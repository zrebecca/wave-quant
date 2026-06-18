"""REST market data: tickers, order book, candlesticks (Demo Trading)."""
import logging
import time
from typing import List

from app.schemas.market import (
    CandleOut,
    InstrumentRule,
    InstrumentStat,
    OrderBookLevel,
    OrderBookOut,
    PublicTrade,
    PublicTradesOut,
    TickerOut,
)
from app.services.okx_client import check, market_api, public_api

logger = logging.getLogger(__name__)


def _f(value, default=0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _fo(value):
    """Float-or-None: blank/invalid → None (so the UI shows '--' not 0)."""
    v = _f(value, None) if value not in (None, "") else None
    return v


def _inst_type(inst_id: str) -> str:
    """Infer OKX instType from an instrument id (SWAP/FUTURES else SPOT)."""
    if inst_id.endswith("-SWAP"):
        return "SWAP"
    # e.g. BTC-USD-240927 (futures) — three dash-segments with a numeric tail.
    parts = inst_id.split("-")
    if len(parts) == 3 and parts[2].isdigit():
        return "FUTURES"
    return "SPOT"


def _index_inst(inst_id: str) -> str:
    """Underlying index instrument for an index-ticker lookup (strip -SWAP)."""
    return inst_id[:-5] if inst_id.endswith("-SWAP") else inst_id


def get_ticker(inst_id: str) -> TickerOut:
    resp = check(market_api().get_ticker(instId=inst_id))
    d = resp["data"][0]
    bid = _f(d.get("bidPx")) or None
    ask = _f(d.get("askPx")) or None
    spread = (ask - bid) if (bid and ask) else None
    spread_pct = (spread / ask * 100) if (spread and ask) else None
    last = _f(d.get("last"))
    open24 = _fo(d.get("open24h"))
    change_pct = ((last - open24) / open24 * 100) if (open24 and last) else None
    return TickerOut(
        inst_id=inst_id,
        last_px=last,
        bid_px=bid,
        ask_px=ask,
        spread=spread,
        spread_pct=spread_pct,
        vol_24h=_fo(d.get("vol24h")),
        vol_ccy_24h=_fo(d.get("volCcy24h")),
        open_24h=open24,
        high_24h=_fo(d.get("high24h")),
        low_24h=_fo(d.get("low24h")),
        change_24h_pct=change_pct,
        ts=int(d["ts"]) if d.get("ts") else None,
    )


def get_tickers(inst_ids: List[str]) -> List[TickerOut]:
    out = []
    for inst_id in inst_ids:
        try:
            out.append(get_ticker(inst_id))
        except Exception as exc:
            logger.warning("ticker fetch failed for %s: %s", inst_id, exc)
    return out


# --- All-instrument tickers (for the "add to watchlist" picker) — cached -----
_ALL_TICKERS: dict[str, tuple[float, List[TickerOut]]] = {}
_ALL_TTL = 8.0


def get_all_tickers(inst_type: str = "SWAP") -> List[TickerOut]:
    """Every OKX ticker for an instrument type (SWAP / SPOT). Cached briefly — the
    full list is large and changes continuously but is fine slightly stale for a picker."""
    inst_type = inst_type.upper()
    cached = _ALL_TICKERS.get(inst_type)
    if cached and (time.time() - cached[0]) < _ALL_TTL:
        return cached[1]
    resp = check(market_api().get_tickers(instType=inst_type))
    out: List[TickerOut] = []
    for d in resp.get("data", []):
        last = _f(d.get("last"))
        open24 = _fo(d.get("open24h"))
        out.append(
            TickerOut(
                inst_id=d.get("instId"),
                last_px=last,
                vol_24h=_fo(d.get("vol24h")),
                vol_ccy_24h=_fo(d.get("volCcy24h")),
                open_24h=open24,
                high_24h=_fo(d.get("high24h")),
                low_24h=_fo(d.get("low24h")),
                change_24h_pct=((last - open24) / open24 * 100) if (open24 and last) else None,
                ts=int(d["ts"]) if d.get("ts") else None,
            )
        )
    _ALL_TICKERS[inst_type] = (time.time(), out)
    return out


def get_orderbook(inst_id: str, depth: int = 20) -> OrderBookOut:
    resp = check(market_api().get_orderbook(instId=inst_id, sz=str(depth)))
    d = resp["data"][0]
    bids = [OrderBookLevel(price=_f(lvl[0]), size=_f(lvl[1])) for lvl in d.get("bids", [])]
    asks = [OrderBookLevel(price=_f(lvl[0]), size=_f(lvl[1])) for lvl in d.get("asks", [])]
    return OrderBookOut(
        inst_id=inst_id,
        bids=bids,
        asks=asks,
        ts=int(d["ts"]) if d.get("ts") else None,
    )


def get_public_trades(inst_id: str, limit: int = 60) -> "PublicTradesOut":
    """Recent public trades (the market tape behind OKX's 最新成交)."""
    resp = check(market_api().get_trades(instId=inst_id, limit=str(limit)))
    trades = [
        PublicTrade(
            price=_f(d.get("px")),
            size=_f(d.get("sz")),
            side=d.get("side") or "",
            ts=int(d["ts"]) if d.get("ts") else 0,
        )
        for d in resp.get("data", [])
    ]
    return PublicTradesOut(inst_id=inst_id, trades=trades)


def get_candles(inst_id: str, bar: str = "1H", limit: int = 200) -> CandleOut:
    resp = check(market_api().get_candlesticks(instId=inst_id, bar=bar, limit=str(limit)))
    candles = []
    # OKX returns newest first; reverse to chronological for charting.
    for row in reversed(resp["data"]):
        candles.append(
            (
                int(row[0]),
                _f(row[1]),
                _f(row[2]),
                _f(row[3]),
                _f(row[4]),
                _f(row[5]),
            )
        )
    return CandleOut(inst_id=inst_id, bar=bar, candles=candles)


# --- Instrument rules (precision) — cached; OKX rules change rarely ---------
_RULE_CACHE: dict[str, tuple[float, InstrumentRule]] = {}
_RULE_TTL = 3600.0  # seconds


def get_instrument_rule(inst_id: str) -> InstrumentRule:
    cached = _RULE_CACHE.get(inst_id)
    if cached and (time.time() - cached[0]) < _RULE_TTL:
        return cached[1]
    resp = check(public_api().get_instruments(instType=_inst_type(inst_id), instId=inst_id))
    d = (resp.get("data") or [{}])[0]
    rule = InstrumentRule(
        inst_id=inst_id,
        inst_type=d.get("instType") or _inst_type(inst_id),
        base_ccy=d.get("baseCcy") or None,
        quote_ccy=d.get("quoteCcy") or None,
        settle_ccy=d.get("settleCcy") or None,
        tick_sz=_fo(d.get("tickSz")),
        lot_sz=_fo(d.get("lotSz")),
        min_sz=_fo(d.get("minSz")),
        ct_val=_fo(d.get("ctVal")),
        ct_mult=_fo(d.get("ctMult")),
        lever=d.get("lever") or None,
        state=d.get("state") or None,
    )
    _RULE_CACHE[inst_id] = (time.time(), rule)
    return rule


def contract_value(inst_id: str) -> float:
    """Coin per contract for derivatives (ct_val × ct_mult); 1 for spot.

    Lets callers turn a contract quantity into a base-coin amount so notional is
    ``size × price × contract_value`` rather than the naive ``size × price``.
    """
    if _inst_type(inst_id) not in ("SWAP", "FUTURES"):
        return 1.0
    try:
        rule = get_instrument_rule(inst_id)
        return (rule.ct_val or 1.0) * (rule.ct_mult or 1.0)
    except Exception:
        return 1.0


def get_instrument_rules(inst_ids: List[str]) -> List[InstrumentRule]:
    out = []
    for inst_id in inst_ids:
        try:
            out.append(get_instrument_rule(inst_id))
        except Exception as exc:
            logger.warning("instrument rule fetch failed for %s: %s", inst_id, exc)
    return out


def get_instrument_stat(inst_id: str) -> InstrumentStat:
    """Live mark/index/funding/open-interest. Each field is best-effort: a failure
    on one (e.g. spot has no funding) leaves it None rather than failing the call."""
    inst_type = _inst_type(inst_id)
    stat = InstrumentStat(inst_id=inst_id)

    # Index price (works for spot + derivatives via the underlying index).
    try:
        resp = check(market_api().get_index_tickers(instId=_index_inst(inst_id)))
        stat.index_px = _fo((resp.get("data") or [{}])[0].get("idxPx"))
    except Exception as exc:
        logger.debug("index ticker failed for %s: %s", inst_id, exc)

    if inst_type in ("SWAP", "FUTURES"):
        try:
            resp = check(public_api().get_mark_price(instType=inst_type, instId=inst_id))
            stat.mark_px = _fo((resp.get("data") or [{}])[0].get("markPx"))
        except Exception as exc:
            logger.debug("mark price failed for %s: %s", inst_id, exc)
        try:
            resp = check(public_api().get_open_interest(instType=inst_type, instId=inst_id))
            d = (resp.get("data") or [{}])[0]
            stat.open_interest = _fo(d.get("oi"))
            stat.open_interest_ccy = _fo(d.get("oiCcy"))
        except Exception as exc:
            logger.debug("open interest failed for %s: %s", inst_id, exc)
    if inst_type == "SWAP":
        try:
            resp = check(public_api().get_funding_rate(instId=inst_id))
            d = (resp.get("data") or [{}])[0]
            stat.funding_rate = _fo(d.get("fundingRate"))
            stat.next_funding_time = int(d["nextFundingTime"]) if d.get("nextFundingTime") else None
            stat.funding_time = int(d["fundingTime"]) if d.get("fundingTime") else None
        except Exception as exc:
            logger.debug("funding rate failed for %s: %s", inst_id, exc)

    return stat
