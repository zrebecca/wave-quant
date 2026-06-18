"""Account equity snapshots."""
from sqlalchemy import Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin


class Account(Base, TimestampMixin):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    total_equity: Mapped[float] = mapped_column(Numeric(24, 8), default=0)
    available_balance: Mapped[float] = mapped_column(Numeric(24, 8), default=0)
    unrealized_pnl: Mapped[float] = mapped_column(Numeric(24, 8), default=0)
    margin_ratio: Mapped[float | None] = mapped_column(Numeric(24, 8), nullable=True)
    currency: Mapped[str] = mapped_column(String(16), default="USDT")
