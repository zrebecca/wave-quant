"""Bot runtime status (single-row table, id=1)."""
from sqlalchemy import BigInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin

# Bot lifecycle states.
BOT_STOPPED = "STOPPED"
BOT_STARTING = "STARTING"
BOT_RUNNING = "RUNNING"
BOT_PAUSED = "PAUSED"
BOT_STOPPING = "STOPPING"
BOT_ERROR = "ERROR"
BOT_RISK_STOPPED = "RISK_STOPPED"  # halted by the risk engine


class BotStatus(Base, TimestampMixin):
    __tablename__ = "bot_status"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    state: Mapped[str] = mapped_column(String(16), default=BOT_STOPPED)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    strategy_name: Mapped[str] = mapped_column(String(64), default="default")
    strategy_version: Mapped[int | None] = mapped_column(nullable=True)  # version bound at start
    started_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)  # epoch ms
    last_heartbeat: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    last_quote_ts: Mapped[int | None] = mapped_column(BigInteger, nullable=True)  # last quote refresh ms
    cycles: Mapped[int] = mapped_column(default=0)
