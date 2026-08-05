"""
A supervisor may record a tank's closing dip on the manager's behalf when the
manager isn't on-site — but only with a stated reason, and it must leave a
trail (stamped on the record, audited, and notified). Manager/owner behavior
must be unaffected — the reason requirement is supervisor-only.
"""
import app.api.v1.tank_readings as tr
import app.services.dip_conversion as dip_conversion
import app.database.storage as storage_module


def _isolate(monkeypatch):
    """Keep the endpoint's storage/calibration side effects in memory only."""
    saved = {}

    def fake_load(sid, fn, default=None):
        return saved.get(fn, default if default is not None else {})

    def fake_save(sid, fn, data):
        saved[fn] = data

    monkeypatch.setattr(tr, "load_station_json", fake_load)
    monkeypatch.setattr(tr, "save_station_json", fake_save)
    monkeypatch.setattr(tr, "ensure_calibration_loaded", lambda *a, **k: True)
    monkeypatch.setattr(dip_conversion, "dip_to_volume", lambda tank_id, dip_cm: (dip_cm or 0) * 10)
    monkeypatch.setattr(dip_conversion, "get_calibration_version", lambda tank_id: "v1")
    monkeypatch.setattr(storage_module, "save_station_storage", lambda *a, **k: None)
    return saved


def _role_headers(client, create_staff, username, role):
    create_staff(username, f"Test {role.title()}", role, password="test1234")
    res = client.post("/api/v1/auth/login", json={"username": username, "password": "test1234"})
    assert res.status_code == 200, res.text
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}", "X-Station-Id": "ST001", "Content-Type": "application/json"}


def _dip_params(recorded_by, **extra):
    params = {"tank_id": "TANK1", "date": "2026-08-05", "shift_type": "Day",
              "recorded_by": recorded_by, "closing_dip_cm": 90.0}
    params.update(extra)
    return params


def test_supervisor_without_reason_is_blocked(client, create_staff, monkeypatch):
    _isolate(monkeypatch)
    headers = _role_headers(client, create_staff, "sup_dip_1", "supervisor")

    res = client.post("/api/v1/tank-readings/dips", headers=headers, params=_dip_params("sup_dip_1"))
    assert res.status_code == 400
    assert "reason" in res.json()["detail"].lower()


def test_supervisor_with_reason_succeeds_stamps_record_and_notifies(client, create_staff, monkeypatch):
    saved = _isolate(monkeypatch)
    notified = []
    monkeypatch.setattr(tr, "create_notification", lambda **k: notified.append(k))
    headers = _role_headers(client, create_staff, "sup_dip_2", "supervisor")

    res = client.post("/api/v1/tank-readings/dips", headers=headers, params=_dip_params(
        "sup_dip_2", delegate_reason="Manager off-site at a supplier delivery"))
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["closing_dip_cm"] == 90.0

    stored = saved["tank_readings.json"][data["reading_id"]]
    assert stored["delegated_by"] == "Test Supervisor"
    assert stored["delegate_reason"] == "Manager off-site at a supplier delivery"
    assert stored["delegated_at"]

    assert len(notified) == 1
    assert notified[0]["type"] == "TANK_DIP_DELEGATED"
    assert "Manager off-site at a supplier delivery" in notified[0]["message"]


def test_manager_without_reason_is_unaffected(client, create_staff, monkeypatch):
    saved = _isolate(monkeypatch)
    notified = []
    monkeypatch.setattr(tr, "create_notification", lambda **k: notified.append(k))
    headers = _role_headers(client, create_staff, "mgr_dip_1", "manager")

    res = client.post("/api/v1/tank-readings/dips", headers=headers, params=_dip_params("mgr_dip_1"))
    assert res.status_code == 200, res.text
    data = res.json()

    stored = saved["tank_readings.json"][data["reading_id"]]
    assert "delegated_by" not in stored
    assert notified == []


def test_attendant_cannot_record_dips_with_or_without_reason(client, create_staff, monkeypatch):
    _isolate(monkeypatch)
    headers = _role_headers(client, create_staff, "att_dip_1", "user")

    res = client.post("/api/v1/tank-readings/dips", headers=headers, params=_dip_params(
        "att_dip_1", delegate_reason="I am covering for everyone"))
    assert res.status_code == 403
