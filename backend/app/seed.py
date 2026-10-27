"""Idempotent database seed.

Usage (from `backend/`):

    python -m app.seed             # create/update demo data, keep tickets
    python -m app.seed --reset     # wipe portal tables, then reseed

Loads `data/bookleaf_sample_data.json` (10 authors, 18 books), creates the
admin account and four realistic support tickets that exercise the edge cases
the assignment calls out: overdue royalty, print defect, Amazon stock sync and
a book still in production (with an AI-offline example for manual triage).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal, init_db
from app.models.book import Book
from app.models.enums import TicketCategory, TicketPriority, TicketStatus, UserRole
from app.models.ticket import Ticket, TicketMessage
from app.models.user import User
from app.security import hash_password

logger = logging.getLogger("seed")

BACKEND_DIR = Path(__file__).resolve().parents[1]
SAMPLE_DATA = BACKEND_DIR / "data" / "bookleaf_sample_data.json"


def _as_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value))


def _as_date(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None


async def _upsert_author(session: AsyncSession, payload: dict[str, Any], password: str) -> User:
    user = await session.get(User, payload["author_id"])
    if user is None:
        user = User(
            id=payload["author_id"],
            email=payload["email"].lower(),
            password_hash=hash_password(password),
            role=UserRole.AUTHOR,
        )
        session.add(user)
    user.name = payload["name"]
    user.email = payload["email"].lower()
    user.phone = payload.get("phone")
    user.city = payload.get("city")
    user.joined_date = _as_date(payload.get("joined_date"))
    user.role = UserRole.AUTHOR
    return user


async def _upsert_book(session: AsyncSession, author_id: str, payload: dict[str, Any]) -> Book:
    book = await session.get(Book, payload["book_id"])
    if book is None:
        book = Book(id=payload["book_id"], author_id=author_id)
        session.add(book)
    book.author_id = author_id
    book.title = payload["title"]
    book.isbn = payload["isbn"]
    book.genre = payload.get("genre")
    book.publication_date = _as_date(payload.get("publication_date"))
    book.status = payload["status"]
    book.mrp = _as_decimal(payload.get("mrp"))
    book.author_royalty_per_copy = _as_decimal(payload.get("author_royalty_per_copy"))
    book.total_copies_sold = int(payload.get("total_copies_sold") or 0)
    book.total_royalty_earned = _as_decimal(payload.get("total_royalty_earned")) or Decimal("0")
    book.royalty_paid = _as_decimal(payload.get("royalty_paid")) or Decimal("0")
    book.royalty_pending = _as_decimal(payload.get("royalty_pending")) or Decimal("0")
    book.last_royalty_payout_date = _as_date(payload.get("last_royalty_payout_date"))
    book.print_partner = payload.get("print_partner")
    book.available_on = list(payload.get("available_on") or [])
    return book


async def _upsert_admin(session: AsyncSession) -> User:
    admin = await session.get(User, settings.admin_id)
    if admin is None:
        admin = User(
            id=settings.admin_id,
            email=settings.admin_email.lower(),
            password_hash=hash_password(settings.admin_password),
            role=UserRole.ADMIN,
        )
        session.add(admin)
    admin.name = settings.admin_name
    admin.email = settings.admin_email.lower()
    admin.phone = "+91-11-4000-1200"
    admin.city = "New Delhi"
    admin.joined_date = date(2021, 8, 2)
    admin.role = UserRole.ADMIN
    return admin


# ---------------------------------------------------------------------------
# Seeded tickets - hand-written so the demo never depends on an API key
# ---------------------------------------------------------------------------
ROHIT_DRAFT = """Dear Rohit,

Thank you for following up, and I'm sorry you've had to chase this. You're right to be frustrated: ₹5,280 is pending on Code & Karma (BK003) and ₹7,744 on Startup Sutra (BK004), and the last payout we have on record is 1 September 2025. That is well outside our 45-day quarterly window, so I won't offer a generic reassurance.

I've escalated this to our finance team with your payout history and bank mandate. They are checking why the recent quarterly releases were not raised and will come back to me with a confirmed transfer date. You will have a written update from me within 48 hours, and if the delay is on our side we will prioritise the transfer and confirm it in writing.

