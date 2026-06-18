"""Authentication primitives — password hashing and signed access tokens.

Implemented with the Python standard library only (no passlib / python-jose),
keeping the dependency footprint minimal in line with the rest of this project.

- Passwords are hashed with PBKDF2-HMAC-SHA256 and a per-password random salt,
  stored as ``pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>``.
- Access tokens are compact, HMAC-SHA256-signed envelopes:
  ``base64url(payload_json).base64url(signature)``. The payload carries the
  user id, role and an expiry timestamp. This is a self-contained, stateless
  token (JWT-like) verified against ``settings.SECRET_KEY``.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Optional, Tuple

from app.core.config import settings

_PBKDF2_ITERATIONS = 200_000
_PBKDF2_ALGO = "pbkdf2_sha256"


# ---- Password hashing -------------------------------------------------------

def hash_password(password: str) -> str:
    """Hash a plaintext password for storage."""
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ITERATIONS)
    return f"{_PBKDF2_ALGO}${_PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Constant-time check of a plaintext password against a stored hash."""
    try:
        algo, iters_s, salt_hex, hash_hex = stored.split("$")
        if algo != _PBKDF2_ALGO:
            return False
        iterations = int(iters_s)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
    except (ValueError, AttributeError):
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(digest, expected)


# ---- Access tokens ----------------------------------------------------------

def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _sign(payload_b64: str) -> str:
    sig = hmac.new(settings.SECRET_KEY.encode("utf-8"), payload_b64.encode("ascii"), hashlib.sha256)
    return _b64url_encode(sig.digest())


def create_access_token(user_id: int, role: str, username: str) -> str:
    """Create a signed, self-contained access token for a user."""
    now = int(time.time())
    payload = {
        "sub": user_id,
        "username": username,
        "role": role,
        "iat": now,
        "exp": now + settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    return f"{payload_b64}.{_sign(payload_b64)}"


def decode_access_token(token: str) -> Optional[dict]:
    """Verify a token's signature + expiry. Returns the payload, or None if invalid."""
    try:
        payload_b64, sig = token.split(".")
    except (ValueError, AttributeError):
        return None
    if not hmac.compare_digest(sig, _sign(payload_b64)):
        return None
    try:
        payload = json.loads(_b64url_decode(payload_b64))
    except (ValueError, json.JSONDecodeError):
        return None
    if int(payload.get("exp", 0)) < int(time.time()):
        return None
    return payload


def parse_bearer(authorization: Optional[str]) -> Optional[str]:
    """Extract the raw token from an ``Authorization: Bearer <token>`` header."""
    if not authorization:
        return None
    parts: Tuple[str, ...] = tuple(authorization.split(" ", 1))
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip()
