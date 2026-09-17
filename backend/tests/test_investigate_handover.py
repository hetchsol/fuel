"""
GET /daily-close-off/investigate/{handover_id} gathers every signal that can
explain a handover's cash reconciliation into one place, plus a synthesized
plain-language "possible_causes" list built from whichever signals actually
apply to this handover.
"""
import app.api.v1.daily_close_off as dco
import app.api.v1.attendant_handover as ah


def _base_handover(**overrides):
    handover = {
        "handover_id": "HO-1", "attendant_name": "Jane", "date": "2026-09-17",
        "shift_type": "Day", "review_status": "flagged",
        "total_expected": 1000.0, "fuel_revenue": 1000.0,
        "lpg_sales": 0, "lubricant_sales": 0, "accessory_sales": 0,
        "expected_cash": 1000.0, "actual_cash": 1000.0,
        "pos_receipts": 0.0, "credit_sales": 0.0, "difference": 0.0,
        "nozzle_summaries": [{"nozzle_id": "N1", "revenue": 1000.0}],
        "auto_flag_reasons": [],
        "credit_sale_details": [],
    }
    handover.update(overrides)
    return handover


def _isolate(monkeypatch, handover, tank_details=None):
    monkeypatch.setattr(dco, "_load_handovers", lambda sid: {"HO-1": handover})
    monkeypatch.setattr(ah, "_compute_tank_nozzle_variance",
                         lambda *a, **k: ([], tank_details or {"status": "no_nozzle_data"}))


def test_404_for_unknown_handover(client, owner_headers, monkeypatch):
    monkeypatch.setattr(dco, "_load_handovers", lambda sid: {})
    res = client.get("/api/v1/daily-close-off/investigate/does-not-exist", headers=owner_headers)
    assert res.status_code == 404


def test_no_issues_gives_generic_message(client, owner_headers, monkeypatch):
    handover = _base_handover()
    _isolate(monkeypatch, handover)

    res = client.get("/api/v1/daily-close-off/investigate/HO-1", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["figures"]["difference"] == 0.0
    assert "genuine cash-handling variance" in data["possible_causes"][0]


def test_duplicate_reading_flag_surfaces_conflict_and_note(client, owner_headers, monkeypatch):
    handover = _base_handover(nozzle_summaries=[
        {"nozzle_id": "N1", "fuel_type": "Diesel", "volume_sold": 100.0, "revenue": 1000.0,
         "price_per_liter": 10.0, "duplicate_reading_flagged": True,
         "duplicate_reading_conflict_shift_id": "2026-09-16-Night",
         "duplicate_reading_note": "Meter was replaced overnight"},
    ])
    _isolate(monkeypatch, handover)

    res = client.get("/api/v1/daily-close-off/investigate/HO-1", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    causes_text = " ".join(data["possible_causes"])
    assert "2026-09-16-Night" in causes_text
    assert "Meter was replaced overnight" in causes_text
    assert data["nozzle_detail"][0]["duplicate_reading_flagged"] is True


def test_revenue_gap_between_handover_and_nozzle_sum_is_flagged(client, owner_headers, monkeypatch):
    # Mirrors the real case found this session: fuel_revenue on the handover
    # (116,790.67 in that instance) didn't match the nozzle summaries' own
    # revenue sum — here scaled down but the same shape of mismatch.
    handover = _base_handover(
        total_expected=900.0, fuel_revenue=900.0,
        nozzle_summaries=[{"nozzle_id": "N1", "revenue": 1000.0}],
    )
    _isolate(monkeypatch, handover)

    res = client.get("/api/v1/daily-close-off/investigate/HO-1", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["figures"]["nozzle_revenue_sum"] == 1000.0
    causes_text = " ".join(data["possible_causes"])
    assert "doesn't match the sum of its own nozzle" in causes_text


def test_reconciliation_adjustment_is_surfaced_as_a_cause(client, owner_headers, monkeypatch):
    handover = _base_handover(
        actual_cash=1000.0, credit_sales=150.0, expected_cash=850.0, difference=150.0,
        reconciliation_adjustments=[{
            "type": "credit_sale", "description": "1 credit sale(s) added",
            "amount": 150.0, "difference_before": 0.0, "difference_after": 150.0,
            "performed_by": "manager1", "performed_at": "2026-09-17T08:00:00",
        }],
    )
    _isolate(monkeypatch, handover)

    res = client.get("/api/v1/daily-close-off/investigate/HO-1", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    causes_text = " ".join(data["possible_causes"])
    assert "manager1" in causes_text
    assert "K0.00 to K150.00" in causes_text


def test_tank_variance_failure_is_surfaced(client, owner_headers, monkeypatch):
    handover = _base_handover()
    tank_details = {"tanks": {"TANK1": {
        "status": "FAIL", "nozzle_total": 2322.35, "tank_movement": 2100.0,
        "variance": 222.35, "variance_percent": 10.6, "calibration_status": "current",
    }}}
    _isolate(monkeypatch, handover, tank_details)

    res = client.get("/api/v1/daily-close-off/investigate/HO-1", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    causes_text = " ".join(data["possible_causes"])
    assert "TANK1" in causes_text
    assert "10.6%" in causes_text
