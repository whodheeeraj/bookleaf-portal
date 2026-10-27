"""Deterministic BookLeaf rule engine.

Two jobs:

1. **Offline demo / zero-key mode** - when `AI_PROVIDER=mock`, or when a real
   provider is selected but no API key is present, the portal still classifies
   tickets and writes a BookLeaf-specific draft. This keeps the product usable
   in a sandbox and during provider outages.
2. **Test oracle** - classification logic is deterministic, so it can be unit
   tested without mocking an LLM.

It is intentionally *not* used when a configured LLM call fails: that case
must surface "AI offline - manual triage required" rather than silently
pretending a model answered (see `ai_service`).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from app.models.book import PRODUCTION_STAGES
from app.models.enums import TicketCategory, TicketPriority
from app.services import kb_context
from app.services.ai_context import (
    AuthorSnapshot,
    BookSnapshot,
    TicketSnapshot,
    format_date,
    format_inr,
    pending_royalty_total,
)

MODEL_NAME = "bookleaf-rules-v1"

# Weighted keyword lexicon. Substring matching is deliberate ("royalt" catches
# royalty/royalties); weights encode how unambiguous a term is for a category.
_CATEGORY_KEYWORDS: dict[TicketCategory, dict[str, float]] = {
    TicketCategory.ROYALTY: {
        "royalt": 5,
        "payout": 4,
        "unpaid": 5,
        "payment": 3,
        "paid": 2,
        "bank": 2,
        "transfer": 2,
        "earning": 3,
        "earned": 2,
        "amount": 2,
        "money": 3,
        "settlement": 3,
        "remuneration": 4,
        "cheque": 4,
        "80/20": 4,
        "quarter": 2,
        "profit": 2,
        "due": 1,
    },
    TicketCategory.ISBN: {
        "isbn": 6,
        "barcode": 5,
        "imprint": 4,
        "metadata": 3,
        "duplicate": 3,
        "wrong isbn": 7,
        "different isbn": 6,
        "mismatch": 4,
        "copyright page": 3,
        "title and author": 4,
    },
    TicketCategory.PRINTING: {
        "misprint": 6,
        "blurry": 6,
        "blurred": 6,
        "binding": 6,
        "misalign": 5,
        "defect": 5,
        "damaged": 4,
        "torn": 4,
        "smudge": 4,
        "reprint": 4,
        "print quality": 5,
        "low quality": 4,
        "author copies": 3,
        "printing": 3,
        "pages": 2,
        "ink": 3,
        "paper": 1,
        "colour": 2,
        "color": 2,
    },
    TicketCategory.DISTRIBUTION: {
        "unavailable": 6,
        "out of stock": 6,
        "not available": 5,
        "buy button": 5,
        "not live": 4,
        "amazon": 3,
        "flipkart": 3,
        "distribut": 4,
        "availability": 4,
        "retailer": 3,
        "stock": 3,
        "listing": 3,
        "store": 2,
        "kindle": 2,
        "purchase": 2,
    },
    TicketCategory.PRODUCTION: {
        "typeset": 5,
        "cover design": 5,
        "proofread": 5,
        "production": 4,
        "manuscript": 4,
        "editing": 3,
        "stage": 3,
        "stuck": 4,
        "delay": 3,
        "when will": 3,
        "not published": 4,
        "pending publication": 4,
        "launch date": 3,
        "publish": 2,
        "ebook": 1,
    },
    TicketCategory.GENERAL: {
        "author bio": 4,
        "bio": 3,
        "description": 2,
        "profile": 3,
        "dashboard": 2,
        "account": 2,
        "package": 3,
        "bestseller": 3,
        "certificate": 2,
        "how do i": 2,
        "how can i": 2,
        "delete": 2,
    },
}

_TIE_BREAK = (
    TicketCategory.ROYALTY,
    TicketCategory.ISBN,
    TicketCategory.PRINTING,
    TicketCategory.DISTRIBUTION,
    TicketCategory.PRODUCTION,
    TicketCategory.GENERAL,
)

_CRITICAL_PHRASES = (
    "legal action",
    "lawyer",
    "consumer court",
    "consumer forum",
    "duplicate isbn",
    "wrong isbn",
    "two different isbn",
    "different isbn",
    "data leak",
    "privacy",
    "never received",
    "haven't received any royalty",
    "have not received any royalty",
    "no royalty for",
    "six months",
    "6 months",
    "two quarters",
    "three quarters",
    "3 quarters",
    "since last year",
    "escalate this",
    "immediately escalate",
)

_HIGH_PHRASES = (
    "not received",
    "haven't received",
    "have not received",
    "overdue",
    "unpaid",
    "urgent",
    "asap",
    "immediately",
    "frustrat",
    "angry",
    "disappointed",
    "blurry",
    "misprint",
    "defect",
    "damaged",
    "unavailable",
    "out of stock",
    "wrong",
    "stuck",
    "delayed",
    "delay",
    "missed",
    "three weeks",
    "3 weeks",
    "one month",
    "a month",
)

_LOW_PHRASES = (
    "can i update",
    "how do i update",
    "just wanted to ask",
    "quick question",
    "author bio",
    "update my bio",
    "update the description",
    "profile picture",
    "how does",
    "curious about",
)

_SPAMMY_HINTS = ("thank you for your help", "no action needed", "just checking")


@dataclass(frozen=True, slots=True)
class RuleEngineResult:
    category: TicketCategory
    priority: TicketPriority
    draft_response: str
    confidence: float
    rationale: str
    model: str = MODEL_NAME


def _score_categories(text: str) -> tuple[TicketCategory, float, dict[TicketCategory, float]]:
    lowered = text.lower()
    scores: dict[TicketCategory, float] = {}
    for category, keywords in _CATEGORY_KEYWORDS.items():
        score = 0.0
        for keyword, weight in keywords.items():
            hits = lowered.count(keyword)
            if hits:
                score += weight * min(hits, 3)
        scores[category] = score

    # An explicit identifier problem outranks royalty chatter in mixed tickets.
    if scores[TicketCategory.ISBN] >= 5 and any(
        phrase in lowered for phrase in ("wrong", "duplicate", "mismatch", "different")
    ):
        best = TicketCategory.ISBN
    else:
        best = max(_TIE_BREAK, key=lambda category: (scores[category], -_TIE_BREAK.index(category)))

    total = sum(scores.values())
    if scores[best] < 2:
        return TicketCategory.GENERAL, 0.35, scores
    dominance = scores[best] / total if total else 0.0
    confidence = round(min(0.92, 0.55 + 0.35 * dominance), 2)
    return best, confidence, scores


def _oldest_payout(books: list[BookSnapshot], book: BookSnapshot | None) -> date | None:
    """Last payout relevant to the ticket: the linked book, or the account."""
    if book is not None:
        return book.last_payout
    candidates = [b.last_payout for b in books if b.last_payout]
    return min(candidates) if candidates else None


def _decide_priority(
    category: TicketCategory,
    text: str,
    book: BookSnapshot | None,
    books: list[BookSnapshot],
    today: date,
) -> tuple[TicketPriority, str]:
    lowered = text.lower()

    for phrase in _CRITICAL_PHRASES:
        if phrase in lowered:
            return TicketPriority.CRITICAL, f"critical phrase '{phrase}'"

    if category in (TicketCategory.ROYALTY,):
        pending = (
            book.royalty_pending
            if book is not None and not book.is_in_production
            else pending_royalty_total(books)
        )
        oldest = _oldest_payout(books, book)
        overdue_quarters = kb_context.quarters_since(oldest, today) if oldest else 0
        if pending > 0 and oldest and overdue_quarters >= 2:
            return (
                TicketPriority.CRITICAL,
                f"{overdue_quarters} quarters since the last payout with {format_inr(pending)} pending",
            )
        if pending > 0 and oldest is None:
            # Published title that has never paid out and is beyond one cycle.
            published = [b for b in ([book] if book else books) if b and b.publication_date]
            if published:
                return (
                    TicketPriority.HIGH,
                    "published title with pending royalty and no recorded payout",
                )

    for phrase in _HIGH_PHRASES:
        if phrase in lowered:
            return TicketPriority.HIGH, f"urgency phrase '{phrase}'"

    if category is TicketCategory.ISBN:
        return TicketPriority.HIGH, "ISBN/metadata issues are high priority by policy"
    if category is TicketCategory.PRINTING:
        return TicketPriority.HIGH, "physical quality defects are high priority by policy"
    if category is TicketCategory.DISTRIBUTION:
        if any(term in lowered for term in ("unavailable", "out of stock", "not live", "buy button")):
            return TicketPriority.HIGH, "published title is not purchasable"
        return TicketPriority.MEDIUM, "availability question without a blocked sale"
    if category is TicketCategory.PRODUCTION:
        return TicketPriority.MEDIUM, "pre-publication status question"
    if category is TicketCategory.ROYALTY:
        if any(term in lowered for term in ("when", "how", "cycle", "explain", "breakdown")):
            return TicketPriority.MEDIUM, "royalty process question"
        return TicketPriority.HIGH, "unresolved royalty balance"

    if any(phrase in lowered for phrase in _LOW_PHRASES):
        return TicketPriority.LOW, "routine account/metadata request"
    return TicketPriority.MEDIUM, "general inquiry"


def _add_business_days(start: date, days: int) -> date:
    current = start
    added = 0
    while added < days:
        current += timedelta(days=1)
        if current.weekday() < 5:
            added += 1
    return current


def _remaining_stages(stage_number: int | None) -> str:
    if stage_number is None:
        return "the remaining production stages"
    remaining = PRODUCTION_STAGES[stage_number : stage_number + 3]
    if not remaining:
        return "distribution setup and publication"
    if len(remaining) == 1:
        return remaining[0]
    return ", ".join(remaining[:-1]) + f", then {remaining[-1]}"


def _greeting(author: AuthorSnapshot) -> str:
    return f"Dear {author.first_name},"


def _closing() -> str:
    return "Warm regards,\nBookLeaf Author Support"


def _royalty_draft(
    author: AuthorSnapshot,
    book: BookSnapshot | None,
    books: list[BookSnapshot],
    ticket: TicketSnapshot,
    priority: TicketPriority,
    today: date,
) -> str:
    if book is not None and book.is_in_production:
        stage = book.production_stage or "in production"
        return (
            f"{_greeting(author)}\n\n"
            f"Thank you for reaching out, and I'm sorry for the uncertainty around royalties on "
            f"{book.title}. The honest answer is that royalties haven't started yet: the book is "
            f"still at the {stage} stage of production, and sales - and therefore royalty "
            f"calculations - begin only after it is published and distribution is live.\n\n"
            f"Once {book.title} goes live, the first royalty cycle closes at the next quarter end "
            f"and is paid within 45 days, provided the balance is above ₹"
            f"{kb_context.ROLLOVER_THRESHOLD_INR:,}. You'll be able to see sales and a "
            f"per-platform breakdown in your dashboard from day one.\n\n"
            f"I've asked the production team for the current dated status of your file and will "
            f"confirm the expected publication window within 48 hours. If you have any pending "
            f"cover or proof approvals, sending them today will keep the schedule moving.\n\n"
            f"{_closing()}"
        )

    # Aggregate view (account-level or multi-title).
    relevant_books = [b for b in books if not b.is_in_production]
    if book is not None:
        relevant_books = [book]

    pending = (
        book.royalty_pending
        if book is not None
        else pending_royalty_total(books)
    )
    pending_text = format_inr(pending) or "₹0"
    last_payout = _oldest_payout(books, book)
    deadline = kb_context.next_payout_deadline(today)
    deadline_text = format_date(deadline)

    if book is not None:
        detail_line = (
            f"For {book.title} ({book.id}), our records show {pending_text} pending against "
            f"{format_inr(book.royalty_earned)} earned and {format_inr(book.royalty_paid)} paid "
            f"to date."
        )
    else:
        pending_titles = [
            f"{b.title} ({b.id}) - {format_inr(b.royalty_pending)}"
            for b in relevant_books
            if b.royalty_pending > 0
        ]
        detail_line = (
            "Across your titles, our records show "
            + (", ".join(pending_titles) if pending_titles else "no outstanding royalty balance")
            + f", a combined {pending_text} pending."
        )

    if last_payout:
        payout_line = f"Your last recorded payout was {format_date(last_payout)}."
    else:
        payout_line = "No payout has been released on this title yet."

    if 0 < pending < kb_context.ROLLOVER_THRESHOLD_INR:
        threshold_line = (
            f"Because the balance is below our ₹{kb_context.ROLLOVER_THRESHOLD_INR:,} minimum "
            f"payout threshold, it automatically rolls over to the next quarter - it is not lost."
        )
    else:
        threshold_line = (
            f"Your balance is above the ₹{kb_context.ROLLOVER_THRESHOLD_INR:,} minimum, so it "
            f"is due in the next payout run."
        )

    overdue = priority is TicketPriority.CRITICAL or (
        last_payout is not None
        and pending > 0
        and kb_context.quarters_since(last_payout, today) >= 2
    )

    if overdue:
        action = (
            f"This sits outside our normal quarterly window, so I'm escalating it to our finance "
            f"team today with your account details. They will verify the payout mandate on file "
            f"and confirm a release date within 48 hours. If the delay is on our side, we will own "
            f"it and prioritise your transfer."
        )
    elif pending <= 0:
        action = (
            f"Your royalty balance is currently settled, so there is nothing pending on this "
            f"title. If you were expecting a specific payment, reply with the month and amount "
            f"and I'll have finance trace it within 48 hours."
        )
    else:
        action = (
            f"The next quarterly payout is due by {deadline_text}. If it hasn't reached your "
            f"linked bank account by then, reply here and I'll escalate it immediately."
        )

    return (
        f"{_greeting(author)}\n\n"
        f"Thank you for raising this, and I'm sorry the royalty position has been unclear. I "
        f"understand how frustrating it is to wait on money you have earned.\n\n"
        f"{detail_line} {payout_line} Royalties are calculated quarterly after the 80/20 "
        f"net-profit split (MRP less printing, platform commission and shipping), and released "
        f"within 45 days of the quarter closing. {threshold_line}\n\n"
        f"{action}\n\n"
        f"{_closing()}"
    )


def _isbn_draft(
    author: AuthorSnapshot, book: BookSnapshot | None, ticket: TicketSnapshot, today: date
) -> tuple[str, date]:
    title = book.title if book else "your book"
    isbn = book.isbn if book else "the ISBN on your record"
    escalate_by = _add_business_days(today, 2)
    return (
        f"{_greeting(author)}\n\n"
        f"Thank you for flagging this, and I'm sorry you had to catch it. An ISBN that differs "
        f"between the printed copy and the Amazon listing is a serious metadata error - it can "
        f"break retailer links and confuse readers - so I'm treating it as a priority.\n\n"
        f"I've logged the ISBN we hold for {title} as {isbn} and escalated the mismatch to our "
        f"production and metadata team now. They will trace where the retail feed diverged, "
        f"correct the Amazon listing and confirm the printed record matches. You should not have "
        f"to fix anything on the retailer side yourself.\n\n"
        f"To speed up verification, please send a photo of the copyright page and the back-cover "
        f"barcode if you have them. Corrected metadata usually propagates to retailers within "
        f"3-5 business days once the fix is pushed.\n\n"
        f"You will have a written update from me by {format_date(escalate_by)} at the latest. If "
        f"you have a launch or event coming up, tell me the date and I'll prioritise the fix "
        f"around it.\n\n"
        f"{_closing()}",
        escalate_by,
    )


def _printing_draft(
    author: AuthorSnapshot, book: BookSnapshot | None, today: date
) -> str:
    title = book.title if book else "your book"
    partner = f" Printed through {book.print_partner}." if book and book.print_partner else ""
    reprint_by = _add_business_days(today, 7)
    return (
        f"{_greeting(author)}\n\n"
        f"I'm really sorry - blurry images and misaligned pages are not the standard we hold "
        f"ourselves to, and I understand how disappointing it is to open author copies and find "
        f"them in that condition.{partner}\n\n"
        f"Please share 3-5 photos: the cover, one affected spread and the copyright page. As soon "
        f"as our production team verifies the defect, we will arrange a free reprint of {title} "
        f"at no cost to you. Dispatch normally takes 5-7 business days after verification, and "
        f"you won't need to return the defective copies unless the team specifically asks.\n\n"
        f"I've also flagged this print batch for a quality check so the same file isn't reused "
        f"for future orders.\n\n"
        f"Once I have your photos, I'll confirm the reprint date by {format_date(reprint_by)}. If "
        f"you need replacement copies for an event, tell me the date and I'll ask production to "
        f"prioritise it.\n\n"
        f"{_closing()}"
    )


def _distribution_draft(
    author: AuthorSnapshot, book: BookSnapshot | None, today: date
) -> str:
    title = book.title if book else "your book"
    channels = (
        ", ".join(book.available_on) if book and book.available_on else "the BookLeaf Store"
    )
    follow_up = _add_business_days(today, 2)
    return (
        f"{_greeting(author)}\n\n"
        f"Thank you for flagging this. A 'Currently Unavailable' badge usually means the "
        f"retailer's stock feed has drifted out of sync with our distributor's inventory - it "
        f"does not mean {title} is out of print or that sales have stopped.\n\n"
        f"Our records show the title is live and distributed through {channels}. I'm triggering "
        f"a re-sync with our distribution team today; these normally clear within 24-48 hours, "
        f"and I'll check the Amazon India listing myself before closing this.\n\n"
        f"If the buy button is still missing after {format_date(follow_up)}, reply here with the "
        f"listing URL and I'll escalate it to our distribution lead the same day. Sending the URL "
        f"now also helps us attach the exact listing to the fix.\n\n"
        f"{_closing()}"
    )


def _production_draft(
    author: AuthorSnapshot, book: BookSnapshot | None, today: date
) -> str:
    title = book.title if book else "your book"
    stage = book.production_stage if book else None
    stage_number = book.production_stage_number if book else None
    next_stage = book.next_production_stage if book else None
    stage_line = (
        f"{title} is currently at {stage} - stage {stage_number} of {len(PRODUCTION_STAGES)} in "
        f"our production flow - with {next_stage} next."
        if stage and stage_number and next_stage
        else f"{title} is moving through our production flow."
    )
    follow_up = _add_business_days(today, 2)

    approval_line = ""
    if stage == "Cover Design":
        approval_line = (
            " Cover work is the stage where timelines most often slip, usually while we wait on "
            "author approval. If you haven't received the latest cover proof, tell me and I'll "
            "have it re-sent today; if you have, a quick approval keeps the next stage moving."
        )
    elif stage == "Proofreading":
        approval_line = (
            " Proofreading can take an extra round if revisions are needed, so if you have "
            "marked changes outstanding, send them in one consolidated pass and I'll attach them "
            "to the file."
        )

    eta = (
        "about 4-6 weeks to publication from this stage"
        if stage in ("Manuscript Received", "Editing", "Cover Design")
        else "about 2-4 weeks to publication from this stage"
    )
    return (
        f"{_greeting(author)}\n\n"
        f"Thank you for checking in, and I'm sorry the timeline feels unclear. {stage_line}\n\n"
        f"The remaining path is {_remaining_stages(stage_number)}. {eta.capitalize()}, assuming "
        f"there are no revision rounds.{approval_line}\n\n"
        f"I've asked the production team for a dated update on your file and will confirm it "
        f"within 48 hours, by {format_date(follow_up)} at the latest. You'll also get the usual "
        f"email at the next stage transition - nothing has been missed on your side.\n\n"
        f"{_closing()}"
    )


def _general_draft(
    author: AuthorSnapshot,
    book: BookSnapshot | None,
    books: list[BookSnapshot],
    ticket: TicketSnapshot,
    today: date,
) -> str:
    lowered = (ticket.subject + " " + ticket.description).lower()
    if any(term in lowered for term in ("bio", "description", "metadata", "profile")):
        return (
            f"{_greeting(author)}\n\n"
            f"Thanks for reaching out - yes, that's straightforward to update. Descriptions, "
            f"author bios and category metadata can be changed after publication; send the exact "
            f"wording here or update it in your dashboard and we'll push it to Amazon and "
            f"Flipkart for you.\n\n"
            f"Retail platforms usually reflect metadata changes within 3-5 business days. If you "
            f"need the change live for a specific date, tell me the date and I'll flag it to the "
            f"metadata team.\n\n"
            f"I've noted your request{(' for ' + book.title) if book else ''} on this ticket. "
            f"Reply with the final copy and I'll confirm once it has been submitted.\n\n"
            f"{_closing()}"
        )

    if book is not None and book.is_in_production:
        stage = book.production_stage or "in production"
        return _production_draft(author, book, today) if "when" in lowered else (
            f"{_greeting(author)}\n\n"
            f"Thank you for reaching out. {book.title} is currently at the {stage} stage of "
            f"production, so it isn't available for sale yet and there are no royalty figures "
            f"to report.\n\n"
            f"I've noted your question and asked the production team for the latest dated status. "
            f"I'll come back to you within 48 hours with a clear next step.\n\n"
            f"{_closing()}"
        )

    pending = pending_royalty_total(books)
    account_line = ""
    if books:
        published = [b for b in books if not b.is_in_production]
        account_line = (
            f" For context, your account currently has {len(published)} published "
            f"title{'s' if len(published) != 1 else ''} and {format_inr(pending)} in pending "
            f"royalties."
        )

    return (
        f"{_greeting(author)}\n\n"
        f"Thank you for reaching out, and I'm sorry for any uncertainty this has caused. I've "
        f"read your query and want to make sure I give you an accurate answer rather than a "
        f"generic one.{account_line}\n\n"
        f"I've noted the details on this ticket and routed it to the right specialist. They will "
        f"review your account and reply with a specific answer within one business day; if it "
        f"needs a policy exception or a production fix, I'll escalate it and give you a 48-hour "
        f"update instead.\n\n"
        f"If there is a deadline attached to this request, reply with the date and I'll "
        f"prioritise it accordingly.\n\n"
        f"{_closing()}"
    )


class RuleEngine:
    """Stateless deterministic triage + drafting."""

    def classify(self, ticket: TicketSnapshot) -> tuple[TicketCategory, float, str]:
        text = f"{ticket.subject}\n{ticket.description}"
        category, confidence, _ = _score_categories(text)
        return category, confidence, f"keyword score -> {category.value}"

    def triage_and_draft(
        self,
        author: AuthorSnapshot,
        book: BookSnapshot | None,
        books: list[BookSnapshot],
        ticket: TicketSnapshot,
        today: date | None = None,
    ) -> RuleEngineResult:
        today = today or date.today()
        category, confidence, category_reason = self.classify(ticket)
        priority, priority_reason = _decide_priority(
            category, f"{ticket.subject}\n{ticket.description}", book, books, today
        )

        draft = self.draft_for(
            category=category,
            author=author,
            book=book,
            books=books,
            ticket=ticket,
            priority=priority,
            today=today,
        )
        return RuleEngineResult(
            category=category,
            priority=priority,
            draft_response=draft,
            confidence=confidence,
            rationale=f"{category_reason}; {priority_reason}",
        )

    def draft_for(
        self,
        *,
        category: TicketCategory,
        author: AuthorSnapshot,
        book: BookSnapshot | None,
        books: list[BookSnapshot],
        ticket: TicketSnapshot,
        priority: TicketPriority = TicketPriority.MEDIUM,
        today: date | None = None,
    ) -> str:
        today = today or date.today()
        if category is TicketCategory.ROYALTY:
            return _royalty_draft(author, book, books, ticket, priority, today)
        if category is TicketCategory.ISBN:
            return _isbn_draft(author, book, ticket, today)[0]
        if category is TicketCategory.PRINTING:
            return _printing_draft(author, book, today)
        if category is TicketCategory.DISTRIBUTION:
            return _distribution_draft(author, book, today)
        if category is TicketCategory.PRODUCTION:
            return _production_draft(author, book, today)
        return _general_draft(author, book, books, ticket, today)
