"""Open positions snapshot."""
from sqlalchemy import Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin


class Position(Base, TimestampMixin):
    __tablename__ = "positions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    inst_id: Mapped[str] = mapped_column(String(64), index=True)
    pos_side: Mapped[str] = mapped_column(String(16), default="net")  # long / short / net
    position: Mapped[float] = mapped_column(Numeric(24, 8), default=0)
    avg_px: Mapped[float] = mapped_column(Numeric(24, 8), default=0)
    mark_px: Mapped[float] = mapped_column(Numeric(24, 8), default=0)
    upl: Mapped[float] = mapped_column(Numeric(24, 8), default=0)  # unrealized pnl
    upl_ratio: Mapped[float | None] = mapped_column(Numeric(24, 8), nullable=True)
    margin: Mapped[float | None] = mapped_column(Numeric(24, 8), nullable=True)
    lever: Mapped[str | None] = mapped_column(String(16), nullable=True)
