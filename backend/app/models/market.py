"""Periodic market snapshots persisted for the dashboard / backtest history."""
from sqlalchemy import BigInteger, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin


class MarketSnapshot(Base, TimestampMixin):
    __tablename__ = "market_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    inst_id: Mapped[str] = mapped_column(String(64), index=True)
    last_px: Mapped[float] = mapped_column(Numeric(24, 8), default=0)
    bid_px: Mapped[float | None] = mapped_column(Numeric(24, 8), nullable=True)
    ask_px: Mapped[float | None] = mapped_column(Numeric(24, 8), nullable=True)
    spread: Mapped[float | None] = mapped_column(Numeric(24, 8), nullable=True)
    vol_24h: Mapped[float | None] = mapped_column(Numeric(24, 8), nullable=True)
    ts: Mapped[int | None] = mapped_column(BigInteger, index=True, nullable=True)
