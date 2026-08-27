"""
Regression tests for get_station_context()'s manager test-station exception.

Before this feature: a user with their own station_id set had it win
outright, full stop — the X-Station-Id header was completely ignored for
any non-owner role. The one new exception is narrow and deliberate: a
manager may additionally reach a station explicitly flagged
is_test_station, and only that — never an arbitrary other station, and
never for supervisor/attendant roles. Owner behavior is untouched.

Calls get_station_context() directly (bypassing the FastAPI Depends
machinery, which doesn't matter for a plain dict + header value) rather
than round-tripping through TestClient, so the resolved station_id is
asserted precisely instead of inferred from HTTP status codes.
"""
import asyncio

import app.api.v1.auth as auth_module
from app.api.v1.auth import get_station_context


def _run(coro):
    return asyncio.run(coro)


def _isolate(monkeypatch, stations: dict):
    monkeypatch.setattr(auth_module, "get_station_storage", lambda sid: {"_station": sid})
    import app.database.stations_registry as registry
    monkeypatch.setattr(registry, "STATIONS", stations)


def test_manager_reaches_flagged_test_station_via_header(monkeypatch):
    stations = {"ST-TEST": {"station_id": "ST-TEST", "is_test_station": True, "status": "active"}}
    _isolate(monkeypatch, stations)

    ctx = _run(get_station_context(
        current_user={"username": "mgr1", "role": "manager", "station_id": "ST001"},
        x_station_id="ST-TEST",
    ))
    assert ctx["station_id"] == "ST-TEST"


def test_manager_cannot_reach_unflagged_station_via_header(monkeypatch):
    stations = {"ST999X": {"station_id": "ST999X", "is_test_station": False, "status": "active"}}
    _isolate(monkeypatch, stations)

    ctx = _run(get_station_context(
        current_user={"username": "mgr1", "role": "manager", "station_id": "ST001"},
        x_station_id="ST999X",
    ))
    # Own station wins — header silently ignored, exactly like before this feature.
    assert ctx["station_id"] == "ST001"


def test_manager_cannot_reach_disabled_test_station(monkeypatch):
    stations = {"ST-TEST": {"station_id": "ST-TEST", "is_test_station": True, "status": "disabled"}}
    _isolate(monkeypatch, stations)

    ctx = _run(get_station_context(
        current_user={"username": "mgr1", "role": "manager", "station_id": "ST001"},
        x_station_id="ST-TEST",
    ))
    assert ctx["station_id"] == "ST001"


def test_manager_cannot_reach_unknown_station_id(monkeypatch):
    _isolate(monkeypatch, {})

    ctx = _run(get_station_context(
        current_user={"username": "mgr1", "role": "manager", "station_id": "ST001"},
        x_station_id="ST-DOES-NOT-EXIST",
    ))
    assert ctx["station_id"] == "ST001"


def test_supervisor_cannot_reach_flagged_test_station(monkeypatch):
    """The exception is manager-only — supervisor/attendant keep the original hard pin."""
    stations = {"ST-TEST": {"station_id": "ST-TEST", "is_test_station": True, "status": "active"}}
    _isolate(monkeypatch, stations)

    ctx = _run(get_station_context(
        current_user={"username": "sup1", "role": "supervisor", "station_id": "ST001"},
        x_station_id="ST-TEST",
    ))
    assert ctx["station_id"] == "ST001"


def test_attendant_cannot_reach_flagged_test_station(monkeypatch):
    stations = {"ST-TEST": {"station_id": "ST-TEST", "is_test_station": True, "status": "active"}}
    _isolate(monkeypatch, stations)

    ctx = _run(get_station_context(
        current_user={"username": "att1", "role": "user", "station_id": "ST001"},
        x_station_id="ST-TEST",
    ))
    assert ctx["station_id"] == "ST001"


def test_owner_unrestricted_as_before(monkeypatch):
    """Owner (station_id=None) still trusts the header unconditionally — unchanged."""
    stations = {"ST-TEST": {"station_id": "ST-TEST", "is_test_station": True, "status": "active"}}
    _isolate(monkeypatch, stations)

    ctx = _run(get_station_context(
        current_user={"username": "owner1", "role": "owner", "station_id": None},
        x_station_id="ST999X-ANYTHING",
    ))
    assert ctx["station_id"] == "ST999X-ANYTHING"


def test_manager_own_station_still_default_with_no_header(monkeypatch):
    _isolate(monkeypatch, {})

    ctx = _run(get_station_context(
        current_user={"username": "mgr1", "role": "manager", "station_id": "ST001"},
        x_station_id=None,
    ))
    assert ctx["station_id"] == "ST001"
