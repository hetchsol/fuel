"""
business_hours_elapsed underlies the shift/handover auto-close thresholds.
Fixed schedule: 06:00-20:00, Monday-Saturday (Sunday excluded). These tests
pin exact dates rather than "N hours before now" so they're deterministic
regardless of when the suite runs.
"""
from datetime import datetime

from app.services.business_hours import business_hours_elapsed


def test_same_day_within_window_is_wall_clock():
    # 2026-09-07 is a Monday.
    start = datetime(2026, 9, 7, 8, 0)
    end = datetime(2026, 9, 7, 14, 0)
    assert business_hours_elapsed(start, end) == 6.0


def test_overnight_gap_only_counts_the_business_window_each_day():
    # Day shift's Phase 1 finishes at 18:00 Monday, reviewed 08:00 Tuesday.
    # Monday: 18:00-20:00 (2h) + Tuesday: 06:00-08:00 (2h) = 4h, not 14h.
    start = datetime(2026, 9, 7, 18, 0)   # Monday
    end = datetime(2026, 9, 8, 8, 0)      # Tuesday
    assert business_hours_elapsed(start, end) == 4.0


def test_sunday_contributes_nothing():
    # 2026-09-06 is a Sunday. Saturday 18:00 -> Monday 08:00 must skip it
    # entirely: Saturday 18:00-20:00 (2h) + Sunday (0h) + Monday 06:00-08:00
    # (2h) = 4h.
    start = datetime(2026, 9, 5, 18, 0)   # Saturday
    end = datetime(2026, 9, 7, 8, 0)      # Monday
    assert business_hours_elapsed(start, end) == 4.0


def test_friday_evening_to_monday_morning_includes_saturday():
    # Saturday is a working day in this schedule, so unlike the Sunday-only
    # gap above, this one isn't just "2h + 2h" — it includes a full Saturday
    # business day in between: Friday 18:00-20:00 (2h) + Saturday 06:00-20:00
    # (14h, a full working day) + Sunday (0h) + Monday 06:00-08:00 (2h) = 18h.
    # Still far short of the ~62 wall-clock hours a flat threshold would see.
    start = datetime(2026, 9, 4, 18, 0)   # Friday
    end = datetime(2026, 9, 7, 8, 0)      # Monday
    assert business_hours_elapsed(start, end) == 18.0


def test_end_before_start_is_zero():
    start = datetime(2026, 9, 7, 12, 0)
    end = datetime(2026, 9, 7, 8, 0)
    assert business_hours_elapsed(start, end) == 0.0


def test_multiple_full_working_days_accumulate():
    # Monday 06:00 -> Thursday 06:00: three full 14h working days
    # (Mon, Tue, Wed) = 42h.
    start = datetime(2026, 9, 7, 6, 0)    # Monday
    end = datetime(2026, 9, 10, 6, 0)     # Thursday
    assert business_hours_elapsed(start, end) == 42.0
