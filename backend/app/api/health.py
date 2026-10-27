"""Health and readiness probes (public)."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter
from sqlalchemy import text

from app.api.deps import SessionDep
from app.config import settings
from app.services.ai_service import ai_service
from app.services.sse_manager import broker

router = APIRouter(tags=["system"])


@router.get(
    "/health",
    summary="Liveness + runtime configuration",
    description=(
        "Public, unauthenticated probe. Exposes the active AI provider/model and in-process "
        "usage counters, but never secrets."
    ),
)
async def health() -> dict:
    return {
        "status": "ok",
        "service": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
        "time": datetime.now(UTC).isoformat(),
        "ai": ai_service.health(),
        "realtime": {"sse_clients": broker.subscriber_count()},
    }


@router.get(
    "/health/ready",
    summary="Readiness probe (database connectivity)",
)
async def readiness(session: SessionDep) -> dict:
    await session.execute(text("SELECT 1"))
    return {"status": "ready", "database": "ok"}
