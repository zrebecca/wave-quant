from typing import Literal, Optional

from pydantic import BaseModel


class BotStatusOut(BaseModel):
    state: str
    message: str | None = None
    strategy_name: str
    strategy_version: int | None = None
    started_at: int | None = None
    last_heartbeat: int | None = None
    last_quote_ts: int | None = None
    cycles: int = 0

    model_config = {"from_attributes": True}


class StopBotRequest(BaseModel):
    # keep: 停止报价保留订单 / cancel: 停止并撤单 / cancel_close: 停止撤单并平仓
    mode: Literal["keep", "cancel", "cancel_close"] = "cancel"
    reason: Optional[str] = None


class BotRuntimeOut(BaseModel):
    state: str
    strategy_name: str
    strategy_version: int | None = None
    inst_id: str | None = None
    started_at: int | None = None
    last_heartbeat: int | None = None
    last_quote_ts: int | None = None
    cycles: int = 0
    open_buy: int = 0
    open_sell: int = 0
    today_fills: int = 0
    maker_fills: int = 0
    maker_ratio: float | None = None
    today_fee: float = 0.0
    net_position: float = 0.0
    gross_exposure: float = 0.0
    last_error: str | None = None
