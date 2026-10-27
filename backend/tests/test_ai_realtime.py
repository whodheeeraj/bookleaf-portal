"""Deterministic AI rule engine, provider factory, degradation and SSE broker."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from datetime import date

import pytest

from app.config import Settings
from app.models.enums import TicketCategory, TicketPriority
from app.services.ai_context import AuthorSnapshot, BookSnapshot, TicketSnapshot
from app.services.ai_service import (
    AIProviderError,
    AIService,
    _extract_json,
)
from app.services.rule_engine import RuleEngine
from app.services.sse_manager import EventBroker, author_channel, sse_encode

TODAY = date(2026, 10, 26)

AUTHOR = AuthorSnapshot(
    id="AUTH009",
    name="Kavita Deshmukh",
    city="Nagpur",
    joined_date=date(2024, 4, 10),
)

PUBLISHED_BOOK = BookSnapshot(
    id="BK016",
    title="The Nagpur Notebooks",
    isbn="978-93-5XXXX-16-5",
    genre="Essays / Memoir",
    publication_date=date(2024, 11, 5),
    status="Published & Live",
    mrp=299.0,
    royalty_per_copy=25.0,
    copies_sold=34,
    royalty_earned=850.0,
    royalty_paid=0.0,
    royalty_pending=850.0,
    last_payout=None,
    print_partner="In-House",
    available_on=("Amazon India", "BookLeaf Store"),
)

PRODUCTION_BOOK = BookSnapshot(
    id="BK015",
    title="Raising Roots",
    isbn="978-93-5XXXX-15-8",
    genre="Parenting / Non-Fiction",
    publication_date=None,
    status="In Production - Typesetting",
    mrp=None,
    royalty_per_copy=None,
    copies_sold=0,
    royalty_earned=0.0,
    royalty_paid=0.0,
    royalty_pending=0.0,
    last_payout=None,
    print_partner=None,
    available_on=(),
)


@pytest.mark.parametrize(
    ("subject", "description", "category", "priority"),
    [
        (
            "Royalty payment not received",
            "The last quarter transfer is still unpaid. Please check.",
            TicketCategory.ROYALTY,
            TicketPriority.HIGH,
        ),
        (
            "Wrong ISBN on my Amazon listing",
            "The printed copy and the listing show a different ISBN.",
            TicketCategory.ISBN,
            TicketPriority.CRITICAL,
        ),
        (
            "Blurry pages in author copies",
            "The author copies arrived with blurry images and misaligned pages.",
            TicketCategory.PRINTING,
            TicketPriority.HIGH,
        ),
        (
            "Book shows Currently Unavailable on Amazon",
            "The buy button disappears and the title looks out of stock.",
            TicketCategory.DISTRIBUTION,
            TicketPriority.HIGH,
        ),
        (
            "Stuck in typesetting for three weeks",
            "The production stage has not moved at all.",
            TicketCategory.PRODUCTION,
            TicketPriority.HIGH,
        ),
        (
            "How do I update my author bio?",
            "Just wanted to ask about the profile page.",
            TicketCategory.GENERAL,
            TicketPriority.LOW,
        ),
        (
            "A small question",
            "No rush at all, just checking in.",
            TicketCategory.GENERAL,
            TicketPriority.MEDIUM,
        ),
    ],
)
def test_rule_engine_classifies_and_sets_priority(
    subject: str, description: str, category: TicketCategory, priority: TicketPriority
):
    engine = RuleEngine()
    ticket = TicketSnapshot(subject=subject, description=description)
    result = engine.triage_and_draft(
        AUTHOR,
        PUBLISHED_BOOK if category is TicketCategory.ROYALTY else None,
        [PUBLISHED_BOOK],
        ticket,
        TODAY,
    )
    assert result.category is category
    assert result.priority is priority
    assert 0 < result.confidence <= 1
    assert result.model == "bookleaf-rules-v1"
    assert result.draft_response.startswith("Dear Kavita,")
    assert "AI" not in result.draft_response


def test_rule_engine_is_deterministic():
    ticket = TicketSnapshot(
        subject="Royalty payment not received",
        description="The last quarter transfer is still unpaid.",
    )
    engine = RuleEngine()
    first = engine.triage_and_draft(AUTHOR, PUBLISHED_BOOK, [PUBLISHED_BOOK], ticket, TODAY)
    second = engine.triage_and_draft(AUTHOR, PUBLISHED_BOOK, [PUBLISHED_BOOK], ticket, TODAY)
    assert first == second


def test_royalty_draft_explains_rollover_threshold():
    ticket = TicketSnapshot(
        subject="When will the ₹850 be paid?",
        description="My balance is below the payout threshold.",
    )
    result = RuleEngine().triage_and_draft(
        AUTHOR, PUBLISHED_BOOK, [PUBLISHED_BOOK], ticket, TODAY
    )
    draft = result.draft_response
    assert "₹850" in draft
    assert "1,000" in draft
    assert "roll over" in draft.lower() or "rolls over" in draft.lower()
    assert "BookLeaf Author Support" in draft


def test_production_draft_uses_stage_context():
    ticket = TicketSnapshot(
        subject="Raising Roots stuck in typesetting",
        description="When will it move to proofreading?",
    )
    result = RuleEngine().triage_and_draft(
        AUTHOR, PRODUCTION_BOOK, [PRODUCTION_BOOK], ticket, TODAY
    )
    assert result.category is TicketCategory.PRODUCTION
    draft = result.draft_response
    assert "Raising Roots" in draft
    assert "Typesetting" in draft
    assert "stage 4" in draft
    assert "Proofreading" in draft


def test_mock_ai_service_uses_rule_engine_end_to_end():
    service = AIService(Settings(ai_provider="mock"))
    ticket = TicketSnapshot(
        subject="Blurry pages in author copies",
        description="The author copies arrived with blurry images.",
    )
    outcome = asyncio.run(
        service.triage_and_draft(
            author=AUTHOR,
            book=PUBLISHED_BOOK,
            books=[PUBLISHED_BOOK],
            ticket=ticket,
            today=TODAY,
        )
    )
    assert outcome.ai_classified is True
    assert outcome.model_used == "bookleaf-rules-v1"
    assert outcome.category is TicketCategory.PRINTING
    assert outcome.error is None
    assert service.health()["mode"] == "rule_engine"


def test_provider_factory_resolves_openai_anthropic_and_local():
    openai_service = AIService(
        Settings(ai_provider="openai", ai_api_key="sk-test", ai_model="gpt-4o-mini")
    )
    assert openai_service.primary is not None
    assert openai_service.primary.kind == "openai"

    anthropic_service = AIService(
        Settings(ai_provider="anthropic", ai_api_key="sk-ant", ai_model="claude-test")
    )
    assert anthropic_service.primary is not None
    assert anthropic_service.primary.kind == "anthropic"

    local_service = AIService(
        Settings(ai_provider="slm_local", ai_model="llama3.2:3b", ai_base_url="http://localhost:11434/v1")
    )
    assert local_service.primary is not None
    assert local_service.primary.kind == "openai"
    assert local_service.primary.base_url == "http://localhost:11434/v1"

    # A cloud provider without a key degrades to the rule engine rather than
    # attempting an unauthenticated request.
    keyless = AIService(Settings(ai_provider="openai", ai_api_key=None))
    assert keyless.primary is None
    assert keyless.health()["mode"] == "rule_engine"


def test_provider_failure_degrades_to_manual_triage(monkeypatch: pytest.MonkeyPatch):
    service = AIService(
        Settings(ai_provider="openai", ai_api_key="sk-test", ai_model="gpt-test")
    )

    async def boom(_user_content: str):
        raise AIProviderError("connection reset by peer")

    monkeypatch.setattr(service, "_single_pass", boom)
    ticket = TicketSnapshot(
        subject="Royalty payment not received",
        description="The last quarter transfer is still unpaid.",
    )
    outcome = asyncio.run(
        service.triage_and_draft(
            author=AUTHOR,
            book=PUBLISHED_BOOK,
            books=[PUBLISHED_BOOK],
            ticket=ticket,
            today=TODAY,
        )
    )
    assert outcome.ai_classified is False
    assert outcome.category is TicketCategory.GENERAL
    assert outcome.priority is TicketPriority.MEDIUM
    assert outcome.draft_response is None
    assert "connection reset" in (outcome.error or "")
    assert outcome.degraded is True


def test_regenerate_uses_only_the_requested_category_slice():
    service = AIService(Settings(ai_provider="mock"))
    ticket = TicketSnapshot(
        subject="Raising Roots timeline",
        description="When will it be published?",
    )
    outcome = asyncio.run(
        service.regenerate_draft(
            author=AUTHOR,
            book=PRODUCTION_BOOK,
            books=[PRODUCTION_BOOK],
            ticket=ticket,
            category=TicketCategory.PRINTING,
            today=TODAY,
        )
    )
    assert outcome.ai_classified is True
    assert outcome.draft_response is not None
    assert "print" in outcome.draft_response.lower()


def test_json_extraction_tolerates_fences_prose_and_trailing_commas():
    raw = """Here is the result:
