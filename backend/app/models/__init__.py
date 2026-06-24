"""SQLAlchemy ORM models.

Importing this package registers every table on ``Base.metadata`` so that
``init_db()`` can create them.
"""
from app.models.account import Account
from app.models.audit import OperationAudit, RiskEvent
from app.models.backtest import BacktestRun
from app.models.bot import BotStatus
from app.models.config import RiskConfig, StrategyConfig
from app.models.log import SystemLog
from app.models.market import MarketSnapshot
from app.models.order import Order, Trade
from app.models.position import Position
from app.models.strategy_version import StrategyVersion
from app.models.user import User
from app.models.user_prefs import UserPref
from app.models.watchlist import UserWatchlist

__all__ = [
    "Account",
    "BotStatus",
    "RiskConfig",
    "StrategyConfig",
    "SystemLog",
    "MarketSnapshot",
    "Order",
    "Trade",
    "Position",
    "User",
    "OperationAudit",
    "RiskEvent",
    "BacktestRun",
    "StrategyVersion",
    "UserWatchlist",
    "UserPref",
]
