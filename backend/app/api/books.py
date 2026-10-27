"""Book routes (author-scoped by default, admin can inspect any author)."""

from __future__ import annotations

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.api.deps import CurrentUser, SessionDep
from app.errors import AppError
from app.models.book import Book
from app.models.enums import UserRole
from app.schemas.book import BookOut

router = APIRouter(prefix="/books", tags=["books"])


@router.get(
    "",
    response_model=list[BookOut],
    summary="List books visible to the caller",
    description=(
        "Authors always receive only their own catalogue. Admins may optionally filter "
        "by `author_id`, or omit it to see every book."
    ),
)
async def list_books(
    user: CurrentUser,
    session: SessionDep,
    author_id: str | None = Query(default=None, description="Admin-only filter"),
) -> list[BookOut]:
    stmt = select(Book).order_by(Book.id)
    if user.role is UserRole.ADMIN:
        if author_id:
            stmt = stmt.where(Book.author_id == author_id)
    else:
        stmt = stmt.where(Book.author_id == user.id)

    books = (await session.execute(stmt)).scalars().all()
    return [BookOut.model_validate(book) for book in books]


@router.get(
    "/{book_id}",
    response_model=BookOut,
    summary="Fetch one book",
    responses={404: {"description": "Book not found or not visible to the caller"}},
)
async def get_book(book_id: str, user: CurrentUser, session: SessionDep) -> BookOut:
    book = await session.get(Book, book_id)
    if book is None or (user.role is UserRole.AUTHOR and book.author_id != user.id):
        raise AppError("book_not_found", "Book not found.", status_code=404)
    return BookOut.model_validate(book)
