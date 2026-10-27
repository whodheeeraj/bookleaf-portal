"""User (author + admin) ORM model."""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, Enum as SAEnum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import UserRole

if TYPE_CHECKING:  # pragma: no cover
    from app.models.book import Book
    from app.models.ticket import Ticket


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32))
    city: Mapped[str | None] = mapped_column(String(80))
    joined_date: Mapped[date | None] = mapped_column(Date)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(
            UserRole,
            name="user_role",
            native_enum=False,
            length=20,
            values_callable=lambda enum: [member.value for member in enum],
            validate_strings=True,
        ),
        nullable=False,
        default=UserRole.AUTHOR,
        index=True,
    )

    books: Mapped[list["Book"]] = relationship(
        back_populates="author",
        cascade="all, delete-orphan",
        order_by="Book.id",
        lazy="select",
    )
    tickets: Mapped[list["Ticket"]] = relationship(
        back_populates="author",
        foreign_keys="Ticket.author_id",
        cascade="all, delete-orphan",
        lazy="raise",
    )

    @property
    def is_admin(self) -> bool:
        return self.role is UserRole.ADMIN

    @property
    def first_name(self) -> str:
        return self.name.split(" ", 1)[0]

    def __repr__(self) -> str:  # pragma: no cover
        return f"<User {self.id} {self.email} {self.role.value}>"
