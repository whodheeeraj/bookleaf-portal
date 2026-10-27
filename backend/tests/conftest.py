"""Shared pytest fixtures.

The environment is configured *before* importing the app because settings and
the async engine are created at import time. A dedicated SQLite file keeps the
suite fast and independent from any local Postgres/SQLite database.
"""

from __future__ import annotations

import io
import os
from contextlib import redirect_stdout
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
TEST_DB = BACKEND_DIR / ".pytest_bookleaf.db"

# Must be set before `app.config` is imported below.
os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./.pytest_bookleaf.db"
os.environ["AUTO_CREATE_TABLES"] = "false"
os.environ["JWT_SECRET"] = "test-secret-that-is-not-used-outside-pytest"
os.environ["AI_PROVIDER"] = "mock"
os.environ["SEED_DEFAULT_PASSWORD"] = "password123"

from app import seed  # noqa: E402
from app.database import AsyncSessionLocal, dispose_engine, init_db  # noqa: E402
from app.main import app  # noqa: E402

ADMIN_EMAIL = "admin@bookleaf.com"
KAVITA_EMAIL = "kavita.deshmukh@email.com"
ROHIT_EMAIL = "rohit.kapoor@email.com"
PASSWORD = "password123"


@pytest.fixture(scope="session", autouse=True)
async def prepared_database():
    if TEST_DB.exists():
        TEST_DB.unlink()
    await init_db()
    # Seed once. Individual tests create their own tickets and never assume an
    # exact global count, so ordering/parallelism inside this file is safe.
    with redirect_stdout(io.StringIO()):
        await seed.run(reset=True)
    yield
    await dispose_engine()
    if TEST_DB.exists():
        try:
            TEST_DB.unlink()
        except OSError:  # pragma: no cover - Windows file handle lag
            pass


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as http:
        yield http


async def _login(client: AsyncClient, email: str, password: str = PASSWORD) -> str:
    response = await client.post(
        "/api/auth/login", json={"email": email, "password": password}
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def admin_token(client: AsyncClient) -> str:
    return await _login(client, ADMIN_EMAIL)


@pytest.fixture
async def kavita_token(client: AsyncClient) -> str:
    return await _login(client, KAVITA_EMAIL)


@pytest.fixture
async def rohit_token(client: AsyncClient) -> str:
    return await _login(client, ROHIT_EMAIL)


@pytest.fixture
async def admin_headers(admin_token: str) -> dict[str, str]:
    return auth(admin_token)


@pytest.fixture
async def kavita_headers(kavita_token: str) -> dict[str, str]:
    return auth(kavita_token)


@pytest.fixture
async def rohit_headers(rohit_token: str) -> dict[str, str]:
    return auth(rohit_token)


@pytest.fixture
async def db_session():
    async with AsyncSessionLocal() as session:
        yield session
