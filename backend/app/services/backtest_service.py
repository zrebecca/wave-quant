"""Historical backtest over OKX candlesticks (Demo data) with a realistic cost model.

Two signal strategies on close prices:
  * sma_cross  — long when fast SMA > slow SMA, flat otherwise
  * momentum   — long when price > price `slow` bars ago

Every position change incurs taker fee + slippage (no "free fills"), and the
result reports return, annualized return, drawdown, Sharpe, win rate, profit
factor, fees, avg holding and max consecutive losses. Research only — not advice.
"""
import logging
from typing import List, Tuple

from app.schemas.backtest import BacktestRequest, BacktestResult
from app.services import market_service

logger = logging.getLogger(__name__)

# Approximate bar length in minutes, for annualizing returns.
_BAR_MINUTES = {
    "1m": 1, "3m": 3, "5m": 5, "15m": 15, "30m": 30,
    "1H": 60, "2H": 120, "4H": 240, "6H": 360, "12H": 720,
    "1D": 1440, "1W": 10080,
}
_MINUTES_PER_YEAR = 365 * 24 * 60


def _sma(values: List[float], window: int, idx: int) -> float | None:
    if idx + 1 < window:
        return None
    return sum(values[idx + 1 - window : idx + 1]) / window


def _ema(values: List[float], span: int) -> List[float]:
    """Exponential moving average over the full series (seeded with the first value)."""
    k = 2 / (span + 1)
    out: List[float] = []
    ema = None
    for v in values:
        ema = v if ema is None else v * k + ema * (1 - k)
        out.append(ema)
    return out


def _rsi(closes: List[float], length: int) -> List[float | None]:
    """Wilder's RSI; None for the warm-up bars before it's defined."""
    n = len(closes)
    rsi: List[float | None] = [None] * n
    if n <= length:
        return rsi
    gains = losses = 0.0
    for i in range(1, length + 1):
        ch = closes[i] - closes[i - 1]
        gains += max(ch, 0.0)
        losses += max(-ch, 0.0)
    avg_gain, avg_loss = gains / length, losses / length
    rsi[length] = 100.0 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss)
    for i in range(length + 1, n):
        ch = closes[i] - closes[i - 1]
        avg_gain = (avg_gain * (length - 1) + max(ch, 0.0)) / length
        avg_loss = (avg_loss * (length - 1) + max(-ch, 0.0)) / length
        rsi[i] = 100.0 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss)
    return rsi


def _warmup(req: BacktestRequest) -> int:
    """Bars needed before a strategy can produce a signal (for the min-candle check)."""
    return {
        "sma_cross": req.slow,
        "momentum": req.slow,
        "rsi": req.rsi_len + 1,
        "bollinger": req.boll_len,
        "donchian": req.donchian_len + 1,
        "macd": req.macd_slow + req.macd_signal,
    }.get(req.strategy, req.slow)


def _signals(closes: List[float], req: BacktestRequest) -> List[int]:
    n = len(closes)
    pos = [0] * n
    if req.strategy == "momentum":
        for i in range(req.slow, n):
            pos[i] = 1 if closes[i] > closes[i - req.slow] else 0

    elif req.strategy == "rsi":
        # Long when oversold (RSI < low); flat when overbought (RSI > high); hold in between.
        rsi = _rsi(closes, req.rsi_len)
        held = 0
        for i in range(n):
            r = rsi[i]
            if r is not None:
                if r < req.rsi_low:
                    held = 1
                elif r > req.rsi_high:
                    held = 0
            pos[i] = held

    elif req.strategy == "bollinger":
        # Long when price pierces the lower band; exit once it reverts above the mid (SMA).
        held = 0
        for i in range(n):
            mid = _sma(closes, req.boll_len, i)
            if mid is not None:
                window = closes[i + 1 - req.boll_len : i + 1]
                sd = (sum((x - mid) ** 2 for x in window) / req.boll_len) ** 0.5
                if closes[i] < mid - req.boll_k * sd:
                    held = 1
                elif closes[i] > mid:
                    held = 0
            pos[i] = held

    elif req.strategy == "donchian":
        # Breakout: long above the prior N-bar high, exit below the prior N-bar low.
        L = req.donchian_len
        held = 0
        for i in range(n):
            if i >= L:
                hh = max(closes[i - L : i])
                ll = min(closes[i - L : i])
                if closes[i] > hh:
                    held = 1
                elif closes[i] < ll:
                    held = 0
            pos[i] = held

    elif req.strategy == "macd":
        # Long when the MACD line is above its signal line.
        macd_line = [f - s for f, s in zip(_ema(closes, req.macd_fast), _ema(closes, req.macd_slow))]
        signal = _ema(macd_line, req.macd_signal)
        warm = min(req.macd_slow, n)
        for i in range(warm, n):
            pos[i] = 1 if macd_line[i] > signal[i] else 0

    else:  # sma_cross
        for i in range(n):
            fast = _sma(closes, req.fast, i)
            slow = _sma(closes, req.slow, i)
            if fast is not None and slow is not None:
                pos[i] = 1 if fast > slow else 0
    return pos