For transparency: royalties are calculated quarterly on the 80/20 net-profit split, and balances above ₹1,000 are released to the bank account linked in your dashboard. Both titles are above that threshold.

Warm regards,
BookLeaf Author Support"""

PRIYA_DRAFT = """Dear Priya,

I'm really sorry - blurry images and misaligned pages are not the standard we hold ourselves to, and I understand how disappointing it is to open author copies and find them in that condition.

Please share 3-5 photos: the cover, one affected spread and the copyright page. Once our production team verifies the defect, we will arrange a free reprint of Whispers of the Ganges (BK001) at no cost to you. Dispatch normally takes 5-7 business days after verification, and you won't need to return the defective copies unless the team asks.

I've flagged the print batch for a quality check so the same file isn't reused for future orders.

Once I have your photos, I'll confirm the reprint date. If you need replacement copies for an event, tell me the date and I'll ask production to prioritise it.

Warm regards,
BookLeaf Author Support"""

KAVITA_DRAFT = """Dear Kavita,

Thank you for checking in, and I'm sorry the timeline feels unclear. Raising Roots (BK015) is currently at Typesetting - stage 4 of 9 in our production flow - with Proofreading next.

The remaining path is Proofreading, ISBN Assignment and Printing, followed by distribution setup and publication. From this stage we usually need about 2-4 weeks, assuming no revision rounds. You haven't missed any emails: authors are updated at each stage transition, and the next one will be proofreading.

I've asked the production team for a dated update on your file and will confirm it within 48 hours. If you have final corrections or front-matter changes, send them in one consolidated pass today and I'll attach them to the job so nothing waits on us.

A quick note so there are no surprises: royalties only begin after publication and the first sales cycle, so there is no royalty movement to report while the book is in production.

