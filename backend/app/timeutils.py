"""Business-timezone helpers.

Admin date filters arrive as calendar dates with no time component. They are
interpreted in the configured business timezone (IST by default) and converted
to UTC boundaries, because ticket timestamps are stored in UTC.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta, timezone, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.config import settings

# `zoneinfo` needs the IANA database. On minimal Windows images the `tzdata`
# package can be missing, so keep a fixed-offset fallback for India, the only
# business timezone the portal relies on today.
_FALLBACK_OFFSETS = {
    "Asia/Kolkata": timedelta(hours=5, minutes=30),
    "Asia/Calcutta": timedelta(hours=5, minutes=30),
}


def display_timezone() -> tzinfo:
    """Resolve the configured IANA timezone, falling back to a fixed offset."""
    name = settings.display_timezone
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        offset = _FALLBACK_OFFSETS.get(name)
        if offset is not None:
            return timezone(offset, name)
        return UTC


def local_day_start_utc(day: date) -> datetime:
    """Midnight in the business timezone, expressed as an aware UTC datetime."""
    return datetime.combine(day, time.min, tzinfo=display_timezone()).astimezone(UTC)
