"""
Business-hours-aware elapsed time, used by the stale-shift/handover
auto-close checks so a normal overnight or Sunday gap - when nobody could
have acted anyway - doesn't count against how "stale" something is.

Fixed schedule for now (06:00-20:00, Monday-Saturday); not per-station
configurable, since nothing currently exposes that as a setting.
"""
from datetime import datetime, timedelta, time

BUSINESS_HOURS_START = 6   # 06:00
BUSINESS_HOURS_END = 20    # 20:00
WORKING_WEEKDAYS = {0, 1, 2, 3, 4, 5}  # Monday=0 .. Saturday=5; Sunday (6) excluded


def business_hours_elapsed(start: datetime, end: datetime) -> float:
    """
    Hours of business-hours "opportunity" between start and end - only time
    that falls within BUSINESS_HOURS_START-END on a working day counts.
    Nights and Sundays contribute zero, regardless of how much wall-clock
    time they span, so a handover that finished at 18:00 Friday and wasn't
    touched again until Monday morning shows the same elapsed hours as one
    finished at 18:00 any other weekday.
    """
    if end <= start:
        return 0.0
    total = timedelta()
    day = start.date()
    while day <= end.date():
        if day.weekday() in WORKING_WEEKDAYS:
            window_start = datetime.combine(day, time(BUSINESS_HOURS_START, 0))
            window_end = datetime.combine(day, time(BUSINESS_HOURS_END, 0))
            overlap_start = max(window_start, start)
            overlap_end = min(window_end, end)
            if overlap_end > overlap_start:
                total += overlap_end - overlap_start
        day += timedelta(days=1)
    return total.total_seconds() / 3600