```json
{"category": "Royalty & Payments", "priority": "High", "draft_response": "hello",}
```
"""
    parsed = _extract_json(raw)
    assert parsed["category"] == "Royalty & Payments"
    assert parsed["draft_response"] == "hello"


async def test_sse_broker_isolates_author_channels():
    broker = EventBroker()
    async with broker.subscribe([author_channel("AUTH009")]) as kavita_queue:
        async with broker.subscribe([author_channel("AUTH001")]) as rohit_queue:
            assert broker.subscriber_count(author_channel("AUTH009")) == 1
            await broker.publish(
                [author_channel("AUTH009")],
                "ticket.updated",
                {"ticket_id": "t1", "author_id": "AUTH009", "status": "In Progress"},
            )
            event = await asyncio.wait_for(kavita_queue.get(), timeout=1)
            assert event.event == "ticket.updated"
            assert event.data["ticket_id"] == "t1"
            assert "content" not in event.data
            assert rohit_queue.empty()

    assert broker.subscriber_count(author_channel("AUTH009")) == 0
    assert broker.subscriber_count(author_channel("AUTH001")) == 0


async def test_sse_encoding_is_json_and_metadata_only():
    broker = EventBroker()
    async with broker.subscribe(["admin"]) as queue:
        await broker.publish(["admin"], "message.created", {"ticket_id": "t1", "is_internal_note": True})
        event = await asyncio.wait_for(queue.get(), timeout=1)

    encoded = sse_encode(event)
    payload = json.loads(encoded["data"])
    assert encoded["event"] == "message.created"
    assert encoded["id"] == event.id
    assert payload["ticket_id"] == "t1"
    assert payload["is_internal_note"] is True
    assert "content" not in payload
