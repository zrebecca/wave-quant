"""Pluggable trading strategies for the bot loop (Demo Trading only).

Every strategy follows the same shape: pull candles, compute a *target* net
position from a classic indicator, then ``_reach_target`` places a single market
order to close the gap to it (no churn when already on target). The same
pre-trade risk gate as the market maker applies. The bot loop dispatches by
``cfg.strategy_type``; "market_maker" stays inline in ``bot_manager``.
"""
import logging
import time
from typing import List, Optional

from app.repositories import order_repo
from app.schemas.order import AlgoOrderRequest, CancelOrderRequest, PlaceOrderRequest
from app.services import market_service, order_service, position_service, risk_service
from app.services.log_service import log_event
from app.services.okx_client import OkxError

logger = logging.getLogger(__name__)

# A maker entry that hasn't filled within this window escalates to a market order.
_MAKER_TIMEOUT_MS = 30_000


# ── indicator helpers ──────────────────────────────────────────────────────
def _sma(values: List[float], window: int) -> Optional[float]:
    if len(values) < window:
        return None
    return sum(values[-window:]) / window


def _stdev(values: List[float]) -> float:
    m = sum(values) / len(values)
    return (sum((x - m) ** 2 for x in values) / len(values)) ** 0.5


def _rsi(closes: List[float], n: int) -> Optional[float]:
    """Classic RSI over the last n changes (simple gain/loss average)."""
    if len(closes) < n + 1:
        return None
    gain = loss = 0.0
    for i in range(len(closes) - n, len(closes)):
        ch = closes[i] - closes[i - 1]
        if ch >= 0:
            gain += ch
        else:
            loss -= ch
    avg_gain, avg_loss = gain / n, loss / n
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - 100 / (1 + rs)


def _net_position(db, inst_id: str) -> float:
    """Signed net position (contracts/coin) for an instrument, both net & hedge modes."""
    net = 0.0
    for p in position_service.get_positions(db):
        if p.inst_id != inst_id:
            continue
        if p.pos_side == "long":
            net += abs(p.position)
        elif p.pos_side == "short":
            net -= abs(p.position)
        else:  # net mode — pos is already signed
            net += p.position
    return net


def _closes(cfg, need: int) -> List[float]:
    candles = market_service.get_candles(cfg.inst_id, cfg.ma_bar, limit=need + 5)
    return [c[4] for c in candles.candles]


def _bot_entries(db, inst_id: str) -> list:
    """Resting entry orders this bot placed on an instrument.

    Excludes orders with no remaining size: just after a fill the local state can
    lag on 'live'/'partially_filled' for a moment, and cancelling such an
    already-filled order each cycle caused brief churn.
    """
    return [
        o for o in order_repo.list_orders(db, open_only=True, inst_id=inst_id)
        if o.source == "bot" and o.order_id and _remaining(o) > 1e-9
    ]


def _cancel_order(db, o) -> None:
    try:
        order_service.cancel_order(db, CancelOrderRequest(inst_id=o.inst_id, order_id=o.order_id))
    except Exception:
        pass


def _remaining(o) -> float:
    try:
        return max(0.0, float(o.size) - float(o.filled_size or 0))
    except (TypeError, ValueError):
        return float(o.size or 0)


def _place_entry(db, inst_id, side, size, td_mode, ord_type, price, reason) -> None:
    try:
        order_service.place_order(
            db,
            PlaceOrderRequest(
                inst_id=inst_id, side=side, ord_type=ord_type, size=size, price=price, td_mode=td_mode
            ),
            source="bot",
        )
        log_event(f"{reason} → {ord_type} {side} {size}", category="strategy", db=db, toast="success",
                  toast_key="toast.strat.signal", toast_vars={"reason": reason, "side": side, "size": str(size)})
    except OkxError as exc:
        log_event(f"{reason}: order rejected — {exc.msg}", category="order", level="WARN", db=db)


