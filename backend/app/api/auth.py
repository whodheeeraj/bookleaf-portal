"""Authentication routes."""

from __future__ import annotations

from fastapi import APIRouter, status
from sqlalchemy import func, select

from app.api.deps import CurrentUser, SessionDep
from app.errors import AppError
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, UserOut
from app.security import create_access_token, verify_password_constant_time

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Sign in with email and password",
    responses={401: {"description": "Invalid credentials"}},
)
async def login(payload: LoginRequest, session: SessionDep) -> TokenResponse:
    normalized_email = payload.email.strip().lower()
    user = (
        await session.execute(select(User).where(func.lower(User.email) == normalized_email))
    ).scalar_one_or_none()

    if not verify_password_constant_time(
        payload.password, user.password_hash if user else None
    ) or user is None:
        raise AppError(
            "invalid_credentials",
            "Email or password is incorrect.",
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": "Bearer"},
        )

    token, expires_in = create_access_token(user.id, user.role)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=expires_in,
        user=UserOut.model_validate(user),
    )


@router.get(
    "/me",
    response_model=UserOut,
    summary="Current authenticated user",
)
async def me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)
