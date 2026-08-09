"""
Retroactive price correction: find the boundary where a fuel price last
changed, preview what already-closed shifts since then would earn at the
new price, and persist approved corrections as separate records that never
touch the original handover.
"""
from datetime import datetime, timedelta

import app.services.price_correction as pc
import app.api.v1.settings as settings_api


def _ns(fuel_type, volume, price):
    return {"fuel_type": fuel_type, "volume_sold": volume, "price_per_liter": price,
            "revenue": round(volume * price, 2)}


def _handover(date, shift_type, nozzle_summaries, phase="completed", attendant_name="A"):
    return {
        "date": date, "shift_type": shift_type, "shift_id": f"S-{date}-{shift_type}",
        "phase": phase, "attendant_name": attendant_name,
        "nozzle_summaries": nozzle_summaries,
    }


# ── find_price_change_boundary ──────────────────────────────────────────

def test_boundary_from_audit_log_only(monkeypatch):
    monkeypatch.setattr(pc, "get_audit_log", lambda sid, action=None, limit=1000: [
        {"timestamp": "2026-08-01T10:00:00", "details": {
            "old": {"diesel_price_per_liter": 25.00}, "new": {"diesel_price_per_liter": 26.86}}},
    ])
    monkeypatch.setattr(pc, "load_station_json", lambda sid, fn, default=None: [])

    result = pc.find_price_change_boundary("ST001", "Diesel")
    assert result == {"since": "2026-08-01T10:00:00", "old_price": 25.00}


def test_boundary_from_scheduled_only(monkeypatch):
    monkeypatch.setattr(pc, "get_audit_log", lambda sid, action=None, limit=1000: [])
    monkeypatch.setattr(pc, "load_station_json", lambda sid, fn, default=None: [
        {"fuel_type": "Diesel", "applied": True, "applied_at": "2026-08-02T00:00:00", "old_price_per_liter": 25.00},
    ] if fn == 'scheduled_price_changes.json' else default)

    result = pc.find_price_change_boundary("ST001", "Diesel")
    assert result == {"since": "2026-08-02T00:00:00", "old_price": 25.00}


def test_boundary_picks_the_more_recent_of_both_sources(monkeypatch):
    monkeypatch.setattr(pc, "get_audit_log", lambda sid, action=None, limit=1000: [
        {"timestamp": "2026-08-01T10:00:00", "details": {
            "old": {"diesel_price_per_liter": 24.00}, "new": {"diesel_price_per_liter": 25.00}}},
    ])
    monkeypatch.setattr(pc, "load_station_json", lambda sid, fn, default=None: [
        {"fuel_type": "Diesel", "applied": True, "applied_at": "2026-08-03T00:00:00", "old_price_per_liter": 25.00},
    ] if fn == 'scheduled_price_changes.json' else default)

    result = pc.find_price_change_boundary("ST001", "Diesel")
    assert result == {"since": "2026-08-03T00:00:00", "old_price": 25.00}


def test_boundary_none_when_no_history(monkeypatch):
    monkeypatch.setattr(pc, "get_audit_log", lambda sid, action=None, limit=1000: [])
    monkeypatch.setattr(pc, "load_station_json", lambda sid, fn, default=None: default)

    assert pc.find_price_change_boundary("ST001", "Petrol") is None


def test_boundary_ignores_unrelated_fuel_type(monkeypatch):
    # A Petrol audit entry must not satisfy a Diesel boundary lookup.
    monkeypatch.setattr(pc, "get_audit_log", lambda sid, action=None, limit=1000: [
        {"timestamp": "2026-08-01T10:00:00", "details": {
            "old": {"petrol_price_per_liter": 24.00}, "new": {"petrol_price_per_liter": 25.29}}},
    ])
    monkeypatch.setattr(pc, "load_station_json", lambda sid, fn, default=None: default)

    assert pc.find_price_change_boundary("ST001", "Diesel") is None


# ── compute_correction_preview ──────────────────────────────────────────

