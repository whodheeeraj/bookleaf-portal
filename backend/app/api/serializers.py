"""Explicit ORM -> API serializers.

Serialization is deliberately explicit rather than `model_validate(ticket)`:
the author-facing view must never accidentally include an internal note or
the AI draft. Keeping that decision in one auditable place (plus tests) is
cheaper than trusting field defaults everywhere.
"""

from __future__ import annotations

from app.models.ticket import Ticket, TicketMessage
from app.models.user import User
from app.schemas.auth import UserBriefOut, UserOut
from app.schemas.book import BookBriefOut, BookOut
from app.schemas.ticket import MessageOut, TicketCreatedOut, TicketDetailOut, TicketSummaryOut


def user_brief(user: User | None) -> UserBriefOut | None:
    if user is None:
        return None
    return UserBriefOut.model_validate(user)


def message_out(message: TicketMessage) -> MessageOut:
    return MessageOut(
        id=message.id,
        ticket_id=message.ticket_id,
        sender=UserBriefOut.model_validate(message.sender),
        content=message.content,
        is_internal_note=message.is_internal_note,
        created_at=message.created_at,
    )


def visible_messages(ticket: Ticket, *, admin: bool) -> list[TicketMessage]:
    if admin:
        return list(ticket.messages)
    return [message for message in ticket.messages if not message.is_internal_note]


def ticket_summary(ticket: Ticket, *, admin: bool) -> TicketSummaryOut:
    messages = visible_messages(ticket, admin=admin)
    return TicketSummaryOut.model_validate(
        {
            "id": ticket.id,
            "ticket_number": ticket.ticket_number,
            "author_id": ticket.author_id,
            "author": user_brief(ticket.author),
            "book_id": ticket.book_id,
            "book": BookBriefOut.model_validate(ticket.book) if ticket.book else None,
            "subject": ticket.subject,
            "status": ticket.status,
            "category": ticket.category,
            "priority": ticket.priority,
            "ai_classified": ticket.ai_classified,
            "ai_model_used": ticket.ai_model_used,
            "ai_confidence": ticket.ai_confidence,
            "ai_suggested_category": ticket.ai_suggested_category,
            "ai_suggested_priority": ticket.ai_suggested_priority,
            "assigned_admin": user_brief(ticket.assigned_admin),
            "message_count": len(messages),
            "last_message_at": max((m.created_at for m in messages), default=None),
            "created_at": ticket.created_at,
            "updated_at": ticket.updated_at,
        }
    )


def ticket_detail(ticket: Ticket, *, admin: bool) -> TicketDetailOut:
    summary = ticket_summary(ticket, admin=admin)
    messages = visible_messages(ticket, admin=admin)
    return TicketDetailOut(
        **summary.model_dump(exclude={"classification_source", "author", "book"}),
        description=ticket.description,
        attachment_name=ticket.attachment_name,
        author=UserOut.model_validate(ticket.author),
        book=BookOut.model_validate(ticket.book) if ticket.book else None,
        messages=[message_out(message) for message in messages],
        # Admin-only fields. Never populate these for an author response.
        ai_draft_response=ticket.ai_draft_response if admin else None,
        ai_error=ticket.ai_error if admin else None,
    )


def ticket_created(ticket: Ticket) -> TicketCreatedOut:
    detail = ticket_detail(ticket, admin=False)
    return TicketCreatedOut(
        **detail.model_dump(exclude={"classification_source"}),
        ai_degraded=not ticket.ai_classified,
    )
