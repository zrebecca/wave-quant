"""CRUD for system logs."""
import json
from datetime import datetime
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.log import SystemLog


def add_log(
    db: Session,
    message: str,
    level: str = "INFO",
    category: str = "system",
    detail: Optional[dict] = None,
) -> SystemLog:
    log = SystemLog(
        message=message,
        level=level,
        category=category,
        detail=json.dumps(detail) if detail else None,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def list_logs(
    db: Session,
    level: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 200,
) -> List[SystemLog]:
    stmt = select(SystemLog)
    if level:
        stmt = stmt.where(SystemLog.level == level)
    if category:
        stmt = stmt.where(SystemLog.category == category)
    if search:
        stmt = stmt.where(SystemLog.message.like(f"%{search}%"))
    stmt = stmt.order_by(SystemLog.id.desc()).limit(limit)
    return list(db.scalars(stmt))


def daily_realized_pnl(db: Session) -> float:
    """Sum trade-derived realized pnl proxy for today (fees only, demo heuristic)."""
    # The dashboard surfaces unrealized pnl from positions; this stays simple.
    from app.models.order import Trade

    start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    trades = db.scalars(select(Trade).where(Trade.created_at >= start))
    return float(sum(float(t.fee or 0) for t in trades))
