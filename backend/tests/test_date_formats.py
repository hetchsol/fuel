"""
format_date_to_display must output "D MMMM YYYY" (e.g. "10 August 2026"),
matching the frontend's dateUtils.ts formatter exactly.
"""
from app.utils.date_formats import format_date_to_display, format_datetime_to_display


def test_single_digit_day_has_no_leading_zero():
    assert format_date_to_display("2026-08-09") == "9 August 2026"


def test_double_digit_day():
    assert format_date_to_display("2026-08-10") == "10 August 2026"


def test_none_returns_none():
    assert format_date_to_display(None) is None


def test_datetime_display_format():
    assert format_datetime_to_display("2026-08-10T14:30:05") == "10 August 2026, 14:30:05"
