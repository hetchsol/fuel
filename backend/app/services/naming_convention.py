"""
Naming Convention Service

Computes spreadsheet-style display labels for islands and nozzles.
Convention: nozzles are "1A", "1B", "2A", "2B" per fuel type;
islands are numbered 1, 2 within each fuel type group;
fuel types use abbreviations LSD (Diesel) and UNL (Petrol).
"""
from ..models.models import FUEL_TYPE_ABBREVIATIONS


def compute_display_labels(islands_data: dict) -> None:
    """
    Groups islands by product_type, numbers them 1, 2, ... within each group,
    and assigns nozzle display_labels as "{island_number}{letter}" (e.g. "1A", "2B").
    Respects custom_label if set by the owner.

    Mutates islands_data dict in place.
    """
    # Group islands by product_type
    groups: dict[str, list[str]] = {}  # product_type -> [island_id, ...]
    for island_id, island in islands_data.items():
        product = island.get("product_type")
        if product:
            groups.setdefault(product, []).append(island_id)

    # Sort each group by island_id for deterministic numbering
    for product, island_ids in groups.items():
        island_ids.sort()
        abbrev = FUEL_TYPE_ABBREVIATIONS.get(product)

        for idx, island_id in enumerate(island_ids, start=1):
            island = islands_data[island_id]
            island["display_number"] = idx
            island["fuel_type_abbrev"] = abbrev

            # Assign nozzle display labels
            pump_station = island.get("pump_station")
            if pump_station:
                letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
                for nozzle_idx, nozzle in enumerate(pump_station.get("nozzles", [])):
                    if nozzle.get("custom_label"):
                        nozzle["display_label"] = nozzle["custom_label"]
                    else:
                        letter = letters[nozzle_idx] if nozzle_idx < len(letters) else str(nozzle_idx)
                        nozzle["display_label"] = f"{idx}{letter}"

    # Clear labels for islands without a product_type
    for island_id, island in islands_data.items():
        if not island.get("product_type"):
            island["display_number"] = None
            island["fuel_type_abbrev"] = None
            pump_station = island.get("pump_station")
            if pump_station:
                for nozzle in pump_station.get("nozzles", []):
                    if not nozzle.get("custom_label"):
                        nozzle["display_label"] = None


def get_full_display_label(nozzle: dict, island: dict) -> str:
    """
    Returns a full display string like "LSD 1A" for a nozzle within its island.
    Falls back to the nozzle_id if display fields are not set.
    """
    abbrev = island.get("fuel_type_abbrev", "")
    label = nozzle.get("display_label", "")
    if abbrev and label:
        return f"{abbrev} {label}"
    return nozzle.get("nozzle_id", "")


def resolve_nozzle_display_to_internal(
    display_label: str,
    fuel_type: str,
    islands_data: dict,
) -> str | None:
    """
    Maps a display label (e.g. "1A") and fuel type back to the internal nozzle_id.
    Returns None if no match is found.
    """
    for island in islands_data.values():
        if island.get("product_type") != fuel_type:
            continue
        pump_station = island.get("pump_station")
        if not pump_station:
            continue
        for nozzle in pump_station.get("nozzles", []):
            if nozzle.get("display_label") == display_label:
                return nozzle["nozzle_id"]
    return None
