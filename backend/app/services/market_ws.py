"""Async consumer of OKX public WebSocket channels (Demo Trading).

Subscribes to tickers + order book for the configured instruments and:
  * caches the latest snapshot in Redis,
  * fans the data out to browser clients via the WsHub.

Runs as a long-lived asyncio task started in the FastAPI lifespan. Reconnects
with backoff on disconnect.
"""
import asyncio
import json
import logging
import time
from typing import List

import websockets

from app.core.config import settings
from app.core.redis_client import cache_set
from app.services.ws_manager import hub

logger = logging.getLogger(__name__)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _f(value, default=0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


class MarketWsConsumer:
    def __init__(self, inst_ids: List[str]):
        self.inst_ids = inst_ids
        self._stop = asyncio.Event()
        # Live connection health, surfaced via /health/status for the frontend.
        self.connected = False
        self.last_message_ts: int | None = None  # epoch ms of last message received

    async def _subscribe_args(self):
        args = []
        for inst_id in self.inst_ids:
            args.append({"channel": "tickers", "instId": inst_id})
            args.append({"channel": "books5", "instId": inst_id})
        return args

    async def run(self):
        backoff = 1
        while not self._stop.is_set():
            try:
                proxy = settings.HTTP_PROXY or None
                connect_kwargs = {"ping_interval": 20, "ping_timeout": 10}
                # websockets>=12 supports proxy kwarg; fall back gracefully.
                try:
                    ws_ctx = websockets.connect(
                        settings.OKX_WS_PUBLIC_URL, proxy=proxy, **connect_kwargs
                    )
                except TypeError:
                    ws_ctx = websockets.connect(settings.OKX_WS_PUBLIC_URL, **connect_kwargs)

                async with ws_ctx as ws:
                    await ws.send(json.dumps({"op": "subscribe", "args": await self._subscribe_args()}))
                    logger.info("market ws subscribed: %s", self.inst_ids)
                    backoff = 1
                    self.connected = True
                    async for raw in ws:
                        self.last_message_ts = _now_ms()
                        await self._handle(raw)
            except Exception as exc:
                if self._stop.is_set():
                    break
                logger.warning("market ws error: %s (reconnect in %ss)", exc, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)
            finally:
                self.connected = False

    async def _handle(self, raw: str):
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            return
        channel = (msg.get("arg") or {}).get("channel")
        data = msg.get("data")
        if not data:
            return
        if channel == "tickers":
            await self._on_ticker(data[0])
        elif channel == "books5":
            await self._on_orderbook((msg["arg"]).get("instId"), data[0])

    async def _on_ticker(self, d: dict):
        inst_id = d.get("instId")
        bid = _f(d.get("bidPx")) or None
        ask = _f(d.get("askPx")) or None
        spread = (ask - bid) if (bid and ask) else None
        payload = {
            "inst_id": inst_id,
            "last_px": _f(d.get("last")),
            "bid_px": bid,
            "ask_px": ask,
            "spread": spread,
            "spread_pct": (spread / ask * 100) if (spread and ask) else None,
            "vol_24h": _f(d.get("vol24h")) or None,
            "ts": int(d["ts"]) if d.get("ts") else None,
        }
        cache_set(f"ticker:{inst_id}", payload, ttl=30)
        await hub.publish("ticker", payload)

    async def _on_orderbook(self, inst_id: str, d: dict):
        payload = {
            "inst_id": inst_id,
            "bids": [{"price": _f(l[0]), "size": _f(l[1])} for l in d.get("bids", [])],
            "asks": [{"price": _f(l[0]), "size": _f(l[1])} for l in d.get("asks", [])],
            "ts": int(d["ts"]) if d.get("ts") else None,
        }
        cache_set(f"orderbook:{inst_id}", payload, ttl=30)
        await hub.publish("orderbook", payload)

    def stop(self):
        self._stop.set()
