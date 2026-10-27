"""Business-timezone boundary helpers."""

from __future__ import annotations

from datetime import UTC, date, datetime

from app.timeutils import local_day_start_utc


def test_local_day_start_converts_to_the_previous_utc_evening():
    # 27 Oct 2026 00:00 IST == 26 Oct 2026 18:30 UTC.
    assert local_day_start_utc(date(2026, 10, 27)) == datetime(
        2026, 10, 26, 18, 30, tzinfo=UTC
    )
