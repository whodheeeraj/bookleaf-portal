"""Ticket request/response schemas."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Literal
from uuid import UUID

from pydantic import Field, computed_field, field_validator, model_validator

from app.models.enums import TicketCategory, TicketPriority, TicketStatus
from app.schemas.auth import UserBriefOut, UserOut
from app.schemas.base import ORMModel, Page
from app.schemas.book import BookBriefOut, BookOut


def _clean_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


class TicketCreate(ORMModel):
    book_id: str | None = Field(default=None, max_length=32)
    subject: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=10, max_length=5000)
    attachment_name: str | None = Field(default=None, max_length=255)

    @field_validator("book_id", mode="before")
    @classmethod
    def _blank_book_is_general(cls, value):
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("subject", "description")
    @classmethod
    def _strip_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("attachment_name", mode="before")
    @classmethod
    def _safe_attachment_name(cls, value):
        value = _clean_optional_text(value if isinstance(value, str) else None)
        if value is None:
            return None
        # UI-only attachment: store a display name, never a path.
        return Path(value.replace("\\", "/")).name[:255]


class TicketUpdate(ORMModel):
    """Admin triage overrides. Only supplied fields are applied."""

    status: TicketStatus | None = None
    category: TicketCategory | None = None
    priority: TicketPriority | None = None
    assigned_admin_id: str | None = Field(default=None, max_length=32)

    @field_validator("assigned_admin_id", mode="before")
    @classmethod
    def _blank_assignee_is_unassign(cls, value):
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @model_validator(mode="after")
    def _at_least_one_field(self):
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update")
        return self


class MessageCreate(ORMModel):
    content: str = Field(min_length=1, max_length=5000)
    is_internal_note: bool = False

    @field_validator("content")
    @classmethod
    def _strip_content(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Message cannot be empty")
        return value


class MessageOut(ORMModel):
    id: UUID
    ticket_id: UUID
    sender: UserBriefOut
    content: str
    is_internal_note: bool
    created_at: datetime


class TicketSummaryOut(ORMModel):
    id: UUID
    ticket_number: str
    author_id: str
    author: UserBriefOut
    book_id: str | None = None
    book: BookBriefOut | None = None
    subject: str
    status: TicketStatus
    category: TicketCategory | None = None
    priority: TicketPriority | None = None

    ai_classified: bool = False
    ai_model_used: str | None = None
    ai_confidence: float | None = None
    ai_suggested_category: TicketCategory | None = None
    ai_suggested_priority: TicketPriority | None = None

    assigned_admin: UserBriefOut | None = None
    message_count: int = 0
    last_message_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def classification_source(self) -> Literal["ai", "rules", "admin_override", "manual_fallback"]:
        """One value the UI can switch on for its provenance badge."""
        if not self.ai_classified:
            return "manual_fallback"
        overridden = (
            self.ai_suggested_category is not None
            and (
                self.category != self.ai_suggested_category
                or self.priority != self.ai_suggested_priority
            )
        )
        if overridden:
            return "admin_override"
        if (self.ai_model_used or "").startswith("bookleaf-rules"):
            return "rules"
        return "ai"


class TicketDetailOut(TicketSummaryOut):
    description: str
    attachment_name: str | None = None
    author: UserOut
    book: BookOut | None = None
    messages: list[MessageOut] = Field(default_factory=list)
    ai_draft_response: str | None = None
    ai_error: str | None = None


class TicketListOut(Page[TicketSummaryOut]):
    pass


class RegenerateDraftRequest(ORMModel):
    category: TicketCategory | None = None
    instruction: str | None = Field(default=None, max_length=500)

    @field_validator("instruction", mode="before")
    @classmethod
    def _clean_instruction(cls, value):
        return _clean_optional_text(value if isinstance(value, str) else None)


class DraftOut(ORMModel):
    ticket_id: UUID
    ai_draft_response: str
    ai_model_used: str | None = None
    ai_classified: bool = True
    ai_confidence: float | None = None
    generated_at: datetime


class TicketCreatedOut(TicketDetailOut):
    ai_degraded: bool = False


class AdminStatsOut(ORMModel):
    total: int = 0
    open: int = 0
    in_progress: int = 0
    resolved: int = 0
    closed: int = 0
    critical: int = 0
    unassigned: int = 0
    ai_offline: int = 0
    created_last_7_days: int = 0
    pending_royalty_total: float = 0.0
