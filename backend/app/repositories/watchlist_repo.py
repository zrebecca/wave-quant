"""Read/write a user's watchlist (自选 favorites + pinned), stored as JSON text."""
import json
from typing import List, Tuple

from sqlalchemy.orm import Session

from app.models.watchlist import UserWatchlist


def _loads(raw: str | None) -> List[str]:
    try:
        val = json.loads(raw or "[]")
        return [str(x) for x in val] if isinstance(val, list) else []
    except (ValueError, TypeError):
        return []


def get_watchlist(db: Session, user_id: int) -> Tuple[List[str], List[str]]:
    """Return (favorites, pinned) for the user; empty lists if no row yet."""
    row = db.get(UserWatchlist, user_id)
    if row is None:
        return [], []
    return _loads(row.favorites), _loads(row.pinned)


def set_watchlist(
    db: Session, user_id: int, favorites: List[str], pinned: List[str]
) -> Tuple[List[str], List[str]]:
    """Upsert the user's favorites/pinned. ``pinned`` is clamped to favorites."""
    favs = [str(x) for x in favorites]
    pins = [str(x) for x in pinned if x in favs]
    row = db.get(UserWatchlist, user_id)
    if row is None:
        row = UserWatchlist(user_id=user_id)
        db.add(row)
    row.favorites = json.dumps(favs)
    row.pinned = json.dumps(pins)
    db.commit()
    return favs, pins
