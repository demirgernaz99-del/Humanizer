"""Auth ohne Zusatz-Abhängigkeiten: PBKDF2-Passworthashes + HMAC-signierte
Session-Cookies (Stdlib only)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import config
from app.database import get_db
from app.models import User

SESSION_COOKIE = "sb_session"
SESSION_MAX_AGE = 30 * 86400  # 30 Tage
_PBKDF2_ITERATIONS = 200_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _PBKDF2_ITERATIONS)
    return f"{salt}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, expected = stored.split("$", 1)
    except ValueError:
        return False
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _PBKDF2_ITERATIONS)
    return hmac.compare_digest(dk.hex(), expected)


def _sign(payload: bytes) -> str:
    return hmac.new(config.SECRET_KEY.encode(), payload, hashlib.sha256).hexdigest()


def create_session_token(user_id: int) -> str:
    payload = f"{user_id}:{int(time.time()) + SESSION_MAX_AGE}".encode()
    return base64.urlsafe_b64encode(payload).decode() + "." + _sign(payload)


def verify_session_token(token: str) -> int | None:
    try:
        payload_b64, signature = token.split(".", 1)
        payload = base64.urlsafe_b64decode(payload_b64.encode())
    except Exception:
        return None
    if not hmac.compare_digest(_sign(payload), signature):
        return None
    try:
        user_id, expiry = payload.decode().split(":")
        if int(expiry) < time.time():
            return None
        return int(user_id)
    except Exception:
        return None


def get_current_user_optional(
    sb_session: str | None = Cookie(default=None, alias=SESSION_COOKIE),
    db: Session = Depends(get_db),
) -> User | None:
    if not sb_session:
        return None
    user_id = verify_session_token(sb_session)
    if user_id is None:
        return None
    return db.get(User, user_id)


def get_current_user(user: User | None = Depends(get_current_user_optional)) -> User:
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nicht eingeloggt",
            headers={"Location": "/login"},
        )
    return user
