"""
Chunk 4 — Naming convention refactor tests.

Verifies the per-fuel namespace label scheme with physical-slot lettering:
  - Single-fuel islands keep today's labels (LSD 1A, LSD 1B) — REGRESSION.
  - Mixed islands produce per-fuel labels using the nozzle's physical slot
    as the letter, regardless of fuel. So a mixed island with diesel in
    slot A and petrol in slot B yields LSD 3A + UNL 1B (assuming it's the
    3rd diesel island and the 1st petrol island).
  - Custom labels override the auto-computed display_label.
  - resolve_nozzle_display_to_internal works on mixed islands.

Test matrix entries: H1, H2, H3, H4.
"""
from app.services.naming_convention import (
    compute_display_labels,
    get_full_display_label,
    resolve_nozzle_display_to_internal,
)


# ---------------------------------------------------------------------------
# Fixture builders
# ---------------------------------------------------------------------------

def _make_island(island_id, nozzles, product_type=None):
    return {
        "island_id": island_id,
        "name": f"Island {island_id}",
        "status": "active",
        "product_type": product_type,
        "pump_station": {
            "pump_station_id": f"PS-{island_id[-3:]}",
            "island_id": island_id,
            "name": f"Pump {island_id}",
            "tank_id": None,
            "nozzles": nozzles,
        },
    }


def _nozzle(nozzle_id, fuel, custom_label=None):
    return {
        "nozzle_id": nozzle_id,
        "fuel_type": fuel,
        "status": "Active",
        "custom_label": custom_label,
    }


# ---------------------------------------------------------------------------
# H1 — Single-fuel island, two diesel nozzles (regression)
# ---------------------------------------------------------------------------

def test_H1_single_fuel_island_preserves_legacy_labels():
    islands = {
        "ISL-001": _make_island("ISL-001", [
            _nozzle("NZ-001", "Diesel"),
            _nozzle("NZ-002", "Diesel"),
        ], product_type="Diesel"),
    }
    compute_display_labels(islands)

    nozzles = islands["ISL-001"]["pump_station"]["nozzles"]
    assert nozzles[0]["display_label"] == "1A"
    assert nozzles[0]["fuel_type_abbrev"] == "LSD"
    assert nozzles[1]["display_label"] == "1B"
    assert nozzles[1]["fuel_type_abbrev"] == "LSD"

    # Single-fuel island: backward-compatible island-level fields
    assert islands["ISL-001"]["display_number"] == 1
    assert islands["ISL-001"]["fuel_type_abbrev"] == "LSD"


# ---------------------------------------------------------------------------
# H2 — Mixed island: physical-slot letters
# ---------------------------------------------------------------------------

def test_H2_mixed_island_uses_physical_slot_letters():
    """
    Single mixed island, slot A = Diesel, slot B = Petrol.
    Expected: LSD 1A (slot A) + UNL 1B (slot B). Letter follows physical slot,
    not 'first nozzle of this fuel on the island'.
    """
    islands = {
        "ISL-001": _make_island("ISL-001", [
            _nozzle("NZ-001", "Diesel"),
            _nozzle("NZ-002", "Petrol"),
        ], product_type="Mixed"),
    }
    compute_display_labels(islands)

    nozzles = islands["ISL-001"]["pump_station"]["nozzles"]
    assert nozzles[0]["display_label"] == "1A"
    assert nozzles[0]["fuel_type_abbrev"] == "LSD"
    assert nozzles[1]["display_label"] == "1B"  # slot B, not A — physical position
    assert nozzles[1]["fuel_type_abbrev"] == "UNL"

    # Mixed island has no single island-level number/abbrev
    assert islands["ISL-001"]["display_number"] is None
    assert islands["ISL-001"]["fuel_type_abbrev"] is None


# ---------------------------------------------------------------------------
# H3 — Multiple islands including a mixed one (the canonical example)
# ---------------------------------------------------------------------------

