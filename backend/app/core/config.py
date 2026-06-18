"""Application configuration.

All settings are loaded from environment variables (see backend/.env.example).
The OKX credentials and trading flag are intentionally pinned to *Demo Trading*
— see ``app.core.security`` for the runtime guard that makes live trading
impossible regardless of how the environment is configured.
"""
from functools import lru_cache
from typing import Annotated, List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- App ----
    APP_NAME: str = "OKX Quant Trading Dashboard"
    API_PREFIX: str = "/api"
    DEBUG: bool = False
    # NoDecode: skip pydantic-settings' JSON parsing so a plain CSV env value
    # (e.g. "http://a,http://b") is handled by the _split_csv validator below.
    CORS_ORIGINS: Annotated[List[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://localhost"]
    )

    # ---- Auth ----
    # Secret for signing access tokens. Override in .env for any shared/public deploy.
    SECRET_KEY: str = "dev-insecure-change-me-okx-quant-dashboard"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 12  # 12h
    # Bootstrap admin, seeded on first startup if no users exist.
    DEFAULT_ADMIN_USERNAME: str = "admin"
    DEFAULT_ADMIN_PASSWORD: str = "admin123456"

    # ---- OKX (Demo Trading) ----
    # flag '1' == OKX demo trading. This is the ONLY supported value.
    OKX_API_KEY: str = ""
    OKX_API_SECRET: str = ""
    OKX_API_PASSPHRASE: str = ""
    OKX_FLAG: str = "1"  # '1' = demo, '0' = live (BLOCKED by security guard)
    OKX_REST_URL: str = "https://www.okx.com"
    OKX_WS_PUBLIC_URL: str = "wss://wspap.okx.com:8443/ws/v5/public"
    OKX_WS_PRIVATE_URL: str = "wss://wspap.okx.com:8443/ws/v5/private"

    # Optional outbound proxy (e.g. local Clash on 127.0.0.1:7897) for reaching OKX.
    HTTP_PROXY: str = ""

    # Instruments tracked by the market-data service / dashboard.
    TRADING_INSTRUMENTS: Annotated[List[str], NoDecode] = Field(
        default_factory=lambda: ["BTC-USDT-SWAP", "ETH-USDT-SWAP"]
    )

    # ---- Database ----
    # Set DB_URL to override (e.g. local run without MySQL):
    #   DB_URL=sqlite:///./okx_dashboard.db
    # Otherwise a MySQL URL is built from the parts below (docker default).
    DB_URL: str = ""
    MYSQL_HOST: str = "mysql"
    MYSQL_PORT: int = 3306
    MYSQL_USER: str = "okx"
    MYSQL_PASSWORD: str = "okx_pass"
    MYSQL_DB: str = "okx_dashboard"

    # ---- Cache ----
    # CACHE_BACKEND: "redis" (default) or "memory" (no Redis needed for local runs).
    CACHE_BACKEND: str = "redis"
    REDIS_HOST: str = "redis"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0

    @field_validator("CORS_ORIGINS", "TRADING_INSTRUMENTS", mode="before")
    @classmethod
    def _split_csv(cls, v):
        if isinstance(v, str):
            return [item.strip() for item in v.split(",") if item.strip()]
        return v

    @property
    def database_url(self) -> str:
        if self.DB_URL:
            return self.DB_URL
        return (
            f"mysql+pymysql://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}"
            f"@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DB}?charset=utf8mb4"
        )

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def redis_url(self) -> str:
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
