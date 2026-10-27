"""ORM model exports - importing this package registers every table."""

from app.models.book import PRODUCTION_STAGES, Book
from app.models.enums import (
    CATEGORY_VALUES,
    PRIORITY_ORDER,
    PRIORITY_VALUES,
    STATUS_VALUES,
    TicketCategory,
    TicketPriority,
    TicketStatus,
    UserRole,
)
from app.models.ticket import Ticket, TicketMessage
from app.models.user import User

__all__ = [
    "Book",
    "PRODUCTION_STAGES",
    "CATEGORY_VALUES",
    "PRIORITY_ORDER",
    "PRIORITY_VALUES",
    "STATUS_VALUES",
    "Ticket",
    "TicketCategory",
    "TicketMessage",
    "TicketPriority",
    "TicketStatus",
    "User",
    "UserRole",
]
