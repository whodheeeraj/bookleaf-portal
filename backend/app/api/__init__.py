"""API router exports."""

from app.api import admin, auth, books, health, stream, tickets

__all__ = ["admin", "auth", "books", "health", "stream", "tickets"]
