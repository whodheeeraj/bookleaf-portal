"""Book ORM model.

Only `title`, `isbn` and `status` are mandatory. Everything commercial is
nullable because books in production (BK013, BK015) have no price, no
royalty figures, no print partner and no publication date yet.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Date,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:  # pragma: no cover
    from app.models.ticket import Ticket
    from app.models.user import User

PRODUCTION_STAGES: tuple[str, ...] = (
    "Manuscript Received",
    "Editing",
    "Cover Design",
    "Typesetting",
    "Proofreading",
    "ISBN Assignment",
    "Printing",
    "Distribution Setup",
    "Published & Live",
)

IN_PRODUCTION_PREFIX = "In Production"


class Book(Base):
    __tablename__ = "books"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    author_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    isbn: Mapped[str] = mapped_column(String(64), nullable=False)
    genre: Mapped[str | None] = mapped_column(String(120))
    publication_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    mrp: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    author_royalty_per_copy: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    total_copies_sold: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_royalty_earned: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0")
    )
    royalty_paid: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0")
    )
    royalty_pending: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0")
    )
    last_royalty_payout_date: Mapped[date | None] = mapped_column(Date)
    print_partner: Mapped[str | None] = mapped_column(String(80))
    available_on: Mapped[list[str]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=list,
    )

    author: Mapped["User"] = relationship(back_populates="books", lazy="raise")
    tickets: Mapped[list["Ticket"]] = relationship(back_populates="book", lazy="raise")

    # --- derived helpers (safe once `available_on` etc. are loaded) --------
    @property
    def is_in_production(self) -> bool:
        return self.status.startswith(IN_PRODUCTION_PREFIX)

    @property
    def production_stage(self) -> str | None:
        if not self.is_in_production:
            return None
        _, _, stage = self.status.partition(" - ")
        return stage.strip() or None

    @property
    def production_stage_index(self) -> int | None:
        stage = self.production_stage
        if not stage:
            return None
        try:
            return PRODUCTION_STAGES.index(stage) + 1
        except ValueError:
            return None

    @property
    def next_production_stage(self) -> str | None:
        index = self.production_stage_index
        if index is None or index >= len(PRODUCTION_STAGES):
            return None
        return PRODUCTION_STAGES[index]

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Book {self.id} {self.title!r}>"
