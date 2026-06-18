"""Structured system / strategy / order event logs."""
from sqlalchemy import Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin


class SystemLog(Base, TimestampMixin):
    __tablename__ = "system_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    level: Mapped[str] = mapped_column(String(16), index=True, default="INFO")  # INFO/WARN/ERROR
    category: Mapped[str] = mapped_column(String(24), index=True, default="system")
    # category in: order / trade / strategy / risk / bot / system / error
    message: Mapped[str] = mapped_column(Text)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON string

    __table_args__ = (Index("ix_logs_cat_level", "category", "level"),)
