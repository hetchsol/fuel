"""
Password expiry: countdown, forced change, self-service change, 90-day
rotation, owner exemption, the owner's 7-day countdown for staff, and
shared-device detection.

Users, the countdown record and devices are kept in memory: nothing is
written to storage/users.json or the station files.
"""
import copy
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.api.v1 import auth
from app.services import password_policy as pwp

CAT = timezone(timedelta(hours=2))
START = datetime(2026, 11, 24, 9, 0, tzinfo=CAT).astimezone(timezone.utc)


@pytest.fixture(autouse=True)
def isolated(monkeypatch):
    saved = copy.deepcopy(auth.users_db)
    monkeypatch.setattr(auth, "_save_users_file", lambda: None)
    files: dict = {}
    monkeypatch.setattr(pwp, "load_station_json",
                        lambda sid, name, default=None: copy.deepcopy(files.get((sid, name), default)))
    monkeypatch.setattr(pwp, "save_station_json",
                        lambda sid, name, data: files.__setitem__((sid, name), copy.deepcopy(data)))
    sent = []
    monkeypatch.setattr(auth, "create_notification", lambda **k: sent.append(k))
    monkeypatch.setattr(auth, "log_audit_event", lambda **k: None)
    yield {"files": files, "sent": sent}
    auth.users_db.clear()
    auth.users_db.update(saved)


def at(monkeypatch, when: datetime):
    monkeypatch.setattr(pwp, "utcnow", lambda: when)


def make_staff(client, owner_headers, role="user", password="Start-pass-1"):
    username = f"pw_{uuid.uuid4().hex[:8]}"
    res = client.post("/api/v1/auth/users", headers=owner_headers, json={
        "username": username, "password": password, "full_name": f"Staff {username}",
        "role": role, "station_id": "ST001"})
    assert res.status_code == 200, res.text
    return username


