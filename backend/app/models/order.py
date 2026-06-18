"""Orders and trade fills."""
from sqlalchemy import BigInteger, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin


class Order(Base, TimestampMixin):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    order_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    client_order_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    inst_id: Mapped[str] = mapped_column(String(64), index=True)
    side: Mapped[str] = mapped_column(String(8))  # buy / sell
    ord_type: Mapped[str] = mapped_column(String(16))  # limit / market
    price: Mapped[float | None] = mapped_column(Numeric(24, 8), nullable=True)
    size: Mapped[float] = mapped_column(Numeric(24, 8), default=0)
    filled_size: Mapped[float] = mapped_column(Numeric(24, 8), default=0)
    avg_price: Mapped[float | None] = mapped_column(Numeric(24, 8), nullable=True)
    state: Mapped[str] = mapped_column(String(24), index=True, default="live")
    source: Mapped[str] = mapped_column(String(16), default="manual")  # manual / bot
    ts: Mapped[int | None] = mapped_column(BigInteger, nullable=True)  # okx event ts (ms)

    __table_args__ = (Index("ix_orders_inst_state", "inst_id", "state"),)


class Trade(Base, TimestampMixin):
    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    trade_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    order_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    inst_id: Mapped[str] = mapped_column(String(64), index=True)
    side: Mapped[str] = mapped_column(String(8))
    fill_px: Mapped[float] = mapped_column(Numeric(24, 8), default=0)
    fill_sz: Mapped[float] = mapped_column(Numeric(24, 8), default=0)
    fee: Mapped[float | None] = mapped_column(Numeric(24, 8), nullable=True)
    fee_ccy: Mapped[str | None] = mapped_column(String(16), nullable=True)
    fill_pnl: Mapped[float | None] = mapped_column(Numeric(24, 8), nullable=True)  # realized pnl of the fill
    exec_type: Mapped[str | None] = mapped_column(String(2), nullable=True)  # M=maker / T=taker
    source: Mapped[str] = mapped_column(String(16), default="manual")
    ts: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
