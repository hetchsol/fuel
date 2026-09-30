"""
Regression tests for two related fixes to /handover/void:

1. Voiding used to match by (shift_id, attendant_id) only, so a duplicate
   handover could never be discarded without also reprocessing (and
   reversing stock/credit effects on) a sibling, already-approved handover
   for the same attendant+shift. Void now accepts an optional handover_id
   to scope the action to exactly one record.

2. Voiding never re-checked whether the shift could now advance to
   'completed' (every other resolving action — approve, batch-approve,
   unvoid-to-approved — does). A voided handover counts as "resolved" for
   shift completion, so void must trigger the same re-check.

Handover/side-effect storage is monkeypatched so the test stays isolated —
same style as tests/test_handover_review.py.
"""
import app.api.v1.attendant_handover as ah


def _isolate(monkeypatch, handovers, advance_calls):
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: handovers)
    monkeypatch.setattr(ah, "_save_handovers", lambda data, sid: handovers.update(data))
    monkeypatch.setattr(ah, "load_station_json", lambda sid, fn, default=None: {})
    monkeypatch.setattr(ah, "save_station_storage", lambda sid: None)
    monkeypatch.setattr(ah, "create_notification", lambda *a, **k: None)
    monkeypatch.setattr(ah, "log_audit_event", lambda *a, **k: None)
    monkeypatch.setattr(ah, "_load_enter_readings", lambda sid: {})
    monkeypatch.setattr(ah, "_save_enter_readings", lambda data, sid: None)
    monkeypatch.setattr(ah, "reverse_handover_sales", lambda *a, **k: (_ for _ in ()).throw(
        AssertionError("reverse_handover_sales should not run on the untouched sibling")))
    monkeypatch.setattr(ah, "_clear_daily_entries_stores_applied", lambda *a, **k: (_ for _ in ()).throw(
        AssertionError("stock clear should not run on the untouched sibling")))
    monkeypatch.setattr(ah, "advance_shift_on_approval",
                         lambda shift_id, sid, storage, performed_by: advance_calls.append(shift_id) or False)


def _handovers_fixture():
    return {
        "HO-APPROVED": {
            "handover_id": "HO-APPROVED",
            "shift_id": "S1",
            "date": "2026-08-24",
            "phase": "completed",
            "review_status": "approved",
            "attendant_id": "STF009",
            "attendant_name": "Sharon Mulemwa",
            "stock_applied": False,  # kept False so the assertion-raising stubs above prove it's never touched
        },
        "HO-DUPLICATE": {
            "handover_id": "HO-DUPLICATE",
            "shift_id": "S1",
            "date": "2026-08-24",
            "phase": "completed",
            "review_status": "returned",
            "status": "reopened",
            "attendant_id": "STF009",
            "attendant_name": "Sharon Mulemwa",
        },
    }


def test_void_with_handover_id_touches_only_that_record(client, owner_headers, monkeypatch):
    handovers = _handovers_fixture()
    advance_calls = []
    _isolate(monkeypatch, handovers, advance_calls)

    res = client.post("/api/v1/handover/void", headers=owner_headers, json={
        "shift_id": "S1",
        "attendant_id": "STF009",
        "handover_id": "HO-DUPLICATE",
        "note": "Duplicate submission, never resubmitted",
    })

    assert res.status_code == 200, res.text
    assert res.json()["voided_handover_ids"] == ["HO-DUPLICATE"]
    assert handovers["HO-DUPLICATE"]["review_status"] == "voided"
    # The sibling approved entry must be completely untouched.
    assert handovers["HO-APPROVED"]["review_status"] == "approved"
    # advance_shift_on_approval must be re-checked after a void.
    assert advance_calls == ["S1"]


def test_void_without_handover_id_still_voids_all_matching_entries(client, owner_headers, monkeypatch):
    """Backward-compat: omitting handover_id keeps the original all-in-one behavior."""
    handovers = _handovers_fixture()
    handovers["HO-APPROVED"]["stock_applied"] = False  # avoid the reverse-sales stub's assertion path
    advance_calls = []
    _isolate(monkeypatch, handovers, advance_calls)

    res = client.post("/api/v1/handover/void", headers=owner_headers, json={
        "shift_id": "S1",
        "attendant_id": "STF009",
        "note": "Wrong assignment for this attendant on this shift",
    })

    assert res.status_code == 200, res.text
    assert set(res.json()["voided_handover_ids"]) == {"HO-APPROVED", "HO-DUPLICATE"}
    assert handovers["HO-APPROVED"]["review_status"] == "voided"
    assert handovers["HO-DUPLICATE"]["review_status"] == "voided"
    assert advance_calls == ["S1"]


def test_void_unknown_handover_id_404s_without_touching_sibling(client, owner_headers, monkeypatch):
    handovers = _handovers_fixture()
    advance_calls = []
    _isolate(monkeypatch, handovers, advance_calls)

    res = client.post("/api/v1/handover/void", headers=owner_headers, json={
        "shift_id": "S1",
        "attendant_id": "STF009",
        "handover_id": "HO-NOT-REAL",
        "note": "typo'd id",
    })

    assert res.status_code == 404
    assert handovers["HO-APPROVED"]["review_status"] == "approved"
    assert handovers["HO-DUPLICATE"]["review_status"] == "returned"
    assert advance_calls == []


