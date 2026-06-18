"""Persisted backtest history — every /backtest run stores its config + key metrics
so users can review past runs (survives refresh / restart, unlike the in-page compare)."""
from sqlalchemy import Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin


class BacktestRun(Base, TimestampMixin):
    __tablename__ = "backtest_runs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    inst_id: Mapped[str] = mapped_column(String(64), index=True)
    bar: Mapped[str] = mapped_column(String(8))
    strategy: Mapped[str] = mapped_column(String(24), index=True)
    limit_bars: Mapped[int] = mapped_column(Integer)
    params: Mapped[str] = mapped_column(Text)  # full BacktestRequest as JSON

    # Key result metrics (enough to render a history table without re-running).
    total_return_pct: Mapped[float] = mapped_column(Numeric(16, 4))
    annualized_return_pct: Mapped[float] = mapped_column(Numeric(16, 4))
    max_drawdown_pct: Mapped[float] = mapped_column(Numeric(16, 4))
    sharpe: Mapped[float] = mapped_column(Numeric(16, 4))
    trade_count: Mapped[int] = mapped_column(Integer)
    win_rate_pct: Mapped[float] = mapped_column(Numeric(16, 4))
    profit_factor: Mapped[float] = mapped_column(Numeric(16, 4))
    total_fee: Mapped[float] = mapped_column(Numeric(20, 4))
    final_equity: Mapped[float] = mapped_column(Numeric(20, 4))
