"""Server-Sent Events endpoint."""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, Depends
from sse_starlette.sse import EventSourceResponse, ServerSentEvent

from app.api.deps import get_stream_user
from app.config import settings
from app.models.enums import UserRole
from app.models.user import User
from app.services.sse_manager import ADMIN_CHANNEL, author_channel, broker, sse_encode

logger = logging.getLogger(__name__)
router = APIRouter(tags=["realtime"])


@router.get(
    "/stream",
    summary="Realtime ticket event stream (SSE)",
    description=(
        "EventSource clients pass the JWT as `?token=` because the browser API cannot set "
        "an Authorization header. Events: `connected`, `ticket.created`, `ticket.updated`, "
        "`message.created`, `ping`. Payloads carry ticket metadata only - never message "
        "bodies - and authors are isolated to their own channel."
    ),
    response_class=EventSourceResponse,
)
async def stream(user: User = Depends(get_stream_user)) -> EventSourceResponse:
    channels = [ADMIN_CHANNEL] if user.role is UserRole.ADMIN else [author_channel(user.id)]

    async def event_generator():
        async with broker.subscribe(channels) as queue:
            yield ServerSentEvent(
                event="connected",
                data=json.dumps(
                    {
                        "user_id": user.id,
                        "role": user.role.value,
                        "channels": channels,
                    }
                ),
            )
            try:
                while True:
                    try:
                        event = await asyncio.wait_for(
                            queue.get(), timeout=settings.sse_heartbeat_seconds
                        )
                    except TimeoutError:
                        yield ServerSentEvent(event="ping", data="{}")
                        continue
                    yield ServerSentEvent(**sse_encode(event))
            except asyncio.CancelledError:  # pragma: no cover - client disconnect
                logger.debug("sse_client_disconnected user=%s", user.id)
                raise

    return EventSourceResponse(
        event_generator(),
        ping=settings.sse_heartbeat_seconds,
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
