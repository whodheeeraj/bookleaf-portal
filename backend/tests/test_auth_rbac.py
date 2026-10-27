"""Authentication, RBAC and author data-scoping tests."""

from __future__ import annotations

from httpx import AsyncClient

from tests.conftest import ADMIN_EMAIL, auth


async def test_health_is_public(client: AsyncClient):
    response = await client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["ai"]["provider"] == "mock"
    assert body["ai"]["mode"] == "rule_engine"
    assert "api_key" not in body["ai"]


async def test_readiness_checks_database(client: AsyncClient):
    response = await client.get("/api/health/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready", "database": "ok"}


async def test_login_returns_user_and_working_token(
    client: AsyncClient, admin_headers: dict[str, str]
):
    me = await client.get("/api/auth/me", headers=admin_headers)
    assert me.status_code == 200
    body = me.json()
    assert body["email"] == ADMIN_EMAIL
    assert body["role"] == "ADMIN"
    assert "password_hash" not in body


async def test_bad_credentials_are_rejected(client: AsyncClient):
    response = await client.post(
        "/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": "definitely-wrong"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_credentials"


async def test_missing_and_invalid_tokens_are_rejected(client: AsyncClient):
    missing = await client.get("/api/tickets")
    assert missing.status_code == 401

    invalid = await client.get("/api/tickets", headers=auth("not-a-jwt"))
    assert invalid.status_code == 401


async def test_author_cannot_access_admin_routes(
    client: AsyncClient, kavita_headers: dict[str, str]
):
    for path in ("/api/admin/stats", "/api/admin/authors", "/api/admin/ai/health"):
        response = await client.get(path, headers=kavita_headers)
        assert response.status_code == 403, path
        assert response.json()["error"]["code"] == "forbidden"


async def test_author_ticket_list_is_author_scoped(
    client: AsyncClient, kavita_headers: dict[str, str]
):
    response = await client.get("/api/tickets?page_size=100", headers=kavita_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["items"]
    assert all(item["author_id"] == "AUTH009" for item in body["items"])
    assert all("ai_draft_response" not in item for item in body["items"])


async def test_author_cannot_read_another_authors_ticket(
    client: AsyncClient,
    kavita_headers: dict[str, str],
    admin_headers: dict[str, str],
):
    listing = await client.get("/api/tickets?page_size=100", headers=admin_headers)
    foreign = next(
        item for item in listing.json()["items"] if item["author_id"] != "AUTH009"
    )

    response = await client.get(f"/api/tickets/{foreign['id']}", headers=kavita_headers)
    # 404 avoids confirming that the other author's ticket exists.
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "ticket_not_found"


async def test_author_cannot_patch_a_ticket(
    client: AsyncClient, kavita_headers: dict[str, str]
):
    listing = await client.get("/api/tickets", headers=kavita_headers)
    ticket_id = listing.json()["items"][0]["id"]
    response = await client.patch(
        f"/api/tickets/{ticket_id}", json={"status": "Resolved"}, headers=kavita_headers
    )
    assert response.status_code == 403


async def test_author_cannot_create_an_internal_note(
    client: AsyncClient, kavita_headers: dict[str, str]
):
    listing = await client.get("/api/tickets", headers=kavita_headers)
    ticket_id = listing.json()["items"][0]["id"]
    response = await client.post(
        f"/api/tickets/{ticket_id}/messages",
        json={"content": "secret", "is_internal_note": True},
        headers=kavita_headers,
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "internal_note_forbidden"


async def test_books_are_author_scoped_and_null_safe(
    client: AsyncClient,
    kavita_headers: dict[str, str],
    rohit_headers: dict[str, str],
):
    books = await client.get("/api/books", headers=kavita_headers)
    assert books.status_code == 200
    catalogue = books.json()
    assert catalogue
    assert all(book["author_id"] == "AUTH009" for book in catalogue)

    in_production = next(book for book in catalogue if book["id"] == "BK015")
    assert in_production["is_in_production"] is True
    assert in_production["production_stage"] == "Typesetting"
    assert in_production["production_stage_number"] == 4
    assert in_production["next_production_stage"] == "Proofreading"
    # Commercial fields are intentionally nullable for in-production books.
    assert in_production["mrp"] is None
    assert in_production["royalty_pending"] == 0
    assert in_production["is_royalty_rollover"] is False

    rollover = next(book for book in catalogue if book["id"] == "BK016")
    assert rollover["is_royalty_rollover"] is True
    assert rollover["royalty_pending"] < 1000

    foreign = await client.get("/api/books/BK015", headers=rohit_headers)
    assert foreign.status_code == 404

    as_admin = await client.get(
        "/api/books?author_id=AUTH009", headers=auth((await _admin_token(client)))
    )
    assert as_admin.status_code == 200
    assert {book["id"] for book in as_admin.json()} == {book["id"] for book in catalogue}


async def _admin_token(client: AsyncClient) -> str:
    response = await client.post(
        "/api/auth/login", json={"email": ADMIN_EMAIL, "password": "password123"}
    )
    return response.json()["access_token"]
