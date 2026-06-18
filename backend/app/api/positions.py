from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import okx_guard, require_admin
from app.core.database import get_db
from app.models.user import User
from app.schemas.common import MessageResponse
from app.schemas.position import ClosedPositionOut, ClosePositionRequest, PositionOut
from app.services import audit_service, position_service
from app.services.log_service import log_event

router = APIRouter()


@router.get("/positions", response_model=List[PositionOut])
def list_positions(db: Session = Depends(get_db)):
    try:
        return position_service.get_positions(db)
    except Exception as exc:
        raise okx_guard(exc)


@router.get("/positions/history", response_model=List[ClosedPositionOut])
def list_positions_history(limit: int = Query(50, ge=1, le=100)):
    try:
        return position_service.get_positions_history(limit)
    except Exception as exc:
        raise okx_guard(exc)


@router.post("/positions/close", response_model=MessageResponse)
def close_position(
    req: ClosePositionRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    try:
        position_service.close_position(req.inst_id, req.pos_side, req.mgn_mode)
        log_event(f"Closed position {req.inst_id}", category="trade", db=db, toast="info",
                  toast_key="toast.pos.closed", toast_vars={"inst": req.inst_id})
        audit_service.record_audit(
            admin.username, "position.close", target=req.inst_id,
            after={"pos_side": req.pos_side, "mgn_mode": req.mgn_mode}, db=db,
        )
        return MessageResponse(msg=f"closed {req.inst_id}")
    except Exception as exc:
        raise okx_guard(exc)
