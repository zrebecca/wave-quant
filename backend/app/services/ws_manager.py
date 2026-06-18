"""WebSocket fan-out hub for the frontend.

A single hub broadcasts typed events to every connected browser client:
    {"type": "ticker" | "orderbook" | "notification" | "bot" | "log", "payload": {...}}

It is safe to publish from any thread (the bot runs in a background thread) via
``publish_threadsafe`` — events are marshalled onto the FastAPI event loop.
"""
import asyncio
import json
import logging
from typing import Any, Dict, Optional, Set

from starlette.websockets import WebSocket

logger = logging.getLogger(__name__)


class WsHub:
    def __init__(self) -> None:
        self._clients: Set[WebSocket] = set()
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._lock = asyncio.Lock()

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._clients.add(ws)
        logger.info("ws client connected (%d total)", len(self._clients))

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(ws)
        logger.info("ws client disconnected (%d total)", len(self._clients))

    async def _broadcast(self, message: str) -> None:
        dead = []
        for ws in list(self._clients):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._clients.discard(ws)

    async def publish(self, event_type: str, payload: Any) -> None:
        await self._broadcast(json.dumps({"type": event_type, "payload": payload}))

    def publish_threadsafe(self, event_type: str, payload: Any) -> None:
        """Publish from a non-async thread (e.g. the bot)."""
        if self._loop is None:
            return
        message = json.dumps({"type": event_type, "payload": payload})
        try:
            asyncio.run_coroutine_threadsafe(self._broadcast(message), self._loop)
        except RuntimeError:
            pass


hub = WsHub()


def notify(
    title: str,
    kind: str = "info",
    description: str = "",
    key: str | None = None,
    vars: dict | None = None,
) -> None:
    """Emit a frontend toast notification (kind: success|info|warning|error).

    `title` is the English fallback; when `key` (an i18n key) is given the frontend
    renders `t(key, vars)` in the user's language instead. `description` is the
    category, which the frontend localizes too.
    """
    hub.publish_threadsafe(
        "notification",
        {"title": title, "kind": kind, "description": description, "key": key, "vars": vars or {}},
    )
