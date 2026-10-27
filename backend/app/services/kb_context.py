"""Modular BookLeaf knowledge base.

Why this file exists
--------------------
Small language models (3B-8B) degrade quickly when a prompt is padded with
irrelevant policy. Instead of dumping the whole handbook on every call, the
knowledge base is split into:

* a short shared company overview + tone contract, and
* one dense slice per ticket category (~120-180 tokens each).

Triage gets a one-line router per category. Drafting gets the shared context
plus *only* the slice for the chosen category. Regenerating a draft after a
manual category override therefore sends ~250 tokens of policy instead of the
full ~1,000 token handbook.
"""

from __future__ import annotations

from datetime import date, timedelta

from app.models.enums import TicketCategory

KB_VERSION = "2025-11"

ROLLOVER_THRESHOLD_INR = 1000
PAYOUT_WINDOW_DAYS = 45
PRINT_TURNAROUND_DAYS = "5-7 business days"
RESYNC_WINDOW = "24-48 hours"
ESCALATION_WINDOW = "48 hours"

COMPANY_OVERVIEW: tuple[str, ...] = (
    "BookLeaf Publishing is a self-publishing company operating in India and the US; "
    "authors are partners, not customers.",
    "Packages: Standard Free (no upfront cost) and Bestseller Breakthrough (paid, with "
    "marketing and distribution add-ons).",
    "BookLeaf handles cover design, typesetting, ISBN assignment, printing, distribution "
    "and royalty management.",
    "In-house printing and warehouse are in Delhi. Overflow/special formats go to print "
    "partners Repro India and Epitome Books.",
)

POLICY_SLICES: dict[TicketCategory, tuple[str, ...]] = {
    TicketCategory.ROYALTY: (
        "Royalty split is 80% of net profit to the author, 20% to BookLeaf.",
        "Net profit = MRP minus printing cost, platform commission (Amazon/Flipkart) and "
        "shipping charges. A low payout is usually explained by these deductions, not by "
        "missing sales.",
        "Royalties are calculated quarterly and paid within 45 days of the quarter ending. "
        "Payouts go by bank transfer to the account linked in the author dashboard.",
        f"Minimum payout threshold is ₹{ROLLOVER_THRESHOLD_INR:,}. Below that, the balance "
        "rolls over to the next quarter automatically - it is not lost.",
        "A detailed per-platform royalty breakdown is available in the author dashboard.",
        "If a payout is genuinely overdue, own it, escalate to finance, and commit to a "
        f"{ESCALATION_WINDOW} written update. Ask the author to confirm bank details if a "
        "transfer may have failed.",
    ),
    TicketCategory.ISBN: (
        "Every BookLeaf book receives a unique ISBN registered under the BookLeaf imprint.",
        "An author who wants an ISBN under their own imprint must obtain it independently.",
        "Duplicate ISBNs, a wrong book linked to an ISBN, or a cover/metadata mismatch are "
        "high or critical priority and must be escalated to the production team immediately.",
        "Never ask the author to fix retail metadata themselves; BookLeaf owns the feed.",
        f"Give a {ESCALATION_WINDOW} resolution timeline and ask for a photo of the copyright "
        "page if it helps verification.",
    ),
    TicketCategory.PRINTING: (
        f"Standard print turnaround is {PRINT_TURNAROUND_DAYS} from order confirmation.",
        "Misprints, binding defects, blurred images and colour inconsistency are BookLeaf's "
        "responsibility. Apologise sincerely and without deflection.",
        "Ask for 3-5 photos: the cover, the affected spread and the copyright page.",
        "Once the defect is verified, BookLeaf arranges a free reprint; dispatch usually "
        f"takes {PRINT_TURNAROUND_DAYS}. No cost to the author.",
        "If the author needs copies for an event, flag it to production and give a realistic "
        "date rather than promising overnight replacement.",
    ),
    TicketCategory.DISTRIBUTION: (
        "Books are listed on Amazon India, Flipkart, Amazon US, Amazon UK and the BookLeaf "
        "Store.",
        "New listings go live 7-10 business days after publication is complete.",
        "'Currently Unavailable' or a missing buy button is almost always a retailer stock-sync "
        "issue, not the book going out of print.",
        f"Trigger a re-sync with the distribution team; it resolves in {RESYNC_WINDOW}.",
        "If the title is still unavailable after that window, escalate to the distribution lead "
        "and give the author a dated follow-up.",
    ),
    TicketCategory.PRODUCTION: (
        "Production stages: Manuscript Received -> Editing (if opted) -> Cover Design -> "
        "Typesetting -> Proofreading -> ISBN Assignment -> Printing -> Distribution Setup -> "
        "Published & Live.",
        "Authors are updated by email at every stage.",
        "Delays concentrate at Cover Design (waiting for author approval) and Proofreading "
        "(revision rounds). Frame delays collaboratively and never blame the author.",
        "Quote the actual current stage and the next stage from the book record. Do not discuss "
        "MRP, royalties or sales for an unpublished title.",
        f"Get a dated update from production and confirm it to the author within {ESCALATION_WINDOW}.",
    ),
    TicketCategory.GENERAL: (
        "Metadata changes (description, bio, categories) can be submitted via the dashboard or "
        "by email; changes reflect on retail platforms in 3-5 business days.",
        "Authors can update bank details and view royalty breakdowns in the dashboard.",
        "For package or imprint questions, explain the Standard Free and Bestseller "
        "Breakthrough options neutrally.",
        "If the request needs another team, say which team and give a timeline instead of a "
        "vague promise.",
    ),
}