def _reach_target(db, cfg, target: float, reason: str) -> None:
    """Move the net position toward ``target``.

    Taker mode (default): one market order for the gap. Maker mode: rest a
    post-only order at the touch, escalating to a market order if it doesn't fill
    within the timeout. Reconciled each cycle, so partial fills shrink the gap.
    """
    inst = cfg.inst_id
    taker = bool(getattr(cfg, "entry_taker", True))
    current = _net_position(db, inst)
    delta = round(target - current, 8)
    lot = float(cfg.order_size) or 1.0
    td_mode = "cross" if inst.endswith("SWAP") else "cash"

    # Already on target (within half a lot). In maker mode, clear leftover rests.
    if abs(delta) < lot * 0.5:
        if not taker:
            for o in _bot_entries(db, inst):
                _cancel_order(db, o)
        return

    side = "buy" if delta > 0 else "sell"
    size = abs(delta)
    # TWAP-style slicing: cap each child order so a large rebalance fills over
    # several cycles instead of one big order (0 = no cap).
    max_slice = float(getattr(cfg, "max_slice", 0) or 0)
    if max_slice > 0:
        size = min(size, max_slice)
    ticker = market_service.get_ticker(inst)
    last = ticker.last_px or 0

    breach = risk_service.pre_order_breach(db, inst, side, size, last)
    if breach:
        log_event(f"{reason}: order skipped — {breach}", category="risk", level="WARN", db=db)
        return

    if taker:
        _place_entry(db, inst, side, size, td_mode, "market", None, reason)
        return

    # ---- maker-first entry ----
    now = int(time.time() * 1000)
    working = _bot_entries(db, inst)
    same = [o for o in working if o.side == side]
    for o in working:                       # target flipped → drop opposite rests
        if o.side != side:
            _cancel_order(db, o)

    covered = sum(_remaining(o) for o in same)
    if same and abs(covered - size) <= lot * 0.5:
        # Adequately resting. Escalate the oldest to market if it has aged out.
        oldest = min(same, key=lambda o: o.created_at.timestamp() if o.created_at else 0.0)
        age = now - int(oldest.created_at.timestamp() * 1000) if oldest.created_at else 0
        if age >= _MAKER_TIMEOUT_MS:
            for o in same:
                _cancel_order(db, o)
            _place_entry(db, inst, side, size, td_mode, "market", None, f"{reason} (maker→market)")
        return

    # No / mismatched resting order → reset and place a fresh post-only at the touch.
    for o in same:
        _cancel_order(db, o)
    touch = (ticker.bid_px if side == "buy" else ticker.ask_px) or last
    _place_entry(db, inst, side, size, td_mode, "post_only", round(touch, 2), reason)


# ── strategies ─────────────────────────────────────────────────────────────
def run_ma_cross(db, cfg) -> None:
    """MA crossover: hold long while fast SMA > slow SMA, else flat (golden/death cross)."""
    fast_n, slow_n = int(cfg.ma_fast), int(cfg.ma_slow)
    if fast_n >= slow_n:
        log_event("MA cross: fast window must be < slow window", category="strategy", level="WARN", db=db)
        return
    closes = _closes(cfg, slow_n)
    fast, slow = _sma(closes, fast_n), _sma(closes, slow_n)
    if fast is None or slow is None:
        return
    want_long = fast > slow
    target = float(cfg.max_position) if want_long else 0.0
    rel = ">" if want_long else "≤"
    _reach_target(db, cfg, target, f"MA cross {'LONG' if want_long else 'FLAT'} (fast {fast:.2f} {rel} slow {slow:.2f})")


def run_rsi(db, cfg) -> None:
    """RSI mean-reversion: buy when oversold (<low), exit when overbought (>high), else hold."""
    n = int(cfg.rsi_len)
    closes = _closes(cfg, n + 1)
    rsi = _rsi(closes, n)
    if rsi is None:
        return
    low, high = float(cfg.rsi_low), float(cfg.rsi_high)
    current = _net_position(db, cfg.inst_id)
    if rsi < low:
        target = float(cfg.max_position)
    elif rsi > high:
        target = 0.0
    else:
        target = current  # hold — no order
    _reach_target(db, cfg, target, f"RSI {rsi:.1f} (低{low:.0f}/高{high:.0f})")


