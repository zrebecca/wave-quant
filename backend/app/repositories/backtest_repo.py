"""CRUD for persisted backtest runs (history)."""
import json
from typing import List, Optional

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.backtest import BacktestRun
from app.schemas.backtest import BacktestRequest, BacktestResult


def record_run(db: Session, req: BacktestRequest, res: BacktestResult) -> BacktestRun:
    """Save one completed backtest (config + key metrics)."""
    run = BacktestRun(
        inst_id=res.inst_id,
        bar=req.bar,
        strategy=res.strategy,
        limit_bars=req.limit,
        params=json.dumps(req.model_dump()),
        total_return_pct=res.total_return_pct,
        annualized_return_pct=res.annualized_return_pct,
        max_drawdown_pct=res.max_drawdown_pct,
        sharpe=res.sharpe,
        trade_count=res.trade_count,
        win_rate_pct=res.win_rate_pct,
        profit_factor=res.profit_factor,
        total_fee=res.total_fee,
        final_equity=res.final_equity,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def list_runs(db: Session, limit: int = 100, strategy: Optional[str] = None) -> List[BacktestRun]:
    stmt = select(BacktestRun)
    if strategy:
        stmt = stmt.where(BacktestRun.strategy == strategy)
    stmt = stmt.order_by(BacktestRun.id.desc()).limit(limit)
    return list(db.scalars(stmt))


def delete_run(db: Session, run_id: int) -> bool:
    run = db.get(BacktestRun, run_id)
    if not run:
        return False
    db.delete(run)
    db.commit()
    return True


def clear_runs(db: Session) -> int:
    n = db.execute(delete(BacktestRun)).rowcount or 0
    db.commit()
    return n
