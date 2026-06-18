"""Positions from OKX, plus market-order close support (demo only)."""
import logging
from typing import List

from sqlalchemy.orm import Session

from app.schemas.position import ClosedPositionOut, PositionOut
from app.services.live_state import live
from app.services.okx_client import account_api, check, trade_api

logger = logging.getLogger(__name__)


def _f(value, default=0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _i(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _to_position_out(d: dict) -> PositionOut:
    """Map an OKX position dict (same shape from REST or the WS channel)."""
    return PositionOut(
        inst_id=d.get("instId", ""),
        pos_side=d.get("posSide", "net"),
        position=_f(d.get("pos")),
        avg_px=_f(d.get("avgPx")),
        mark_px=_f(d.get("markPx")),
        upl=_f(d.get("upl")),
        upl_ratio=_f(d.get("uplRatio")) or None,
        realized_pnl=_f(d.get("realizedPnl")) or None,
        margin=_f(d.get("margin")) or None,
        mgn_mode=d.get("mgnMode") or None,
        lever=d.get("lever") or None,
        liq_px=_f(d.get("liqPx")) or None,
        c_time=_i(d.get("cTime")),
    )


def get_positions(db: Session | None = None) -> List[PositionOut]:
    # Prefer the real-time WS snapshot (updated on every fill) when the private
    # channel is connected; fall back to a REST pull otherwise.
    if live.positions_fresh():
        rows = live.positions()
    else:
        rows = check(account_api().get_positions()).get("data", [])
    return [_to_position_out(d) for d in rows if _f(d.get("pos")) != 0]


def get_positions_history(limit: int = 50) -> List[ClosedPositionOut]:
    """Closed positions from OKX positions-history (demo). Newest first."""
    resp = check(account_api().get_positions_history(limit=str(limit)))
    out: List[ClosedPositionOut] = []
    for d in resp.get("data", []):
        out.append(
            ClosedPositionOut(
                inst_id=d.get("instId", ""),
                pos_side=d.get("direction") or d.get("posSide") or "net",
                close_type=d.get("type") or None,
                open_avg_px=_f(d.get("openAvgPx")),
                close_avg_px=_f(d.get("closeAvgPx")),
                realized_pnl=_f(d.get("realizedPnl") or d.get("pnl")) or None,
                pnl_ratio=_f(d.get("pnlRatio")) or None,
                open_max_pos=_f(d.get("openMaxPos")) or None,
                close_total_pos=_f(d.get("closeTotalPos")) or None,
                lever=d.get("lever") or None,
                mgn_mode=d.get("mgnMode") or None,
                c_time=_i(d.get("cTime")),
                u_time=_i(d.get("uTime")),
            )
        )
    return out


def close_position(inst_id: str, pos_side: str = "net", mgn_mode: str = "cross") -> dict:
    """Close a position at market via OKX's close-position endpoint (demo)."""
    resp = trade_api().close_positions(
        instId=inst_id,
        mgnMode=mgn_mode,
        posSide=pos_side if pos_side != "net" else "",
        autoCxl=True,
    )
    return check(resp)