def test_H3_multiple_islands_with_one_mixed():
    """
    ISL-001: 2 diesel nozzles
    ISL-002: 2 diesel nozzles
    ISL-003: mixed (slot A diesel, slot B petrol)
    ISL-004: 2 petrol nozzles

    Expected labels:
      ISL-001 → LSD 1A, LSD 1B
      ISL-002 → LSD 2A, LSD 2B
      ISL-003 → LSD 3A (slot A, 3rd diesel island)
                UNL 1B (slot B, 1st petrol island — letter is B because slot B)
      ISL-004 → UNL 2A, UNL 2B
    """
    islands = {
        "ISL-001": _make_island("ISL-001", [
            _nozzle("NZ-1A", "Diesel"),
            _nozzle("NZ-1B", "Diesel"),
        ], product_type="Diesel"),
        "ISL-002": _make_island("ISL-002", [
            _nozzle("NZ-2A", "Diesel"),
            _nozzle("NZ-2B", "Diesel"),
        ], product_type="Diesel"),
        "ISL-003": _make_island("ISL-003", [
            _nozzle("NZ-3A", "Diesel"),
            _nozzle("NZ-3B", "Petrol"),
        ], product_type="Mixed"),
        "ISL-004": _make_island("ISL-004", [
            _nozzle("NZ-4A", "Petrol"),
            _nozzle("NZ-4B", "Petrol"),
        ], product_type="Petrol"),
    }
    compute_display_labels(islands)

    by_id = {}
    for island in islands.values():
        for n in island["pump_station"]["nozzles"]:
            by_id[n["nozzle_id"]] = n

    # Diesel namespace: islands 1, 2, 3 → numbered 1, 2, 3
    assert by_id["NZ-1A"]["display_label"] == "1A" and by_id["NZ-1A"]["fuel_type_abbrev"] == "LSD"
    assert by_id["NZ-1B"]["display_label"] == "1B"
    assert by_id["NZ-2A"]["display_label"] == "2A"
    assert by_id["NZ-2B"]["display_label"] == "2B"
    assert by_id["NZ-3A"]["display_label"] == "3A" and by_id["NZ-3A"]["fuel_type_abbrev"] == "LSD"

    # Petrol namespace: islands 3 (mixed), 4 → numbered 1, 2
    # The mixed island's petrol nozzle is in slot B → letter B → "1B"
    assert by_id["NZ-3B"]["display_label"] == "1B" and by_id["NZ-3B"]["fuel_type_abbrev"] == "UNL"
    assert by_id["NZ-4A"]["display_label"] == "2A"
    assert by_id["NZ-4B"]["display_label"] == "2B"

    # Island-level
    assert islands["ISL-001"]["display_number"] == 1
    assert islands["ISL-002"]["display_number"] == 2
    assert islands["ISL-003"]["display_number"] is None  # mixed
    assert islands["ISL-003"]["fuel_type_abbrev"] is None
    assert islands["ISL-004"]["display_number"] == 2  # 2nd petrol island
    assert islands["ISL-004"]["fuel_type_abbrev"] == "UNL"


# ---------------------------------------------------------------------------
# H4 — Custom labels preserved
# ---------------------------------------------------------------------------

def test_H4_custom_label_overrides_auto_label():
    islands = {
        "ISL-001": _make_island("ISL-001", [
            _nozzle("NZ-001", "Diesel", custom_label="Pump-Alpha"),
            _nozzle("NZ-002", "Diesel"),
        ], product_type="Diesel"),
    }
    compute_display_labels(islands)

    nozzles = islands["ISL-001"]["pump_station"]["nozzles"]
    assert nozzles[0]["display_label"] == "Pump-Alpha"
    assert nozzles[0]["fuel_type_abbrev"] == "LSD"
    assert nozzles[1]["display_label"] == "1B"


# ---------------------------------------------------------------------------
# Additional — physical-slot rule with 3 nozzles
# ---------------------------------------------------------------------------

def test_three_nozzle_island_diesel_diesel_petrol():
    """
    A 3-nozzle island where slots A and B are diesel and slot C is petrol.
    Expected: LSD 1A, LSD 1B, UNL 1C — the petrol nozzle takes letter C
    because that's its physical slot, not 'A' for being first petrol.
    """
    islands = {
        "ISL-001": _make_island("ISL-001", [
            _nozzle("NZ-001", "Diesel"),
            _nozzle("NZ-002", "Diesel"),
            _nozzle("NZ-003", "Petrol"),
        ], product_type="Mixed"),
    }
    compute_display_labels(islands)

    nozzles = islands["ISL-001"]["pump_station"]["nozzles"]
    assert nozzles[0]["display_label"] == "1A" and nozzles[0]["fuel_type_abbrev"] == "LSD"
    assert nozzles[1]["display_label"] == "1B" and nozzles[1]["fuel_type_abbrev"] == "LSD"
    assert nozzles[2]["display_label"] == "1C" and nozzles[2]["fuel_type_abbrev"] == "UNL"


