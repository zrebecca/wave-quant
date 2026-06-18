"""Strategy and risk configuration, persisted and dynamically loaded by the bot."""
from typing import Optional

from sqlalchemy import Boolean, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin


class StrategyConfig(Base, TimestampMixin):
    __tablename__ = "strategy_configs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, default="default")
    # Owning user (creator). NULL = unowned/global (e.g. the bot's `default`
    # config); user instances are scoped to their owner in the 我的策略 list.
    owner_id: Mapped[Optional[int]] = mapped_column(Integer, index=True, default=None)
    inst_id: Mapped[str] = mapped_column(String(64), default="BTC-USDT-SWAP")
    order_size: Mapped[float] = mapped_column(Numeric(24, 8), default=1)
    spread: Mapped[float] = mapped_column(Numeric(24, 8), default=0.001)  # fraction, e.g. 0.001 = 0.1%
    refresh_interval: Mapped[int] = mapped_column(default=5)  # seconds
    max_position: Mapped[float] = mapped_column(Numeric(24, 8), default=10)
    num_levels: Mapped[int] = mapped_column(default=1)  # quotes per side
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Pluggable strategy selector: market_maker (default) | ma_cross | rsi | bollinger.
    strategy_type: Mapped[str] = mapped_column(String(32), default="market_maker")
    # Shared candle timeframe for indicator strategies; MA-crossover windows.
    ma_fast: Mapped[int] = mapped_column(default=5)    # fast SMA window
    ma_slow: Mapped[int] = mapped_column(default=20)   # slow SMA window
    ma_bar: Mapped[str] = mapped_column(String(8), default="1H")  # candle timeframe (all indicators)
    # RSI mean-reversion params.
    rsi_len: Mapped[int] = mapped_column(default=14)
    rsi_low: Mapped[float] = mapped_column(Numeric(24, 8), default=30)
    rsi_high: Mapped[float] = mapped_column(Numeric(24, 8), default=70)
    # Bollinger-band reversion params.
    boll_len: Mapped[int] = mapped_column(default=20)
    boll_k: Mapped[float] = mapped_column(Numeric(24, 8), default=2)
    # Spot-grid (现货网格) params: price band + number of grids.
    grid_low: Mapped[float] = mapped_column(Numeric(24, 8), default=0)
    grid_high: Mapped[float] = mapped_column(Numeric(24, 8), default=0)
    grid_count: Mapped[int] = mapped_column(default=10)
    # Take-profit / stop-loss as % from entry for directional (non-MM) strategies;
    # 0 = disabled. The bot auto-manages a reduce-only TP/SL bracket per position.
    tp_pct: Mapped[float] = mapped_column(Numeric(24, 8), default=0)
    sl_pct: Mapped[float] = mapped_column(Numeric(24, 8), default=0)
    # Entry execution for directional strategies: True = market (taker, default),
    # False = post-only maker at the touch with a market fallback on timeout.
    entry_taker: Mapped[bool] = mapped_column(Boolean, default=True)
    # Max size per child order when reaching a target (TWAP-style slicing of large
    # rebalances over cycles); 0 = no slicing (send the whole gap at once).
    max_slice: Mapped[float] = mapped_column(Numeric(24, 8), default=0)


class RiskConfig(Base, TimestampMixin):
    __tablename__ = "risk_configs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, default="default")
    max_position: Mapped[float] = mapped_column(Numeric(24, 8), default=10)  # 最大总持仓(数量)
    max_order_notional: Mapped[float] = mapped_column(Numeric(24, 8), default=50000)  # 单笔名义上限(USD)
    max_open_orders: Mapped[int] = mapped_column(default=20)  # 最大挂单数
    max_daily_loss: Mapped[float] = mapped_column(Numeric(24, 8), default=1000)  # 单日最大亏损(USD)
    # 净多 / 净空(数量) / 总风险敞口(USD)
    max_net_long: Mapped[float] = mapped_column(Numeric(24, 8), default=5)
    max_net_short: Mapped[float] = mapped_column(Numeric(24, 8), default=5)
    max_gross_exposure: Mapped[float] = mapped_column(Numeric(24, 8), default=100000)
    # 下单频率(每分钟) / 撤单频率(每分钟) / 最大回撤(%) / 最大行情延迟(秒)
    max_order_rate: Mapped[int] = mapped_column(default=60)
    max_cancel_rate: Mapped[int] = mapped_column(default=120)
    max_drawdown: Mapped[float] = mapped_column(Numeric(24, 8), default=20)
    max_market_delay_sec: Mapped[int] = mapped_column(default=5)
    max_consecutive_losses: Mapped[int] = mapped_column(default=10)
    # 触发后的动作：alert / pause / cancel / stop / stop_close
    on_breach_action: Mapped[str] = mapped_column(String(16), default="stop")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