def test_preview_math_and_date_filtering(monkeypatch):
    monkeypatch.setattr(pc, "find_price_change_boundary",
                         lambda sid, ft: {"since": "2026-08-01T00:00:00", "old_price": 25.00})
    handovers = {
        "HO-before": _handover("2026-07-31", "Day", [_ns("Diesel", 1000, 25.00)]),  # excluded, before boundary
        "HO-after": _handover("2026-08-02", "Day", [_ns("Diesel", 1000, 25.00)]),   # included
        "HO-other-fuel": _handover("2026-08-02", "Night", [_ns("Petrol", 500, 24.00)]),  # no Diesel volume
    }
    monkeypatch.setattr(pc, "load_station_json", lambda sid, fn, default=None:
                         handovers if fn == 'attendant_handovers.json' else {})

    result = pc.compute_correction_preview("ST001", "Diesel", 26.86)
    assert result["boundary_found"] is True
    assert [r["handover_id"] for r in result["rows"]] == ["HO-after"]
    row = result["rows"][0]
    assert row["old_revenue"] == 25000.0
    assert row["new_revenue"] == 26860.0
    assert row["variance"] == 1860.0
    assert result["total_variance"] == 1860.0


def test_preview_excludes_incomplete_and_already_corrected(monkeypatch):
    monkeypatch.setattr(pc, "find_price_change_boundary",
                         lambda sid, ft: {"since": "2026-08-01T00:00:00", "old_price": 25.00})
    handovers = {
        "HO-partial": _handover("2026-08-02", "Day", [_ns("Diesel", 1000, 25.00)], phase="readings_verified"),
        "HO-done": _handover("2026-08-02", "Night", [_ns("Diesel", 500, 25.00)]),
        "HO-corrected": _handover("2026-08-03", "Day", [_ns("Diesel", 800, 25.00)]),
    }
    corrections = {"PC-1": {"handover_id": "HO-corrected", "fuel_type": "Diesel"}}

    def fake_load(sid, fn, default=None):
        if fn == 'attendant_handovers.json':
            return handovers
        if fn == 'price_corrections.json':
            return corrections
        return default
    monkeypatch.setattr(pc, "load_station_json", fake_load)

    result = pc.compute_correction_preview("ST001", "Diesel", 26.86)
    assert [r["handover_id"] for r in result["rows"]] == ["HO-done"]


def test_preview_no_boundary_returns_empty(monkeypatch):
    monkeypatch.setattr(pc, "find_price_change_boundary", lambda sid, ft: None)
    result = pc.compute_correction_preview("ST001", "Diesel", 26.86)
    assert result["boundary_found"] is False
    assert result["rows"] == []


# ── apply_corrections ───────────────────────────────────────────────────

def test_apply_writes_records_without_touching_handovers(monkeypatch):
    handovers = {
        "HO-1": _handover("2026-08-02", "Day", [_ns("Diesel", 1000, 25.00)]),
        "HO-2": _handover("2026-08-02", "Night", [_ns("Petrol", 500, 24.00)]),  # no Diesel volume -> skipped
    }
    saved = {}

    def fake_load(sid, fn, default=None):
        if fn == 'attendant_handovers.json':
            return handovers
        if fn == 'price_corrections.json':
            return saved.get(fn, {})
        return default

    def fake_save(sid, fn, data):
        saved[fn] = data

    monkeypatch.setattr(pc, "load_station_json", fake_load)
    monkeypatch.setattr(pc, "save_station_json", fake_save)

    original_handovers_snapshot = dict(handovers)
    created = pc.apply_corrections("ST001", "Diesel", 26.86, ["HO-1", "HO-2", "HO-missing"], "owner1")

    assert len(created) == 1
    assert created[0]["handover_id"] == "HO-1"
    assert created[0]["variance"] == 1860.0
    assert 'attendant_handovers.json' not in saved  # original store never written
    assert handovers == original_handovers_snapshot  # in-memory handovers dict untouched
    assert 'price_corrections.json' in saved
    assert list(saved['price_corrections.json'].values())[0]["handover_id"] == "HO-1"


# ── HTTP-level: role gating ─────────────────────────────────────────────

def _isolate_endpoints(monkeypatch):
    monkeypatch.setattr(settings_api, "log_audit_event", lambda *a, **k: None)
    monkeypatch.setattr(settings_api, "create_notification", lambda *a, **k: None)


def test_preview_endpoint_allows_manager(client, create_staff, monkeypatch):
    _isolate_endpoints(monkeypatch)
    monkeypatch.setattr(pc, "compute_correction_preview",
                         lambda sid, ft, price, since_override=None: {
                             "boundary_found": False, "since": None, "old_price": None,
                             "rows": [], "total_old_revenue": 0, "total_new_revenue": 0, "total_variance": 0})
    create_staff("mgr_pc_1", "Test Manager", "manager", password="test1234")
    res = client.post("/api/v1/auth/login", json={"username": "mgr_pc_1", "password": "test1234"})
    headers = {"Authorization": f"Bearer {res.json()['access_token']}", "X-Station-Id": "ST001"}

    res = client.get("/api/v1/settings/fuel/correction-preview?fuel_type=Diesel&new_price=26.86", headers=headers)
    assert res.status_code == 200


