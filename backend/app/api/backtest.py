import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import okx_guard, require_admin
from app.core.database import get_db
from app.models.user import User
from app.repositories import backtest_repo
from app.schemas.backtest import BacktestRequest, BacktestResult, BacktestRunOut
from app.services import backtest_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/backtest", response_model=BacktestResult)
def run_backtest(
    req: BacktestRequest,
    save: bool = Query(True),  # set false when re-computing a saved run (avoids duplicate history)
    db: Session = Depends(get_db),
):
    try:
        res = backtest_service.run_backtest(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise okx_guard(exc)
    # Persist to history (best-effort: a DB hiccup must not fail the user's run).
    if save:
        try:
            backtest_repo.record_run(db, req, res)
        except Exception:
            logger.exception("failed to persist backtest run")
    return res


@router.get("/backtest/history", response_model=List[BacktestRunOut])
def backtest_history(
    limit: int = Query(100, ge=1, le=500),
    strategy: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return [BacktestRunOut.model_validate(r) for r in backtest_repo.list_runs(db, limit=limit, strategy=strategy)]


@router.delete("/backtest/history/{run_id}")
def delete_backtest_run(run_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if not backtest_repo.delete_run(db, run_id):
        raise HTTPException(status_code=404, detail="backtest run not found")
    return {"ok": True}


@router.delete("/backtest/history")
def clear_backtest_history(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return {"ok": True, "deleted": backtest_repo.clear_runs(db)}
