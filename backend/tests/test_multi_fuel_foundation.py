"""
Chunk 1 (Foundation) regression tests for the multi-fuel nozzle refactor.

These tests cover Categories A (legacy single-fuel preserved) and B (migration)
from Multi_Fuel_Nozzles_Plan.html Section 10. They guarantee that:

  1. The new nozzle.tank_id field is read first when present, with a transparent
     fallback to pump_station.tank_id for legacy data.
  2. The propagation migration is idempotent and partial-failure-safe.
  3. Stations that don't deliberately use multi-fuel features see no behavioural
     change.

No HTTP layer here — these are unit-level tests against the pure helpers and
the migration function so they are fast and deterministic.
"""
import copy
import pytest

from app.database.storage import (
    get_tank_id_for_nozzle,
    get_nozzle_ids_for_tank,
)
from app.database.seed_defaults import _migrate_nozzles_propagate_tank_id


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _legacy_storage():
    """A station as it would look BEFORE the migration runs:
    pump.tank_id is set, no nozzle has a tank_id yet."""
    return {
        "islands": {
            "ISL-001": {
                "island_id": "ISL-001",
                "product_type": "Diesel",
                "pump_station": {
                    "pump_station_id": "PS-001",
                    "island_id": "ISL-001",
                    "tank_id": "TANK-DIESEL-1",
                    "nozzles": [
                        {"nozzle_id": "NZ-001", "fuel_type": "Diesel"},
                        {"nozzle_id": "NZ-002", "fuel_type": "Diesel"},
                    ],
                },
            },
            "ISL-002": {
                "island_id": "ISL-002",
                "product_type": "Petrol",
                "pump_station": {
                    "pump_station_id": "PS-002",
                    "island_id": "ISL-002",
                    "tank_id": "TANK-PETROL-1",
                    "nozzles": [
                        {"nozzle_id": "NZ-003", "fuel_type": "Petrol"},
                    ],
                },
            },
        }
    }


def _migrated_storage():
    """Same data after _migrate_nozzles_propagate_tank_id ran cleanly."""
    s = _legacy_storage()
    _migrate_nozzles_propagate_tank_id(s)
    return s


# ---------------------------------------------------------------------------
# Category A — Legacy single-fuel station behaviour preserved
# ---------------------------------------------------------------------------

class TestLegacyResolutionFallback:
    """Without nozzle.tank_id, helpers must fall back to pump.tank_id transparently."""

    def test_get_tank_id_returns_pump_fallback_for_legacy_nozzle(self):
        s = _legacy_storage()
        # Nozzle has no tank_id; helper falls back to pump's TANK-DIESEL-1
        assert get_tank_id_for_nozzle(nozzle_id="NZ-001", storage=s) == "TANK-DIESEL-1"
        assert get_tank_id_for_nozzle(nozzle_id="NZ-003", storage=s) == "TANK-PETROL-1"

    def test_get_nozzle_ids_for_tank_includes_legacy_fallback_nozzles(self):
        s = _legacy_storage()
        diesel_nozzles = get_nozzle_ids_for_tank(tank_id="TANK-DIESEL-1", storage=s)
        assert sorted(diesel_nozzles) == ["NZ-001", "NZ-002"]
        petrol_nozzles = get_nozzle_ids_for_tank(tank_id="TANK-PETROL-1", storage=s)
        assert petrol_nozzles == ["NZ-003"]

    def test_get_tank_id_returns_none_for_unknown_nozzle(self):
        s = _legacy_storage()
        assert get_tank_id_for_nozzle(nozzle_id="DOES-NOT-EXIST", storage=s) is None


class TestExplicitNozzleTankWins:
    """When nozzle.tank_id is set, it overrides the pump's value."""

    def test_explicit_nozzle_tank_takes_priority_over_pump(self):
        s = _legacy_storage()
        # Wire NZ-001 to a different diesel tank (the multi-tank load-balancing case)
        s["islands"]["ISL-001"]["pump_station"]["nozzles"][0]["tank_id"] = "TANK-DIESEL-2"
        assert get_tank_id_for_nozzle(nozzle_id="NZ-001", storage=s) == "TANK-DIESEL-2"
        # Sibling nozzle still inherits from pump
        assert get_tank_id_for_nozzle(nozzle_id="NZ-002", storage=s) == "TANK-DIESEL-1"

    def test_reverse_lookup_respects_explicit_assignment(self):
        s = _legacy_storage()
        s["islands"]["ISL-001"]["pump_station"]["nozzles"][0]["tank_id"] = "TANK-DIESEL-2"
        # NZ-001 is now on TANK-DIESEL-2; NZ-002 still inherits TANK-DIESEL-1
        assert get_nozzle_ids_for_tank(tank_id="TANK-DIESEL-1", storage=s) == ["NZ-002"]
        assert get_nozzle_ids_for_tank(tank_id="TANK-DIESEL-2", storage=s) == ["NZ-001"]


# ---------------------------------------------------------------------------
# Category B — Migration
# ---------------------------------------------------------------------------

