"""
Password expiry policy.

Every non-owner user has a `password_change_due` timestamp (ISO, UTC). Seven
days before it the user is reminded at every sign-in (and each new day); from
the due moment on, the server refuses everything except changing the password
(see auth.get_current_user). A change sets the next due date 90 days on.

  - Owner accounts are exempt: never due, never forced.
  - The owner starts a one-off countdown for all staff (`start_campaign`):
    due = start of the day 7 days from today, Zambia time (CAT, UTC+2).
  - A password set by someone else (new user, manager/owner reset or edit)
    is due immediately - that person knows it.

Shared devices: each browser sends a random device id. A device used by two
or more different people is treated as shared unless a manager/owner has
marked it otherwise. Shared devices get a short idle sign-out and keep no
login once the browser closes (frontend).
"""
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException

from ..database.station_files import load_station_json, save_station_json

CAT = timezone(timedelta(hours=2))
REMIND_DAYS = 7
CAMPAIGN_DAYS = 7
ROTATION_DAYS = 90
MIN_LENGTH = 8

GLOBAL_SLOT = "_GLOBAL"
CAMPAIGN_FILE = "password_campaign.json"
DEVICES_FILE = "devices.json"

FORCED_HEADER = "X-Password-Change-Required"
FORCED_DETAIL = "Your password has expired. Change it to continue."
# Routes a user with an expired password can still reach
EXEMPT_PATHS = ("/auth/change-password", "/auth/logout", "/auth/me", "/auth/password-status")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _role(role) -> str:
    return role.value if hasattr(role, "value") else str(role or "")


def is_exempt(role) -> bool:
    return _role(role) == "owner"


def _parse(iso: Optional[str]) -> Optional[datetime]:
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(str(iso))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def start_of_day_in(days: int, now: Optional[datetime] = None) -> str:
    """Midnight (Zambia time) `days` days from today, as a UTC ISO string."""
    now = now or utcnow()
    day = now.astimezone(CAT).date() + timedelta(days=days)
    return datetime(day.year, day.month, day.day, tzinfo=CAT).astimezone(timezone.utc).isoformat()


def due_now(now: Optional[datetime] = None) -> str:
    return (now or utcnow()).isoformat()


def next_rotation(now: Optional[datetime] = None) -> str:
    return start_of_day_in(ROTATION_DAYS, now)


def status(user: dict, now: Optional[datetime] = None) -> dict:
    """What the app should show this user about their password."""
    now = now or utcnow()
    due = _parse((user or {}).get("password_change_due"))
    if is_exempt((user or {}).get("role")) or not due:
        return {"exempt": is_exempt((user or {}).get("role")), "due_at": None, "days_left": None,
                "must_change": False, "remind": False,
                "changed_at": (user or {}).get("password_changed_at")}
    must = now >= due
    days_left = (due.astimezone(CAT).date() - now.astimezone(CAT).date()).days
    return {"exempt": False, "due_at": due.isoformat(), "days_left": max(days_left, 0),
            "must_change": must, "remind": not must and days_left <= REMIND_DAYS,
            "changed_at": user.get("password_changed_at")}


def must_change(user: dict, now: Optional[datetime] = None) -> bool:
    return status(user, now)["must_change"]


def path_is_exempt(path: str) -> bool:
    return any(path.rstrip("/").endswith(p) for p in EXEMPT_PATHS)


def validate_new_password(username: str, current: str, new: str):
    if not new or len(new) < MIN_LENGTH:
        raise HTTPException(status_code=400, detail=f"The new password must be at least {MIN_LENGTH} characters.")
    if new == current:
        raise HTTPException(status_code=400, detail="The new password must be different from the old one.")
    if new.strip().lower() == (username or "").strip().lower():
        raise HTTPException(status_code=400, detail="The new password cannot be your username.")


# ── owner countdown for all staff ───────────────────────────────────

def load_campaign() -> dict:
    return load_station_json(GLOBAL_SLOT, CAMPAIGN_FILE, default={}) or {}


