from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import okx_guard, require_admin
from app.core.database import get_db
from app.models.user import User
from app.repositories import config_repo
from app.schemas.risk import (
    HaltState,
    KillSwitchRequest,
    KillSwitchResult,
    RiskConfigOut,
    RiskConfigUpdate,
    RiskEventOut,
    RiskStatusOut,
)
from app.services import audit_service, risk_service
from app.services.log_service import log_event

router = APIRouter()


@router.get("/risk", response_model=RiskStatusOut)
def get_risk(db: Session = Depends(get_db)):
    try:
        return risk_service.evaluate(db)
    except Exception as exc:
        raise okx_guard(exc)


@router.put("/risk", response_model=RiskConfigOut)
def update_risk(
    payload: RiskConfigUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    before = RiskConfigOut.model_validate(config_repo.get_or_create_risk(db)).model_dump()
    cfg = config_repo.update_risk(db, payload.model_dump(exclude_unset=True))
    after = RiskConfigOut.model_validate(cfg).model_dump()
    log_event(
        "Risk config updated",
        category="risk",
        detail=payload.model_dump(exclude_unset=True),
        db=db,
        toast="success",
    )
    audit_service.record_audit(admin.username, "risk.update", before=before, after=after, db=db)
    return RiskConfigOut.model_validate(cfg)


@router.get("/risk/events", response_model=List[RiskEventOut])
def list_risk_events(
    limit: int = Query(100, ge=1, le=500),
    level: str | None = Query(None),
    db: Session = Depends(get_db),
):
    return [RiskEventOut.model_validate(e) for e in audit_service.list_risk_events(db, limit, level)]


@router.delete("/risk/events")
def clear_risk_events(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return {"ok": True, "deleted": audit_service.clear_risk_events(db)}


@router.get("/risk/halt", response_model=HaltState)
def get_halt():
    return HaltState(**risk_service.halt_state())


@router.post("/risk/kill-switch", response_model=KillSwitchResult)
def kill_switch(
    req: KillSwitchRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    try:
        summary = risk_service.kill_switch(
            db, cancel_orders=req.cancel_orders, close_positions=req.close_positions, actor=admin.username
        )
        audit_service.record_audit(
            admin.username, "risk.kill_switch",
            after={"cancel_orders": req.cancel_orders, "close_positions": req.close_positions, **summary},
            db=db,
        )
        return KillSwitchResult(**summary)
    except Exception as exc:
        raise okx_guard(exc)


@router.post("/risk/resume", response_model=HaltState)
def resume_trading(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    state = risk_service.resume_trading(db, actor=admin.username)
    audit_service.record_audit(admin.username, "risk.resume", after=state, db=db)
    return HaltState(**state)
