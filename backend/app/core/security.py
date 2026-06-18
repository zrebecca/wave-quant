"""Hard safety guard: this project may ONLY talk to OKX Demo Trading.

Every code path that could place / cancel / amend a real order routes its OKX
``flag`` through :func:`enforce_demo_flag`. If anything ever tries to use the
live-trading flag (``'0'``), we raise immediately instead of sending the request.
This is defence-in-depth on top of the ``OKX_FLAG`` default in the config.
"""
from app.core.config import settings

DEMO_FLAG = "1"
LIVE_FLAG = "0"


class LiveTradingBlockedError(RuntimeError):
    """Raised whenever live trading is attempted. Always a bug — never expected."""


def enforce_demo_flag(flag: str | None = None) -> str:
    """Return the validated OKX flag, guaranteeing it is the demo flag.

    Raises:
        LiveTradingBlockedError: if a live-trading flag is requested.
    """
    resolved = flag if flag is not None else settings.OKX_FLAG
    if resolved != DEMO_FLAG:
        raise LiveTradingBlockedError(
            "Live trading is permanently disabled in this project. "
            f"Refused OKX flag={resolved!r}; only demo flag '1' is allowed."
        )
    return DEMO_FLAG


# Fail fast at import time if the environment is misconfigured for live trading.
enforce_demo_flag()
