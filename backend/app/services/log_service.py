"""Central event logging: persists to MySQL and streams to the frontend."""
import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.core.database import session_scope
from app.repositories import log_repo
from app.services.ws_manager import hub, notify

logger = logging.getLogger(__name__)


def log_event(
    message: str,
    category: str = "system",
    level: str = "INFO",
    detail: Optional[dict] = None,
    db: Optional[Session] = None,
    toast: Optional[str] = None,
    toast_key: Optional[str] = None,
    toast_vars: Optional[dict] = None,
) -> None:
    """Persist a log row, broadcast it, and optionally raise a toast.

    Args:
        toast: if set (success|info|warning|error), also emits a frontend toast.
        toast_key: i18n key so the frontend localizes the toast; `message` stays
            the English fallback (and the persisted log text).
        toast_vars: placeholder values for `toast_key`.
    """
    def _write(session: Session):
        row = log_repo.add_log(session, message=message, level=level, category=category, detail=detail)
        hub.publish_threadsafe(
            "log",
            {
                "id": row.id,
                "level": row.level,
                "category": row.category,
                "message": row.message,
                "created_at": row.created_at.isoformat(),
            },
        )

    try:
        if db is not None:
            _write(db)
        else:
            with session_scope() as session:
                _write(session)
    except Exception as exc:  # logging must never crash the caller
        logger.error("failed to persist log event: %s", exc)

    logger.log(getattr(logging, level, logging.INFO), "[%s] %s", category, message)
    if toast:
        notify(message, kind=toast, description=category, key=toast_key, vars=toast_vars)