def test_apply_endpoint_forbidden_for_manager(client, create_staff, monkeypatch):
    _isolate_endpoints(monkeypatch)
    create_staff("mgr_pc_2", "Test Manager", "manager", password="test1234")
    res = client.post("/api/v1/auth/login", json={"username": "mgr_pc_2", "password": "test1234"})
    headers = {"Authorization": f"Bearer {res.json()['access_token']}", "X-Station-Id": "ST001",
               "Content-Type": "application/json"}

    res = client.post("/api/v1/settings/fuel/corrections/apply", headers=headers,
                       json={"fuel_type": "Diesel", "new_price": 26.86, "handover_ids": ["HO-1"]})
    assert res.status_code == 403


def test_apply_endpoint_succeeds_for_owner(client, owner_headers, monkeypatch):
    _isolate_endpoints(monkeypatch)
    monkeypatch.setattr(pc, "apply_corrections", lambda sid, ft, price, ids, by: [
        {"correction_id": "PC-1", "handover_id": "HO-1", "variance": 100.0},
    ])
    res = client.post("/api/v1/settings/fuel/corrections/apply", headers=owner_headers,
                       json={"fuel_type": "Diesel", "new_price": 26.86, "handover_ids": ["HO-1"]})
    assert res.status_code == 200
    assert res.json()["applied"] == 1


# ── Owner-to-manager delegation ─────────────────────────────────────────

def _iso(dt):
    return dt.isoformat()


def test_is_delegated_true_within_window(monkeypatch):
    future = _iso(datetime.now() + timedelta(hours=1))
    monkeypatch.setattr(pc, "load_station_json", lambda sid, fn, default=None: {
        "PCD-1": {"manager_username": "mgr1", "revoked_at": None, "expires_at": future},
    })
    assert pc.is_delegated("ST001", "mgr1") is True
    assert pc.is_delegated("ST001", "someone_else") is False


def test_is_delegated_false_after_expiry(monkeypatch):
    past = _iso(datetime.now() - timedelta(hours=1))
    monkeypatch.setattr(pc, "load_station_json", lambda sid, fn, default=None: {
        "PCD-1": {"manager_username": "mgr1", "revoked_at": None, "expires_at": past},
    })
    assert pc.is_delegated("ST001", "mgr1") is False


def test_is_delegated_false_after_revoke(monkeypatch):
    future = _iso(datetime.now() + timedelta(hours=1))
    monkeypatch.setattr(pc, "load_station_json", lambda sid, fn, default=None: {
        "PCD-1": {"manager_username": "mgr1", "revoked_at": "2026-01-01T00:00:00", "expires_at": future},
    })
    assert pc.is_delegated("ST001", "mgr1") is False


def test_grant_and_revoke_delegation(monkeypatch):
    saved = {}
    monkeypatch.setattr(pc, "load_station_json", lambda sid, fn, default=None: saved.get(fn, default if default is not None else {}))
    monkeypatch.setattr(pc, "save_station_json", lambda sid, fn, data: saved.__setitem__(fn, data))

    record = pc.grant_delegation("ST001", "mgr1", "Test Manager", "2099-01-01T00:00:00", "owner1")
    assert record["manager_username"] == "mgr1"
    assert record["revoked_at"] is None

    assert pc.revoke_delegation("ST001", record["delegation_id"]) is True
    assert saved['price_correction_delegations.json'][record["delegation_id"]]["revoked_at"] is not None
    # revoking an already-revoked (or unknown) id is a no-op, not an error
    assert pc.revoke_delegation("ST001", record["delegation_id"]) is False
    assert pc.revoke_delegation("ST001", "PCD-nonexistent") is False


def test_list_delegations_status(monkeypatch):
    future = _iso(datetime.now() + timedelta(hours=1))
    past = _iso(datetime.now() - timedelta(hours=1))
    monkeypatch.setattr(pc, "load_station_json", lambda sid, fn, default=None: {
        "PCD-active": {"manager_username": "mgr1", "granted_at": "2026-01-01T00:00:00", "revoked_at": None, "expires_at": future},
        "PCD-expired": {"manager_username": "mgr2", "granted_at": "2026-01-02T00:00:00", "revoked_at": None, "expires_at": past},
        "PCD-revoked": {"manager_username": "mgr3", "granted_at": "2026-01-03T00:00:00", "revoked_at": "2026-01-04T00:00:00", "expires_at": future},
    })
    rows = pc.list_delegations("ST001")
    statuses = {r["manager_username"]: r["status"] for r in rows}
    assert statuses == {"mgr1": "active", "mgr2": "expired", "mgr3": "revoked"}


