from pydantic import BaseModel


class PositionOut(BaseModel):
    inst_id: str
    pos_side: str
    position: float
    avg_px: float
    mark_px: float
    upl: float
    upl_ratio: float | None = None
    realized_pnl: float | None = None
    margin: float | None = None
    mgn_mode: str | None = None
    lever: str | None = None
    liq_px: float | None = None
    c_time: int | None = None  # position open time, epoch ms


class ClosedPositionOut(BaseModel):
    """A closed (historical) position, from OKX positions-history."""

    inst_id: str
    pos_side: str  # long / short / net
    close_type: str | None = None  # OKX type: 1 partial-liq 2 partial-close 3 full-close 4 liq 5 adl
    open_avg_px: float = 0.0
    close_avg_px: float = 0.0
    realized_pnl: float | None = None
    pnl_ratio: float | None = None
    open_max_pos: float | None = None  # max position size held
    close_total_pos: float | None = None  # total closed size
    lever: str | None = None
    mgn_mode: str | None = None
    c_time: int | None = None  # open time, epoch ms
    u_time: int | None = None  # close time, epoch ms


class ClosePositionRequest(BaseModel):
    inst_id: str
    pos_side: str = "net"
    mgn_mode: str = "cross"  # cross / isolated / cash
