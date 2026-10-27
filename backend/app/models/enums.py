"""Domain enums shared by ORM models, Pydantic schemas and the AI layer."""

from __future__ import annotations

from enum import Enum


class UserRole(str, Enum):
    AUTHOR = "AUTHOR"
    ADMIN = "ADMIN"


class TicketStatus(str, Enum):
    OPEN = "Open"
    IN_PROGRESS = "In Progress"
    RESOLVED = "Resolved"
    CLOSED = "Closed"


class TicketCategory(str, Enum):
    ROYALTY = "Royalty & Payments"
    ISBN = "ISBN & Metadata Issues"
    PRINTING = "Printing & Quality"
    DISTRIBUTION = "Distribution & Availability"
    PRODUCTION = "Book Status & Production Updates"
    GENERAL = "General Inquiry"


class TicketPriority(str, Enum):
    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"


#: Ordered worst-first; used for queue sorting and UI legends.
PRIORITY_ORDER: tuple[TicketPriority, ...] = (
    TicketPriority.CRITICAL,
    TicketPriority.HIGH,
    TicketPriority.MEDIUM,
    TicketPriority.LOW,
)

CATEGORY_VALUES: tuple[str, ...] = tuple(category.value for category in TicketCategory)
STATUS_VALUES: tuple[str, ...] = tuple(status.value for status in TicketStatus)
PRIORITY_VALUES: tuple[str, ...] = tuple(priority.value for priority in TicketPriority)
