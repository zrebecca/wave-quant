"""Shared FastAPI dependencies and error handling for OKX calls."""
from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import decode_access_token, parse_bearer
from app.core.database import get_db
from app.models.user import User
from app.repositories import user_repo
from app.services.okx_client import OkxError

__all__ = [
    "get_db",
    "Session",
    "Depends",
    "okx_guard",
    "get_current_user",
    "require_admin",
]


def okx_guard(exc: Exception) -> HTTPException:
    """Translate an OkxError / generic exception into an HTTP 502."""
    if isinstance(exc, OkxError):
        return HTTPException(status_code=502, detail=f"OKX error {exc.code}: {exc.msg}")
    return HTTPException(status_code=500, detail=str(exc))


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    """Resolve the authenticated user from the Bearer token, or raise 401."""
    token = parse_bearer(authorization)
    payload = decode_access_token(token) if token else None
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = user_repo.get_by_id(db, int(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User inactive or not found")
    return user


def require_admin(current: User = Depends(get_current_user)) -> User:
    """Require the authenticated user to be an admin, else raise 403."""
    if not current.is_admin:
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return current
