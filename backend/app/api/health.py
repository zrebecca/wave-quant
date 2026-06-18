"""Aggregated connection / health status for the frontend status bar.

Reports the live state of: backend service, database, OKX public market
WebSocket consumer, and the trading bot heartbeat — so the UI can show one
unified green/yellow/red indicator instead of guessing from polling failures.
"""
import time

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.repositories.config_repo import get_or_create_bot_status

router = APIRouter()

# A running bot whose heartbeat is older than this is considered stale.
_BOT_HEARTBEAT_STALE_MS = 30_000
# Market WS with no message for longer than this is considered stale.
_MARKET_STALE_MS = 30_000


def _now_ms() -> int:
    return int(time.time() * 1000)


@router.get("/health/status")
def health_status(request: Request, db: Session = Depends(get_db)):
    now = _now_ms()

    # Database — a trivial query proves the connection works.
    try:
        db.execute(text("SELECT 1"))
        database = "up"
    except Exception:
        database = "down"

    # Public market WebSocket consumer (set on app.state in the lifespan).
    consumer = getattr(request.app.state, "market_consumer", None)
    market_last = getattr(consumer, "last_message_ts", None) if consumer else None
    if consumer and getattr(consumer, "connected", False):
        fresh = market_last is not None and (now - market_last) < _MARKET_STALE_MS
        market_ws = "up" if fresh else "stale"
    else:
        market_ws = "down"

    # Private (account/orders) WebSocket consumer.
    private = getattr(request.app.state, "private_consumer", None)
    if private is None or not getattr(private, "configured", False):
        private_ws = "idle"
    elif getattr(private, "connected", False):
        private_ws = "up"
    else:
        private_ws = "down"

    # Bot heartbeat.
    bot = get_or_create_bot_status(db)
    bot_state = bot.state
    last_hb = bot.last_heartbeat
    if bot_state == "RUNNING":
        if last_hb is not None and (now - last_hb) < _BOT_HEARTBEAT_STALE_MS:
            bot_health = "up"
        else:
            bot_health = "stale"
    elif bot_state in ("ERROR", "RISK_STOPPED"):
        bot_health = "down"
    else:
        bot_health = "idle"

    return {
        "server_time": now,
        "backend": "up",
        "database": database,
        "market_ws": market_ws,
        "market_ws_last_ts": market_last,
        "private_ws": private_ws,
        "bot": bot_health,
        "bot_state": bot_state,
        "bot_last_heartbeat": last_hb,
    }
