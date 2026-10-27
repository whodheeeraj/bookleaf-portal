"""Password hashing, JWT issuing and verification."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Literal

import jwt
from passlib.context import CryptContext
from pydantic import BaseModel, ValidationError

from app.config import settings
from app.errors import AppError
from app.models.enums import UserRole

# bcrypt work factor 12: ~250ms/hash on modern hardware, good for a support
# portal login. Passlib is pinned alongside bcrypt 4.0.x (see requirements.txt).
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


class TokenPayload(BaseModel):
    sub: str
    role: UserRole
    type: Literal["access"]
    exp: int
    iat: int


def hash_password(password: str) -> str:
    # bcrypt silently truncates at 72 bytes; reject early instead.
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Password must be at most 72 bytes")
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return pwd_context.verify(password, password_hash)
    except (ValueError, TypeError):
        return False


@lru_cache(maxsize=1)
def _dummy_hash() -> str:
    """A valid hash used to keep failed-login timing roughly constant."""
    return pwd_context.hash("bookleaf-dummy-password")


def verify_password_constant_time(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        verify_password(password, _dummy_hash())
        return False
    return verify_password(password, password_hash)


def create_access_token(user_id: str, role: UserRole) -> tuple[str, int]:
    expires_in = settings.access_token_expire_minutes * 60
    issued_at = datetime.now(UTC)
    payload = {
        "sub": user_id,
        "role": role.value,
        "type": "access",
        "iat": int(issued_at.timestamp()),
        "exp": int((issued_at + timedelta(seconds=expires_in)).timestamp()),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, expires_in


def decode_access_token(token: str) -> TokenPayload:
    try:
        raw = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise AppError(
            "token_expired",
            "Your session has expired. Please sign in again.",
            status_code=401,
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise AppError(
            "invalid_token", "Invalid authentication token.", status_code=401
        ) from exc

    try:
        payload = TokenPayload.model_validate(raw)
    except ValidationError as exc:
        raise AppError("invalid_token", "Malformed authentication token.", status_code=401) from exc

    if payload.type != "access":
        raise AppError("invalid_token", "Unsupported token type.", status_code=401)
    return payload
