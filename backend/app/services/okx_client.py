"""Thin factory over the python-okx SDK, pinned to Demo Trading.

Every client is created with the demo flag (validated by ``enforce_demo_flag``),
so no part of the application can construct a live-trading client.

OKX is reached over plain REST (``requests``). When ``HTTP_PROXY`` is configured
we export it to the process environment in :func:`apply_proxy_env` so that
``requests`` tunnels through it — matching how the legacy market maker reaches
OKX behind a local Clash proxy. We deliberately avoid passing ``proxy=`` to the
SDK constructor to stay compatible across python-okx versions.
"""
import logging
import os
from functools import lru_cache

from okx.Account import AccountAPI
from okx.MarketData import MarketAPI
from okx.PublicData import PublicAPI
from okx.Trade import TradeAPI

from app.core.config import settings
from app.core.security import enforce_demo_flag

logger = logging.getLogger(__name__)


def apply_proxy_env() -> None:
    """Export the configured proxy so ``requests`` (and the SDK) honour it."""
    if settings.HTTP_PROXY:
        os.environ.setdefault("HTTP_PROXY", settings.HTTP_PROXY)
        os.environ.setdefault("HTTPS_PROXY", settings.HTTP_PROXY)
        os.environ.setdefault("http_proxy", settings.HTTP_PROXY)
        os.environ.setdefault("https_proxy", settings.HTTP_PROXY)
        logger.info("Routing OKX REST through proxy %s", settings.HTTP_PROXY)


@lru_cache
def trade_api() -> TradeAPI:
    flag = enforce_demo_flag(settings.OKX_FLAG)
    return TradeAPI(
        api_key=settings.OKX_API_KEY,
        api_secret_key=settings.OKX_API_SECRET,
        passphrase=settings.OKX_API_PASSPHRASE,
        flag=flag,
        debug=False,
    )


@lru_cache
def account_api() -> AccountAPI:
    flag = enforce_demo_flag(settings.OKX_FLAG)
    return AccountAPI(
        api_key=settings.OKX_API_KEY,
        api_secret_key=settings.OKX_API_SECRET,
        passphrase=settings.OKX_API_PASSPHRASE,
        flag=flag,
        debug=False,
    )


@lru_cache
def market_api() -> MarketAPI:
    flag = enforce_demo_flag(settings.OKX_FLAG)
    return MarketAPI(flag=flag, debug=False)


@lru_cache
def public_api() -> PublicAPI:
    flag = enforce_demo_flag(settings.OKX_FLAG)
    return PublicAPI(flag=flag, debug=False)


class OkxError(RuntimeError):
    """Raised when an OKX REST call returns a non-zero code."""

    def __init__(self, code: str, msg: str):
        self.code = code
        self.msg = msg
        super().__init__(f"OKX error {code}: {msg}")


def check(resp: dict) -> dict:
    """Validate an OKX REST response, raising OkxError on failure."""
    if not isinstance(resp, dict):
        raise OkxError("-1", f"unexpected response: {resp!r}")
    if str(resp.get("code")) != "0":
        # Surface the per-item sCode/sMsg when present (e.g. place_order failures).
        data = resp.get("data") or []
        if data and isinstance(data, list) and isinstance(data[0], dict) and data[0].get("sMsg"):
            raise OkxError(str(data[0].get("sCode", resp.get("code"))), data[0]["sMsg"])
        raise OkxError(str(resp.get("code")), resp.get("msg", "unknown error"))
    return resp
