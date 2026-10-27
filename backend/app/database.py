"""Async SQLAlchemy engine, session factory and declarative base."""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import StaticPool

from app.config import settings


class Base(DeclarativeBase):
    """Declarative base shared by every ORM model."""


def _engine_kwargs() -> dict:
    kwargs: dict = {
        "echo": settings.database_echo,
        "pool_pre_ping": True,
    }
    if settings.is_sqlite:
        # SQLite + asyncpg-style pooling is not useful; StaticPool keeps a
        # single connection so `:memory:` databases stay alive across sessions.
        kwargs["connect_args"] = {"check_same_thread": False}
        if ":memory:" in settings.database_url:
            kwargs["poolclass"] = StaticPool
    else:
        kwargs["pool_size"] = 10
        kwargs["max_overflow"] = 20
        kwargs["pool_recycle"] = 1800
    return kwargs


engine = create_async_engine(settings.database_url, **_engine_kwargs())

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


if settings.is_sqlite:

    @event.listens_for(engine.sync_engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, _record) -> None:  # pragma: no cover
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency yielding a scoped async session.

    Routes commit explicitly; the context manager rolls back anything left
    uncommitted when an exception escapes.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Create tables from metadata (dev convenience / test bootstrap)."""
    # Importing models registers them on Base.metadata.
    from app import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def dispose_engine() -> None:
    await engine.dispose()
