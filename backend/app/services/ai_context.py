"""Compact, privacy-conscious snapshots of the data injected into prompts.

Golden rule: never dump every book into a prompt. We send the author profile,
the single linked book (full facts) or - for account-level tickets - one line
per book, and nothing else. This keeps prompts small enough for 3B SLMs and
avoids leaking unrelated commercial data to a third-party model.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Iterable

from app.models.book import PRODUCTION_STAGES, Book
from app.models.ticket import Ticket
from app.models.user import User


def format_inr(value: float | Decimal | None) -> str | None:
    """Format a number with Indian digit grouping and a rupee prefix."""
    if value is None:
        return None
    amount = float(value)
    whole = int(abs(amount))
    digits = str(whole)
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        groups: list[str] = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        digits = ",".join([*groups, tail])
    if amount < 0:
        digits = f"-{digits}"
    paise = round(abs(amount - int(amount)) * 100)
    body = f"{digits}.{paise:02d}" if paise else digits
    return f"₹{body}"


def format_date(value: date | None, *, style: str = "short") -> str | None:
    if value is None:
        return None
    if style == "iso":
        return value.isoformat()
    return f"{value.day} {value.strftime('%b %Y')}"


def truncate(text: str | None, limit: int) -> str:
    if not text:
        return ""
    collapsed = " ".join(text.split())
    if len(collapsed) <= limit:
        return collapsed
    return collapsed[: limit - 1].rstrip() + "…"


@dataclass(frozen=True, slots=True)
class AuthorSnapshot:
    id: str
    name: str
    city: str | None
    joined_date: date | None

    @property
    def first_name(self) -> str:
        return self.name.split(" ", 1)[0]


@dataclass(frozen=True, slots=True)
class BookSnapshot:
    id: str
    title: str
    isbn: str
    genre: str | None
    publication_date: date | None
    status: str
    mrp: float | None
    royalty_per_copy: float | None
    copies_sold: int
    royalty_earned: float
    royalty_paid: float
    royalty_pending: float
    last_payout: date | None
    print_partner: str | None
    available_on: tuple[str, ...]

    @property
    def is_in_production(self) -> bool:
        return self.status.startswith("In Production")

    @property
    def production_stage(self) -> str | None:
        if not self.is_in_production:
            return None
        _, _, stage = self.status.partition(" - ")
        return stage.strip() or None

    @property
    def production_stage_number(self) -> int | None:
        stage = self.production_stage
        if not stage or stage not in PRODUCTION_STAGES:
            return None
        return PRODUCTION_STAGES.index(stage) + 1

    @property
    def next_production_stage(self) -> str | None:
        number = self.production_stage_number
        if number is None or number >= len(PRODUCTION_STAGES):
            return None
        return PRODUCTION_STAGES[number]


@dataclass(frozen=True, slots=True)
class TicketSnapshot:
    subject: str
    description: str
    category: str | None = None
    priority: str | None = None


def author_snapshot(user: User) -> AuthorSnapshot:
    return AuthorSnapshot(
        id=user.id,
        name=user.name,
        city=user.city,
        joined_date=user.joined_date,
    )


def book_snapshot(book: Book) -> BookSnapshot:
    return BookSnapshot(
        id=book.id,
        title=book.title,
        isbn=book.isbn,
        genre=book.genre,
        publication_date=book.publication_date,
        status=book.status,
        mrp=float(book.mrp) if book.mrp is not None else None,
        royalty_per_copy=(
            float(book.author_royalty_per_copy) if book.author_royalty_per_copy is not None else None
        ),
        copies_sold=book.total_copies_sold or 0,
        royalty_earned=float(book.total_royalty_earned or 0),
        royalty_paid=float(book.royalty_paid or 0),
        royalty_pending=float(book.royalty_pending or 0),
        last_payout=book.last_royalty_payout_date,
        print_partner=book.print_partner,
        available_on=tuple(book.available_on or ()),
    )


def ticket_snapshot(ticket: Ticket) -> TicketSnapshot:
    return TicketSnapshot(
        subject=ticket.subject,
        description=ticket.description,
        category=ticket.category.value if ticket.category else None,
        priority=ticket.priority.value if ticket.priority else None,
    )


def author_block(author: AuthorSnapshot) -> str:
    parts = [f"Name: {author.name} (author id {author.id})"]
    if author.city:
        parts.append(f"City: {author.city}")
    if author.joined_date:
        parts.append(f"BookLeaf author since: {author.joined_date.isoformat()}")
    return "AUTHOR\n" + "\n".join(parts)


def book_block(book: BookSnapshot) -> str:
    """Full fact block for the single book linked to the ticket."""
    lines = [
        f"Title: {book.title} ({book.id})",
        f"ISBN: {book.isbn}",
    ]
    if book.genre:
        lines.append(f"Genre: {book.genre}")
    lines.append(f"Status: {book.status}")

    if book.is_in_production:
        stage = book.production_stage or "in production"
        number = book.production_stage_number
        stage_text = f"{stage} (stage {number} of {len(PRODUCTION_STAGES)})" if number else stage
        lines.append(f"Production stage: {stage_text}")
        if book.next_production_stage:
            lines.append(f"Next stage: {book.next_production_stage}")
        lines.append("Publication date: not published yet")
        lines.append("Commercials: not applicable until publication (no MRP, sales or royalties yet)")
        return "LINKED BOOK\n" + "\n".join(lines)

    if book.publication_date:
        lines.append(f"Publication date: {book.publication_date.isoformat()}")
    if book.mrp is not None:
        lines.append(f"MRP: {format_inr(book.mrp)}")
    if book.royalty_per_copy is not None:
        lines.append(f"Author royalty per copy: {format_inr(book.royalty_per_copy)}")
    lines.append(f"Copies sold: {book.copies_sold}")
    lines.append(f"Royalty earned (lifetime): {format_inr(book.royalty_earned)}")
    lines.append(f"Royalty paid: {format_inr(book.royalty_paid)}")
    lines.append(f"Royalty pending: {format_inr(book.royalty_pending)}")
    lines.append(
        "Last royalty payout: "
        + (book.last_payout.isoformat() if book.last_payout else "no payout released yet")
    )
    if book.print_partner:
        lines.append(f"Print partner: {book.print_partner}")
    if book.available_on:
        lines.append(f"Available on: {', '.join(book.available_on)}")
    return "LINKED BOOK\n" + "\n".join(lines)


def books_summary_block(books: Iterable[BookSnapshot]) -> str:
    """One line per book - only used for 'General / Account Level' tickets."""
    lines: list[str] = []
    for book in books:
        if book.is_in_production:
            lines.append(
                f"- {book.id} {book.title!r}: {book.status}; not published yet; no royalties."
            )
            continue
        payout = book.last_payout.isoformat() if book.last_payout else "never paid"
        lines.append(
            f"- {book.id} {book.title!r}: {book.status}; royalty pending "
            f"{format_inr(book.royalty_pending)}; lifetime earned "
            f"{format_inr(book.royalty_earned)}; last payout {payout}."
        )
    if not lines:
        return "AUTHOR BOOKS\n- No books on file."
    return "AUTHOR BOOKS (one line each)\n" + "\n".join(lines)


def pending_royalty_total(books: Iterable[BookSnapshot]) -> float:
    return sum(book.royalty_pending for book in books if not book.is_in_production)
