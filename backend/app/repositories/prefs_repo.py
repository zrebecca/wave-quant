"""Read/write a user's display preferences (设置)."""
from typing import Optional

from sqlalchemy.orm import Session

from app.models.user_prefs import UserPref


def get_prefs(db: Session, user_id: int) -> Optional[UserPref]:
    """Return the user's prefs row, or ``None`` if they have no row yet."""
    return db.get(UserPref, user_id)


def set_prefs(
    db: Session,
    user_id: int,
    *,
    theme: Optional[str] = None,
    up_down: Optional[str] = None,
    fiat: Optional[str] = None,
    lang: Optional[str] = None,
    coin_icons: Optional[bool] = None,
) -> UserPref:
    """Upsert the user's prefs. Only non-``None`` fields are written, so a partial
    payload leaves the other settings untouched."""
    row = db.get(UserPref, user_id)
    if row is None:
        row = UserPref(user_id=user_id)
        db.add(row)
    if theme is not None:
        row.theme = theme
    if up_down is not None:
        row.up_down = up_down
    if fiat is not None:
        row.fiat = fiat
    if lang is not None:
        row.lang = lang
    if coin_icons is not None:
        row.coin_icons = coin_icons
    db.commit()
    db.refresh(row)
    return row