def run_bollinger(db, cfg) -> None:
    """Bollinger-band reversion: buy at/below lower band, exit at/above upper band, else hold."""
    n, k = int(cfg.boll_len), float(cfg.boll_k)
    closes = _closes(cfg, n)
    if len(closes) < n:
        return
    window = closes[-n:]
    mid = sum(window) / n
    sd = _stdev(window)
    upper, lower = mid + k * sd, mid - k * sd
    price = closes[-1]
    current = _net_position(db, cfg.inst_id)
    if price <= lower:
        target = float(cfg.max_position)
    elif price >= upper:
        target = 0.0
    else:
        target = current  # hold
    _reach_target(db, cfg, target, f"BOLL price {price:.2f} (下{lower:.2f}/上{upper:.2f})")


def run_grid(db, cfg) -> None:
    """Spot grid (现货网格): hold a larger long the lower the price sits in the
    band, stepped into ``grid_count`` levels — buy-low / sell-high. The target net
    position is reached via a single market order each tick (no resting orders)."""
    low, high = float(cfg.grid_low), float(cfg.grid_high)
    count = int(cfg.grid_count or 0)
    if not (high > low > 0) or count < 2:
        log_event("Grid: need grid_low < grid_high and grid_count ≥ 2", category="strategy", level="WARN", db=db)
        return
    price = market_service.get_ticker(cfg.inst_id).last_px or 0
    if price <= 0:
        return
    step = (high - low) / count
    if price <= low:
        steps_above = count          # at/below floor → fully long
    elif price >= high:
        steps_above = 0              # at/above ceiling → flat
    else:
        steps_above = int((high - price) / step)
    target = float(cfg.max_position) * steps_above / count
    _reach_target(db, cfg, target, f"GRID {steps_above}/{count} @ {price:.2f} ({low:.0f}-{high:.0f})")


# ── more classic strategies (single-instrument, via _reach_target) ──────────
def _ema_series(vals: List[float], n: int) -> List[float]:
    k = 2 / (n + 1)
    out: List[float] = []
    e: Optional[float] = None
    for v in vals:
        e = v if e is None else v * k + e * (1 - k)
        out.append(e)
    return out


def run_macd(db, cfg) -> None:
    """MACD trend: long while DIF > DEA (12/26/9), else flat."""
    closes = _closes(cfg, 60)
    if len(closes) < 35:
        return
    ef, es = _ema_series(closes, 12), _ema_series(closes, 26)
    dif = [a - b for a, b in zip(ef, es)]
    dea = _ema_series(dif, 9)
    long = dif[-1] > dea[-1]
    _reach_target(db, cfg, float(cfg.max_position) if long else 0.0,
                  f"MACD DIF{dif[-1]:.1f}{'>' if long else '≤'}DEA{dea[-1]:.1f}")


def run_boll_break(db, cfg) -> None:
    """Bollinger breakout: long above upper band, short below lower."""
    n, k = int(cfg.boll_len), float(cfg.boll_k)
    closes = _closes(cfg, n)
    if len(closes) < n:
        return
    w = closes[-n:]
    mid, sd = sum(w) / n, _stdev(w)
    px = closes[-1]
    cur = _net_position(db, cfg.inst_id)
    target = float(cfg.max_position) if px > mid + k * sd else -float(cfg.max_position) if px < mid - k * sd else cur
    _reach_target(db, cfg, target, f"BOLL-break px{px:.1f}")


def _donchian(db, cfg, window: int, tag: str) -> None:
    closes = _closes(cfg, window + 1)
    if len(closes) < window + 1:
        return
    prior = closes[-window - 1:-1]
    hi, lo, px = max(prior), min(prior), closes[-1]
    cur = _net_position(db, cfg.inst_id)
    target = float(cfg.max_position) if px >= hi else -float(cfg.max_position) if px <= lo else cur
    _reach_target(db, cfg, target, f"{tag}{window} px{px:.1f}")


