from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.pnl import PnlSummary
from app.services import pnl_service

router = APIRouter()


@router.get("/pnl/summary", response_model=PnlSummary)
def pnl_summary(
    days: int | None = Query(None, ge=1, le=365, description="restrict to the last N days"),
    db: Session = Depends(get_db),
):
    """Realized PnL + activity per instrument, aggregated from local fills."""
    return pnl_service.summary(db, days)