def run_backtest(req: BacktestRequest) -> BacktestResult:
    candles = market_service.get_candles(req.inst_id, bar=req.bar, limit=req.limit).candles
    if len(candles) < _warmup(req) + 2:
        raise ValueError("not enough candles for the chosen parameters")

    ts = [c[0] for c in candles]
    closes = [c[4] for c in candles]
    pos = _signals(closes, req)

    # Cost per fill = taker fee + slippage, applied to equity on each position change.
    cost_rate = req.fee_rate / 100 + req.slippage_bp / 10000

    equity = req.initial_capital
    peak = equity
    max_dd = 0.0
    equity_curve: List[Tuple[int, float]] = [(ts[0], round(equity, 2))]
    drawdown_curve: List[Tuple[int, float]] = [(ts[0], 0.0)]
    returns: List[float] = []

    total_fee = 0.0
    trade_pnls: List[float] = []      # per round-trip pct pnl
    holding_bars: List[int] = []
    entry_equity = None
    entry_idx = None

    for i in range(1, len(closes)):
        held = pos[i - 1]
        ret = (closes[i] / closes[i - 1] - 1) if closes[i - 1] else 0.0
        period_ret = held * ret
        equity *= 1 + period_ret
        returns.append(period_ret)

        # A position change executes a fill → fee + slippage.
        if pos[i] != pos[i - 1]:
            fee = equity * cost_rate
            total_fee += fee
            equity -= fee
            if pos[i] == 1:  # entering
                entry_equity = equity
                entry_idx = i
            elif entry_equity is not None:  # exiting → close a round trip
                trade_pnls.append(equity / entry_equity - 1)
                holding_bars.append(i - (entry_idx or i))
                entry_equity = None
                entry_idx = None

        peak = max(peak, equity)
        dd = (peak - equity) / peak if peak else 0.0
        max_dd = max(max_dd, dd)
        equity_curve.append((ts[i], round(equity, 2)))
        drawdown_curve.append((ts[i], round(dd * 100, 3)))

    total_return = (equity / req.initial_capital - 1) * 100

    # Annualized return from the covered time span.
    bar_min = _BAR_MINUTES.get(req.bar, 60)
    years = (len(closes) * bar_min) / _MINUTES_PER_YEAR
    if years > 0 and equity > 0:
        annualized = ((equity / req.initial_capital) ** (1 / years) - 1) * 100
    else:
        annualized = 0.0

    wins = [p for p in trade_pnls if p > 0]
    losses = [p for p in trade_pnls if p <= 0]
    win_rate = (len(wins) / len(trade_pnls) * 100) if trade_pnls else 0.0
    gross_win = sum(wins)
    gross_loss = abs(sum(losses))
    profit_factor = (gross_win / gross_loss) if gross_loss else (gross_win and 999.0 or 0.0)

    # Max consecutive losing trades.
    max_consec = cur = 0
    for p in trade_pnls:
        if p <= 0:
            cur += 1
            max_consec = max(max_consec, cur)
        else:
            cur = 0

    mean = sum(returns) / len(returns) if returns else 0.0
    var = sum((r - mean) ** 2 for r in returns) / len(returns) if returns else 0.0
    std = var ** 0.5
    sharpe = (mean / std * (len(returns) ** 0.5)) if std else 0.0

    avg_holding = (sum(holding_bars) / len(holding_bars)) if holding_bars else 0.0

    return BacktestResult(
        inst_id=req.inst_id,
        strategy=req.strategy,
        total_return_pct=round(total_return, 2),
        annualized_return_pct=round(annualized, 2),
        max_drawdown_pct=round(max_dd * 100, 2),
        trade_count=len(trade_pnls),
        win_rate_pct=round(win_rate, 2),
        profit_factor=round(profit_factor, 2),
        sharpe=round(sharpe, 2),
        total_fee=round(total_fee, 2),
        avg_holding_bars=round(avg_holding, 1),
        max_consecutive_losses=max_consec,
        final_equity=round(equity, 2),
        equity_curve=equity_curve,
        drawdown_curve=drawdown_curve,
        price_series=[(ts[i], closes[i]) for i in range(len(closes))],
    )
