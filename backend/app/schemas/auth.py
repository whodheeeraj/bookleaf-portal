"""Auth + user schemas."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import UserRole
from app.schemas.base import ORMModel


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(ORMModel):
    id: str
    name: str
    email: EmailStr
    phone: str | None = None
    city: str | None = None
    joined_date: date | None = None
    role: UserRole


class UserBriefOut(ORMModel):
    id: str
    name: str
    email: EmailStr
    role: UserRole


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class AuthorOverviewOut(BaseModel):
    """Admin-facing author row with portfolio aggregates."""

    id: str
    name: str
    email: EmailStr
    city: str | None = None
    joined_date: date | None = None
    book_count: int
    published_count: int
    pending_royalty: float
    open_tickets: int
