"""
Date Format Utilities
Standardizes date format to DD-MM-YYYY throughout the application
"""
from datetime import datetime
from typing import Optional


# Standard date format: DD-MM-YYYY
DATE_FORMAT = "%d-%m-%Y"
DATETIME_FORMAT = "%d-%m-%Y %H:%M:%S"

# ISO format for internal processing (YYYY-MM-DD)
ISO_DATE_FORMAT = "%Y-%m-%d"


def format_date_to_display(date_str: Optional[str]) -> Optional[str]:
    """
    Convert ISO format (YYYY-MM-DD) to display format (DD-MM-YYYY)

    Args:
        date_str: Date string in ISO format (YYYY-MM-DD)

    Returns:
        Date string in DD-MM-YYYY format
    """
    if not date_str:
        return None

    try:
        # Parse ISO format
        date_obj = datetime.strptime(date_str[:10], ISO_DATE_FORMAT)
        # Return in DD-MM-YYYY format
        return date_obj.strftime(DATE_FORMAT)
    except (ValueError, TypeError):
        # If already in DD-MM-YYYY or invalid, return as is
        return date_str


def format_date_to_iso(date_str: Optional[str]) -> Optional[str]:
    """
    Convert display format (DD-MM-YYYY) to ISO format (YYYY-MM-DD)

    Args:
        date_str: Date string in DD-MM-YYYY format

    Returns:
        Date string in YYYY-MM-DD format for database operations
    """
    if not date_str:
        return None

    try:
        # Try parsing as DD-MM-YYYY
        date_obj = datetime.strptime(date_str, DATE_FORMAT)
        # Return in ISO format
        return date_obj.strftime(ISO_DATE_FORMAT)
    except ValueError:
        try:
            # Try parsing as ISO format (already in correct format)
            date_obj = datetime.strptime(date_str[:10], ISO_DATE_FORMAT)
            return date_obj.strftime(ISO_DATE_FORMAT)
        except (ValueError, TypeError):
            # If invalid, return as is
            return date_str


def format_datetime_to_display(datetime_str: Optional[str]) -> Optional[str]:
    """
    Convert ISO datetime to display format (DD-MM-YYYY HH:MM:SS)

    Args:
        datetime_str: Datetime string in ISO format

    Returns:
        Datetime string in DD-MM-YYYY HH:MM:SS format
    """
    if not datetime_str:
        return None

    try:
        # Parse ISO datetime
        if 'T' in datetime_str:
            dt_obj = datetime.fromisoformat(datetime_str.replace('Z', '+00:00'))
        else:
            dt_obj = datetime.strptime(datetime_str[:19], "%Y-%m-%d %H:%M:%S")

        # Return in DD-MM-YYYY HH:MM:SS format
        return dt_obj.strftime(DATETIME_FORMAT)
    except (ValueError, TypeError):
        return datetime_str


def get_today_display() -> str:
    """
    Get today's date in DD-MM-YYYY format

    Returns:
        Today's date as DD-MM-YYYY
    """
    return datetime.now().strftime(DATE_FORMAT)


def get_today_iso() -> str:
    """
    Get today's date in YYYY-MM-DD format

    Returns:
        Today's date as YYYY-MM-DD
    """
    return datetime.now().strftime(ISO_DATE_FORMAT)


def validate_date_format(date_str: str, format_type: str = "display") -> bool:
    """
    Validate if a date string matches the expected format

    Args:
        date_str: Date string to validate
        format_type: "display" for DD-MM-YYYY or "iso" for YYYY-MM-DD

    Returns:
        True if valid, False otherwise
    """
    if not date_str:
        return False

    try:
        if format_type == "display":
            datetime.strptime(date_str, DATE_FORMAT)
        else:
            datetime.strptime(date_str, ISO_DATE_FORMAT)
        return True
    except (ValueError, TypeError):
        return False


def parse_flexible_date(date_str: str) -> Optional[datetime]:
    """
    Parse date from multiple possible formats

    Tries: DD-MM-YYYY, YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY

    Args:
        date_str: Date string in any common format

    Returns:
        datetime object or None if unparseable
    """
    if not date_str:
        return None

    formats_to_try = [
        DATE_FORMAT,          # DD-MM-YYYY
        ISO_DATE_FORMAT,      # YYYY-MM-DD
        "%d/%m/%Y",           # DD/MM/YYYY
        "%m/%d/%Y",           # MM/DD/YYYY
        "%Y%m%d",             # YYYYMMDD
    ]

    for fmt in formats_to_try:
        try:
            return datetime.strptime(date_str[:10], fmt)
        except (ValueError, TypeError):
            continue

    return None