def run_donchian(db, cfg) -> None:
    _donchian(db, cfg, 20, "Donchian")


def run_turtle(db, cfg) -> None:
    _donchian(db, cfg, 55, "Turtle")


def run_momentum(db, cfg) -> None:
    """Time-series momentum: long if N-bar return > 0, else short."""
    n = int(cfg.ma_slow)
    closes = _closes(cfg, n + 1)
    if len(closes) < n + 1:
        return
    roc = closes[-1] / closes[-1 - n] - 1
    _reach_target(db, cfg, float(cfg.max_position) if roc > 0 else -float(cfg.max_position),
                  f"Momentum ROC{roc * 100:.2f}%")


def run_mean_rev(db, cfg) -> None:
    """Z-score mean reversion: long when cheap (z<-1), short when rich (z>1)."""
    n = int(cfg.boll_len)
    closes = _closes(cfg, n)
    if len(closes) < n:
        return
    w = closes[-n:]
    mid, sd = sum(w) / n, (_stdev(w) or 1)
    z = (closes[-1] - mid) / sd
    cur = _net_position(db, cfg.inst_id)
    target = float(cfg.max_position) if z < -1 else -float(cfg.max_position) if z > 1 else cur
    _reach_target(db, cfg, target, f"MeanRev z{z:.2f}")


def run_atr_trend(db, cfg) -> None:
    """Trend filter: long while price > slow SMA, else flat (ATR-stop style)."""
    n = int(cfg.ma_slow)
    closes = _closes(cfg, n)
    s = _sma(closes, n)
    if s is None:
        return
    px = closes[-1]
    _reach_target(db, cfg, float(cfg.max_position) if px > s else 0.0,
                  f"ATR-trend px{px:.1f}{'>' if px > s else '≤'}SMA{s:.1f}")


def run_ichimoku(db, cfg) -> None:
    """Ichimoku: long above tenkan & kijun, flat below both."""
    closes = _closes(cfg, 60)
    if len(closes) < 52:
        return
    mid = lambda a: (max(a) + min(a)) / 2  # noqa: E731
    tenkan, kijun, px = mid(closes[-9:]), mid(closes[-26:]), closes[-1]
    cur = _net_position(db, cfg.inst_id)
    target = float(cfg.max_position) if px > tenkan and px > kijun else 0.0 if px < tenkan and px < kijun else cur
    _reach_target(db, cfg, target, f"Ichimoku px{px:.1f}")


def run_kdj(db, cfg) -> None:
    """KDJ stochastic: long oversold (%K<20), flat overbought (%K>80)."""
    n = int(cfg.rsi_len)
    closes = _closes(cfg, n)
    if len(closes) < n:
        return
    w = closes[-n:]
    lo, hi, px = min(w), max(w), closes[-1]
    k = 100 * (px - lo) / ((hi - lo) or 1)
    cur = _net_position(db, cfg.inst_id)
    target = float(cfg.max_position) if k < 20 else 0.0 if k > 80 else cur
    _reach_target(db, cfg, target, f"KDJ K{k:.0f}")


def run_dca(db, cfg) -> None:
    """Dollar-cost averaging / TWAP execution: accumulate toward max position."""
    _reach_target(db, cfg, float(cfg.max_position), "DCA/TWAP accumulate")


def run_martingale(db, cfg) -> None:
    """Martingale (demo): scale the long larger the further price sits below its mean."""
    n = int(cfg.boll_len)
    closes = _closes(cfg, n)
    if len(closes) < n:
        return
    mid, px = sum(closes[-n:]) / n, closes[-1]
    frac = max(0.0, min(1.0, (mid - px) / mid * 10)) if mid else 0.0
    _reach_target(db, cfg, float(cfg.max_position) * frac, f"Martingale {frac * 100:.0f}%")


