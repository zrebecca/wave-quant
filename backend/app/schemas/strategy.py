from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class StrategyConfigOut(BaseModel):
    id: int
    name: str
    inst_id: str
    order_size: float
    spread: float
    refresh_interval: int
    max_position: float
    num_levels: int
    is_active: bool
    strategy_type: str = "market_maker"
    ma_fast: int = 5
    ma_slow: int = 20
    ma_bar: str = "1H"
    rsi_len: int = 14
    rsi_low: float = 30
    rsi_high: float = 70
    boll_len: int = 20
    boll_k: float = 2
    grid_low: float = 0
    grid_high: float = 0
    grid_count: int = 10
    tp_pct: float = 0
    sl_pct: float = 0
    entry_taker: bool = True
    max_slice: float = 0

    model_config = {"from_attributes": True}


class StrategyConfigUpdate(BaseModel):
    inst_id: Optional[str] = None
    order_size: Optional[float] = Field(default=None, gt=0)
    spread: Optional[float] = Field(default=None, gt=0)
    refresh_interval: Optional[int] = Field(default=None, ge=1)
    max_position: Optional[float] = Field(default=None, gt=0)
    num_levels: Optional[int] = Field(default=None, ge=1, le=10)
    is_active: Optional[bool] = None
    # Validated against the backend strategy registry (66 runnable types) instead of
    # a hardcoded regex, so new library strategies stay accepted automatically.
    strategy_type: Optional[str] = Field(default=None)

    @field_validator("strategy_type")
    @classmethod
    def _valid_strategy_type(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        from app.services.strategies import VALID_STRATEGY_TYPES  # lazy: avoid import cycle
        if v not in VALID_STRATEGY_TYPES:
            raise ValueError(f"未知的策略类型: {v}")
        return v
    ma_fast: Optional[int] = Field(default=None, ge=1, le=200)
    ma_slow: Optional[int] = Field(default=None, ge=2, le=400)
    ma_bar: Optional[str] = None
    rsi_len: Optional[int] = Field(default=None, ge=2, le=200)
    rsi_low: Optional[float] = Field(default=None, ge=1, le=49)
    rsi_high: Optional[float] = Field(default=None, ge=51, le=99)
    boll_len: Optional[int] = Field(default=None, ge=2, le=400)
    boll_k: Optional[float] = Field(default=None, gt=0, le=5)
    grid_low: Optional[float] = Field(default=None, ge=0)
    grid_high: Optional[float] = Field(default=None, ge=0)
    grid_count: Optional[int] = Field(default=None, ge=2, le=200)
    # TP/SL as % from entry (0 = off). Capped at 50% to avoid fat-finger triggers.
    tp_pct: Optional[float] = Field(default=None, ge=0, le=50)
    sl_pct: Optional[float] = Field(default=None, ge=0, le=50)
    entry_taker: Optional[bool] = None
    max_slice: Optional[float] = Field(default=None, ge=0)
    note: Optional[str] = None  # 版本备注（不写入配置，仅记入版本快照）


class StopStrategyRequest(BaseModel):
    # 停止并卖出 → cancel_close（撤单 + 市价平仓）; 停止但不卖出 → cancel（撤单，留仓）
    mode: str = Field(default="cancel", pattern="^(keep|cancel|cancel_close)$")


class StrategyCreate(StrategyConfigUpdate):
    """Create a new named strategy instance (name required)."""
    name: str = Field(min_length=1, max_length=64)


class StrategyVersionOut(BaseModel):
    id: int
    strategy_name: str
    version: int
    params: dict
    note: str | None = None
    created_by: str
    created_at: datetime

    model_config = {"from_attributes": True}
