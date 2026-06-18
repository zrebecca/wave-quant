from typing import List, Literal

from pydantic import BaseModel, Field


class AccountDetailOut(BaseModel):
    """Per-currency balance breakdown (from OKX account details)."""

    ccy: str
    eq: float = 0.0           # equity in the currency
    eq_usd: float = 0.0       # USD-converted value
    avail_bal: float = 0.0    # available balance
    frozen_bal: float = 0.0   # frozen / on-hold balance
    upl: float = 0.0          # unrealized pnl in the currency


class EquityPoint(BaseModel):
    ts: int  # epoch ms
    total_equity: float
    available_balance: float
    unrealized_pnl: float


class AccountOut(BaseModel):
    total_equity: float
    available_balance: float
    unrealized_pnl: float
    margin_ratio: float | None = None
    currency: str = "USDT"
    position_count: int = 0
    open_order_count: int = 0
    bot_state: str = "STOPPED"
    # Asset composition + provenance (so the UI can show "where the equity comes from").
    details: List[AccountDetailOut] = []
    source: str = "OKX Demo Trading"
    ts: int | None = None  # epoch ms when this snapshot was taken


class AccountConfigOut(BaseModel):
    """Account-level trade config (currently just the position mode)."""

    pos_mode: str  # "long_short_mode" (hedge / 双向) | "net_mode" (one-way / 单向)


class PositionModeRequest(BaseModel):
    pos_mode: Literal["long_short_mode", "net_mode"]


class LeverageOut(BaseModel):
    inst_id: str
    mgn_mode: str
    lever: float


class SetLeverageRequest(BaseModel):
    inst_id: str
    lever: float = Field(ge=1, le=125)
    mgn_mode: Literal["cross", "isolated"] = "cross"
