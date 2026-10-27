"""Schemas for the structured AI/SLM output contract."""

from __future__ import annotations

import re
import unicodedata

from pydantic import BaseModel, Field, field_validator

from app.models.enums import TicketCategory, TicketPriority


def _slug(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


_CATEGORY_ALIASES: dict[str, TicketCategory] = {}
for _category in TicketCategory:
    _CATEGORY_ALIASES[_slug(_category.value)] = _category

_CATEGORY_ALIASES.update(
    {
        "royalty": TicketCategory.ROYALTY,
        "royalties": TicketCategory.ROYALTY,
        "royalty payments": TicketCategory.ROYALTY,
        "payments": TicketCategory.ROYALTY,
        "payout": TicketCategory.ROYALTY,
        "isbn": TicketCategory.ISBN,
        "metadata": TicketCategory.ISBN,
        "isbn metadata": TicketCategory.ISBN,
        "printing": TicketCategory.PRINTING,
        "quality": TicketCategory.PRINTING,
        "print quality": TicketCategory.PRINTING,
        "distribution": TicketCategory.DISTRIBUTION,
        "availability": TicketCategory.DISTRIBUTION,
        "production": TicketCategory.PRODUCTION,
        "production updates": TicketCategory.PRODUCTION,
        "book status": TicketCategory.PRODUCTION,
        "general": TicketCategory.GENERAL,
        "other": TicketCategory.GENERAL,
    }
)

_PRIORITY_ALIASES: dict[str, TicketPriority] = {
    "critical": TicketPriority.CRITICAL,
    "urgent": TicketPriority.CRITICAL,
    "p0": TicketPriority.CRITICAL,
    "p1": TicketPriority.HIGH,
    "high": TicketPriority.HIGH,
    "medium": TicketPriority.MEDIUM,
    "normal": TicketPriority.MEDIUM,
    "p2": TicketPriority.MEDIUM,
    "low": TicketPriority.LOW,
    "p3": TicketPriority.LOW,
    "minor": TicketPriority.LOW,
}

VALID_CATEGORIES = ", ".join(category.value for category in TicketCategory)
VALID_PRIORITIES = ", ".join(priority.value for priority in TicketPriority)


def normalize_category(value: str) -> TicketCategory:
    key = _slug(str(value))
    if key in _CATEGORY_ALIASES:
        return _CATEGORY_ALIASES[key]
    # Fuzzy containment: "royalty and payments" -> "royalty payments".
    for alias, category in _CATEGORY_ALIASES.items():
        if alias and (alias in key or key in alias):
            return category
    raise ValueError(f"Unknown category {value!r}; expected one of: {VALID_CATEGORIES}")


def normalize_priority(value: str) -> TicketPriority:
    key = _slug(str(value))
    if key in _PRIORITY_ALIASES:
        return _PRIORITY_ALIASES[key]
    for alias, priority in _PRIORITY_ALIASES.items():
        if alias in key:
            return priority
    raise ValueError(f"Unknown priority {value!r}; expected one of: {VALID_PRIORITIES}")


def clean_draft(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("draft_response must be a string")
    cleaned = value.strip()
    cleaned = re.sub(r"^```[a-zA-Z]*\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()
    if len(cleaned) < 20:
        raise ValueError("draft_response is too short")
    return cleaned


class AITriageResult(BaseModel):
    """The single contract every provider must satisfy.

    Deliberately small - three required fields, no nested objects - so 3B-8B
    SLMs have the best chance of emitting valid JSON on the first try.
    """

    category: TicketCategory
    priority: TicketPriority
    draft_response: str = Field(min_length=20)
    confidence: float = Field(default=0.6, ge=0.0, le=1.0)
    rationale: str | None = Field(default=None, max_length=500)

    @field_validator("category", mode="before")
    @classmethod
    def _category(cls, value):
        if isinstance(value, TicketCategory):
            return value
        return normalize_category(str(value))

    @field_validator("priority", mode="before")
    @classmethod
    def _priority(cls, value):
        if isinstance(value, TicketPriority):
            return value
        return normalize_priority(str(value))

    @field_validator("draft_response", mode="before")
    @classmethod
    def _draft(cls, value):
        return clean_draft(value)


class AITriageOnly(BaseModel):
    category: TicketCategory
    priority: TicketPriority
    confidence: float = Field(default=0.6, ge=0.0, le=1.0)
    rationale: str | None = Field(default=None, max_length=500)

    @field_validator("category", mode="before")
    @classmethod
    def _category(cls, value):
        if isinstance(value, TicketCategory):
            return value
        return normalize_category(str(value))

    @field_validator("priority", mode="before")
    @classmethod
    def _priority(cls, value):
        if isinstance(value, TicketPriority):
            return value
        return normalize_priority(str(value))


class AIDraftOnly(BaseModel):
    draft_response: str = Field(min_length=20)

    @field_validator("draft_response", mode="before")
    @classmethod
    def _draft(cls, value):
        return clean_draft(value)