class TestMigrationPropagatesTankId:

    def test_first_run_stamps_every_legacy_nozzle(self):
        s = _legacy_storage()
        migrated = _migrate_nozzles_propagate_tank_id(s)
        assert migrated == 3  # 2 diesel nozzles + 1 petrol nozzle
        nozzles = (
            s["islands"]["ISL-001"]["pump_station"]["nozzles"]
            + s["islands"]["ISL-002"]["pump_station"]["nozzles"]
        )
        for n in nozzles:
            assert n["tank_id"] is not None
        # Spot-check assignments
        assert s["islands"]["ISL-001"]["pump_station"]["nozzles"][0]["tank_id"] == "TANK-DIESEL-1"
        assert s["islands"]["ISL-002"]["pump_station"]["nozzles"][0]["tank_id"] == "TANK-PETROL-1"

    def test_second_run_is_a_noop(self):
        """Idempotency: running migration twice never re-stamps."""
        s = _migrated_storage()
        migrated_again = _migrate_nozzles_propagate_tank_id(s)
        assert migrated_again == 0

    def test_migration_never_overwrites_existing_assignment(self):
        """If a nozzle already has tank_id (e.g. owner used preset endpoint), leave it."""
        s = _legacy_storage()
        s["islands"]["ISL-001"]["pump_station"]["nozzles"][0]["tank_id"] = "TANK-DIESEL-2"
        _migrate_nozzles_propagate_tank_id(s)
        # Explicit assignment preserved
        assert s["islands"]["ISL-001"]["pump_station"]["nozzles"][0]["tank_id"] == "TANK-DIESEL-2"
        # Sibling without explicit tank_id gets inherited from pump
        assert s["islands"]["ISL-001"]["pump_station"]["nozzles"][1]["tank_id"] == "TANK-DIESEL-1"

    def test_partial_failure_recovery(self):
        """Simulate kill -9 mid-migration: some nozzles stamped, others not.
        Re-running completes the rest without disturbing already-stamped ones."""
        s = _legacy_storage()
        # Manually stamp half of them, as if migration died after the first nozzle
        s["islands"]["ISL-001"]["pump_station"]["nozzles"][0]["tank_id"] = "TANK-DIESEL-1"
        # Now migration runs again — must complete the rest, not double-stamp
        migrated = _migrate_nozzles_propagate_tank_id(s)
        assert migrated == 2  # the two unstamped nozzles
        # Every nozzle is now stamped
        for island in s["islands"].values():
            for nozzle in island["pump_station"]["nozzles"]:
                assert nozzle.get("tank_id")

    def test_migration_skips_pump_with_no_tank_id(self):
        """Malformed data: pump has no tank_id. Migration logs and skips."""
        s = _legacy_storage()
        # Wipe pump's tank_id to simulate malformed data
        s["islands"]["ISL-001"]["pump_station"]["tank_id"] = None
        migrated = _migrate_nozzles_propagate_tank_id(s)
        # Only ISL-002's one nozzle was migratable
        assert migrated == 1
        # ISL-001 nozzles still have no tank_id
        for nozzle in s["islands"]["ISL-001"]["pump_station"]["nozzles"]:
            assert nozzle.get("tank_id") is None

    def test_migration_handles_island_with_no_pump_station(self):
        """Edge case: orphaned island with no pump_station shouldn't crash the migration."""
        s = _legacy_storage()
        s["islands"]["ISL-003"] = {"island_id": "ISL-003", "pump_station": None}
        migrated = _migrate_nozzles_propagate_tank_id(s)
        assert migrated == 3  # original 3 still migrated; ISL-003 ignored

    def test_migration_returns_zero_for_empty_storage(self):
        assert _migrate_nozzles_propagate_tank_id({}) == 0
        assert _migrate_nozzles_propagate_tank_id({"islands": {}}) == 0


# ---------------------------------------------------------------------------
# Category C (lite) — End-to-end round-trip
# ---------------------------------------------------------------------------

class TestRoundTrip:
    """After migration, helpers behave identically to before for legacy data,
    and gain new behaviour for explicitly-assigned nozzles."""

    def test_helper_results_unchanged_for_pre_migrated_legacy_station(self):
        legacy = _legacy_storage()
        migrated = copy.deepcopy(legacy)
        _migrate_nozzles_propagate_tank_id(migrated)

        # Same answers from both stores for every nozzle
        for nozzle_id in ("NZ-001", "NZ-002", "NZ-003"):
            assert (
                get_tank_id_for_nozzle(nozzle_id=nozzle_id, storage=legacy)
                == get_tank_id_for_nozzle(nozzle_id=nozzle_id, storage=migrated)
            )

        # Same reverse lookups
        for tank_id in ("TANK-DIESEL-1", "TANK-PETROL-1"):
            assert (
                sorted(get_nozzle_ids_for_tank(tank_id=tank_id, storage=legacy))
                == sorted(get_nozzle_ids_for_tank(tank_id=tank_id, storage=migrated))
            )