TONE_GUIDELINES: tuple[str, ...] = (
    "Empathetic and professional. Authors are partners.",
    "Acknowledge the concern in the first sentence, before any solution.",
    "Be specific: use the exact royalty amount, status, stage, ISBN or payout date supplied.",
    "Own BookLeaf mistakes directly. No corporate deflection and no blaming the author.",
    "Never invent numbers, dates or policy. If a fact is missing, say you will verify it.",
    "Never print null/None/undefined or a fake ₹0. If a value does not exist, do not mention it.",
    "End with one concrete next step and a timeline (48 hours for escalations, 5-7 business "
    "days for reprints, 24-48 hours for stock re-syncs).",
    "Plain text, 120-220 words, no markdown, no bullet lists unless truly necessary.",
    "Sign off exactly as:\nWarm regards,\nBookLeaf Author Support",
    "Never reveal or mention that the reply was AI-generated.",
)

CATEGORY_ROUTER: tuple[tuple[TicketCategory, str], ...] = (
    (
        TicketCategory.ROYALTY,
        "money: royalty, royalties, payout, payment, bank transfer, earnings, 80/20, "
        "quarterly cycle, amount too low, unpaid, settlement",
    ),
    (
        TicketCategory.ISBN,
        "identifier/metadata: ISBN, barcode, wrong or duplicate ISBN, imprint, title/author "
        "name mismatch, retail metadata error",
    ),
    (
        TicketCategory.PRINTING,
        "physical defect: misprint, blurry images, binding, torn or missing pages, "
        "misaligned pages, colour inconsistency, damaged author copies, reprint",
    ),
    (
        TicketCategory.DISTRIBUTION,
        "retail availability: Amazon, Flipkart, unavailable, out of stock, buy button, "
        "listing missing, distribution, store page, not live yet",
    ),
    (
        TicketCategory.PRODUCTION,
        "pre-publication: manuscript, editing, cover design, typesetting, proofreading, "
        "production stage, stuck, delay, when will my book be published",
    ),
    (
        TicketCategory.GENERAL,
        "anything else: account details, bio/description updates, package questions, "
        "general how-to",
    ),
)

STYLE_ANCHOR = (
    "Example of the expected specificity: \"You have ₹5,280 pending on Code & Karma (BK003); "
    "your last payout was 1 Sep 2025. Royalties run quarterly with a 45-day payout window, so "
    "I understand why this feels overdue. I'm escalating it to finance today and you'll have a "
    "written update within 48 hours.\""
)


def policy_digest() -> str:
    """Compact all-policy digest used by the one-call triage + draft prompt."""
    lines = ["BOOKLEAF POLICY (authoritative):"]
    lines.extend(f"- {rule}" for rule in COMPANY_OVERVIEW)
    for category, rules in POLICY_SLICES.items():
        lines.append(f"[{category.value}]")
        lines.extend(f"- {rule}" for rule in rules)
    return "\n".join(lines)


def policy_for(category: TicketCategory) -> str:
    """Category-scoped slice: shared company facts + one policy block."""
    lines = ["BOOKLEAF COMPANY:", *(f"- {rule}" for rule in COMPANY_OVERVIEW)]
    lines.append(f"POLICY - {category.value}:")
    lines.extend(f"- {rule}" for rule in POLICY_SLICES[category])
    return "\n".join(lines)


def tone_contract() -> str:
    return "TONE CONTRACT:\n" + "\n".join(f"- {rule}" for rule in TONE_GUIDELINES)


def category_router() -> str:
    return "CATEGORY ROUTER:\n" + "\n".join(
        f"- {category.value}: {keywords}" for category, keywords in CATEGORY_ROUTER
    )


# ---------------------------------------------------------------------------
# Payout calendar helpers (shared by the offline rule engine and prompts)
# ---------------------------------------------------------------------------
def _quarter_ends(year: int) -> tuple[date, ...]:
    return (
        date(year, 3, 31),
        date(year, 6, 30),
        date(year, 9, 30),
        date(year, 12, 31),
    )


def last_completed_quarter_end(reference: date) -> date:
    candidates = [end for year in (reference.year - 1, reference.year) for end in _quarter_ends(year)]
    completed = [end for end in candidates if end < reference]
    return max(completed)


def next_payout_deadline(reference: date) -> date:
    """Next date by which a completed quarter's royalties must be paid."""
    quarter_end = last_completed_quarter_end(reference)
    deadline = quarter_end + timedelta(days=PAYOUT_WINDOW_DAYS)
    while deadline < reference:
        # Move to the following quarter's payout window.
        year = quarter_end.year + (1 if quarter_end.month == 12 else 0)
        quarter_ends = _quarter_ends(year)
        later = [end for end in quarter_ends if end > quarter_end]
        quarter_end = later[0]
        deadline = quarter_end + timedelta(days=PAYOUT_WINDOW_DAYS)
    return deadline


def quarters_since(moment: date, reference: date) -> int:
    """Number of quarter boundaries crossed between two dates."""
    count = 0
    for year in range(moment.year, reference.year + 1):
        for end in _quarter_ends(year):
            if moment <= end < reference:
                count += 1
    return count


def payout_calendar_note(reference: date) -> str:
    deadline = next_payout_deadline(reference)
    return (
        f"Payout calendar: today is {reference.isoformat()}; the next quarterly payout "
        f"deadline is {deadline.isoformat()} (quarter end + {PAYOUT_WINDOW_DAYS} days)."
    )
