from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import okx_guard, require_admin
from app.core.database import get_db
from app.models.user import User
from app.schemas.common import MessageResponse
from app.schemas.order import (
    AlgoOrderOut,
    AlgoOrderRequest,
    CancelAlgoRequest,
    CancelOrderRequest,
    OrderOut,
    PlaceOrderRequest,
    TriggerOrderRequest,
)
from app.services import audit_service, order_service, risk_service

router = APIRouter()


@router.get("/orders", response_model=List[OrderOut])
def list_orders(
    open_only: bool = Query(False),
    inst_id: Optional[str] = Query(None),
    sync: bool = Query(True, description="reconcile with OKX before returning"),
    db: Session = Depends(get_db),
):
    try:
        if sync:
            order_service.sync_open_orders(db)
        return order_service.list_orders(db, open_only=open_only, inst_id=inst_id)
    except Exception as exc:
        raise okx_guard(exc)


@router.post("/order", response_model=OrderOut)
def place_order(
    req: PlaceOrderRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    # Hard pre-trade risk check (notional + open orders + projected net position).
    # Close orders (reduce_only / hedge posSide) lower exposure, so they bypass the check.
    is_close = req.reduce_only or (req.pos_side and req.pos_side != "net")
    if not is_close:
        breach = risk_service.pre_order_breach(db, req.inst_id, req.side, req.size, req.price)
        if breach:
            raise HTTPException(status_code=400, detail=breach)
    try:
        result = order_service.place_order(db, req, source="manual")
        audit_service.record_audit(
            admin.username,
            "order.place",
            target=req.inst_id,
            after={"side": req.side, "size": req.size, "price": req.price, "type": req.ord_type},
            db=db,
        )
        return result
    except order_service.OrderValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise okx_guard(exc)


@router.post("/order/algo", response_model=AlgoOrderOut)
def place_algo(
    req: AlgoOrderRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    try:
        result = order_service.place_algo(db, req, source="manual")
        audit_service.record_audit(
            admin.username, "order.algo", target=req.inst_id,
            after={"side": req.side, "size": req.size, "tp": req.tp_trigger_px, "sl": req.sl_trigger_px}, db=db,
        )
        return result
    except order_service.OrderValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise okx_guard(exc)


@router.post("/order/trigger", response_model=AlgoOrderOut)
def place_trigger(
    req: TriggerOrderRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    try:
        result = order_service.place_trigger(db, req, source="manual")
        audit_service.record_audit(
            admin.username, "order.trigger", target=req.inst_id,
            after={"side": req.side, "size": req.size, "trigger_px": req.trigger_px}, db=db,
        )
        return result
    except order_service.OrderValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise okx_guard(exc)


@router.get("/orders/algo", response_model=List[AlgoOrderOut])
def list_algos(inst_id: Optional[str] = Query(None)):
    try:
        return order_service.list_algos(inst_id=inst_id)
    except Exception as exc:
        raise okx_guard(exc)


@router.post("/order/algo/cancel", response_model=MessageResponse)
def cancel_algo(
    req: CancelAlgoRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    try:
        order_service.cancel_algo(db, req.inst_id, req.algo_id)
        audit_service.record_audit(admin.username, "order.algo_cancel", target=req.inst_id, after={"algo_id": req.algo_id}, db=db)
        return MessageResponse(msg="cancelled")
    except Exception as exc:
        raise okx_guard(exc)


@router.post("/order/cancel", response_model=MessageResponse)
def cancel_order(
    req: CancelOrderRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    try:
        order_service.cancel_order(db, req)
        audit_service.record_audit(
            admin.username, "order.cancel", target=req.inst_id,
            after={"order_id": req.order_id, "client_order_id": req.client_order_id}, db=db,
        )
        return MessageResponse(msg="cancelled")
    except Exception as exc:
        raise okx_guard(exc)


@router.post("/order/cancel-all", response_model=MessageResponse)
def cancel_all(
    inst_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    try:
        count = order_service.cancel_all(db, inst_id=inst_id)
        audit_service.record_audit(
            admin.username, "order.cancel_all", target=inst_id or "ALL",
            after={"cancelled": count}, db=db,
        )
        return MessageResponse(msg=f"cancelled {count} orders")
    except Exception as exc:
        raise okx_guard(exc)
