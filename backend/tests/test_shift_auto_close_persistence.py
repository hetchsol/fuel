"""
check_and_close_stale_shifts mutates shift status in memory at server
startup. Without an immediate save, a restart shortly afterward (idle
spin-down, a redeploy, a crash) loses that mutation entirely: the next
startup reads the shift back as still 'active' and re-closes + re-logs it,
producing duplicate audit entries with an ever-growing "hours active"
figure for the same shift instead of a single, durable close.
"""
from datetime import datetime, timedelta

import app.database.storage as storage_module
from app.services.shift_auto_close import check_and_close_stale_shifts


def test_persists_immediately_when_a_shift_is_closed(monkeypatch):
    # Staleness is measured in business hours (see business_hours.py), not
    # wall-clock, so a short offset isn't reliably safe — e.g. "2 days back"
    # can land on a Sunday, which contributes zero business hours and can
    # leave the total under the 20h threshold depending on what day the
    # suite happens to run. 10 days back guarantees several full working
    # days (at most 2 Sundays skipped) regardless of calendar alignment.
    stale_start = (datetime.now() - timedelta(days=10)).strftime("%Y-%m-%d")
    storage = {
        "shifts": {
            "S1": {"status": "active", "date": stale_start, "shift_type": "Day"},
        },
        "tanks": {},
    }
    saved_for = []
    monkeypatch.setattr(storage_module, "save_station_storage", lambda sid: saved_for.append(sid))

    closed = check_and_close_stale_shifts(storage, "ST001")

    assert closed == ["S1"]
    assert storage["shifts"]["S1"]["status"] == "auto-closed"
    assert saved_for == ["ST001"], "must persist immediately, not defer to shutdown/next-request flush"


def test_does_not_save_when_nothing_is_stale(monkeypatch):
    today = datetime.now().strftime("%Y-%m-%d")
    storage = {
        "shifts": {
            "S1": {"status": "active", "date": today, "shift_type": "Day"},
        },
        "tanks": {},
    }
    saved_for = []
    monkeypatch.setattr(storage_module, "save_station_storage", lambda sid: saved_for.append(sid))

    closed = check_and_close_stale_shifts(storage, "ST001")

    assert closed == []
    assert saved_for == []
