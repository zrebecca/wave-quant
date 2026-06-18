from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

BreachAction = Literal["alert", "pause", "cancel", "stop", "stop_close"]


class RiskConfigOut(BaseModel):
    id: int
    name: str
    max_position: float
    max_order_notional: float
    max_open_orders: int
    max_daily_loss: float
    max_net_long: float
    max_net_short: float
    max_gross_exposure: float
    max_order_rate: int
    max_cancel_rate: int
    max_drawdown: float
    max_market_delay_sec: int
    max_consecutive_losses: int
    on_breach_action: str
    enabled: bool

    model_config = {"from_attributes": True}


class RiskConfigUpdate(BaseModel):
    max_position: Optional[float] = Field(default=None, gt=0)
    max_order_notional: Optional[float] = Field(default=None, gt=0)
    max_open_orders: Optional[int] = Field(default=None, ge=1)
    max_daily_loss: Optional[float] = Field(default=None, gt=0)
    max_net_long: Optional[float] = Field(default=None, ge=0)
    max_net_short: Optional[float] = Field(default=None, ge=0)
    max_gross_exposure: Optional[float] = Field(default=None, gt=0)
    max_order_rate: Optional[int] = Field(default=None, ge=1)
    max_cancel_rate: Optional[int] = Field(default=None, ge=1)
    max_drawdown: Optional[float] = Field(default=None, gt=0)
    max_market_delay_sec: Optional[int] = Field(default=None, ge=1)
    max_consecutive_losses: Optional[int] = Field(default=None, ge=1)
    on_breach_action: Optional[BreachAction] = None
    enabled: Optional[bool] = None


class RiskStatusOut(BaseModel):
    config: RiskConfigOut
    current_position_notional: float
    open_order_count: int
    daily_pnl: float
    net_position: float = 0.0
    gross_exposure: float = 0.0
    breaches: List[str]
    triggered: bool
    action: str = "stop"  # action that would fire on breach
    # 风险使用率（0~1+），便于前端画进度条
    usage: dict = {}


class RiskEventOut(BaseModel):
    id: int
    rule: str
    level: str
    action: str
    metric_value: float | None = None
    threshold: float | None = None
    inst_id: str | None = None
    message: str
    ts: int | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class KillSwitchRequest(BaseModel):
    """Global emergency stop. Cancel/close are separate to avoid accidental liquidation."""
    cancel_orders: bool = True
    close_positions: bool = False


class HaltState(BaseModel):
    halted: bool
    reason: str | None = None
    ts: int | None = None


class KillSwitchResult(BaseModel):
    halted: bool
    bot_stopped: bool
    cancelled: int
    closed: int
    errors: List[str] = []