def save_campaign(data: dict):
    save_station_json(GLOBAL_SLOT, CAMPAIGN_FILE, data)


def start_campaign(usernames: list, started_by: str, station_id: str,
                   now: Optional[datetime] = None, deadline: Optional[str] = None) -> dict:
    now = now or utcnow()
    camp = {
        "started_at": now.isoformat(), "started_by": started_by,
        "deadline": deadline or start_of_day_in(CAMPAIGN_DAYS, now),
        "usernames": sorted(usernames), "station_id": station_id,
        "deadline_notified": False,
    }
    save_campaign(camp)
    return camp


def campaign_summary(users: list, now: Optional[datetime] = None) -> Optional[dict]:
    """Owner's view of the countdown: days left, who has and has not changed."""
    camp = load_campaign()
    if not camp.get("started_at"):
        return None
    now = now or utcnow()
    started = _parse(camp["started_at"])
    deadline = _parse(camp["deadline"])
    by_name = {u["username"]: u for u in users}
    in_scope = [by_name[n] for n in camp.get("usernames", []) if n in by_name]
    changed, pending = [], []
    for u in in_scope:
        at = _parse(u.get("password_changed_at"))
        (changed if at and at >= started else pending).append(u)
    days_left = (deadline.astimezone(CAT).date() - now.astimezone(CAT).date()).days
    return {
        "started_at": camp["started_at"], "started_by": camp.get("started_by"),
        "deadline": camp["deadline"], "days_left": max(days_left, 0),
        "deadline_passed": now >= deadline,
        "total": len(in_scope), "changed": len(changed),
        "pending": [{"username": u["username"], "full_name": u.get("full_name") or u["username"]}
                    for u in pending],
        "deadline_notified": bool(camp.get("deadline_notified")),
        "station_id": camp.get("station_id"),
    }


def mark_deadline_notified():
    camp = load_campaign()
    camp["deadline_notified"] = True
    save_campaign(camp)


# ── devices ─────────────────────────────────────────────────────────

_DEVICE_RE = re.compile(r"^[A-Za-z0-9-]{8,64}$")


def clean_device_id(device_id: Optional[str]) -> Optional[str]:
    return device_id if device_id and _DEVICE_RE.match(device_id) else None


def load_devices(station_id: str) -> dict:
    return load_station_json(station_id, DEVICES_FILE, default={}) or {}


def is_shared(device: dict) -> bool:
    override = device.get("override")
    if override in ("shared", "personal"):
        return override == "shared"
    return len(device.get("users") or {}) >= 2


def record_login(station_id: str, device_id: Optional[str], username: str,
                 user_agent: str = "", now: Optional[datetime] = None) -> bool:
    """Note who signed in on this device; returns whether it counts as shared."""
    device_id = clean_device_id(device_id)
    if not device_id:
        return False
    now_iso = (now or utcnow()).isoformat()
    devices = load_devices(station_id)
    d = devices.get(device_id) or {"device_id": device_id, "first_seen": now_iso, "users": {},
                                   "override": None, "label": ""}
    d["users"][username] = now_iso
    d["last_seen"] = now_iso
    if user_agent:
        d["user_agent"] = user_agent[:200]
    devices[device_id] = d
    save_station_json(station_id, DEVICES_FILE, devices)
    return is_shared(d)


def device_is_shared(station_id: str, device_id: Optional[str]) -> bool:
    device_id = clean_device_id(device_id)
    if not device_id:
        return False
    d = load_devices(station_id).get(device_id)
    return bool(d) and is_shared(d)


def set_device(station_id: str, device_id: str, override: Optional[str], label: Optional[str]) -> dict:
    devices = load_devices(station_id)
    d = devices.get(device_id)
    if not d:
        raise HTTPException(status_code=404, detail="Device not found.")
    if override not in (None, "shared", "personal"):
        raise HTTPException(status_code=400, detail="Choose shared, personal or automatic.")
    d["override"] = override
    if label is not None:
        d["label"] = label.strip()[:60]
    save_station_json(station_id, DEVICES_FILE, devices)
    return d
