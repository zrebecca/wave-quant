"""Cache layer for live market snapshots and bot heartbeat.

Two backends, selected by ``CACHE_BACKEND``:
  * "redis"  — shared Redis (docker default)
  * "memory" — in-process dict, so local runs need no Redis at all.

The cache is best-effort: failures never propagate to callers.
"""
import json
import logging
import time
from threading import Lock
from typing import Any, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

_USE_REDIS = settings.CACHE_BACKEND.lower() != "memory"

if _USE_REDIS:
    import redis

    redis_client = redis.Redis(
        host=settings.REDIS_HOST,
        port=settings.REDIS_PORT,
        db=settings.REDIS_DB,
        decode_responses=True,
    )
else:
    redis_client = None
    _MEM: dict[str, tuple[Any, Optional[float]]] = {}
    _MEM_LOCK = Lock()


def cache_set(key: str, value: Any, ttl: Optional[int] = None) -> None:
    if _USE_REDIS:
        try:
            redis_client.set(key, json.dumps(value), ex=ttl)
        except Exception as exc:  # cache is best-effort
            logger.debug("redis set failed for %s: %s", key, exc)
        return
    with _MEM_LOCK:
        _MEM[key] = (value, (time.time() + ttl) if ttl else None)


def cache_get(key: str) -> Optional[Any]:
    if _USE_REDIS:
        try:
            raw = redis_client.get(key)
            return json.loads(raw) if raw else None
        except Exception as exc:
            logger.debug("redis get failed for %s: %s", key, exc)
            return None
    with _MEM_LOCK:
        item = _MEM.get(key)
        if not item:
            return None
        value, expiry = item
        if expiry and time.time() > expiry:
            _MEM.pop(key, None)
            return None
        return value
