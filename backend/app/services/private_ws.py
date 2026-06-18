"""Async consumer of the OKX private WebSocket (Demo Trading).

Logs in with the API credentials, subscribes to the ``orders``, ``positions`` and
``account`` channels and applies updates in real time (instead of waiting for the
polling sync):
  - ``orders``    → persist order/fill to the DB, broadcast, and WAKE the bot so
                    the active strategy reacts to the fill immediately.
  - ``positions`` → refresh the in-memory live position snapshot + broadcast.
  - ``account``   → refresh the in-memory live account snapshot + broadcast.

REST polling (order_service.sync_*, position/account services) stays in place as a
fallback, so the app keeps working even if the private channel is unavailable.
"""
import asyncio
import base64
import hashlib
import hmac
import json
import logging
import time
from typing import Optional

import websockets

from app.core.config import settings
from app.core.database import session_scope
from app.core.security import enforce_demo_flag
from app.repositories import order_repo
from app.services.live_state import live
from app.services.ws_manager import hub

logger = logging.getLogger(__name__)


def _wake_bot(reason: str) -> None:
    """Nudge the trading bot to re-evaluate now (event-driven). Lazy import to
    avoid a module import cycle, best-effort (never breaks the WS feed)."""
    try:
        from app.services.bot_manager import bot_manager

        bot_manager.wake(reason)
    except Exception as exc:  # pragma: no cover - defensive
        logger.debug("wake bot failed: %s", exc)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _f(value, default=0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


class PrivateWsConsumer:
    def __init__(self) -> None:
        self._stop = asyncio.Event()
        self.connected = False
        self.last_message_ts: Optional[int] = None

    @property
    def configured(self) -> bool:
        return bool(settings.OKX_API_KEY and settings.OKX_API_SECRET and settings.OKX_API_PASSPHRASE)

    def _login_arg(self) -> dict:
        ts = str(int(time.time()))
        msg = ts + "GET" + "/users/self/verify"
        sign = base64.b64encode(
            hmac.new(settings.OKX_API_SECRET.encode(), msg.encode(), hashlib.sha256).digest()
        ).decode()
        return {
            "apiKey": settings.OKX_API_KEY,
            "passphrase": settings.OKX_API_PASSPHRASE,
            "timestamp": ts,
            "sign": sign,
        }

    async def run(self):
        enforce_demo_flag(settings.OKX_FLAG)  # never connect a live private channel
        if not self.configured:
            logger.warning("private ws: no OKX credentials, skipping real-time order feed")
            return
        backoff = 1
        while not self._stop.is_set():
            try:
                proxy = settings.HTTP_PROXY or None
                kwargs = {"ping_interval": 20, "ping_timeout": 10}
                try:
                    ws_ctx = websockets.connect(settings.OKX_WS_PRIVATE_URL, proxy=proxy, **kwargs)
                except TypeError:
                    ws_ctx = websockets.connect(settings.OKX_WS_PRIVATE_URL, **kwargs)
                async with ws_ctx as ws:
                    await ws.send(json.dumps({"op": "login", "args": [self._login_arg()]}))
                    backoff = 1
                    while not self._stop.is_set():
                        try:
                            raw = await asyncio.wait_for(ws.recv(), timeout=20)
                        except asyncio.TimeoutError:
                            # OKX closes idle sockets (~30s). The private channel can be
                            # quiet for long stretches, so keep it alive with a literal ping.
                            await ws.send("ping")
                            continue
                        self.last_message_ts = _now_ms()
                        if raw == "pong":
                            continue
                        await self._handle(ws, raw)
            except Exception as exc:
                if self._stop.is_set():
                    break
                logger.warning("private ws error: %s (reconnect in %ss)", exc, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)
            finally:
                self.connected = False
                live.set_connected(False)

    async def _handle(self, ws, raw: str):
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            return
        event = msg.get("event")
        if event == "login":
            if msg.get("code") == "0":
                self.connected = True
                await ws.send(
                    json.dumps(
                        {
                            "op": "subscribe",
                            "args": [
                                {"channel": "orders", "instType": "ANY"},
                                {"channel": "positions", "instType": "ANY"},
                                {"channel": "account"},
                            ],
                        }
                    )
                )
                live.set_connected(True)
                logger.info("private ws: logged in, subscribed to orders/positions/account")
            else:
                logger.error("private ws login failed: %s", msg)
            return
        if event in ("subscribe", "error"):
            if event == "error":
                logger.error("private ws error event: %s", msg)
            return

        channel = (msg.get("arg") or {}).get("channel")
        data = msg.get("data") or []
        if channel == "orders":
            for d in data:
                self._apply_order(d)
        elif channel == "positions":
            live.update_positions(data)
            hub.publish_threadsafe("position", {"count": len(live.positions())})
        elif channel == "account":
            live.update_account(data)
            hub.publish_threadsafe("account", {"ts": live.account_ts})

    def _apply_order(self, d: dict) -> None:
        """Persist an order update + any new fill, then broadcast."""
        try:
            with session_scope() as db:
                order_repo.upsert_order(
                    db,
                    order_id=d.get("ordId"),
                    client_order_id=d.get("clOrdId") or None,
                    inst_id=d.get("instId"),
                    side=d.get("side"),
                    ord_type=d.get("ordType"),
                    price=_f(d.get("px")) or None,
                    size=_f(d.get("sz")),
                    filled_size=_f(d.get("accFillSz")),
                    avg_price=_f(d.get("avgPx")) or None,
                    state=d.get("state", "live"),
                    ts=int(d["uTime"]) if d.get("uTime") else None,
                )
                # A fill arrived on this update → record the trade (dedup by tradeId).
                tid = d.get("tradeId")
                if tid and _f(d.get("fillSz")) > 0:
                    from sqlalchemy import select

                    from app.models.order import Trade

                    if not db.scalar(select(Trade).where(Trade.trade_id == tid)):
                        order_repo.insert_trade(
                            db,
                            trade_id=tid,
                            order_id=d.get("ordId"),
                            inst_id=d.get("instId"),
                            side=d.get("side"),
                            fill_px=_f(d.get("fillPx")),
                            fill_sz=_f(d.get("fillSz")),
                            fee=_f(d.get("fillFee")) or None,
                            fee_ccy=d.get("fillFeeCcy"),
                            fill_pnl=_f(d.get("fillPnl")) or None,
                            exec_type=d.get("execType") or None,
                            ts=int(d["fillTime"]) if d.get("fillTime") else None,
                        )
        except Exception as exc:
            logger.error("private ws apply order failed: %s", exc)
            return

        # Broadcast lightweight signals so the UI can refresh promptly.
        hub.publish_threadsafe("order", {"inst_id": d.get("instId"), "state": d.get("state")})
        if d.get("tradeId") and _f(d.get("fillSz")) > 0:
            hub.publish_threadsafe(
                "fill",
                {
                    "inst_id": d.get("instId"),
                    "side": d.get("side"),
                    "fill_px": _f(d.get("fillPx")),
                    "fill_sz": _f(d.get("fillSz")),
                },
            )
            # Event-driven loop: a fill changes our position, so let the bot
            # re-quote / re-evaluate immediately rather than on the next timer tick.
            _wake_bot("fill")

    def stop(self):
        self._stop.set()
