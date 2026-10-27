"""Ticket lifecycle business logic.

Routes stay thin; everything with invariants (ownership, numbering, status
transitions, AI orchestration, event broadcasting) lives here so it can be
unit tested without HTTP.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import Integer, Select, case, cast, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.errors import AppError
from app.models.book import Book
from app.models.enums import TicketCategory, TicketPriority, TicketStatus, UserRole
from app.models.ticket import Ticket, TicketMessage
from app.models.user import User
from app.models.types import utcnow
from app.schemas.auth import AuthorOverviewOut
from app.schemas.ticket import AdminStatsOut, MessageCreate, TicketCreate, TicketUpdate
from app.services.ai_context import (
    author_snapshot,
    book_snapshot,
    ticket_snapshot,
)
from app.services.ai_service import TriageOutcome, ai_service
from app.services.sse_manager import (
    ADMIN_CHANNEL,
    author_channel,
    broker,
    ticket_event_payload,
)
from app.timeutils import local_day_start_utc

logger = logging.getLogger(__name__)

_TICKET_LOAD_OPTIONS = (
    selectinload(Ticket.author),
    selectinload(Ticket.book),
    selectinload(Ticket.assigned_admin),
    selectinload(Ticket.messages).selectinload(TicketMessage.sender),
)


async def _author_books(session: AsyncSession, author_id: str) -> list[Book]:
    result = await session.execute(select(Book).where(Book.author_id == author_id).order_by(Book.id))
    return list(result.scalars().all())


async def _next_ticket_number(session: AsyncSession) -> str:
    """TKT-1001, TKT-1002, ... based on the numeric suffix."""
    result = await session.execute(
        select(func.max(cast(func.substr(Ticket.ticket_number, 5), Integer)))
    )
    current = result.scalar_one_or_none() or 1000
    return f"TKT-{int(current) + 1}"


async def _publish(channels: list[str], event: str, payload: dict[str, Any]) -> None:
    # Realtime is best-effort: a broker hiccup must never fail the API call.
    try:
        await broker.publish(channels, event, payload)
    except Exception:  # pragma: no cover - defensive
        logger.exception("sse_publish_failed event=%s", event)


async def create_ticket(
    session: AsyncSession, author: User, payload: TicketCreate
) -> tuple[Ticket, TriageOutcome]:
    book: Book | None = None
    if payload.book_id:
        book = await session.get(Book, payload.book_id)
        if book is None or book.author_id != author.id:
            raise AppError(
                "book_not_found",
                "That book does not exist on your account.",
                status_code=404,
            )

    books = await _author_books(session, author.id)
    outcome = await ai_service.triage_and_draft(
        author=author_snapshot(author),
        book=book_snapshot(book) if book else None,
        books=[book_snapshot(item) for item in books],
        ticket=ticket_snapshot(
            _TransientTicketView(subject=payload.subject, description=payload.description)
        ),
    )

    ticket = Ticket(
        author_id=author.id,
        book_id=book.id if book else None,
        subject=payload.subject,
        description=payload.description,
        attachment_name=payload.attachment_name,
        status=TicketStatus.OPEN,
        category=outcome.category,
        priority=outcome.priority,
        ai_classified=outcome.ai_classified,
        ai_model_used=outcome.model_used,
        ai_confidence=outcome.confidence,
        ai_draft_response=outcome.draft_response,
        ai_error=outcome.error,
        ai_suggested_category=outcome.category if outcome.ai_classified else None,
        ai_suggested_priority=outcome.priority if outcome.ai_classified else None,
    )

    # The expensive AI call is done; only the short insert is retried on a
    # rare ticket-number race.
    for attempt in range(1, 6):
        ticket.ticket_number = await _next_ticket_number(session)
        try:
            session.add(ticket)
            await session.flush()
            break
        except IntegrityError:
            await session.rollback()
            logger.warning("ticket_number_collision attempt=%s", attempt)
            if attempt == 5:
                raise AppError(
                    "ticket_number_conflict",
                    "Could not allocate a ticket number. Please try again.",
                    status_code=503,
                ) from None

    await session.commit()

    # Reload with every relationship eagerly populated: serializing a
    # half-initialized instance inside the async context would otherwise
    # trigger a lazy load outside greenlet context.
    ticket = await load_ticket(session, ticket.id)

    await _publish(
        [ADMIN_CHANNEL, author_channel(author.id)],
        "ticket.created",
        ticket_event_payload(ticket, actor_role=UserRole.AUTHOR.value),
    )
    return ticket, outcome


async def load_ticket(
    session: AsyncSession, ticket_id: UUID, *, for_update: bool = False
) -> Ticket:
    stmt: Select = select(Ticket).where(Ticket.id == ticket_id).options(*_TICKET_LOAD_OPTIONS)
    if for_update:
        stmt = stmt.with_for_update()
    result = await session.execute(stmt)
    ticket = result.scalar_one_or_none()
    if ticket is None:
        raise AppError("ticket_not_found", "Ticket not found.", status_code=404)
    return ticket


async def list_tickets(
    session: AsyncSession,
    *,
    author_id: str | None = None,
    status: TicketStatus | None = None,
    category: TicketCategory | None = None,
    priority: TicketPriority | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = None,
    unassigned: bool = False,
    assigned_admin_id: str | None = None,
    page: int = 1,
    page_size: int = 20,
    admin_view: bool = True,
) -> tuple[list[Ticket], int]:
    conditions = []
    if author_id:
        conditions.append(Ticket.author_id == author_id)
    if status is not None:
        conditions.append(Ticket.status == status)
    if category is not None:
        conditions.append(Ticket.category == category)
    if priority is not None:
        conditions.append(Ticket.priority == priority)
    if date_from is not None:
        conditions.append(Ticket.created_at >= local_day_start_utc(date_from))
    if date_to is not None:
        # Exclusive upper bound: start of the day *after* `date_to`.
        conditions.append(Ticket.created_at < local_day_start_utc(date_to + timedelta(days=1)))
    if q:
        needle = f"%{q.strip()}%"
        conditions.append(
            or_(
                Ticket.subject.ilike(needle),
                Ticket.description.ilike(needle),
                Ticket.ticket_number.ilike(needle),
            )
        )
    if unassigned:
        conditions.append(Ticket.assigned_admin_id.is_(None))
    if assigned_admin_id:
        conditions.append(Ticket.assigned_admin_id == assigned_admin_id)

    count_stmt = select(func.count(Ticket.id))
    if conditions:
        count_stmt = count_stmt.where(*conditions)
    total = int((await session.execute(count_stmt)).scalar_one())

    stmt = select(Ticket).options(*_TICKET_LOAD_OPTIONS)
    if conditions:
        stmt = stmt.where(*conditions)

    if admin_view:
        unresolved_first = case(
            (Ticket.status.in_([TicketStatus.OPEN, TicketStatus.IN_PROGRESS]), 0), else_=1
        )
        priority_rank = case(
            {
                TicketPriority.CRITICAL: 0,
                TicketPriority.HIGH: 1,
                TicketPriority.MEDIUM: 2,
                TicketPriority.LOW: 3,
            },
            value=Ticket.priority,
            else_=4,
        )
        stmt = stmt.order_by(
            unresolved_first.asc(), priority_rank.asc(), Ticket.created_at.asc()
        )
    else:
        stmt = stmt.order_by(Ticket.created_at.desc())

    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await session.execute(stmt)
    return list(result.scalars().unique().all()), total


async def add_message(
    session: AsyncSession,
    ticket: Ticket,
    sender: User,
    payload: MessageCreate,
) -> tuple[TicketMessage, bool]:
    if sender.role is UserRole.AUTHOR and payload.is_internal_note:
        raise AppError(
            "internal_note_forbidden",
            "Authors cannot create internal notes.",
            status_code=403,
        )

    previous_status = ticket.status
    if sender.role is UserRole.ADMIN:
        if not payload.is_internal_note and ticket.status is TicketStatus.OPEN:
            ticket.status = TicketStatus.IN_PROGRESS
        if ticket.assigned_admin_id is None:
            # Picking up a ticket implies ownership - a common ops expectation.
            ticket.assigned_admin_id = sender.id
            # Keep the loaded relationship in sync; expire_on_commit=False means
            # serializers would otherwise still see the pre-assignment value.
            ticket.assigned_admin = sender
    else:
        # An author replying to a resolved thread reopens it.
        if ticket.status in (TicketStatus.RESOLVED, TicketStatus.CLOSED):
            ticket.status = TicketStatus.OPEN

    message = TicketMessage(
        ticket_id=ticket.id,
        sender_id=sender.id,
        content=payload.content,
        is_internal_note=payload.is_internal_note,
    )
    message.sender = sender
    ticket.messages.append(message)
    ticket.updated_at = utcnow()

    await session.commit()

    status_changed = previous_status != ticket.status
    # Internal notes are admin-only: do not even signal their existence on the
    # author's realtime channel.
    message_channels = (
        [ADMIN_CHANNEL]
        if message.is_internal_note
        else [ADMIN_CHANNEL, author_channel(ticket.author_id)]
    )
    await _publish(
        message_channels,
        "message.created",
        ticket_event_payload(
            ticket,
            actor_role=sender.role.value,
            message_id=str(message.id),
            is_internal_note=message.is_internal_note,
            extra={"status_changed": status_changed},
        ),
    )
    if status_changed:
        await _publish(
            [ADMIN_CHANNEL, author_channel(ticket.author_id)],
            "ticket.updated",
            ticket_event_payload(ticket, actor_role=sender.role.value),
        )
    return message, status_changed


async def update_ticket(
    session: AsyncSession, ticket: Ticket, payload: TicketUpdate, actor: User
) -> Ticket:
    fields = payload.model_fields_set
    assignee: User | None = None

    if "assigned_admin_id" in fields and payload.assigned_admin_id:
        assignee = await session.get(User, payload.assigned_admin_id)
        if assignee is None or assignee.role is not UserRole.ADMIN:
            raise AppError(
                "invalid_assignee",
                "Tickets can only be assigned to an admin user.",
                status_code=422,
            )

    if "status" in fields:
        if payload.status is None:
            raise AppError(
                "invalid_status",
                "Ticket status cannot be empty.",
                status_code=422,
            )
        ticket.status = payload.status
    if "category" in fields:
        ticket.category = payload.category
    if "priority" in fields:
        ticket.priority = payload.priority
    if "assigned_admin_id" in fields:
        ticket.assigned_admin_id = payload.assigned_admin_id
        # Update the eagerly loaded relationship as well, otherwise the
        # response (and SSE payload) keeps the old assignee until reload.
        ticket.assigned_admin = assignee

    ticket.updated_at = utcnow()
    await session.commit()

    await _publish(
        [ADMIN_CHANNEL, author_channel(ticket.author_id)],
        "ticket.updated",
        ticket_event_payload(ticket, actor_role=actor.role.value),
    )
    return ticket


async def regenerate_draft(
    session: AsyncSession,
    ticket: Ticket,
    *,
    category: TicketCategory | None,
    instruction: str | None,
) -> Ticket:
    chosen_category = category or ticket.category or TicketCategory.GENERAL

    books = await _author_books(session, ticket.author_id)
    book = next((item for item in books if item.id == ticket.book_id), None)

    outcome = await ai_service.regenerate_draft(
        author=author_snapshot(ticket.author),
        book=book_snapshot(book) if book else None,
        books=[book_snapshot(item) for item in books],
        ticket=ticket_snapshot(ticket),
        category=chosen_category,
        instruction=instruction,
    )

    if not outcome.ai_classified or not outcome.draft_response:
        ticket.ai_error = (outcome.error or "Draft generation failed")[:500]
        ticket.updated_at = utcnow()
        await session.commit()
        raise AppError(
            "ai_unavailable",
            "The AI provider is unavailable. The existing draft was kept so you can reply manually.",
            status_code=503,
            details={"reason": outcome.error},
        )

    ticket.ai_draft_response = outcome.draft_response
    ticket.ai_model_used = outcome.model_used
    ticket.ai_confidence = outcome.confidence
    ticket.ai_classified = True
    ticket.ai_error = None
    ticket.updated_at = utcnow()
    await session.commit()

    await _publish(
        [ADMIN_CHANNEL],
        "ticket.updated",
        ticket_event_payload(ticket, actor_role=UserRole.ADMIN.value),
    )
    return ticket


async def admin_stats(session: AsyncSession) -> AdminStatsOut:
    week_ago = datetime.now(UTC) - timedelta(days=7)
    row = (
        await session.execute(
            select(
                func.count(Ticket.id),
                func.sum(case((Ticket.status == TicketStatus.OPEN, 1), else_=0)),
                func.sum(case((Ticket.status == TicketStatus.IN_PROGRESS, 1), else_=0)),
                func.sum(case((Ticket.status == TicketStatus.RESOLVED, 1), else_=0)),
                func.sum(case((Ticket.status == TicketStatus.CLOSED, 1), else_=0)),
                func.sum(case((Ticket.priority == TicketPriority.CRITICAL, 1), else_=0)),
                func.sum(
                    case(
                        (
                            (Ticket.assigned_admin_id.is_(None))
                            & (Ticket.status.in_([TicketStatus.OPEN, TicketStatus.IN_PROGRESS])),
                            1,
                        ),
                        else_=0,
                    )
                ),
                func.sum(case((Ticket.ai_classified.is_(False), 1), else_=0)),
                func.sum(case((Ticket.created_at >= week_ago, 1), else_=0)),
            )
        )
    ).one()

    pending = (
        await session.execute(select(func.coalesce(func.sum(Book.royalty_pending), 0)))
    ).scalar_one()

    return AdminStatsOut(
        total=int(row[0] or 0),
        open=int(row[1] or 0),
        in_progress=int(row[2] or 0),
        resolved=int(row[3] or 0),
        closed=int(row[4] or 0),
        critical=int(row[5] or 0),
        unassigned=int(row[6] or 0),
        ai_offline=int(row[7] or 0),
        created_last_7_days=int(row[8] or 0),
        pending_royalty_total=float(pending or 0),
    )


async def author_overviews(session: AsyncSession) -> list[AuthorOverviewOut]:
    authors = list(
        (
            await session.execute(
                select(User)
                .where(User.role == UserRole.AUTHOR)
                .options(selectinload(User.books))
                .order_by(User.name)
            )
        )
        .scalars()
        .all()
    )

    ticket_rows = (
        await session.execute(
            select(Ticket.author_id, func.count(Ticket.id))
            .where(Ticket.status.in_([TicketStatus.OPEN, TicketStatus.IN_PROGRESS]))
            .group_by(Ticket.author_id)
        )
    ).all()
    open_counts = {author_id: int(count) for author_id, count in ticket_rows}

    return [
        AuthorOverviewOut(
            id=author.id,
            name=author.name,
            email=author.email,
            city=author.city,
            joined_date=author.joined_date,
            book_count=len(author.books),
            published_count=sum(1 for book in author.books if not book.is_in_production),
            pending_royalty=float(sum((book.royalty_pending or 0) for book in author.books)),
            open_tickets=open_counts.get(author.id, 0),
        )
        for author in authors
    ]


class _TransientTicketView:
    """Minimal object accepted by `ticket_snapshot` before a row exists."""

    def __init__(self, subject: str, description: str) -> None:
        self.subject = subject
        self.description = description
        self.category = None
        self.priority = None
