"""FastAPI application entrypoint.

Demo Trading ONLY — see app.core.security. On startup we ensure DB tables exist,
seed default configs, bind the WebSocket hub to the running event loop, and start
the OKX public market-data consumer.
"""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import api_router
from app.core.config import settings
from app.core.database import init_db, session_scope
from app.core.logging_config import configure_logging
from app.core.security import DEMO_FLAG, enforce_demo_flag
from app.repositories import config_repo, user_repo
from app.services.market_ws import MarketWsConsumer
from app.services.okx_client import apply_proxy_env
from app.services.private_ws import PrivateWsConsumer
from app.services.ws_manager import hub

logger = logging.getLogger(__name__)


def _seed_defaults() -> None:
    with session_scope() as db:
        # Note: the `default` strategy instance is intentionally NOT seeded here.
        # Strategies are user-managed multi-instances; seeding would resurrect a
        # `default` row the user deleted. Risk/bot-status are singletons (not
        # shown in the strategy table) so they stay seeded.
        config_repo.get_or_create_risk(db)
        config_repo.get_or_create_bot_status(db)
        user_repo.seed_default_admin(db)


async def _startup_reconcile() -> None:
    """Pull live orders + recent fills from OKX once on boot so a restart restores
    in-flight state instead of starting blank. The private ``orders`` channel only
    streams *changes*, not existing open orders, so this REST sync fills that gap.
    Runs in a worker thread; best-effort — on-demand sync stays as the fallback.
    """
    from app.core.database import session_scope
    from app.repositories import order_repo
    from app.services import order_service

    def _do() -> int:
        with session_scope() as db:
            order_service.sync_open_orders(db)
            order_service.sync_fills(db)
            return order_repo.count_open_orders(db)

    try:
        n = await asyncio.to_thread(_do)
        logger.info("startup reconcile: %d open order(s) restored from OKX", n)
    except Exception as exc:
        logger.warning("startup reconcile failed (on-demand sync still applies): %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(logging.DEBUG if settings.DEBUG else logging.INFO)
    enforce_demo_flag(settings.OKX_FLAG)  # hard guard: refuse to boot for live trading
    logger.info("Starting %s (OKX flag=%s = DEMO TRADING)", settings.APP_NAME, DEMO_FLAG)
    apply_proxy_env()

    # DB may not be ready instantly in docker-compose; retry briefly.
    for attempt in range(1, 31):
        try:
            init_db()
            _seed_defaults()
            break
        except Exception as exc:
            logger.warning("DB not ready (attempt %d/30): %s", attempt, exc)
            await asyncio.sleep(2)

    hub.bind_loop(asyncio.get_running_loop())
    consumer = MarketWsConsumer(settings.TRADING_INSTRUMENTS)
    ws_task = asyncio.create_task(consumer.run())
    app.state.market_consumer = consumer

    # Private channel: real-time order/fill updates (REST polling stays as fallback).
    private = PrivateWsConsumer()
    private_task = asyncio.create_task(private.run())
    app.state.private_consumer = private

    # One-shot reconcile so a restart restores in-flight orders/fills (not blank).
    reconcile_task = asyncio.create_task(_startup_reconcile())
    app.state.reconcile_task = reconcile_task

    try:
        yield
    finally:
        consumer.stop()
        private.stop()
        for task in (ws_task, private_task, reconcile_task):
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        # Stop the bot thread cleanly on shutdown.
        from app.services.bot_manager import bot_manager

        if bot_manager.is_running:
            bot_manager.stop("server shutdown")


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="OKX Quant Trading Dashboard — Demo Trading only. Live trading is disabled.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_PREFIX)


@app.get("/health")
def health():
    return {"status": "ok", "mode": "demo", "okx_flag": settings.OKX_FLAG}
