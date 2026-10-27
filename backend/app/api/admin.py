"""Admin-only aggregate routes."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import AdminUser, SessionDep
from app.schemas.auth import AuthorOverviewOut
from app.schemas.ticket import AdminStatsOut
from app.services import ticket_service
from app.services.ai_service import ai_service

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get(
    "/stats",
    response_model=AdminStatsOut,
    summary="Queue KPIs",
    description="Counts by status/priority plus AI-offline and unassigned workload indicators.",
)
async def stats(_: AdminUser, session: SessionDep) -> AdminStatsOut:
    return await ticket_service.admin_stats(session)


@router.get(
    "/authors",
    response_model=list[AuthorOverviewOut],
    summary="Author portfolio overview",
    description="Used by the admin queue for the author filter and the ops context header.",
)
async def authors(_: AdminUser, session: SessionDep) -> list[AuthorOverviewOut]:
    return await ticket_service.author_overviews(session)


@router.get(
    "/ai/health",
    summary="AI provider + token usage snapshot",
    description="Never returns API keys. Counters are process-local and reset on restart.",
)
async def ai_health(_: AdminUser) -> dict:
    return ai_service.health()
