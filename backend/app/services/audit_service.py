"""Operation audit + risk-event recording and querying.

`record_audit` captures sensitive actions (who/what/before/after/result).
`record_risk_event` captures each risk-engine action. Both accept an optional
session so callers inside a request or the bot thread can reuse their session.
"""
import json
import logging
import time
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import session_scope
from app.models.audit import OperationAudit, RiskEvent

logger = logging.getLogger(__name__)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _dump(obj) -> Optional[str]:
    if obj is None:
        return None
    try:
        return json.dumps(obj, default=str, ensure_ascii=False)
    except Exception:
        return str(obj)


def record_audit(
    actor: str,
    action: str,
    *,
    target: Optional[str] = None,
    before=None,
    after=None,
    result: str = "ok",
    detail: Optional[str] = None,
    trace_id: Optional[str] = None,
    db: Optional[Session] = None,
) -> None:
    """Persist an operation audit row. Never raises (audit must not break the action)."""

    def _write(session: Session):
        session.add(
            OperationAudit(
                actor=actor,
                action=action,
                target=target,
                result=result,
                before=_dump(before),
                after=_dump(after),
                detail=detail,
                trace_id=trace_id,
            )
        )

    try:
        if db is not None:
            _write(db)
            db.commit()
        else:
            with session_scope() as session:
                _write(session)
    except Exception as exc:  # pragma: no cover - audit must be best-effort
        logger.error("failed to record audit %s: %s", action, exc)


def record_risk_event(
    rule: str,
    action: str,
    message: str,
    *,
    level: str = "WARNING",
    metric_value: Optional[float] = None,
    threshold: Optional[float] = None,
    inst_id: Optional[str] = None,
    db: Optional[Session] = None,
) -> None:
    def _write(session: Session):
        session.add(
            RiskEvent(
                rule=rule,
                action=action,
                message=message,
                level=level,
                metric_value=metric_value,
                threshold=threshold,
                inst_id=inst_id,
                ts=_now_ms(),
            )
        )

    try:
        if db is not None:
            _write(db)
            db.commit()
        else:
            with session_scope() as session:
                _write(session)
    except Exception as exc:  # pragma: no cover
        logger.error("failed to record risk event %s: %s", rule, exc)


def list_audits(db: Session, limit: int = 200, action: Optional[str] = None):
    stmt = select(OperationAudit).order_by(OperationAudit.id.desc()).limit(limit)
    if action:
        stmt = (
            select(OperationAudit)
            .where(OperationAudit.action == action)
            .order_by(OperationAudit.id.desc())
            .limit(limit)
        )
    return list(db.scalars(stmt))


def list_risk_events(db: Session, limit: int = 200, level: str | None = None):
    stmt = select(RiskEvent)
    if level:
        stmt = stmt.where(RiskEvent.level == level)
    return list(db.scalars(stmt.order_by(RiskEvent.id.desc()).limit(limit)))


def clear_risk_events(db: Session) -> int:
    from sqlalchemy import delete

    n = db.execute(delete(RiskEvent)).rowcount or 0
    db.commit()
    return n