Warm regards,
BookLeaf Author Support"""


def _seed_ticket_specs(admin_id: str, now: datetime) -> list[dict[str, Any]]:
    return [
        {
            "ticket_number": "TKT-1001",
            "author_id": "AUTH002",
            "book_id": "BK003",
            "subject": "Royalty pending since September - no payout received",
            "description": (
                "Hi team, I published Code & Karma in Feb 2023 and Startup Sutra in May 2024. "
                "My dashboard shows ₹5,280 pending on Code & Karma and ₹7,744 on Startup Sutra, "
                "but the last transfer I received was on 1 September 2025. It has now been over "
                "a year. I have emailed twice and not received a clear answer. Please tell me "
                "when the money will be transferred, or escalate this."
            ),
            "status": TicketStatus.OPEN,
            "category": TicketCategory.ROYALTY,
            "priority": TicketPriority.CRITICAL,
            "ai_classified": True,
            "ai_model_used": "gpt-4o-mini",
            "ai_confidence": 0.91,
            "ai_draft_response": ROHIT_DRAFT,
            "assigned_admin_id": admin_id,
            "created_at": now - timedelta(days=9),
            "updated_at": now - timedelta(days=2),
            "messages": [
                {
                    "sender_id": admin_id,
                    "is_internal_note": True,
                    "created_at": now - timedelta(days=2),
                    "content": (
                        "Finance check (internal): bank mandate is active, but NEFT runs were "
                        "not raised for the last three quarters. Escalated to Priyanka in "
                        "Finance on the 21st. Do not promise a date until the ledger is "
                        "reconciled - 48h SLA applies."
                    ),
                }
            ],
        },
        {
            "ticket_number": "TKT-1002",
            "author_id": "AUTH001",
            "book_id": "BK001",
            "subject": "Author copies arrived with blurry images and misaligned pages",
            "description": (
                "I received my author copies of Whispers of the Ganges yesterday. The cover is "
                "fine but the interior images are blurry, the text is faint on several pages, "
                "and the margins are misaligned so the page numbers sit too close to the edge. "
                "This is my debut and I have a reading event in three weeks - I need usable "
                "copies. What can you do?"
            ),
            "status": TicketStatus.IN_PROGRESS,
            "category": TicketCategory.PRINTING,
            "priority": TicketPriority.HIGH,
            "ai_classified": True,
            "ai_model_used": "gpt-4o-mini",
            "ai_confidence": 0.94,
            "ai_draft_response": PRIYA_DRAFT,
            "assigned_admin_id": admin_id,
            "created_at": now - timedelta(days=6),
            "updated_at": now - timedelta(days=3),
            "messages": [
                {
                    "sender_id": admin_id,
                    "is_internal_note": False,
                    "created_at": now - timedelta(days=3),
                    "content": (
                        "Hi Priya, thank you for the photos - our production team has verified "
                        "the misalignment and the faint text. We're arranging a free reprint of "
                        "Whispers of the Ganges now; dispatch normally takes 5-7 business days, "
                        "and we'll prioritise it ahead of your reading event. You don't need to "
                        "return the defective copies. I'll confirm the dispatch date here as "
                        "soon as it's booked. - BookLeaf Author Support"
                    ),
                },
                {
                    "sender_id": admin_id,
                    "is_internal_note": True,
                    "created_at": now - timedelta(days=3),
                    "content": (
                        "QA flagged print batch 23-B. PDF export for the interior looks like "
                        "the source of the faint text; design team is re-exporting. Reprint PO "
                        "raised with the Delhi facility."
                    ),
                },
            ],
        },
        {
            "ticket_number": "TKT-1003",
            "author_id": "AUTH005",
            "book_id": "BK009",
            "subject": "Letters from Lakshadweep showing 'Currently Unavailable' on Amazon India",
            "description": (
                "My book Letters from Lakshadweep is live on the BookLeaf Store but Amazon India "
                "has shown 'Currently Unavailable' for the last two days, so nobody can buy it. "
                "Is it out of print? I have a small ad campaign running and I'm losing sales. "
                "Please fix this urgently."
            ),
            "status": TicketStatus.IN_PROGRESS,
            "category": TicketCategory.DISTRIBUTION,
            "priority": TicketPriority.HIGH,
            # Deliberately unclassified: demonstrates the admin "AI offline" state and
            # the Regenerate Draft flow.
            "ai_classified": False,
            "ai_model_used": None,
            "ai_confidence": None,
            "ai_draft_response": None,
            "ai_error": "Simulated provider timeout during seeding - manual triage example",
            "assigned_admin_id": admin_id,
            "created_at": now - timedelta(days=3),
            "updated_at": now - timedelta(days=1),
            "messages": [
                {
                    "sender_id": admin_id,
                    "is_internal_note": False,
                    "created_at": now - timedelta(days=1),
                    "content": (
                        "Hi Meera, this is a stock-feed sync issue rather than the book going "
                        "out of print. I've triggered a fresh sync with our distribution team "
                        "for the Amazon India listing; these usually clear within 24-48 hours. "
                        "I'll check the buy button tomorrow and confirm here. - BookLeaf Author "
                        "Support"
                    ),
                },
                {
                    "sender_id": admin_id,
                    "is_internal_note": True,
                    "created_at": now - timedelta(days=1),
                    "content": (
                        "Distributor re-sync ticket DS-4471 raised. ASIN B0C7XQ2M9K confirmed "
                        "against the retail feed. Re-check after 48h before closing."
                    ),
                },
            ],
        },
        {
            "ticket_number": "TKT-1004",
            "author_id": "AUTH009",
            "book_id": "BK015",
            "subject": "Raising Roots stuck in Typesetting for three weeks",
            "description": (
                "It has been three weeks since you told me Raising Roots moved to typesetting, "
                "and the dashboard still shows the same stage. When will it be done? I was "
                "hoping to launch around the end of next month and I've had no update since."
            ),
            "status": TicketStatus.OPEN,
            "category": TicketCategory.PRODUCTION,
            "priority": TicketPriority.MEDIUM,
            "ai_classified": True,
            "ai_model_used": "llama-3.1-8b-instant",
            "ai_confidence": 0.78,
            "ai_draft_response": KAVITA_DRAFT,
            "assigned_admin_id": None,
            "created_at": now - timedelta(days=1),
            "updated_at": now - timedelta(days=1),
            "messages": [],
        },
    ]


async def _seed_tickets(session: AsyncSession, admin_id: str) -> int:
    existing = set(
        (await session.execute(select(Ticket.ticket_number))).scalars().all()
    )
    created = 0
    now = datetime.now(UTC)

    for spec in _seed_ticket_specs(admin_id, now):
        if spec["ticket_number"] in existing:
            continue

        messages = spec.pop("messages")
        ticket = Ticket(**spec)
        ticket.ai_suggested_category = (
            spec["category"] if spec.get("ai_classified") else None
        )
        ticket.ai_suggested_priority = (
            spec["priority"] if spec.get("ai_classified") else None
        )
        session.add(ticket)
        await session.flush()

        for message_spec in messages:
            message = TicketMessage(ticket_id=ticket.id, **message_spec)
            session.add(message)

        created += 1

    return created


async def reset_database(session: AsyncSession) -> None:
    await session.execute(delete(TicketMessage))
    await session.execute(delete(Ticket))
    await session.execute(delete(Book))
    await session.execute(delete(User))
    await session.commit()
    logger.warning("all portal tables cleared (--reset)")


def load_sample(path: Path | None = None) -> dict[str, Any]:
    candidates = [
        path,
        SAMPLE_DATA,
        BACKEND_DIR.parent / "bookleaf_sample_data.json",
    ]
    for candidate in candidates:
        if candidate and candidate.exists():
            return json.loads(candidate.read_text(encoding="utf-8"))
    raise FileNotFoundError(
        f"Sample data not found. Expected {SAMPLE_DATA}. "
        "Pass --sample <path> or copy bookleaf_sample_data.json into backend/data/."
    )


async def run(reset: bool = False, sample_path: Path | None = None) -> None:
    # Windows consoles default to cp1252, which cannot encode the rupee sign.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):  # pragma: no cover - non-standard streams
        pass
    logging.basicConfig(level="INFO", format="%(levelname)-8s %(message)s")
    data = load_sample(sample_path)

    await init_db()
    async with AsyncSessionLocal() as session:
        if reset:
            await reset_database(session)

        admin = await _upsert_admin(session)
        for author_payload in data.get("authors", []):
            await _upsert_author(session, author_payload, settings.seed_default_password)
            for book_payload in author_payload.get("books", []):
                await _upsert_book(session, author_payload["author_id"], book_payload)

        await session.flush()
        seeded_tickets = await _seed_tickets(session, admin.id)
        await session.commit()

        authors = int(
            (
                await session.execute(
                    select(User).where(User.role == UserRole.AUTHOR)
                )
            )
            .scalars()
            .all()
            .__len__()
        )
        book_count = int((await session.execute(select(Book))).scalars().all().__len__())
        ticket_count = int((await session.execute(select(Ticket))).scalars().all().__len__())

    print()
    print("=" * 68)
    print("  BookLeaf Portal seed complete")
    print("=" * 68)
    print(f"  authors : {authors}")
    print(f"  books   : {book_count}")
    print(f"  tickets : {ticket_count} ({seeded_tickets} created this run)")
    print()
    print("  Demo logins (password for all: %s)" % settings.seed_default_password)
    print(f"    Admin   : {settings.admin_email}")
    print("    Sneha   : sneha.kulkarni@email.com      (BK013 in Cover Design)")
    print("    Kavita  : kavita.deshmukh@email.com     (BK015 Typesetting, BK016 ₹850 pending)")
    print("    Rohit   : rohit.kapoor@email.com        (₹13,024 pending across 2 books)")
    print("    Priya   : priya.sharma@email.com        (print quality sample)")
    print("    Meera   : meera.nair@email.com          (stock sync / AI-offline sample)")
    print("=" * 68)
    print()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Seed the BookLeaf support portal database.")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete existing users/books/tickets before seeding (destructive).",
    )
    parser.add_argument(
        "--sample",
        type=Path,
        default=None,
        help="Path to bookleaf_sample_data.json (defaults to backend/data).",
    )
    args = parser.parse_args(argv)

    try:
        asyncio.run(run(reset=args.reset, sample_path=args.sample))
    except FileNotFoundError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    except Exception as exc:  # pragma: no cover - CLI surface
        logger.exception("seed failed: %s", exc)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
