"""In-memory snapshot of live positions + account from the OKX private WS.

The private channels (``positions``, ``account``) push deltas in real time, so we
keep the latest view here for the bot / API to read current exposure without a
REST round-trip. REST polling (position_service / account_service) stays the
source of truth on cold start and as a fallback when the channel is unavailable.

Thread-safe: written from the WS consumer (event loop thread), read from the bot
thread and request handlers.
"""
import threading
import time
from typing import Dict, List, Optional


def _now_ms() -> int:
    return int(time.time() * 1000)


class LiveState:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._positions: Dict[str, dict] = {}
        self._account: dict = {}
        self.positions_ts: Optional[int] = None
        self.account_ts: Optional[int] = None
        # Whether the private WS is currently connected + subscribed. The
        # positions/account channels push a full snapshot on subscribe and a
        # delta on every change, so while connected the in-memory view is
        # authoritative; on disconnect callers fall back to REST.
        self.connected: bool = False

    def set_connected(self, value: bool) -> None:
        with self._lock:
            self.connected = value
            if not value:
                # Force REST fallback until a fresh snapshot re-arrives.
                self.positions_ts = None
                self.account_ts = None

    def update_positions(self, data: List[dict]) -> None:
        """Apply a ``positions`` push. A row with empty/zero ``pos`` means the
        position was closed, so it is dropped from the snapshot."""
        with self._lock:
            for p in data:
                key = f"{p.get('instId')}|{p.get('posSide') or 'net'}"
                if str(p.get("pos", "")) in ("", "0"):
                    self._positions.pop(key, None)
                else:
                    self._positions[key] = p
            self.positions_ts = _now_ms()

    def update_account(self, data: List[dict]) -> None:
        """Apply an ``account`` push (one summary object per message)."""
        with self._lock:
            if data:
                self._account = data[0]
                self.account_ts = _now_ms()

    def positions(self) -> List[dict]:
        with self._lock:
            return list(self._positions.values())

    def account(self) -> dict:
        with self._lock:
            return dict(self._account)

    def positions_fresh(self) -> bool:
        """True when the live position snapshot can be trusted over REST:
        the WS is connected AND we've received at least one snapshot."""
        return self.connected and self.positions_ts is not None

    def account_fresh(self) -> bool:
        return self.connected and self.account_ts is not None


live = LiveState()
