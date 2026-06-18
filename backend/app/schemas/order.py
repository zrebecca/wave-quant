from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator


class OrderOut(BaseModel):
    id: int
    order_id: str | None = None
    client_order_id: str | None = None
    inst_id: str
    side: str
    ord_type: str
    price: float | None = None
    size: float
    filled_size: float
    avg_price: float | None = None
    state: str
    source: str
    ts: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TradeOut(BaseModel):
    id: int
    trade_id: str | None = None
    order_id: str | None = None
    inst_id: str
    side: str
    fill_px: float
    fill_sz: float
    fee: float | None = None
    fee_ccy: str | None = None
    fill_pnl: float | None = None
    exec_type: str | None = None
    source: str
    ts: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# Order types accepted by the platform → mapped 1:1 to OKX ordType.
# post_only / ioc / fok are price-bound (limit-based) execution variants.
OrderType = Literal["limit", "market", "post_only", "ioc", "fok"]
_PRICE_REQUIRED = {"limit", "post_only", "ioc", "fok"}


class PlaceOrderRequest(BaseModel):
    inst_id: str
    side: Literal["buy", "sell"]
    ord_type: OrderType
    size: float = Field(gt=0)
    price: Optional[float] = None
    td_mode: str = "cross"  # cross / isolated / cash
    # Close-order fields: reduce_only (net mode) or pos_side=long/short (hedge mode).
    reduce_only: bool = False
    pos_side: Optional[Literal["long", "short", "net"]] = None

    @model_validator(mode="after")
    def _check_price(self):
        if self.ord_type in _PRICE_REQUIRED and self.price is None:
            raise ValueError(f"price is required for {self.ord_type} orders")
        return self


class CancelOrderRequest(BaseModel):
    inst_id: str
    order_id: Optional[str] = None
    client_order_id: Optional[str] = None

    @model_validator(mode="after")
    def _need_an_id(self):
        if not self.order_id and not self.client_order_id:
            raise ValueError("order_id or client_order_id is required")
        return self


class AlgoOrderRequest(BaseModel):
    """Take-profit / stop-loss as an OKX algo order (conditional / OCO).

    ``side`` is the *closing* side (sell to close a long, buy to close a short).
    Trigger prices are required; order prices default to market (-1) when omitted."""
    inst_id: str
    side: Literal["buy", "sell"]
    size: float = Field(gt=0)
    td_mode: str = "cross"
    reduce_only: bool = True
    tp_trigger_px: Optional[float] = None
    tp_ord_px: Optional[float] = None   # None → market (-1)
    sl_trigger_px: Optional[float] = None
    sl_ord_px: Optional[float] = None   # None → market (-1)

    @model_validator(mode="after")
    def _need_a_trigger(self):
        if self.tp_trigger_px is None and self.sl_trigger_px is None:
            raise ValueError("at least one of tp_trigger_px / sl_trigger_px is required")
        return self


class AlgoOrderOut(BaseModel):
    algo_id: str | None = None
    algo_cl_ord_id: str | None = None
    inst_id: str
    side: str
    ord_type: str
    state: str | None = None
    size: float | None = None
    tp_trigger_px: float | None = None
    tp_ord_px: float | None = None
    sl_trigger_px: float | None = None
    sl_ord_px: float | None = None
    trigger_px: float | None = None     # for ordType=trigger
    order_px: float | None = None       # for ordType=trigger (-1 = market)
    ts: int | None = None


class TriggerOrderRequest(BaseModel):
    """A standalone conditional (trigger) order: when the market hits ``trigger_px``,
    OKX submits an order at ``order_px`` (or market when omitted)."""
    inst_id: str
    side: Literal["buy", "sell"]
    size: float = Field(gt=0)
    td_mode: str = "cross"
    trigger_px: float = Field(gt=0)
    order_px: Optional[float] = None     # None → market (-1)
    reduce_only: bool = False


class CancelAlgoRequest(BaseModel):
    inst_id: str
    algo_id: str