# Registry of non-market-maker strategies the bot loop can dispatch to.
# Arbitrage/neutral strategies (pairs, funding, cash-and-carry, triangular) are
# demo-approximated by single-instrument mean reversion; TWAP maps to DCA.
_STRATEGIES = {
    "ma_cross": run_ma_cross,
    "rsi": run_rsi,
    "bollinger": run_bollinger,
    "grid": run_grid,
    "macd": run_macd,
    "boll_break": run_boll_break,
    "donchian": run_donchian,
    "turtle": run_turtle,
    "momentum": run_momentum,
    "mean_rev": run_mean_rev,
    "atr_trend": run_atr_trend,
    "ichimoku": run_ichimoku,
    "kdj": run_kdj,
    "dca": run_dca,
    "twap": run_dca,
    "martingale": run_martingale,
    "pairs": run_mean_rev,
    "funding_arb": run_mean_rev,
    "cash_carry": run_mean_rev,
    "triangular": run_mean_rev,
    # ── Classic Strategy Library (66 templates) ──
    # The library exposes 66 strategies for study; the demo bot can't host a distinct
    # engine for each (order-flow / cross-exchange / triangular need L2 feeds, multi-
    # venue connectivity, etc.). Consistent with the demo-approximation already used
    # for arbitrage above, every additional library type is mapped to the nearest
    # implemented engine so the strategy still runs (approximately) on demo. The
    # frontend `runnerOf()` mirrors this mapping for the param form & categorisation.
    # Trend → MA cross
    "ema_trend": run_ma_cross,
    "supertrend": run_ma_cross,
    "parabolic_sar": run_ma_cross,
    "adx_filter": run_ma_cross,
    # Mean reversion → mean reversion
    "vwap_reversion": run_mean_rev,
    "cci": run_mean_rev,
    "williams_r": run_mean_rev,
    "bias": run_mean_rev,
    "stoch_rsi": run_mean_rev,
    # Breakout & volatility → Bollinger breakout
    "boll_squeeze": run_boll_break,
    "keltner": run_boll_break,
    "dual_thrust": run_boll_break,
    "r_breaker": run_boll_break,
    "atr_breakout": run_boll_break,
    "range_breakout": run_boll_break,
    "donchian_breakout": run_boll_break,
    # Grid & DCA → grid / dca
    "futures_grid": run_grid,
    "infinite_grid": run_grid,
    "dynamic_grid": run_grid,
    "smart_grid": run_grid,
    "smart_dca": run_dca,
    # Arbitrage & hedging → mean reversion (neutral demo approximation)
    "cross_exchange": run_mean_rev,
    "perp_basis": run_mean_rev,
    "calendar_spread": run_mean_rev,
    "funding_rotation": run_mean_rev,
    # Order book & flow → mean reversion (market-making engine is dispatched inline)
    "ob_imbalance": run_mean_rev,
    "spread_capture": run_mean_rev,
    "large_order_follow": run_mean_rev,
    "cvd": run_mean_rev,
    "order_flow_imbalance": run_mean_rev,
    "liquidity_sweep": run_mean_rev,
    "iceberg_detection": run_mean_rev,
    # Volume-price & factor → momentum
    "roc": run_momentum,
    "obv": run_momentum,
    "mfi": run_momentum,
    "volume_breakout": run_momentum,
    "pv_divergence": run_momentum,
    "volume_profile": run_momentum,
    "multi_factor": run_momentum,
    # Execution algorithms → DCA (time-sliced execution proxy, like twap)
    "vwap": run_dca,
    "iceberg_order": run_dca,
    "pov": run_dca,
    "post_only": run_dca,
    "smart_router": run_dca,
    "reduce_only": run_dca,
}

# All valid strategy_type values a config may hold: every registry key plus the
# inline-dispatched market maker. Single source of truth for schema validation so
# the create/update API accepts exactly the types the bot can run (66 total).
VALID_STRATEGY_TYPES = set(_STRATEGIES) | {"market_maker"}


