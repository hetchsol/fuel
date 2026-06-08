"""
Naming Convention Service

Computes spreadsheet-style display labels for islands and nozzles.

After the multi-fuel refactor, labels live in PER-FUEL NAMESPACES with
PHYSICAL-SLOT LETTERING:

  - Within each fuel_type, islands containing at least one nozzle of that
    fuel are sorted by island_id and given an island number 1, 2, ...
  - Within an island, every nozzle gets a letter (A, B, C, ...) based on
    its physical slot (its index in the nozzle list) — independent of fuel.
  - A nozzle's display_label is "{island_number}{slot_letter}" — e.g. "1A".
  - A nozzle's fuel_type_abbrev is the LSD/UNL/etc. abbreviation for its
    own fuel_type.
  - The full label is "{abbrev} {display_label}" — e.g. "LSD 1A".

Mixed-fuel islands produce per-fuel labels that never collide. Example:
ISL-003 with slot A=Diesel and slot B=Petrol, sitting after two diesel
islands, yields:

  Slot A → LSD 3A     (third diesel island, physical slot A)
  Slot B → UNL 1B     (first petrol island, physical slot B)

The slot-letter is the same as the nozzle's physical position on the
island, regardless of fuel. A 3-nozzle island with diesel in slots A & B
and petrol in slot C produces LSD 1A, LSD 1B, UNL 1C — the petrol nozzle
is "C" because that is where it physically sits, not because it's the
first petrol nozzle on the island.

Single-fuel islands behave identically to the pre-refactor scheme: an
island with two diesel nozzles still gets labels "LSD 1A" and "LSD 1B".

Custom labels (owner overrides) are always preserved.
"""
from typing import Dict, List, Optional

from ..models.models import FUEL_TYPE_ABBREVIATIONS

_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _letter_for_index(idx: int) -> str:
    return _LETTERS[idx] if idx < len(_LETTERS) else str(idx)


def compute_display_labels(islands_data: dict) -> None:
    """
    Refresh display_label, fuel_type_abbrev, and display_number on every
    island and nozzle, applying the per-fuel namespace + physical-slot
    lettering scheme described in this module's docstring. Mutates
    `islands_data` in place.

    Custom labels on a nozzle (`custom_label`) override the auto-computed
    `display_label`.
    """
    # Step 1 — for each fuel, find the islands containing at least one nozzle
    # of that fuel and assign island numbers in sorted order.
    fuel_island_numbers: Dict[str, Dict[str, int]] = {}
    for island_id in sorted(islands_data.keys()):
        island = islands_data[island_id]
        pump = island.get("pump_station")
        if not pump:
            continue
        fuels_present_on_island = {
            n.get("fuel_type")
            for n in pump.get("nozzles", []) or []
            if n.get("fuel_type")
        }
        for fuel in fuels_present_on_island:
            fuel_map = fuel_island_numbers.setdefault(fuel, {})
            if island_id not in fuel_map:
                fuel_map[island_id] = len(fuel_map) + 1

    # Step 2 — assign per-nozzle labels using the island number from this nozzle's
    # fuel namespace and the nozzle's physical slot letter (its index in the nozzle list).
    for island_id, island in islands_data.items():
        pump = island.get("pump_station")
        if not pump:
            continue
        nozzles = pump.get("nozzles", []) or []
        for slot_idx, nozzle in enumerate(nozzles):
            fuel = nozzle.get("fuel_type")
            if not fuel:
                # Without a fuel, we cannot resolve a namespace; clear computed fields.
                nozzle["fuel_type_abbrev"] = None
                if not nozzle.get("custom_label"):
                    nozzle["display_label"] = None
                continue
            island_num = fuel_island_numbers.get(fuel, {}).get(island_id)
            nozzle["fuel_type_abbrev"] = FUEL_TYPE_ABBREVIATIONS.get(fuel)
            if nozzle.get("custom_label"):
                nozzle["display_label"] = nozzle["custom_label"]
            elif island_num is None:
                nozzle["display_label"] = None
            else:
                nozzle["display_label"] = f"{island_num}{_letter_for_index(slot_idx)}"

    # Step 3 — populate island-level display fields. Single-fuel islands keep
    # backward-compatible values; mixed islands get None at the island level
    # because no single number/abbrev makes sense.
    for island_id, island in islands_data.items():
        pump = island.get("pump_station")
        if not pump:
            island["display_number"] = None
            island["fuel_type_abbrev"] = None
            continue

        nozzles = pump.get("nozzles", []) or []
        fuels_present = {n.get("fuel_type") for n in nozzles if n.get("fuel_type")}

        if not fuels_present:
            island["display_number"] = None
            island["fuel_type_abbrev"] = None
            continue

        if len(fuels_present) == 1:
            only_fuel = next(iter(fuels_present))
            island["fuel_type_abbrev"] = FUEL_TYPE_ABBREVIATIONS.get(only_fuel)
            island["display_number"] = fuel_island_numbers.get(only_fuel, {}).get(island_id)
        else:
            island["fuel_type_abbrev"] = None
            island["display_number"] = None


def get_full_display_label(nozzle: dict, island: Optional[dict] = None) -> str:
    """
    Build the full display string for a nozzle, e.g. "LSD 1A".

    After the refactor, fuel_type_abbrev lives on the nozzle itself (so mixed
    islands work correctly). Falls back to island.fuel_type_abbrev for any
    legacy data that hasn't been refreshed yet, then to the bare nozzle_id.
    """
    abbrev = nozzle.get("fuel_type_abbrev")
    if not abbrev and island:
        abbrev = island.get("fuel_type_abbrev")
    label = nozzle.get("display_label")
    if abbrev and label:
        return f"{abbrev} {label}"
    return nozzle.get("nozzle_id", "")


def compute_tank_display_name(tank_id: str, tanks_data: dict) -> str:
    """
    Size-based display name for a tank, e.g. "Diesel Tank 2 — 14,000 L".

    The per-fuel index is stable: it is this tank's position among all tanks of
    the same fuel_type, sorted by tank_id (1-based). A custom name set by the
    owner (`custom_name` on the tank) always overrides the auto-generated one.

    tank_id is never changed — this is a display label only.
    """
    tank = (tanks_data or {}).get(tank_id) or {}
    custom = tank.get("custom_name")
    if custom:
        return custom

    fuel = tank.get("fuel_type") or "Fuel"
    same_fuel = sorted(
        tid for tid, t in (tanks_data or {}).items()
        if (t or {}).get("fuel_type") == fuel
    )
    index = same_fuel.index(tank_id) + 1 if tank_id in same_fuel else 1

    capacity = tank.get("capacity") or 0
    try:
        cap_str = f"{int(round(float(capacity))):,}"
    except (TypeError, ValueError):
        cap_str = str(capacity)

    return f"{fuel} Tank {index} — {cap_str} L"


def resolve_nozzle_display_to_internal(
    display_label: str,
    fuel_type: str,
    islands_data: dict,
) -> Optional[str]:
    """
    Reverse lookup: given a display label like "1A" and a fuel_type, return
    the internal nozzle_id. Now keyed off `nozzle.fuel_type` so it works for
    mixed-fuel islands (the old version filtered by `island.product_type`,
    which would miss the petrol nozzle on a mixed island).
    """
    for island in islands_data.values():
        pump = island.get("pump_station")
        if not pump:
            continue
        for nozzle in pump.get("nozzles", []) or []:
            if nozzle.get("fuel_type") != fuel_type:
                continue
            if nozzle.get("display_label") == display_label:
                return nozzle["nozzle_id"]
    return None
