"""Immutable strategy parameter snapshots — one row per save / rollback.

Lets the platform show version history, diff two versions and roll back to a
prior parameter set. Each row stores the full resulting parameter set as JSON.
"""
from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin


class StrategyVersion(Base, TimestampMixin):
    __tablename__ = "strategy_versions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    strategy_name: Mapped[str] = mapped_column(String(64), index=True, default="default")
    version: Mapped[int] = mapped_column(Integer, default=1)
    params: Mapped[str] = mapped_column(Text)  # JSON snapshot of the parameter set
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[str] = mapped_column(String(64), default="system")
