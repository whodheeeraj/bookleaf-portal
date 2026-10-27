"""In-process pub/sub broker for Server-Sent Events.

Channels
--------
* ``admin``           - every admin session
* ``author:<id>``     - a single author's sessions

A browser tab subscribes to exactly the channels it is allowed to see, and
events carry metadata only (never message bodies), so an author can never
observe another author's activity even if they inspect the SSE stream.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator, Iterable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.models.ticket import Ticket

ADMIN_CHANNEL = "admin"


def author_channel(author_id: str) -> str:
    return f"author:{author_id}"


@dataclass(slots=True)
class Event:
    event: str
    data: dict[str, Any]
    id: str = field(default_factory=lambda: uuid4().hex)


class EventBroker:
    def __init__(self, queue_size: int = 100) -> None:
        self._subscribers: dict[str, set[asyncio.Queue[Event]]] = {}
        self._queue_size = queue_size

    @asynccontextmanager
    async def subscribe(self, channels: Iterable[str]) -> AsyncIterator[asyncio.Queue[Event]]:
        queue: asyncio.Queue[Event] = asyncio.Queue(maxsize=self._queue_size)
        registered: list[str] = []
        for channel in set(channels):
            self._subscribers.setdefault(channel, set()).add(queue)
            registered.append(channel)
        try:
            yield queue
        finally:
            for channel in registered:
                subscribers = self._subscribers.get(channel)
                if subscribers is None:
                    continue
                subscribers.discard(queue)
                if not subscribers:
                    self._subscribers.pop(channel, None)

    def subscriber_count(self, channel: str | None = None) -> int:
        if channel is not None:
            return len(self._subscribers.get(channel, ()))
        return len({id(queue) for queues in self._subscribers.values() for queue in queues})

    async def publish(self, channels: Iterable[str], event: str, data: dict[str, Any]) -> None:
        payload = Event(event=event, data={"sent_at": datetime.now(UTC).isoformat(), **data})
        for channel in set(channels):
            for queue in tuple(self._subscribers.get(channel, ())):
                try:
                    queue.put_nowait(payload)
                except asyncio.QueueFull:
                    # Slow consumer: drop the oldest event rather than blocking
                    # the request that is publishing.
                    try:
                        queue.get_nowait()
                    except asyncio.QueueEmpty:  # pragma: no cover
                        pass
                    try:
                        queue.put_nowait(payload)
                    except asyncio.QueueFull:  # pragma: no cover
                        pass


broker = EventBroker()


def ticket_event_payload(
    ticket: Ticket,
    *,
    actor_role: str | None = None,
    message_id: str | None = None,
    is_internal_note: bool | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "ticket_id": str(ticket.id),
        "ticket_number": ticket.ticket_number,
        "author_id": ticket.author_id,
        "book_id": ticket.book_id,
        "status": ticket.status.value if ticket.status else None,
        "category": ticket.category.value if ticket.category else None,
        "priority": ticket.priority.value if ticket.priority else None,
        "assigned_admin_id": ticket.assigned_admin_id,
        "updated_at": ticket.updated_at.isoformat() if ticket.updated_at else None,
    }
    if actor_role:
        payload["actor_role"] = actor_role
    if message_id:
        payload["message_id"] = message_id
    if is_internal_note is not None:
        payload["is_internal_note"] = is_internal_note
    if extra:
        payload.update(extra)
    return payload


def sse_encode(event: Event) -> dict[str, str]:
    """Shape consumed by sse-starlette's ServerSentEvent."""
    return {
        "event": event.event,
        "data": json.dumps(event.data, separators=(",", ":")),
        "id": event.id,
    }
