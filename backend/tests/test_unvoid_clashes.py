"""
Un-void must never bring an entry back if that would count sales twice.

All checks run before anything is restored; the owner gets the full list and
decides which entry is right. Pins: live replacement entry, POS slip now on
another attendant's handover, coupon re-recorded elsewhere, several voided
entries coming back at once, check_only changes nothing, and a clean un-void
still works.
"""
import app.api.v1.attendant_handover as ah
from app.database.storage import get_station_storage

SHIFT = "2026-10-01-Day"


def _ho(hid, attendant="ATT-A", name="Ann", status="voided", pre="submitted", slips=(), **extra):
    return {"handover_id": hid, "shift_id": SHIFT, "date": "2026-10-01", "attendant_id": attendant,
            "attendant_name": name, "review_status": status, "pre_void_review_status": pre,
            "phase": "completed", "created_at": "2026-10-01T18:00:00",
            "pos_breakdown": [{"id": f"{hid}-{r}", "type_id": "VISA", "type_name": "Visa",
                               "amount": 100, "reference": r} for r in slips], **extra}


def _patch(monkeypatch, handovers, sales=None):
    storage = get_station_storage("ST001")
    storage["credit_sales"] = sales or []
    storage["accounts"] = {"ACC-A": {"account_id": "ACC-A", "account_name": "Alpha Transport", "balance": 0}}
    storage["shifts"] = {}
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: handovers)
    monkeypatch.setattr(ah, "_save_handovers", lambda data, sid: handovers.update(data))
    monkeypatch.setattr(ah, "load_station_json", lambda sid, fn, default=None: {})
    monkeypatch.setattr(ah, "save_station_storage", lambda sid: None)
    monkeypatch.setattr(ah, "create_notification", lambda *a, **k: None)
    monkeypatch.setattr(ah, "log_audit_event", lambda *a, **k: None)
    monkeypatch.setattr(ah, "_load_enter_readings", lambda sid: {})
    monkeypatch.setattr(ah, "_save_enter_readings", lambda data, sid: None)
    monkeypatch.setattr(ah, "_apply_handover_stock", lambda *a, **k: None)
    monkeypatch.setattr(ah, "advance_shift_on_approval", lambda *a, **k: None)
    return storage


def _unvoid(client, headers, **extra):
    return client.post("/api/v1/handover/unvoid", headers=headers,
                       json={"shift_id": SHIFT, "attendant_id": "ATT-A", **extra})


def test_refused_when_attendant_already_has_a_live_replacement(client, owner_headers, monkeypatch):
    handovers = {"HO-OLD": _ho("HO-OLD"), "HO-NEW": _ho("HO-NEW", status="submitted")}
    _patch(monkeypatch, handovers)
    res = _unvoid(client, owner_headers)
    assert res.status_code == 409
    kinds = [c["kind"] for c in res.json()["detail"]["clashes"]]
    assert kinds == ["live_replacement"]
    assert handovers["HO-OLD"]["review_status"] == "voided"      # nothing restored


def test_refused_when_a_slip_is_now_on_another_attendants_handover(client, owner_headers, monkeypatch):
    handovers = {"HO-OLD": _ho("HO-OLD", slips=["SLIP-7"]),
                 "HO-BEN": _ho("HO-BEN", attendant="ATT-B", name="Ben", status="submitted", slips=["slip-7"])}
    _patch(monkeypatch, handovers)
    res = _unvoid(client, owner_headers)
    assert res.status_code == 409
    clash = res.json()["detail"]["clashes"][0]
    assert clash["kind"] == "pos_reference" and "Ben" in clash["message"]
    assert handovers["HO-OLD"]["review_status"] == "voided"


def test_refused_when_a_coupon_was_recorded_again_elsewhere(client, owner_headers, monkeypatch):
    handovers = {"HO-OLD": _ho("HO-OLD")}
    sales = [
        {"sale_id": "CS-HO-HO-OLD-0", "account_id": "ACC-A", "shift_id": SHIFT, "date": "2026-10-01",
         "fuel_type": "Diesel", "volume": 4, "amount": 100, "coupon_serial": "C1", "voided": True},
        {"sale_id": "CS-NEW", "account_id": "ACC-A", "shift_id": SHIFT, "date": "2026-10-01",
         "fuel_type": "Diesel", "volume": 4, "amount": 100, "coupon_serial": "C1", "voided": False,
         "attendant_id": "ATT-B", "attendant_name": "Ben"},
    ]
    storage = _patch(monkeypatch, handovers, sales)
    res = _unvoid(client, owner_headers)
    assert res.status_code == 409
    clash = res.json()["detail"]["clashes"][0]
    assert clash["kind"] == "credit_coupon" and "Ben" in clash["message"]
    assert storage["credit_sales"][0]["voided"] is True          # not re-charged


def test_several_voided_entries_must_be_restored_one_at_a_time(client, owner_headers, monkeypatch):
    handovers = {"HO-1": _ho("HO-1"), "HO-2": _ho("HO-2")}
    _patch(monkeypatch, handovers)
    res = _unvoid(client, owner_headers)
    assert res.status_code == 409
    clash = res.json()["detail"]["clashes"][0]
    assert clash["kind"] == "multiple_entries"
    assert {c["handover_id"] for c in clash["candidates"]} == {"HO-1", "HO-2"}

    ok = _unvoid(client, owner_headers, handover_id="HO-2")
    assert ok.status_code == 200, ok.text
    assert handovers["HO-2"]["review_status"] == "submitted"
    assert handovers["HO-1"]["review_status"] == "voided"


def test_check_only_reports_without_changing_anything(client, owner_headers, monkeypatch):
    handovers = {"HO-OLD": _ho("HO-OLD"), "HO-NEW": _ho("HO-NEW", status="submitted")}
    _patch(monkeypatch, handovers)
    res = _unvoid(client, owner_headers, check_only=True)
    assert res.status_code == 200
    body = res.json()
    assert body["can_unvoid"] is False and body["clashes"][0]["kind"] == "live_replacement"
    assert handovers["HO-OLD"]["review_status"] == "voided"


def test_clean_unvoid_still_restores(client, owner_headers, monkeypatch):
    handovers = {"HO-OLD": _ho("HO-OLD", slips=["SLIP-1"])}
    _patch(monkeypatch, handovers)
    check = _unvoid(client, owner_headers, check_only=True).json()
    assert check["can_unvoid"] is True and check["clashes"] == []
    res = _unvoid(client, owner_headers)
    assert res.status_code == 200, res.text
    assert handovers["HO-OLD"]["review_status"] == "submitted"


def test_entry_that_was_already_superseded_is_not_treated_as_coming_back_live(client, owner_headers, monkeypatch):
    # It was replaced before it was voided, so restoring it doesn't create a second live entry.
    handovers = {"HO-OLD": _ho("HO-OLD", pre="superseded", superseded_by="HO-NEW"),
                 "HO-NEW": _ho("HO-NEW", status="submitted")}
    _patch(monkeypatch, handovers)
    assert _unvoid(client, owner_headers, check_only=True).json()["can_unvoid"] is True
