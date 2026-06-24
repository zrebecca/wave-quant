"""Per-user watchlist (自选).

Stored server-side, one row per user, so the favorites/pinned list follows the
account across browsers, ports and devices instead of living only in the browser's
``localStorage`` (which is per-origin and gets wiped when the dashboard port changes).
"""
from sqlalchemy import ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin


class UserWatchlist(Base, TimestampMixin):
    __tablename__ = "user_watchlists"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    favorites: Mapped[str] = mapped_column(Text, nullable=False, default="[]")  # JSON list of instId
    pinned: Mapped[str] = mapped_column(Text, nullable=False, default="[]")     # JSON list of instId