def _trig_match(a: Optional[float], b: Optional[float]) -> bool:
    """Two trigger prices are 'the same' within 0.2% (both None also matches)."""
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    return abs(a - b) <= max(abs(a), 1.0) * 0.002


def _manage_bracket(db, cfg) -> None:
    """Keep a reduce-only TP/SL bracket in sync with the current position.

    Idempotent per cycle (reconciles against the live position + avg entry, so it
    tolerates fill-timing): flat → cancel any bracket; in a position with TP/SL
    configured → ensure one OCO/conditional matching side+size+triggers exists.
    Only meaningful for instruments that carry positions (SWAP); spot has none.
    """
    inst = cfg.inst_id
    tp_pct = float(getattr(cfg, "tp_pct", 0) or 0) / 100.0
    sl_pct = float(getattr(cfg, "sl_pct", 0) or 0) / 100.0
    lot = float(cfg.order_size) or 1.0
    net = _net_position(db, inst)

    try:
        existing = [
            a for a in order_service.list_algos(inst)
            if a.ord_type in ("oco", "conditional")
            and (a.state or "live") in ("live", "effective", "pause")
        ]
    except Exception as exc:
        logger.warning("manage bracket: list algos failed for %s: %s", inst, exc)
        return

    # Flat → drop any leftover bracket and return.
    if abs(net) < lot * 0.5:
        for a in existing:
            try:
                order_service.cancel_algo(db, inst, a.algo_id)
            except Exception:
                pass
        return

    pos = next((p for p in position_service.get_positions(db)
                if p.inst_id == inst and p.avg_px), None)
    if pos is None:
        return
    entry = float(pos.avg_px)
    long = net > 0
    close_side = "sell" if long else "buy"
    size = abs(net)
    tp_trig = (entry * (1 + tp_pct) if long else entry * (1 - tp_pct)) if tp_pct > 0 else None
    sl_trig = (entry * (1 - sl_pct) if long else entry * (1 + sl_pct)) if sl_pct > 0 else None

    # A matching bracket already in place → nothing to do (avoid algo churn).
    for a in existing:
        if (
            a.side == close_side
            and abs((a.size or 0) - size) <= lot * 0.5
            and _trig_match(a.tp_trigger_px, tp_trig)
            and _trig_match(a.sl_trigger_px, sl_trig)
        ):
            return

    # Otherwise replace: cancel stale brackets, place a fresh reduce-only OCO/conditional.
    for a in existing:
        try:
            order_service.cancel_algo(db, inst, a.algo_id)
        except Exception:
            pass
    td_mode = "cross" if inst.endswith("SWAP") else "cash"
    try:
        order_service.place_algo(
            db,
            AlgoOrderRequest(
                inst_id=inst,
                side=close_side,
                size=size,
                td_mode=td_mode,
                reduce_only=True,
                tp_trigger_px=tp_trig,
                sl_trigger_px=sl_trig,
            ),
            source="bot",
        )
        log_event(
            f"TP/SL bracket {close_side} {size} (tp {tp_trig} / sl {sl_trig})",
            category="strategy", db=db,
        )
    except OkxError as exc:
        log_event(f"TP/SL bracket rejected — {exc.msg}", category="order", level="WARN", db=db)


def run_strategy(db, cfg) -> bool:
    """Run the configured non-market-maker strategy. Returns False if unknown."""
    fn = _STRATEGIES.get(getattr(cfg, "strategy_type", "market_maker"))
    if fn is None:
        return False
    fn(db, cfg)
    # Auto-manage a TP/SL bracket when configured (skips the extra OKX calls when off).
    if float(getattr(cfg, "tp_pct", 0) or 0) > 0 or float(getattr(cfg, "sl_pct", 0) or 0) > 0:
        try:
            _manage_bracket(db, cfg)
        except Exception as exc:
            logger.warning("manage bracket failed: %s", exc)
    return True
