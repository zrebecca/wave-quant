from typing import List, Tuple

from pydantic import BaseModel


class TickerOut(BaseModel):
    inst_id: str
    last_px: float
    bid_px: float | None = None
    ask_px: float | None = None
    spread: float | None = None
    spread_pct: float | None = None
    vol_24h: float | None = None        # base-currency 24h volume
    vol_ccy_24h: float | None = None    # quote-currency 24h turnover
    open_24h: float | None = None
    high_24h: float | None = None
    low_24h: float | None = None
    change_24h_pct: float | None = None  # (last - open24h) / open24h * 100
    ts: int | None = None


class OrderBookLevel(BaseModel):
    price: float
    size: float


class OrderBookOut(BaseModel):
    inst_id: str
    bids: List[OrderBookLevel]
    asks: List[OrderBookLevel]
    ts: int | None = None


class PublicTrade(BaseModel):
    price: float
    size: float          # in contracts (SWAP) / base coin (SPOT), as OKX returns
    side: str            # "buy" | "sell" (taker side)
    ts: int


class PublicTradesOut(BaseModel):
    inst_id: str
    trades: List[PublicTrade]


class CandleOut(BaseModel):
    # [ts, open, high, low, close, volume]
    inst_id: str
    bar: str
    candles: List[Tuple[int, float, float, float, float, float]]


class InstrumentRule(BaseModel):
    """Trading rules from OKX public/instruments — drives order-form precision."""
    inst_id: str
    inst_type: str
    base_ccy: str | None = None
    quote_ccy: str | None = None
    settle_ccy: str | None = None
    tick_sz: float | None = None       # price step
    lot_sz: float | None = None        # size step
    min_sz: float | None = None        # minimum order size
    ct_val: float | None = None        # contract value (derivatives)
    ct_mult: float | None = None       # contract multiplier
    lever: str | None = None           # max leverage
    state: str | None = None           # live / suspend / ...


class InstrumentStat(BaseModel):
    """Live derivative microstructure: mark/index price, funding, open interest."""
    inst_id: str
    mark_px: float | None = None
    index_px: float | None = None
    funding_rate: float | None = None
    next_funding_time: int | None = None
    funding_time: int | None = None
    open_interest: float | None = None       # in contracts
    open_interest_ccy: float | None = None    # in base currency