def login(client, username, password, device=None):
    headers = {"X-Device-Id": device} if device else {}
    res = client.post("/api/v1/auth/login", json={"username": username, "password": password}, headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


def bearer(token):
    return {"Authorization": f"Bearer {token}", "X-Station-Id": "ST001"}


def clear_due(username):
    auth.users_db[username]["password_change_due"] = None


# ── countdown arithmetic ────────────────────────────────────────────

def test_countdown_runs_7_to_1_then_forces():
    due = pwp.start_of_day_in(7, START)
    assert due == "2026-11-30T22:00:00+00:00"          # 01/12/2026 00:00 Zambia time
    user = {"role": "user", "password_change_due": due}
    for day, left in enumerate([7, 6, 5, 4, 3, 2, 1]):
        st = pwp.status(user, START + timedelta(days=day))
        assert (st["days_left"], st["remind"], st["must_change"]) == (left, True, False)
    late_night = datetime(2026, 11, 30, 23, 59, tzinfo=CAT)
    assert pwp.status(user, late_night)["must_change"] is False
    st = pwp.status(user, datetime(2026, 12, 1, 0, 0, tzinfo=CAT))
    assert st["must_change"] and st["days_left"] == 0


def test_rotation_reminders_at_21_15_10_then_daily():
    user = {"role": "user", "password_change_due": pwp.next_rotation(START)}
    expected = {}
    for left in range(90, 0, -1):
        expected[left] = ("21" if 16 <= left <= 21 else "15" if 11 <= left <= 15
                          else "10" if 8 <= left <= 10 else "daily" if left <= 7 else None)
    for day in range(0, 90):
        st = pwp.status(user, START + timedelta(days=day))
        left = 90 - day
        assert st["days_left"] == left
        assert st["notice"] == expected[left], (left, st["notice"])
        assert st["remind"] is (expected[left] is not None)
        assert st["must_change"] is False
    st = pwp.status(user, START + timedelta(days=90))
    assert st["must_change"] and st["notice"] is None and not st["remind"]


def test_changing_inside_the_reminder_period_starts_a_new_90_days(client, owner_headers, monkeypatch):
    at(monkeypatch, START)
    u = make_staff(client, owner_headers)
    h = bearer(login(client, u, "Start-pass-1")["access_token"])
    client.post("/api/v1/auth/change-password", headers=h,
                json={"current_password": "Start-pass-1", "new_password": "Second-pass-2"})
    at(monkeypatch, START + timedelta(days=72))          # 18 days left: inside the 21-day notice
    st = client.get("/api/v1/auth/password-status", headers=h).json()["password_status"]
    assert st["notice"] == "21" and st["days_left"] == 18
    ok = client.post("/api/v1/auth/change-password", headers=h,
                     json={"current_password": "Second-pass-2", "new_password": "Third-pass-3"}).json()
    assert ok["password_status"]["days_left"] == 90 and ok["password_status"]["remind"] is False


def test_owner_is_never_due():
    owner = {"role": "owner", "password_change_due": pwp.due_now(START)}
    st = pwp.status(owner, START + timedelta(days=1))
    assert st["exempt"] and not st["must_change"] and not st["remind"]


def test_password_rules():
    from fastapi import HTTPException
    for new in ("short1", "Same-pass-1", "Mary_k"):
        with pytest.raises(HTTPException):
            pwp.validate_new_password("mary_k", "Same-pass-1", new if new != "Mary_k" else "MARY_K")
    pwp.validate_new_password("mary_k", "Same-pass-1", "New-pass-22")


# ── forced change and self-service change ───────────────────────────

def test_new_staff_must_change_before_anything_else(client, owner_headers):
    u = make_staff(client, owner_headers)
    data = login(client, u, "Start-pass-1")
    assert data["password_status"]["must_change"] is True
    h = bearer(data["access_token"])

    res = client.get("/api/v1/auth/staff", headers=h)
    assert res.status_code == 403
    assert res.headers.get("x-password-change-required") == "1"
    assert client.get("/api/v1/auth/password-status", headers=h).status_code == 200

    bad = client.post("/api/v1/auth/change-password", headers=h,
                      json={"current_password": "wrong", "new_password": "New-pass-22"})
    assert bad.status_code == 400 and "current password" in bad.json()["detail"]
    short = client.post("/api/v1/auth/change-password", headers=h,
                        json={"current_password": "Start-pass-1", "new_password": "abc"})
    assert short.status_code == 400

    ok = client.post("/api/v1/auth/change-password", headers=h,
                     json={"current_password": "Start-pass-1", "new_password": "New-pass-22"})
    assert ok.status_code == 200, ok.text
    st = ok.json()["password_status"]
    assert not st["must_change"] and not st["remind"] and st["days_left"] >= 89
    assert client.get("/api/v1/auth/staff", headers=h).status_code == 200
    login(client, u, "New-pass-22")


def test_owner_is_not_forced(client, owner_headers):
    res = client.post("/api/v1/auth/login", json={"username": "owner1", "password": "owner123"})
    assert res.json()["password_status"]["exempt"] is True
    assert client.get("/api/v1/auth/staff", headers=owner_headers).status_code == 200


def test_reset_makes_password_due_now(client, owner_headers):
    u = make_staff(client, owner_headers)
    clear_due(u)
    res = client.post(f"/api/v1/auth/users/{u}/reset-password", headers=owner_headers)
    data = login(client, u, res.json()["new_password"])
    assert data["password_status"]["must_change"] is True


# ── owner's 7-day countdown ─────────────────────────────────────────

def test_owner_countdown_for_staff(client, owner_headers, monkeypatch, isolated):
    at(monkeypatch, START)
    a = make_staff(client, owner_headers)
    b = make_staff(client, owner_headers, role="manager")
    for u in (a, b):
        clear_due(u)

    res = client.post("/api/v1/auth/password-campaign", headers=owner_headers)
    assert res.status_code == 200, res.text
    s = res.json()
    assert s["days_left"] == 7 and s["changed"] == 0
    assert s["total"] == len([u for u in auth.users_db.values() if not pwp.is_exempt(u.get("role"))])
    assert auth.users_db[a]["password_change_due"] == s["deadline"]
    assert auth.users_db["owner1"].get("password_change_due") is None
    start_msg = isolated["sent"][-1]
    assert start_msg["type"] == "PASSWORD_CAMPAIGN_START" and "A prompt has been sent" in start_msg["message"]

    # Staff see the reminder; it does not block yet
    data = login(client, a, "Start-pass-1")
    assert data["password_status"]["remind"] and data["password_status"]["days_left"] == 7
    h = bearer(data["access_token"])
    assert client.get("/api/v1/auth/staff", headers=h).status_code == 200
    assert client.post("/api/v1/auth/password-campaign", headers=owner_headers).status_code == 400

    # Two days on, one has changed; the owner's view counts down
    at(monkeypatch, START + timedelta(days=2))
    client.post("/api/v1/auth/change-password", headers=h,
                json={"current_password": "Start-pass-1", "new_password": "New-pass-22"})
    view = client.get("/api/v1/auth/password-status", headers=owner_headers).json()["campaign"]
    assert view["days_left"] == 5 and view["changed"] == 1
    assert b in {p["username"] for p in view["pending"]}

    # Deadline: the manager who did not change is forced; owner told once
    at(monkeypatch, datetime(2026, 12, 1, 0, 1, tzinfo=CAT))
    tb = login(client, b, "Start-pass-1")["access_token"]
    assert client.get("/api/v1/auth/staff", headers=bearer(tb)).status_code == 403
    client.get("/api/v1/auth/password-status", headers=owner_headers)
    client.get("/api/v1/auth/password-status", headers=owner_headers)
    deadline_msgs = [m for m in isolated["sent"] if m["type"] == "PASSWORD_CAMPAIGN_DEADLINE"]
    pending = client.get("/api/v1/auth/password-status", headers=owner_headers).json()["campaign"]["pending"]
    assert b in {p["username"] for p in pending}
    assert len(deadline_msgs) == 1
    assert deadline_msgs[0]["message"].startswith(f"{len(pending)} staff had not changed their password")


def test_staff_cannot_start_countdown(client, owner_headers):
    u = make_staff(client, owner_headers)
    clear_due(u)
    h = bearer(login(client, u, "Start-pass-1")["access_token"])
    assert client.post("/api/v1/auth/password-campaign", headers=h).status_code == 403


# ── shared devices ──────────────────────────────────────────────────

def test_device_used_by_two_people_is_shared(client, owner_headers):
    a, b = make_staff(client, owner_headers), make_staff(client, owner_headers)
    clear_due(a), clear_due(b)
    device = "dev-" + uuid.uuid4().hex
    assert login(client, a, "Start-pass-1", device)["device_shared"] is False
    assert login(client, a, "Start-pass-1", device)["device_shared"] is False
    assert login(client, b, "Start-pass-1", device)["device_shared"] is True

    rows = client.get("/api/v1/auth/devices", headers=owner_headers).json()
    row = next(r for r in rows if r["device_id"] == device)
    assert row["shared"] and {x["username"] for x in row["users"]} == {a, b}

    res = client.patch(f"/api/v1/auth/devices/{device}", headers=owner_headers,
                       json={"override": "personal", "label": "Manager laptop"})
    assert res.status_code == 200 and res.json()["shared"] is False
    assert login(client, b, "Start-pass-1", device)["device_shared"] is False


def test_bad_device_id_is_ignored(client, owner_headers):
    a = make_staff(client, owner_headers)
    clear_due(a)
    assert login(client, a, "Start-pass-1", "<script>")["device_shared"] is False


# ── one-off system countdown (Nov 2026) ─────────────────────────────

def test_one_off_countdown_starts_once_with_fixed_deadline(client, owner_headers, monkeypatch, isolated):
    from app.services import one_off_password_countdown as once
    at(monkeypatch, START)
    u = make_staff(client, owner_headers)
    clear_due(u)

    assert once.run_once() == "started"
    assert auth.users_db[u]["password_change_due"] == once.DEADLINE
    assert auth.users_db["owner1"].get("password_change_due") is None
    msg = isolated["sent"][-1]
    assert msg["title"] == "Password change started by the system"
    assert "7 days" in msg["message"] and "30/11/2026" in msg["message"]
    assert "A prompt has been sent to them" in msg["message"]

    view = client.get("/api/v1/auth/password-status", headers=owner_headers).json()["campaign"]
    assert view["days_left"] == 7 and view["started_by"] == "system"
    st = login(client, u, "Start-pass-1")["password_status"]
    assert st["remind"] and st["days_left"] == 7

    assert once.run_once() == "not_needed"               # a restart never repeats it
    assert len([m for m in isolated["sent"] if m["type"] == "PASSWORD_CAMPAIGN_START"]) == 1


def test_one_off_countdown_skipped_after_deadline(monkeypatch, isolated):
    from app.services import one_off_password_countdown as once
    at(monkeypatch, datetime(2026, 12, 1, 8, 0, tzinfo=CAT))
    assert once.run_once() == "not_needed"
    assert not isolated["sent"]


def test_owner_button_still_gives_seven_days(client, owner_headers, monkeypatch):
    at(monkeypatch, datetime(2027, 3, 10, 9, 0, tzinfo=CAT))
    s = client.post("/api/v1/auth/password-campaign", headers=owner_headers).json()
    assert s["days_left"] == 7 and s["deadline"] == "2027-03-16T22:00:00+00:00"


def test_rotation_continues_every_90_days(client, owner_headers, monkeypatch):
    at(monkeypatch, START)
    u = make_staff(client, owner_headers)
    h = bearer(login(client, u, "Start-pass-1")["access_token"])
    first = client.post("/api/v1/auth/change-password", headers=h,
                        json={"current_password": "Start-pass-1", "new_password": "Second-pass-2"}).json()
    assert first["password_status"]["days_left"] == 90
    # 90 days on: forced again, change again, next due 90 days later
    at(monkeypatch, START + timedelta(days=91))
    assert client.get("/api/v1/auth/staff", headers=h).status_code == 403
    again = client.post("/api/v1/auth/change-password", headers=h,
                        json={"current_password": "Second-pass-2", "new_password": "Third-pass-3"}).json()
    assert again["password_status"]["days_left"] == 90 and not again["password_status"]["must_change"]


def test_one_off_countdown_retries_when_columns_cannot_be_added(client, owner_headers, monkeypatch, isolated):
    """During a deploy the old instance can lock users; the start fails, nothing is half-done, a retry succeeds."""
    from app.services import one_off_password_countdown as once
    from app.database import db
    at(monkeypatch, START)
    u = make_staff(client, owner_headers)
    clear_due(u)
    monkeypatch.setattr(auth, "_USE_DB", lambda: True)
    monkeypatch.setattr(db, "db_ensure_password_columns", lambda: False)
    assert once.run_once() == "failed"
    assert not [m for m in isolated["sent"] if m["type"].startswith("PASSWORD_CAMPAIGN")]
    assert not pwp.load_campaign()
    monkeypatch.setattr(auth, "_USE_DB", lambda: False)
    assert once.run_once() == "started"
    assert auth.users_db[u]["password_change_due"] == once.DEADLINE


def test_saving_a_password_never_fails_without_the_columns(monkeypatch):
    from app.database import db
    monkeypatch.setattr(db, "db_ensure_password_columns", lambda: False)
    fields = {"password": "x", "password_change_due": "d", "password_changed_at": "c", "full_name": "n"}
    assert auth._db_safe_fields(fields) == {"password": "x", "full_name": "n"}
    monkeypatch.setattr(db, "db_ensure_password_columns", lambda: True)
    assert auth._db_safe_fields(fields) == fields
