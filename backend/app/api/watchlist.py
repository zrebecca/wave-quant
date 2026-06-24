"""Per-user watchlist (自选) — server-side so it follows the account across
browsers/ports/devices instead of living in the browser's localStorage."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.repositories import watchlist_repo
from app.schemas.watchlist import WatchlistOut, WatchlistUpdate

router = APIRouter()


@router.get("/me/watchlist", response_model=WatchlistOut)
def get_my_watchlist(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    favs, pinned = watchlist_repo.get_watchlist(db, current.id)
    return WatchlistOut(favorites=favs, pinned=pinned)


@router.put("/me/watchlist", response_model=WatchlistOut)
def update_my_watchlist(
    payload: WatchlistUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    favs, pinned = watchlist_repo.set_watchlist(db, current.id, payload.favorites, payload.pinned)
    return WatchlistOut(favorites=favs, pinned=pinned)