# ── Fix 3: the shared AR-{shift}-{attendant}-O/C record must only be tagged
# voided when the handover(s) just voided include whichever one is most
# recent for the pair — every submission path overwrites that same key
# unconditionally, so its current content always belongs to the most
# recently created handover, never an earlier one. ──

def _isolate_with_readings(monkeypatch, handovers, readings_db, advance_calls):
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: handovers)
    monkeypatch.setattr(ah, "_save_handovers", lambda data, sid: handovers.update(data))
    monkeypatch.setattr(ah, "load_station_json", lambda sid, fn, default=None: {})
    monkeypatch.setattr(ah, "save_station_storage", lambda sid: None)
    monkeypatch.setattr(ah, "create_notification", lambda *a, **k: None)
    monkeypatch.setattr(ah, "log_audit_event", lambda *a, **k: None)
    monkeypatch.setattr(ah, "_load_enter_readings", lambda sid: readings_db)
    monkeypatch.setattr(ah, "_save_enter_readings", lambda data, sid: readings_db.update(data))
    monkeypatch.setattr(ah, "reverse_handover_sales", lambda *a, **k: None)
    monkeypatch.setattr(ah, "_clear_daily_entries_stores_applied", lambda *a, **k: None)
    monkeypatch.setattr(ah, "advance_shift_on_approval",
                         lambda shift_id, sid, storage, performed_by: advance_calls.append(shift_id) or False)


def _handovers_with_timestamps():
    return {
        "HO-EARLY": {
            "handover_id": "HO-EARLY", "shift_id": "S1", "date": "2026-08-24",
            "phase": "completed", "review_status": "approved",
            "attendant_id": "STF009", "attendant_name": "Sharon Mulemwa",
            "created_at": "2026-08-24T10:08:55",
        },
        "HO-LATE": {
            "handover_id": "HO-LATE", "shift_id": "S1", "date": "2026-08-24",
            "phase": "completed", "review_status": "returned",
            "attendant_id": "STF009", "attendant_name": "Sharon Mulemwa",
            "created_at": "2026-08-24T19:23:18",
        },
    }


def _ar_records():
    return {
        "AR-S1-STF009-O": {"nozzle_readings": []},
        "AR-S1-STF009-C": {"nozzle_readings": []},
    }


def test_voiding_the_most_recent_handover_tags_the_shared_ar_record(monkeypatch, client, owner_headers):
    handovers = _handovers_with_timestamps()
    readings_db = _ar_records()
    advance_calls = []
    _isolate_with_readings(monkeypatch, handovers, readings_db, advance_calls)

    res = client.post("/api/v1/handover/void", headers=owner_headers, json={
        "shift_id": "S1", "attendant_id": "STF009", "handover_id": "HO-LATE",
        "note": "This is the most recent one - its data is what's in the shared record",
    })

    assert res.status_code == 200, res.text
    assert readings_db["AR-S1-STF009-O"]["voided"] is True
    assert readings_db["AR-S1-STF009-C"]["voided"] is True


def test_voiding_an_older_handover_does_not_touch_a_newer_survivors_data(monkeypatch, client, owner_headers):
    # HO-EARLY is being voided (it turned out to be wrong), but HO-LATE
    # survives untouched and is the one whose data currently occupies the
    # shared AR record. Tagging it voided here would mislabel HO-LATE's
    # real, current reading data as voided.
    handovers = _handovers_with_timestamps()
    readings_db = _ar_records()
    advance_calls = []
    _isolate_with_readings(monkeypatch, handovers, readings_db, advance_calls)

    res = client.post("/api/v1/handover/void", headers=owner_headers, json={
        "shift_id": "S1", "attendant_id": "STF009", "handover_id": "HO-EARLY",
        "note": "This one turned out to be wrong, but HO-LATE is the real, surviving entry",
    })

    assert res.status_code == 200, res.text
    assert "voided" not in readings_db["AR-S1-STF009-O"]
    assert "voided" not in readings_db["AR-S1-STF009-C"]
    assert handovers["HO-LATE"]["review_status"] == "returned"  # untouched


def test_voiding_the_only_handover_still_tags_the_shared_record(monkeypatch, client, owner_headers):
    handovers = {
        "HO-ONLY": {
            "handover_id": "HO-ONLY", "shift_id": "S1", "date": "2026-08-24",
            "phase": "completed", "review_status": "submitted",
            "attendant_id": "STF009", "attendant_name": "Sharon Mulemwa",
            "created_at": "2026-08-24T10:08:55",
        },
    }
    readings_db = _ar_records()
    advance_calls = []
    _isolate_with_readings(monkeypatch, handovers, readings_db, advance_calls)

    res = client.post("/api/v1/handover/void", headers=owner_headers, json={
        "shift_id": "S1", "attendant_id": "STF009",
        "note": "Only entry - definitely a mistake shift",
    })

    assert res.status_code == 200, res.text
    assert readings_db["AR-S1-STF009-O"]["voided"] is True
    assert readings_db["AR-S1-STF009-C"]["voided"] is True
