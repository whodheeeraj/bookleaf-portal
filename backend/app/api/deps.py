"""Shared route dependencies: authentication, RBAC, pagination."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.errors import AppError
from app.models.enums import UserRole
from app.models.user import User
from app.security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False, scheme_name="BearerAuth")

SessionDep = Annotated[AsyncSession, Depends(get_session)]

_UNAUTHORIZED_HEADERS = {"WWW-Authenticate": "Bearer"}


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    session: SessionDep,
) -> User:
    if credentials is None or not credentials.credentials:
        raise AppError(
            "not_authenticated",
            "Authentication required. Sign in and retry.",
            status_code=401,
            headers=_UNAUTHORIZED_HEADERS,
        )
    payload = decode_access_token(credentials.credentials)
    user = await session.get(User, payload.sub)
    if user is None:
        raise AppError(
            "user_not_found", "This account no longer exists.", status_code=401
        )
    if user.role is not payload.role:
        # Role changes invalidate existing tokens.
        raise AppError(
            "token_role_mismatch",
            "Your permissions changed. Please sign in again.",
            status_code=401,
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def require_admin(user: CurrentUser) -> User:
    if user.role is not UserRole.ADMIN:
        raise AppError(
            "forbidden", "Admin access is required for this action.", status_code=403
        )
    return user


async def require_author(user: CurrentUser) -> User:
    if user.role is not UserRole.AUTHOR:
        raise AppError(
            "forbidden", "This endpoint is for author accounts only.", status_code=403
        )
    return user


AdminUser = Annotated[User, Depends(require_admin)]
AuthorUser = Annotated[User, Depends(require_author)]


class Pagination:
    def __init__(
        self,
        page: int = Query(1, ge=1, description="1-based page number"),
        page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    ) -> None:
        self.page = page
        self.page_size = page_size


PaginationDep = Annotated[Pagination, Depends(Pagination)]


async def get_stream_user(
    request: Request,
    session: SessionDep,
    token: str | None = Query(
        default=None,
        description=(
            "JWT for EventSource clients, which cannot set an Authorization header. "
            "Browser EventSource connections are same-origin and short-lived; prefer "
            "the Authorization header for server-to-server use."
        ),
    ),
) -> User:
    raw_token = token
    if not raw_token:
        header = request.headers.get("authorization", "")
        if header.lower().startswith("bearer "):
            raw_token = header[7:].strip()
    if not raw_token:
        raise AppError(
            "not_authenticated",
            "A token query parameter or Bearer header is required for the event stream.",
            status_code=401,
            headers=_UNAUTHORIZED_HEADERS,
        )
    payload = decode_access_token(raw_token)
    user = await session.get(User, payload.sub)
    if user is None:
        raise AppError("user_not_found", "This account no longer exists.", status_code=401)
    return user
