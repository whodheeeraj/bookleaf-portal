"""Ticket lifecycle, AI mock, RBAC filtering and admin analytics tests."""

from __future__ import annotations

import asyncio
import re
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from httpx import AsyncClient

from app.services.sse_manager import author_channel, broker
from app.timeutils import display_timezone


def unique_subject(prefix: str = "Test request") -> str:
    return f"{prefix} {uuid4().hex[:8]}"


async def create_ticket(
    client: AsyncClient,
    headers: dict[str, str],
    *,
    subject: str,
    description: str,
    book_id: str | None = None,
) -> dict:
    response = await client.post(
        "/api/tickets",
        json={"subject": subject, "description": description, "book_id": book_id},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_create_ticket_runs_mock_triage_and_keeps_draft_admin_only(
    client: AsyncClient,
    kavita_headers: dict[str, str],
    admin_headers: dict[str, str],
):
    subject = unique_subject("Royalty payment not received")
    created = await create_ticket(
        client,
        kavita_headers,
        subject=subject,
        description=(
            "My royalty statement shows an amount due for the last quarter but I have "
            "not received the payment. Please check the transfer."
        ),
        book_id="BK016",
    )

    assert re.fullmatch(r"TKT-\d{4,}", created["ticket_number"])
    assert created["status"] == "Open"
    assert created["category"] == "Royalty & Payments"
    assert created["priority"] == "High"
    assert created["ai_classified"] is True
    assert created["ai_model_used"] == "bookleaf-rules-v1"
    assert created["ai_confidence"] and 0 < created["ai_confidence"] <= 1
    assert created["ai_degraded"] is False
    # The draft is generated synchronously but never returned to the author.
    assert created["ai_draft_response"] is None
    assert created["ai_error"] is None

    admin_detail = await client.get(
        f"/api/tickets/{created['id']}", headers=admin_headers
    )
    assert admin_detail.status_code == 200
    admin_body = admin_detail.json()
    assert admin_body["ai_draft_response"]
    assert "Dear Kavita" in admin_body["ai_draft_response"]
    assert "1,000" in admin_body["ai_draft_response"]  # rollover threshold
    assert admin_body["classification_source"] == "rules"

    author_detail = await client.get(
        f"/api/tickets/{created['id']}", headers=kavita_headers
    )
    assert author_detail.status_code == 200
    author_body = author_detail.json()
    assert author_body["ai_draft_response"] is None
    assert author_body["ai_error"] is None


async def test_create_ticket_rejects_a_foreign_book(
    client: AsyncClient, kavita_headers: dict[str, str]
):
    response = await client.post(
        "/api/tickets",
        json={
            "subject": unique_subject("Wrong book"),
            "description": "This book belongs to another author and must not attach.",
            "book_id": "BK001",
        },
        headers=kavita_headers,
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "book_not_found"


async def test_internal_notes_and_reply_transitions(
    client: AsyncClient,
    kavita_headers: dict[str, str],
    admin_headers: dict[str, str],
):
    created = await create_ticket(
        client,
        kavita_headers,
        subject=unique_subject("General account question"),
        description="How do I update the description on my author profile?",
    )
    assert created["category"] == "General Inquiry"
    assert created["priority"] == "Low"

    internal = await client.post(
        f"/api/tickets/{created['id']}/messages",
        json={"content": "INTERNAL: verify the profile record first.", "is_internal_note": True},
        headers=admin_headers,
    )
    assert internal.status_code == 201
    assert internal.json()["is_internal_note"] is True

    admin_after_internal = await client.get(
        f"/api/tickets/{created['id']}", headers=admin_headers
    )
    admin_body = admin_after_internal.json()
    # An internal note does not change the public ticket status, but picking it
    # up does claim ownership.
    assert admin_body["status"] == "Open"
    assert admin_body["assigned_admin"]["email"] == "admin@bookleaf.com"
    assert any(message["is_internal_note"] for message in admin_body["messages"])

    public = await client.post(
        f"/api/tickets/{created['id']}/messages",
        json={"content": "Thanks for reaching out. Send the new description here."},
        headers=admin_headers,
    )
    assert public.status_code == 201

    admin_after_public = await client.get(
        f"/api/tickets/{created['id']}", headers=admin_headers
    )
    assert admin_after_public.json()["status"] == "In Progress"

    author_view = await client.get(
        f"/api/tickets/{created['id']}", headers=kavita_headers
    )
    author_body = author_view.json()
    assert [m["content"] for m in author_body["messages"]] == [
        "Thanks for reaching out. Send the new description here."
    ]
    assert all(not m["is_internal_note"] for m in author_body["messages"])

    resolved = await client.patch(
        f"/api/tickets/{created['id']}",
        json={"status": "Resolved"},
        headers=admin_headers,
    )
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "Resolved"

    reopened = await client.post(
        f"/api/tickets/{created['id']}/messages",
        json={"content": "One more question before I close this out."},
        headers=kavita_headers,
    )
    assert reopened.status_code == 201

    after_reopen = await client.get(
        f"/api/tickets/{created['id']}", headers=kavita_headers
    )
    assert after_reopen.json()["status"] == "Open"
    assert (
        after_reopen.json()["messages"][-1]["content"]
        == "One more question before I close this out."
    )


async def test_internal_note_is_not_broadcast_to_author_channel(
    client: AsyncClient,
    kavita_headers: dict[str, str],
    admin_headers: dict[str, str],
):
    created = await create_ticket(
        client,
        kavita_headers,
        subject=unique_subject("Private note stream check"),
        description="A ticket used to verify that internal notes stay off the author stream.",
    )
    kavita = (await client.get("/api/auth/me", headers=kavita_headers)).json()

    async with broker.subscribe([author_channel(kavita["id"])]) as queue:
        response = await client.post(
            f"/api/tickets/{created['id']}/messages",
            json={"content": "INTERNAL: do not leak this to the author.", "is_internal_note": True},
            headers=admin_headers,
        )
        assert response.status_code == 201
        await asyncio.sleep(0.05)
        assert queue.empty()


async def test_admin_triage_override_preserves_ai_suggestion(
    client: AsyncClient,
    kavita_headers: dict[str, str],
    admin_headers: dict[str, str],
):
    created = await create_ticket(
        client,
        kavita_headers,
        subject=unique_subject("Blurry author copies"),
        description="The author copies arrived with blurry images and misaligned pages.",
    )
    assert created["category"] == "Printing & Quality"
    original_priority = created["priority"]
    admin_id = (await client.get("/api/auth/me", headers=admin_headers)).json()["id"]

    patched = await client.patch(
        f"/api/tickets/{created['id']}",
        json={
            "category": "General Inquiry",
            "priority": "Low",
            "status": "In Progress",
            "assigned_admin_id": admin_id,
        },
        headers=admin_headers,
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["category"] == "General Inquiry"
    assert body["priority"] == "Low"
    assert body["status"] == "In Progress"
    assert body["assigned_admin"]["id"] == admin_id
    assert body["ai_suggested_category"] == "Printing & Quality"
    assert body["ai_suggested_priority"] == original_priority
    assert body["classification_source"] == "admin_override"

    unassigned = await client.patch(
        f"/api/tickets/{created['id']}",
        json={"assigned_admin_id": None},
        headers=admin_headers,
    )
    assert unassigned.status_code == 200
    assert unassigned.json()["assigned_admin"] is None

    invalid = await client.patch(
        f"/api/tickets/{created['id']}",
        json={"assigned_admin_id": "AUTH009"},
        headers=admin_headers,
    )
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "invalid_assignee"


async def test_regenerate_draft_uses_requested_category_and_stays_hidden(
    client: AsyncClient,
    kavita_headers: dict[str, str],
    admin_headers: dict[str, str],
):
    created = await create_ticket(
        client,
        kavita_headers,
        subject=unique_subject("Typesetting timeline"),
        description="Raising Roots is at typesetting. When will it move to proofreading?",
        book_id="BK015",
    )
    assert created["category"] == "Book Status & Production Updates"

    regenerated = await client.post(
        f"/api/tickets/{created['id']}/regenerate-draft",
        json={"category": "Printing & Quality", "instruction": "Mention the reprint policy."},
        headers=admin_headers,
    )
    assert regenerated.status_code == 200, regenerated.text
    draft_body = regenerated.json()
    assert draft_body["ai_draft_response"]
    assert "print" in draft_body["ai_draft_response"].lower()
    assert draft_body["ai_model_used"] == "bookleaf-rules-v1"

    admin_detail = await client.get(
        f"/api/tickets/{created['id']}", headers=admin_headers
    )
    assert admin_detail.json()["ai_draft_response"] == draft_body["ai_draft_response"]

    author_detail = await client.get(
        f"/api/tickets/{created['id']}", headers=kavita_headers
    )
    assert author_detail.json()["ai_draft_response"] is None


async def test_admin_filters_search_date_range_and_pagination(
    client: AsyncClient,
    kavita_headers: dict[str, str],
    admin_headers: dict[str, str],
):
    marker = uuid4().hex[:10]
    first = await create_ticket(
        client,
        kavita_headers,
        subject=f"Filter marker {marker} royalty",
        description="Royalty payment question for the filter test.",
        book_id="BK016",
    )
    second = await create_ticket(
        client,
        kavita_headers,
        subject=f"Filter marker {marker} profile",
        description="How do I update my author bio and profile?",
    )

    searched = await client.get(
        f"/api/tickets?q={marker}&page_size=100", headers=admin_headers
    )
    assert searched.status_code == 200
    assert {item["id"] for item in searched.json()["items"]} == {first["id"], second["id"]}

    by_status = await client.get(
        "/api/tickets?status=Open&page_size=100", headers=admin_headers
    )
    assert by_status.status_code == 200
    assert all(item["status"] == "Open" for item in by_status.json()["items"])

    by_category = await client.get(
        "/api/tickets?category=Royalty%20%26%20Payments&page_size=100",
        headers=admin_headers,
    )
    assert by_category.status_code == 200
    assert by_category.json()["items"]
    assert all(
        item["category"] == "Royalty & Payments"
        for item in by_category.json()["items"]
    )

    by_priority = await client.get(
        "/api/tickets?priority=Low&page_size=100", headers=admin_headers
    )
    assert by_priority.status_code == 200
    assert all(item["priority"] == "Low" for item in by_priority.json()["items"])

    today = datetime.now(UTC).astimezone(display_timezone()).date().isoformat()
    dated = await client.get(
        f"/api/tickets?date_from={today}&date_to={today}&page_size=100",
        headers=admin_headers,
    )
    assert dated.status_code == 200
    assert any(item["id"] == first["id"] for item in dated.json()["items"])

    invalid_range = await client.get(
        "/api/tickets?date_from=2026-10-28&date_to=2026-10-27",
        headers=admin_headers,
    )
    assert invalid_range.status_code == 422
    assert invalid_range.json()["error"]["code"] == "invalid_date_range"

    unassigned = await client.get(
        "/api/tickets?unassigned=true&page_size=100", headers=admin_headers
    )
    assert unassigned.status_code == 200
    assert all(item["assigned_admin"] is None for item in unassigned.json()["items"])

    page = await client.get(
        "/api/tickets?page=1&page_size=2", headers=admin_headers
    )
    assert page.status_code == 200
    page_body = page.json()
    assert len(page_body["items"]) == 2
    assert page_body["total"] >= 6
    assert page_body["pages"] == (page_body["total"] + 1) // 2


async def test_admin_queue_sorting_invariant(
    client: AsyncClient, admin_headers: dict[str, str]
):
    response = await client.get("/api/tickets?page_size=100", headers=admin_headers)
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) >= 4

    ranks = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    keys = [
        (
            0 if item["status"] in ("Open", "In Progress") else 1,
            ranks.get(item["priority"], 4),
            datetime.fromisoformat(item["created_at"].replace("Z", "+00:00")),
        )
        for item in items
    ]
    assert keys == sorted(keys)


async def test_admin_stats_and_author_overview(
    client: AsyncClient, admin_headers: dict[str, str]
):
    stats = await client.get("/api/admin/stats", headers=admin_headers)
    assert stats.status_code == 200
    body = stats.json()
    assert body["total"] >= 4
    assert body["ai_offline"] >= 1
    assert body["pending_royalty_total"] >= 850
    for key in ("open", "in_progress", "resolved", "closed", "critical", "unassigned"):
        assert body[key] >= 0

    authors = await client.get("/api/admin/authors", headers=admin_headers)
    assert authors.status_code == 200
    kavita = next(item for item in authors.json() if item["id"] == "AUTH009")
    assert kavita["book_count"] == 2
    assert kavita["pending_royalty"] == 850
    assert kavita["open_tickets"] >= 1

    ai_health = await client.get("/api/admin/ai/health", headers=admin_headers)
    assert ai_health.status_code == 200
    assert ai_health.json()["provider"] == "mock"
    assert "api_key" not in ai_health.text


async def test_mine_filter_returns_only_assigned_to_caller(
    client: AsyncClient,
    kavita_headers: dict[str, str],
    admin_headers: dict[str, str],
):
    admin = (await client.get("/api/auth/me", headers=admin_headers)).json()
    created = await create_ticket(
        client,
        kavita_headers,
        subject=unique_subject("Assign to me"),
        description="Please assign this request to the logged-in admin.",
    )
    patched = await client.patch(
        f"/api/tickets/{created['id']}",
        json={"assigned_admin_id": admin["id"]},
        headers=admin_headers,
    )
    assert patched.status_code == 200

    mine = await client.get("/api/tickets?mine=true&page_size=100", headers=admin_headers)
    assert mine.status_code == 200
    assert mine.json()["items"]
    assert all(
        item["assigned_admin"] and item["assigned_admin"]["id"] == admin["id"]
        for item in mine.json()["items"]
    )
    assert any(item["id"] == created["id"] for item in mine.json()["items"])


async def test_page_size_upper_bound_is_enforced(
    client: AsyncClient, admin_headers: dict[str, str]
):
    response = await client.get("/api/tickets?page_size=101", headers=admin_headers)
    assert response.status_code == 422


async def test_created_at_is_timezone_aware(
    client: AsyncClient, kavita_headers: dict[str, str]
):
    created = await create_ticket(
        client,
        kavita_headers,
        subject=unique_subject("Timezone check"),
        description="A short description to exercise UTC serialization.",
    )
    parsed = datetime.fromisoformat(created["created_at"].replace("Z", "+00:00"))
    assert parsed.tzinfo is not None
    assert abs(datetime.now(UTC) - parsed) < timedelta(minutes=5)