def test_apply_endpoint_403_for_manager_without_delegation(client, create_staff, monkeypatch):
    _isolate_endpoints(monkeypatch)
    monkeypatch.setattr(pc, "is_delegated", lambda sid, username: False)
    create_staff("mgr_pc_nodel", "Test Manager", "manager", password="test1234")
    res = client.post("/api/v1/auth/login", json={"username": "mgr_pc_nodel", "password": "test1234"})
    headers = {"Authorization": f"Bearer {res.json()['access_token']}", "X-Station-Id": "ST001", "Content-Type": "application/json"}

    res = client.post("/api/v1/settings/fuel/corrections/apply", headers=headers,
                       json={"fuel_type": "Diesel", "new_price": 26.86, "handover_ids": ["HO-1"]})
    assert res.status_code == 403


def test_apply_endpoint_200_for_delegated_manager(client, create_staff, monkeypatch):
    _isolate_endpoints(monkeypatch)
    monkeypatch.setattr(pc, "is_delegated", lambda sid, username: True)
    monkeypatch.setattr(pc, "apply_corrections", lambda sid, ft, price, ids, by: [
        {"correction_id": "PC-1", "handover_id": "HO-1", "variance": 50.0},
    ])
    create_staff("mgr_pc_del", "Test Manager", "manager", password="test1234")
    res = client.post("/api/v1/auth/login", json={"username": "mgr_pc_del", "password": "test1234"})
    headers = {"Authorization": f"Bearer {res.json()['access_token']}", "X-Station-Id": "ST001", "Content-Type": "application/json"}

    res = client.post("/api/v1/settings/fuel/corrections/apply", headers=headers,
                       json={"fuel_type": "Diesel", "new_price": 26.86, "handover_ids": ["HO-1"]})
    assert res.status_code == 200
    assert res.json()["applied"] == 1


def test_delegate_and_list_endpoints_forbidden_for_manager(client, create_staff, monkeypatch):
    _isolate_endpoints(monkeypatch)
    create_staff("mgr_pc_deleg", "Test Manager", "manager", password="test1234")
    res = client.post("/api/v1/auth/login", json={"username": "mgr_pc_deleg", "password": "test1234"})
    headers = {"Authorization": f"Bearer {res.json()['access_token']}", "X-Station-Id": "ST001", "Content-Type": "application/json"}

    res = client.post("/api/v1/settings/fuel/corrections/delegate", headers=headers,
                       json={"manager_username": "mgr2", "manager_full_name": "M2", "expires_at": "2099-01-01T00:00:00"})
    assert res.status_code == 403

    res = client.get("/api/v1/settings/fuel/corrections/delegations", headers=headers)
    assert res.status_code == 403


def test_delegate_endpoint_succeeds_for_owner(client, owner_headers, monkeypatch):
    _isolate_endpoints(monkeypatch)
    monkeypatch.setattr(pc, "grant_delegation", lambda sid, u, n, exp, by: {
        "delegation_id": "PCD-1", "manager_username": u, "manager_full_name": n,
        "granted_by": by, "granted_at": "2026-01-01T00:00:00", "expires_at": exp, "revoked_at": None,
    })
    res = client.post("/api/v1/settings/fuel/corrections/delegate", headers=owner_headers,
                       json={"manager_username": "mgr2", "manager_full_name": "M2", "expires_at": "2099-01-01T00:00:00"})
    assert res.status_code == 200
    assert res.json()["delegation"]["manager_username"] == "mgr2"


def test_my_access_endpoint(client, owner_headers, create_staff, monkeypatch):
    _isolate_endpoints(monkeypatch)
    res = client.get("/api/v1/settings/fuel/corrections/my-access", headers=owner_headers)
    assert res.status_code == 200
    assert res.json()["can_apply"] is True

    monkeypatch.setattr(pc, "is_delegated", lambda sid, username: False)
    create_staff("mgr_pc_access", "Test Manager", "manager", password="test1234")
    login = client.post("/api/v1/auth/login", json={"username": "mgr_pc_access", "password": "test1234"})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}", "X-Station-Id": "ST001"}
    res = client.get("/api/v1/settings/fuel/corrections/my-access", headers=headers)
    assert res.status_code == 200
    assert res.json()["can_apply"] is False