# ---------------------------------------------------------------------------
# Helpers — full label rendering and reverse lookup
# ---------------------------------------------------------------------------

def test_full_display_label_uses_nozzle_abbrev_for_mixed():
    islands = {
        "ISL-001": _make_island("ISL-001", [
            _nozzle("NZ-001", "Diesel"),
            _nozzle("NZ-002", "Petrol"),
        ]),
    }
    compute_display_labels(islands)
    diesel_n, petrol_n = islands["ISL-001"]["pump_station"]["nozzles"]
    # Pass the (now-mixed) island as second arg to confirm we DON'T fall back to it
    assert get_full_display_label(diesel_n, islands["ISL-001"]) == "LSD 1A"
    assert get_full_display_label(petrol_n, islands["ISL-001"]) == "UNL 1B"


def test_resolve_display_to_internal_works_on_mixed_island():
    islands = {
        "ISL-001": _make_island("ISL-001", [
            _nozzle("NZ-DIESEL", "Diesel"),
            _nozzle("NZ-PETROL", "Petrol"),
        ]),
    }
    compute_display_labels(islands)

    # Diesel side: slot A → "1A"
    assert resolve_nozzle_display_to_internal("1A", "Diesel", islands) == "NZ-DIESEL"
    # Petrol side: slot B → "1B" (NOT "1A")
    assert resolve_nozzle_display_to_internal("1B", "Petrol", islands) == "NZ-PETROL"
    # And looking up "1A" with petrol (the wrong fuel) returns nothing
    assert resolve_nozzle_display_to_internal("1A", "Petrol", islands) is None
    # Unknown fuel
    assert resolve_nozzle_display_to_internal("1A", "Kerosene", islands) is None


def test_resolve_handles_legacy_islands_without_explicit_product_type():
    """Lookup should work even if island.product_type is unset."""
    islands = {
        "ISL-X": _make_island("ISL-X", [
            _nozzle("NZ-X", "Diesel"),
        ], product_type=None),
    }
    compute_display_labels(islands)
    assert resolve_nozzle_display_to_internal("1A", "Diesel", islands) == "NZ-X"


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

def test_island_without_nozzles_clears_display_fields():
    islands = {
        "ISL-EMPTY": _make_island("ISL-EMPTY", [], product_type="Diesel"),
    }
    compute_display_labels(islands)
    assert islands["ISL-EMPTY"]["display_number"] is None
    assert islands["ISL-EMPTY"]["fuel_type_abbrev"] is None


def test_island_without_pump_station_handled():
    islands = {
        "ISL-NOPUMP": {"island_id": "ISL-NOPUMP", "product_type": "Diesel"},
    }
    compute_display_labels(islands)
    assert islands["ISL-NOPUMP"]["display_number"] is None
    assert islands["ISL-NOPUMP"]["fuel_type_abbrev"] is None


def test_nozzle_without_fuel_clears_label():
    """A nozzle with no fuel_type cannot belong to a fuel namespace, so its
    auto-label is None. Custom label still wins if set."""
    islands = {
        "ISL-001": _make_island("ISL-001", [
            {"nozzle_id": "NZ-NO-FUEL", "status": "Active", "custom_label": None},
            _nozzle("NZ-DIESEL", "Diesel"),
        ]),
    }
    compute_display_labels(islands)
    nozzles = islands["ISL-001"]["pump_station"]["nozzles"]
    # No-fuel nozzle: cleared
    assert nozzles[0]["display_label"] is None
    assert nozzles[0]["fuel_type_abbrev"] is None
    # Diesel nozzle: still gets a label, in slot B (its physical position)
    assert nozzles[1]["display_label"] == "1B"
    assert nozzles[1]["fuel_type_abbrev"] == "LSD"
