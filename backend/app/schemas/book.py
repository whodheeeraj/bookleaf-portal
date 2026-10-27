"""Book response schemas.

Every commercial field is optional because in-production titles (BK013,
BK015) genuinely have no MRP / royalty / publication date yet. The API
returns `null` and lets the client render an honest "In Production" state
instead of a misleading zero.
"""

from __future__ import annotations

from datetime import date

from pydantic import computed_field

from app.models.book import PRODUCTION_STAGES
from app.schemas.base import ORMModel

ROLLOVER_THRESHOLD_INR = 1000.0


class BookOut(ORMModel):
    id: str
    author_id: str
    title: str
    isbn: str
    genre: str | None = None
    publication_date: date | None = None
    status: str
    mrp: float | None = None
    author_royalty_per_copy: float | None = None
    total_copies_sold: int = 0
    total_royalty_earned: float = 0.0
    royalty_paid: float = 0.0
    royalty_pending: float = 0.0
    last_royalty_payout_date: date | None = None
    print_partner: str | None = None
    available_on: list[str] = []

    @computed_field
    @property
    def is_in_production(self) -> bool:
        return self.status.startswith("In Production")

    @computed_field
    @property
    def production_stage(self) -> str | None:
        if not self.is_in_production:
            return None
        _, _, stage = self.status.partition(" - ")
        return stage.strip() or None

    @computed_field
    @property
    def production_stage_number(self) -> int | None:
        stage = self.production_stage
        if not stage or stage not in PRODUCTION_STAGES:
            return None
        return PRODUCTION_STAGES.index(stage) + 1

    @computed_field
    @property
    def production_stage_count(self) -> int:
        return len(PRODUCTION_STAGES)

    @computed_field
    @property
    def next_production_stage(self) -> str | None:
        number = self.production_stage_number
        if number is None or number >= len(PRODUCTION_STAGES):
            return None
        return PRODUCTION_STAGES[number]

    @computed_field
    @property
    def has_published(self) -> bool:
        return self.publication_date is not None

    @computed_field
    @property
    def is_royalty_rollover(self) -> bool:
        """Pending but below the ₹1,000 payout floor."""
        return 0 < (self.royalty_pending or 0) < ROLLOVER_THRESHOLD_INR


class BookBriefOut(ORMModel):
    id: str
    title: str
    isbn: str
    status: str
    publication_date: date | None = None

    @computed_field
    @property
    def is_in_production(self) -> bool:
        return self.status.startswith("In Production")
