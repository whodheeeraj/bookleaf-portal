"""Pydantic schema exports."""

from app.schemas.ai import AIDraftOnly, AITriageOnly, AITriageResult
from app.schemas.auth import AuthorOverviewOut, LoginRequest, TokenResponse, UserBriefOut, UserOut
from app.schemas.base import ErrorResponse, MessageResponse, Page
from app.schemas.book import BookBriefOut, BookOut
from app.schemas.ticket import (
    AdminStatsOut,
    DraftOut,
    MessageCreate,
    MessageOut,
    RegenerateDraftRequest,
    TicketCreate,
    TicketCreatedOut,
    TicketDetailOut,
    TicketListOut,
    TicketSummaryOut,
    TicketUpdate,
)

__all__ = [
    "AIDraftOnly",
    "AITriageOnly",
    "AITriageResult",
    "AdminStatsOut",
    "AuthorOverviewOut",
    "BookBriefOut",
    "BookOut",
    "DraftOut",
    "ErrorResponse",
    "LoginRequest",
    "MessageCreate",
    "MessageOut",
    "MessageResponse",
    "Page",
    "RegenerateDraftRequest",
    "TicketCreate",
    "TicketCreatedOut",
    "TicketDetailOut",
    "TicketListOut",
    "TicketSummaryOut",
    "TicketUpdate",
    "TokenResponse",
    "UserBriefOut",
    "UserOut",
]
