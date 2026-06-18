"""Operation audit trail and risk-event log.

- ``operation_audits`` records every sensitive action (bot start/pause/stop,
  cancel, strategy/risk edits, emergency stop/close) with actor, before/after
  snapshots and result — for accountability and traceability.
- ``risk_events`` records each time the risk engine acts (alert / pause /
  cancel / stop / stop-and-close), with the metric, threshold and chosen action.
"""
from sqlalchemy import BigInteger, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin


class OperationAudit(Base, TimestampMixin):
    __tablename__ = "operation_audits"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    actor: Mapped[str] = mapped_column(String(64), index=True, default="system")
    action: Mapped[str] = mapped_column(String(48), index=True)  # e.g. bot.start, order.cancel
    target: Mapped[str | None] = mapped_column(String(128), nullable=True)
    result: Mapped[str] = mapped_column(String(16), default="ok")  # ok / error
    before: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON snapshot before
    after: Mapped[str | None] = mapped_column(Text, nullable=True)   # JSON snapshot after
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    trace_id: Mapped[str | None] = mapped_column(String(40), index=True, nullable=True)


class RiskEvent(Base, TimestampMixin):
    __tablename__ = "risk_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    rule: Mapped[str] = mapped_column(String(48), index=True)  # e.g. max_position
    level: Mapped[str] = mapped_column(String(16), default="WARNING")
    action: Mapped[str] = mapped_column(String(24), default="alert")
    metric_value: Mapped[float | None] = mapped_column(Numeric(24, 8), nullable=True)
    threshold: Mapped[float | None] = mapped_column(Numeric(24, 8), nullable=True)
    inst_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    message: Mapped[str] = mapped_column(Text)
    ts: Mapped[int | None] = mapped_column(BigInteger, nullable=True)  # epoch ms
