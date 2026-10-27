"""Ticket routes - the heart of the portal."""

from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.api.deps import (
    AdminUser,
    AuthorUser,
    CurrentUser,
    PaginationDep,
    SessionDep,
)
from app.api.serializers import message_out, ticket_created, ticket_detail, ticket_summary
from app.errors import AppError
from app.models.enums import TicketCategory, TicketPriority, TicketStatus, UserRole
from app.models.ticket import Ticket
from app.schemas.ticket import (
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
from app.services import ticket_service

router = APIRouter(prefix="/tickets", tags=["tickets"])


def _ensure_visible(ticket: Ticket, user: CurrentUser) -> None:
    if user.role is UserRole.AUTHOR and ticket.author_id != user.id:
        # 404 rather than 403: don't confirm that another author's ticket exists.
        raise AppError("ticket_not_found", "Ticket not found.", status_code=404)


@router.post(
    "",
    response_model=TicketCreatedOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a support ticket (author)",
    description=(
        "Runs AI/SLM triage and drafting synchronously, then saves the ticket. "
        "If every configured AI engine fails, the ticket is still created with "
        "`General Inquiry` / `Medium` / `ai_classified=false` and no draft."
    ),
)
async def create_ticket(
    payload: TicketCreate, user: AuthorUser, session: SessionDep
) -> TicketCreatedOut:
    ticket, _outcome = await ticket_service.create_ticket(session, user, payload)
    return ticket_created(ticket)


@router.get(
    "",
    response_model=TicketListOut,
    summary="List tickets (role-aware)",
    description=(
        "Authors see only their own tickets, newest first. Admins see everything and "
        "can filter by status, category, priority, date range, assignee and free text. "
        "Admin results are ordered unresolved-first, then Critical -> Low, then oldest."
    ),
)
async def list_tickets(
    user: CurrentUser,
    session: SessionDep,
    pagination: PaginationDep,
    status_filter: TicketStatus | None = Query(default=None, alias="status"),
    category: TicketCategory | None = Query(default=None),
    priority: TicketPriority | None = Query(default=None),
    date_from: date | None = Query(default=None, description="Inclusive created-at lower bound"),
    date_to: date | None = Query(default=None, description="Inclusive created-at upper bound"),
    q: str | None = Query(default=None, max_length=120, description="Subject/description/number search"),
    unassigned: bool = Query(default=False, description="Admin only: only unassigned tickets"),
    mine: bool = Query(default=False, description="Admin only: assigned to the caller"),
) -> TicketListOut:
    if date_from and date_to and date_from > date_to:
        raise AppError(
            "invalid_date_range", "date_from must be on or before date_to.", status_code=422
        )

    is_admin = user.role is UserRole.ADMIN
    tickets, total = await ticket_service.list_tickets(
        session,
        author_id=None if is_admin else user.id,
        status=status_filter,
        category=category,
        priority=priority,
        date_from=date_from,
        date_to=date_to,
        q=q,
        unassigned=unassigned and is_admin,
        assigned_admin_id=user.id if (is_admin and mine) else None,
        page=pagination.page,
        page_size=pagination.page_size,
        admin_view=is_admin,
    )

    items: list[TicketSummaryOut] = [
        ticket_summary(ticket, admin=is_admin) for ticket in tickets
    ]
    return TicketListOut(
        items=items,
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
        pages=(total + pagination.page_size - 1) // pagination.page_size if total else 0,
    )


@router.get(
    "/{ticket_id}",
    response_model=TicketDetailOut,
    summary="Ticket detail + thread",
    description=(
        "Authors can only read their own ticket. Internal notes and the AI draft are "
        "stripped from every author response."
    ),
    responses={404: {"description": "Ticket not found or not visible to the caller"}},
)
async def get_ticket(
    ticket_id: UUID, user: CurrentUser, session: SessionDep
) -> TicketDetailOut:
    ticket = await ticket_service.load_ticket(session, ticket_id)
    _ensure_visible(ticket, user)
    return ticket_detail(ticket, admin=user.role is UserRole.ADMIN)


@router.patch(
    "/{ticket_id}",
    response_model=TicketDetailOut,
    summary="Override triage fields (admin)",
    description=(
        "Partial update for status, category, priority and assignee. Supplying "
        "`assigned_admin_id: null` unassigns; the assignee must be an admin."
    ),
)
async def update_ticket(
    ticket_id: UUID, payload: TicketUpdate, user: AdminUser, session: SessionDep
) -> TicketDetailOut:
    ticket = await ticket_service.load_ticket(session, ticket_id)
    ticket = await ticket_service.update_ticket(session, ticket, payload, user)
    return ticket_detail(ticket, admin=True)


@router.post(
    "/{ticket_id}/messages",
    response_model=MessageOut,
    status_code=status.HTTP_201_CREATED,
    summary="Reply publicly or add an internal note",
    description=(
        "Admins may set `is_internal_note=true`; those messages never appear in author "
        "responses. An admin's first public reply moves Open -> In Progress. An author "
        "reply on a Resolved/Closed ticket reopens it."
    ),
)
async def create_message(
    ticket_id: UUID,
    payload: MessageCreate,
    user: CurrentUser,
    session: SessionDep,
) -> MessageOut:
    ticket = await ticket_service.load_ticket(session, ticket_id)
    _ensure_visible(ticket, user)
    message, _status_changed = await ticket_service.add_message(
        session, ticket, user, payload
    )
    return message_out(message)


@router.post(
    "/{ticket_id}/regenerate-draft",
    response_model=DraftOut,
    summary="Regenerate the AI draft (admin)",
    description=(
        "Uses the supplied category (or the ticket's current category) to inject only that "
        "policy slice. Returns 503 if the provider fails; the existing draft is preserved."
    ),
)
async def regenerate_draft(
    ticket_id: UUID,
    user: AdminUser,
    session: SessionDep,
    payload: RegenerateDraftRequest | None = None,
) -> DraftOut:
    ticket = await ticket_service.load_ticket(session, ticket_id)
    ticket = await ticket_service.regenerate_draft(
        session,
        ticket,
        category=payload.category if payload else None,
        instruction=payload.instruction if payload else None,
    )
    return DraftOut(
        ticket_id=ticket.id,
        ai_draft_response=ticket.ai_draft_response or "",
        ai_model_used=ticket.ai_model_used,
        ai_classified=ticket.ai_classified,
        ai_confidence=ticket.ai_confidence,
        generated_at=datetime.now(UTC),
    )
