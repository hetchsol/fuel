"""
Safe deposits, bound to the attendant who made them.

Each deposit carries the attendant it belongs to (`attendant_id`), fixed when
it is recorded. A voided deposit no longer counts anywhere. An attendant's
deposits are what their own shift close is checked against; nobody else's.
"""
from typing import Optional

from ..database.station_files import load_station_json, save_station_json

DEPOSITS_FILE = "safe_deposits.json"


def load_deposits(station_id: str) -> dict:
    return load_station_json(station_id, DEPOSITS_FILE, default={})


def save_deposits(station_id: str, data: dict):
    save_station_json(station_id, DEPOSITS_FILE, data)


def is_live(deposit: dict) -> bool:
    return not deposit.get("voided")


def shift_deposits(station_id: str, shift_id: str, include_voided: bool = False) -> list:
    rows = (load_deposits(station_id).get(shift_id) or {}).get("deposits", [])
    return rows if include_voided else [d for d in rows if is_live(d)]


def attendant_deposits(station_id: str, shift_id: str, attendant_id: str) -> list:
    """Live deposits belonging to one attendant on one shift."""
    return [d for d in shift_deposits(station_id, shift_id) if d.get("attendant_id") == attendant_id]


def attendant_deposit_summary(station_id: str, shift_id: str, attendant_id: Optional[str]) -> dict:
    rows = attendant_deposits(station_id, shift_id, attendant_id) if attendant_id else []
    return {
        "total": round(sum(d.get("amount", 0) or 0 for d in rows), 2),
        "count": len(rows),
        "deposit_ids": [d.get("deposit_id") for d in rows],
    }
