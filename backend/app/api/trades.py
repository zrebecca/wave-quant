from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import okx_guard
from app.core.database import get_db
from app.schemas.order import TradeOut
from app.services import order_service

router = APIRouter()


@router.get("/trades", response_model=List[TradeOut])
def list_trades(
    inst_id: Optional[str] = Query(None),
    sync: bool = Query(True),
    db: Session = Depends(get_db),
):
    try:
        if sync:
            order_service.sync_fills(db)
        return order_service.list_trades(db, inst_id=inst_id)
    except Exception as exc:
        raise okx_guard(exc)
