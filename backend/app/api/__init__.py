"""Aggregate API router."""
from fastapi import APIRouter

from app.api import (
    account,
    audits,
    auth,
    backtest,
    bot,
    health,
    logs,
    market,
    members,
    orders,
    pnl,
    positions,
    risk,
    strategy,
    trades,
    websocket,
)

api_router = APIRouter()
api_router.include_router(auth.router, tags=["auth"])
api_router.include_router(members.router, tags=["members"])
api_router.include_router(health.router, tags=["health"])
api_router.include_router(audits.router, tags=["audits"])
api_router.include_router(account.router, tags=["account"])
api_router.include_router(positions.router, tags=["positions"])
api_router.include_router(orders.router, tags=["orders"])
api_router.include_router(trades.router, tags=["trades"])
api_router.include_router(market.router, tags=["market"])
api_router.include_router(bot.router, tags=["bot"])
api_router.include_router(strategy.router, tags=["strategy"])
api_router.include_router(risk.router, tags=["risk"])
api_router.include_router(logs.router, tags=["logs"])
api_router.include_router(backtest.router, tags=["backtest"])
api_router.include_router(pnl.router, tags=["pnl"])
api_router.include_router(websocket.router, tags=["websocket"])
