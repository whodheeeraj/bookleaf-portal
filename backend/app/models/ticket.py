"""Ticket and ticket-message ORM models."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Index,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import TicketCategory, TicketPriority, TicketStatus
from app.models.types import UTCDateTime, utcnow

if TYPE_CHECKING:  # pragma: no cover
    from app.models.book import Book
    from app.models.user import User


def _enum(enum_cls, name: str, length: int):
    return SAEnum(
        enum_cls,
        name=name,
        native_enum=False,
        length=length,
        values_callable=lambda enum: [member.value for member in enum],
        validate_strings=True,
    )


class Ticket(Base):
    __tablename__ = "tickets"
    __table_args__ = (
        Index("ix_tickets_queue", "status", "priority", "created_at"),
        Index("ix_tickets_author_status", "author_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    ticket_number: Mapped[str] = mapped_column(
        String(16), nullable=False, unique=True, index=True
    )
    author_id: Mapped[str] = mapped_column(
        String(32),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    book_id: Mapped[str | None] = mapped_column(
        String(32),
        ForeignKey("books.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    attachment_name: Mapped[str | None] = mapped_column(String(255))

    status: Mapped[TicketStatus] = mapped_column(
        _enum(TicketStatus, "ticket_status", 20),
        nullable=False,
        default=TicketStatus.OPEN,
        index=True,
    )
    category: Mapped[TicketCategory | None] = mapped_column(
        _enum(TicketCategory, "ticket_category", 40), nullable=True, index=True
    )
    priority: Mapped[TicketPriority | None] = mapped_column(
        _enum(TicketPriority, "ticket_priority", 12), nullable=True, index=True
    )

    # --- AI observability --------------------------------------------------
    ai_classified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ai_model_used: Mapped[str | None] = mapped_column(String(120))
    ai_confidence: Mapped[float | None] = mapped_column(Float)
    ai_draft_response: Mapped[str | None] = mapped_column(Text)
    ai_error: Mapped[str | None] = mapped_column(String(500))
    # What the model originally suggested - lets the UI show "admin override"
    # without losing the model's opinion.
    ai_suggested_category: Mapped[TicketCategory | None] = mapped_column(
        _enum(TicketCategory, "ticket_category_suggested", 40), nullable=True
    )
    ai_suggested_priority: Mapped[TicketPriority | None] = mapped_column(
        _enum(TicketPriority, "ticket_priority_suggested", 12), nullable=True
    )

    assigned_admin_id: Mapped[str | None] = mapped_column(
        String(32),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=utcnow, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=utcnow, onupdate=utcnow
    )

    author: Mapped["User"] = relationship(
        back_populates="tickets", foreign_keys=[author_id], lazy="selectin"
    )
    assigned_admin: Mapped["User | None"] = relationship(
        foreign_keys=[assigned_admin_id], lazy="selectin"
    )
    book: Mapped["Book | None"] = relationship(back_populates="tickets", lazy="selectin")
    messages: Mapped[list["TicketMessage"]] = relationship(
        back_populates="ticket",
        cascade="all, delete-orphan",
        order_by="TicketMessage.created_at",
        lazy="selectin",
    )

    @property
    def is_unresolved(self) -> bool:
        return self.status in (TicketStatus.OPEN, TicketStatus.IN_PROGRESS)

    @property
    def priority_rank(self) -> int:
        order = {
            TicketPriority.CRITICAL: 0,
            TicketPriority.HIGH: 1,
            TicketPriority.MEDIUM: 2,
            TicketPriority.LOW: 3,
        }
        return order.get(self.priority, 4)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Ticket {self.ticket_number} {self.status.value}>"


class TicketMessage(Base):
    __tablename__ = "ticket_messages"
    __table_args__ = (Index("ix_ticket_messages_ticket_created", "ticket_id", "created_at"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    ticket_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("tickets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sender_id: Mapped[str] = mapped_column(
        String(32),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal_note: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=utcnow, index=True
    )

    ticket: Mapped["Ticket"] = relationship(back_populates="messages", lazy="raise")
    sender: Mapped["User"] = relationship(lazy="selectin")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<TicketMessage {self.id} ticket={self.ticket_id}>"
