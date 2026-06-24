"""Per-user display preferences (设置).

Stored server-side, one row per user, so theme / 涨跌色 / 价格单位 / 语言 / 币种图标
follow the account across browsers, ports and devices instead of living only in the
browser's ``localStorage`` (which is per-origin and gets wiped when the dashboard port
changes or the browser data is cleared).
"""
from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin


class UserPref(Base, TimestampMixin):
    __tablename__ = "user_prefs"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    theme: Mapped[str] = mapped_column(String(8), nullable=False, default="dark")        # "light" | "dark"
    up_down: Mapped[str] = mapped_column(String(8), nullable=False, default="green")     # "green" | "red"
    fiat: Mapped[str] = mapped_column(String(8), nullable=False, default="USD")          # "USD" | "CNY"
    lang: Mapped[str] = mapped_column(String(8), nullable=False, default="en")           # "en" | "zh" | "zh-TW"
    coin_icons: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
