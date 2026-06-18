from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import okx_guard, require_admin
from app.core.database import get_db
from app.models.user import User
from app.schemas.account import (
    AccountConfigOut,
    AccountOut,
    EquityPoint,
    LeverageOut,
    PositionModeRequest,
    SetLeverageRequest,
)
from app.services import account_service, audit_service

router = APIRouter()


@router.get("/account", response_model=AccountOut)
def get_account(db: Session = Depends(get_db)):
    try:
        return account_service.get_account_summary(db)
    except Exception as exc:
        raise okx_guard(exc)


@router.get("/account/equity-history", response_model=List[EquityPoint])
def equity_history(limit: int = Query(200, ge=1, le=1000), db: Session = Depends(get_db)):
    return account_service.get_equity_history(db, limit)


@router.get("/account/config", response_model=AccountConfigOut)
def get_account_config():
    try:
        return account_service.get_config()
    except Exception as exc:
        raise okx_guard(exc)


@router.post("/account/position-mode", response_model=AccountConfigOut)
def set_position_mode(
    req: PositionModeRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    try:
        result = account_service.set_position_mode(req.pos_mode)
        audit_service.record_audit(admin.username, "account.position_mode", target=req.pos_mode, db=db)
        return result
    except Exception as exc:
        raise okx_guard(exc)


@router.get("/account/leverage", response_model=LeverageOut)
def get_leverage(inst_id: str = Query(...), mgn_mode: str = Query("cross")):
    try:
        return account_service.get_leverage(inst_id, mgn_mode)
    except Exception as exc:
        raise okx_guard(exc)


@router.post("/account/leverage", response_model=LeverageOut)
def set_leverage(
    req: SetLeverageRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    try:
        result = account_service.set_leverage(req.inst_id, req.lever, req.mgn_mode)
        audit_service.record_audit(
            admin.username,
            "account.leverage",
            target=req.inst_id,
            after={"lever": req.lever, "mgn_mode": req.mgn_mode},
            db=db,
        )
        return result
    except Exception as exc:
        raise okx_guard(exc)
