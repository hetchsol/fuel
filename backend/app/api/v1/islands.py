"""
Islands, Pump Stations, and Nozzles Management API
Default setup: 6 islands, 1 pump each, 2 nozzles per pump.
Islands are configured (product type) and activated/deactivated by the owner.
Owners retain full CRUD capabilities.

Multi-fuel support: each Nozzle owns its own tank_id (and fuel_type). The
preset endpoint POST /islands/{id}/preset is the primary surface for
configuring an island as All Diesel / All Petrol / Mixed; per-nozzle
endpoints exist for fine-grained adjustments.
"""
from collections import Counter
import copy
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from ...models.models import Island, PumpStation, Nozzle, FUEL_TYPE_ABBREVIATIONS, FUEL_TYPE_FROM_ABBREV
from ...services.naming_convention import compute_display_labels
from ...config import TANK_ID_PETROL, TANK_ID_DIESEL
from .auth import get_station_context, require_owner

router = APIRouter()


def _find_tank_for_fuel(storage: dict, product_type: str) -> str:
    """
    Find the first tank matching a fuel type, falling back to config constants.

    NOTE: This is a default/convenience behavior for backward compatibility.
    For multi-tank setups, use the explicit PUT /islands/{id}/pump-station/tank
    endpoint to manually assign islands to specific tanks.
    """
    tanks = storage.get('tanks', {})
    for tid, tdata in tanks.items():
        if tdata.get("fuel_type") == product_type:
            return tid
    # Fallback to config defaults
    return TANK_ID_PETROL if product_type == "Petrol" else TANK_ID_DIESEL


def _validate_tank_for_fuel(storage: dict, tank_id: str, fuel_type: str) -> dict:
    """
    Confirm a tank exists and its fuel_type matches the caller's expectation.
    Raises HTTPException(400) on any mismatch — there is NO force override.
    """
    tanks = storage.get('tanks', {})
    if tank_id not in tanks:
        raise HTTPException(status_code=404, detail=f"Tank {tank_id} not found")
    tank_fuel = tanks[tank_id].get('fuel_type')
    if tank_fuel != fuel_type:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Tank {tank_id} dispenses {tank_fuel}; cannot serve a {fuel_type} nozzle. "
                "To change a nozzle's fuel, use PUT /islands/{id}/nozzle/{id}/fuel-type "
                "and supply both the new fuel_type and a matching tank_id atomically."
            ),
        )
    return tanks[tank_id]


def _recompute_island_product_type(island: dict) -> Optional[str]:
    """
    Refresh island.product_type based on its current nozzle composition.
    Returns the new value: 'Petrol' / 'Diesel' / 'Mixed' / None.
    """
    pump = island.get('pump_station')
    if not pump:
        island['product_type'] = None
        return None
    fuels = {n.get('fuel_type') for n in pump.get('nozzles', []) or [] if n.get('fuel_type')}
    if not fuels:
        new_pt = None
    elif len(fuels) == 1:
        new_pt = next(iter(fuels))
    else:
        new_pt = "Mixed"
    island['product_type'] = new_pt
    return new_pt


def _recompute_pump_default_tank(island: dict) -> Optional[str]:
    """
    Refresh pump_station.tank_id as the most common tank among nozzles.
    Used for backward compatibility with code that still reads pump.tank_id.
    Returns None if no nozzles are assigned or there's a tie with no clear winner.
    """
    pump = island.get('pump_station')
    if not pump:
        return None
    nozzle_tanks = [n.get('tank_id') for n in pump.get('nozzles', []) or [] if n.get('tank_id')]
    if not nozzle_tanks:
        return pump.get('tank_id')  # leave unchanged
    counts = Counter(nozzle_tanks)
    most_common, top_count = counts.most_common(1)[0]
    # If everyone agrees, set it. If split (mixed island), leave None — there's no
    # honest single value, and the pump-level fallback is no longer authoritative.
    if all(c == top_count for _, c in counts.most_common()) and len(counts) > 1:
        pump['tank_id'] = None
        return None
    pump['tank_id'] = most_common
    return most_common


# ── Request models ──────────────────────────────────────

class StatusUpdate(BaseModel):
    status: str  # "active" or "inactive"

class ProductUpdate(BaseModel):
    product_type: str  # "Petrol" or "Diesel"

class IslandNameUpdate(BaseModel):
    name: str  # New human-readable display name for the island

class NozzleLabelUpdate(BaseModel):
    custom_label: Optional[str] = None  # Set to None to clear and use auto-computed label

class NozzleTankUpdate(BaseModel):
    tank_id: str  # Must reference a tank whose fuel_type matches the nozzle's fuel_type

class NozzleFuelTypeUpdate(BaseModel):
    fuel_type: str  # 'Petrol' or 'Diesel'
    tank_id: str    # Required — matching tank must be supplied in the same call

class PresetTanks(BaseModel):
    diesel_tank_id: Optional[str] = None
    petrol_tank_id: Optional[str] = None

class PresetNozzleAssignment(BaseModel):
    nozzle_id: str
    tank_id: str

class IslandPresetApply(BaseModel):
    preset: str  # 'all_diesel' | 'all_petrol' | 'mixed' | 'custom'
    tanks: Optional[PresetTanks] = None
    nozzle_assignments: Optional[List[PresetNozzleAssignment]] = None


# ── READ endpoints ──────────────────────────────────────

@router.get("/fuel-types")
async def get_fuel_types():
    """Return fuel type abbreviation mappings used by the spreadsheet convention."""
    return {
        "abbreviations": FUEL_TYPE_ABBREVIATIONS,
        "from_abbrev": FUEL_TYPE_FROM_ABBREV,
    }


@router.get("/", response_model=List[Island])
async def get_all_islands(
    status: Optional[str] = Query(None, description="Filter by status: active or inactive"),
    ctx: dict = Depends(get_station_context),
):
    """
    Get all islands with their pump stations and nozzles.
    Optional ?status=active filter.
    """
    storage = ctx["storage"]
    islands_data = storage.get('islands', {})
    islands = [Island(**island) for island in islands_data.values()]

    if status:
        islands = [i for i in islands if i.status == status]

    return islands


@router.get("/{island_id}", response_model=Island)
async def get_island(island_id: str, ctx: dict = Depends(get_station_context)):
    """Get specific island details"""
    storage = ctx["storage"]
    islands_data = storage.get('islands', {})

    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    return Island(**islands_data[island_id])


@router.get("/{island_id}/pump-station", response_model=PumpStation)
async def get_pump_station(island_id: str, ctx: dict = Depends(get_station_context)):
    """Get pump station for a specific island"""
    storage = ctx["storage"]
    islands_data = storage.get('islands', {})

    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    pump_station = islands_data[island_id].get("pump_station")
    if not pump_station:
        raise HTTPException(status_code=404, detail="Pump station not found")

    return PumpStation(**pump_station)


@router.get("/{island_id}/nozzles", response_model=List[Nozzle])
async def get_island_nozzles(island_id: str, ctx: dict = Depends(get_station_context)):
    """Get all nozzles for a specific island"""
    storage = ctx["storage"]
    islands_data = storage.get('islands', {})

    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    pump_station = islands_data[island_id].get("pump_station")
    if not pump_station:
        return []

    return [Nozzle(**nozzle) for nozzle in pump_station.get("nozzles", [])]


@router.get("/nozzle/{nozzle_id}")
async def get_nozzle_info(nozzle_id: str, ctx: dict = Depends(get_station_context)):
    """Get nozzle info including its island and pump station"""
    storage = ctx["storage"]
    islands_data = storage.get('islands', {})

    for island_id, island in islands_data.items():
        pump_station = island.get("pump_station")
        if pump_station:
            for nozzle in pump_station.get("nozzles", []):
                if nozzle["nozzle_id"] == nozzle_id:
                    return {
                        "nozzle": nozzle,
                        "pump_station": {
                            "pump_station_id": pump_station["pump_station_id"],
                            "name": pump_station["name"]
                        },
                        "island": {
                            "island_id": island["island_id"],
                            "name": island["name"],
                            "location": island.get("location")
                        }
                    }

    return {"error": "Nozzle not found"}


# ── Configuration endpoints ─────────────────────────────

@router.put("/{island_id}/status")
async def update_island_status(
    island_id: str,
    body: StatusUpdate,
    ctx: dict = Depends(get_station_context),
):
    """
    Toggle island active/inactive.
    Islands default to active; owner can deactivate as needed.
    """
    storage = ctx["storage"]
    islands_data = storage.get('islands', {})

    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    new_status = body.status
    if new_status not in ("active", "inactive"):
        raise HTTPException(status_code=400, detail="Status must be 'active' or 'inactive'")

    island = islands_data[island_id]
    island["status"] = new_status
    return {"status": "success", "island_id": island_id, "new_status": new_status}


@router.put("/{island_id}/name", dependencies=[Depends(require_owner)])
async def update_island_name(
    island_id: str,
    body: IslandNameUpdate,
    ctx: dict = Depends(get_station_context),
):
    """
    Rename an island's display name (Owner only).

    This changes ONLY the human-readable `name` shown in the UI. It does not
    touch product_type, nozzle/tank assignments, status, or the auto-computed
    display fields (display_number / fuel_type_abbrev / nozzle display_label),
    so no operational, naming, or reconciliation logic is affected.
    """
    storage = ctx["storage"]
    islands_data = storage.get('islands', {})

    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    new_name = (body.name or "").strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Island name cannot be empty")
    if len(new_name) > 60:
        raise HTTPException(status_code=400, detail="Island name must be 60 characters or fewer")

    island = islands_data[island_id]
    old_name = island.get("name")
    island["name"] = new_name

    return {
        "status": "success",
        "island_id": island_id,
        "old_name": old_name,
        "name": new_name,
    }


@router.put("/{island_id}/product", deprecated=True)
async def update_island_product(
    island_id: str,
    body: ProductUpdate,
    ctx: dict = Depends(get_station_context),
):
    """
    DEPRECATED — sets `island.product_type` as an informational label only.

    This endpoint used to atomically rewrite `pump.tank_id` and every nozzle's
    `fuel_type`, but those side effects would silently destroy a mixed-fuel
    island's configuration. As of the multi-fuel refactor it only updates
    the label; fuel and tank assignments live on the nozzle and are managed
    via:

      - POST /islands/{id}/preset                       (recommended)
      - PUT  /islands/{id}/nozzle/{nozzle_id}/tank
      - PUT  /islands/{id}/nozzle/{nozzle_id}/fuel-type

    The `product_type` value set here is informational and may be overwritten
    when a nozzle change triggers a recompute.
    """
    storage = ctx["storage"]
    islands_data = storage.get('islands', {})

    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    product = body.product_type
    if product not in ("Petrol", "Diesel"):
        raise HTTPException(status_code=400, detail="product_type must be 'Petrol' or 'Diesel'")

    island = islands_data[island_id]
    island["product_type"] = product
    # Refresh labels — single-fuel islands' display fields update naturally.
    compute_display_labels(islands_data)

    return {
        "status": "success",
        "island_id": island_id,
        "product_type": product,
        "display_number": island.get("display_number"),
        "fuel_type_abbrev": island.get("fuel_type_abbrev"),
        "deprecation_notice": (
            "This endpoint is informational only and does not configure nozzle or tank assignments. "
            "Use POST /islands/{id}/preset to wire fuel and tanks atomically."
        ),
    }


@router.put("/{island_id}/nozzle/{nozzle_id}/status")
async def update_nozzle_status(island_id: str, nozzle_id: str, status: str, ctx: dict = Depends(get_station_context)):
    """Update nozzle status (Active, Inactive, Maintenance)"""
    storage = ctx["storage"]
    islands_data = storage.get('islands', {})

    if island_id not in islands_data:
        return {"error": "Island not found"}

    pump_station = islands_data[island_id].get("pump_station")
    if not pump_station:
        return {"error": "Pump station not found"}

    for nozzle in pump_station.get("nozzles", []):
        if nozzle["nozzle_id"] == nozzle_id:
            nozzle["status"] = status
            return {"status": "success", "nozzle_id": nozzle_id, "new_status": status}

    return {"error": "Nozzle not found"}


# ── Label endpoints ───────────────────────────────────────

@router.put("/{island_id}/nozzle/{nozzle_id}/label")
async def update_nozzle_label(
    island_id: str,
    nozzle_id: str,
    body: NozzleLabelUpdate,
    ctx: dict = Depends(get_station_context),
):
    """
    Set or clear a custom display label for a nozzle (Owner only).
    Setting custom_label to None reverts to the auto-computed label.
    """
    storage = ctx["storage"]
    islands_data = storage.get('islands', {})

    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    pump_station = islands_data[island_id].get("pump_station")
    if not pump_station:
        raise HTTPException(status_code=404, detail="Pump station not found")

    for nozzle in pump_station.get("nozzles", []):
        if nozzle["nozzle_id"] == nozzle_id:
            nozzle["custom_label"] = body.custom_label
            # Recompute all labels (will use custom_label where set)
            compute_display_labels(islands_data)
            return {
                "status": "success",
                "nozzle_id": nozzle_id,
                "custom_label": body.custom_label,
                "display_label": nozzle.get("display_label"),
            }

    raise HTTPException(status_code=404, detail="Nozzle not found")


# ── Multi-fuel: per-nozzle tank/fuel + island presets ─────

def _find_nozzle(islands_data: dict, island_id: str, nozzle_id: str):
    """Return (island, pump, nozzle) tuple or raise 404."""
    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")
    island = islands_data[island_id]
    pump = island.get('pump_station')
    if not pump:
        raise HTTPException(status_code=404, detail="Pump station not found")
    for nozzle in pump.get('nozzles', []):
        if nozzle.get('nozzle_id') == nozzle_id:
            return island, pump, nozzle
    raise HTTPException(status_code=404, detail="Nozzle not found")


@router.put("/{island_id}/nozzle/{nozzle_id}/tank")
async def update_nozzle_tank(
    island_id: str,
    nozzle_id: str,
    body: NozzleTankUpdate,
    ctx: dict = Depends(get_station_context),
):
    """
    Reassign a single nozzle to a different tank.

    The new tank's `fuel_type` must match the nozzle's current `fuel_type`.
    To change a nozzle's fuel as well, call PUT /nozzle/{id}/fuel-type instead
    so both fields update atomically.
    """
    storage = ctx["storage"]
    islands_data = storage.get('islands', {})
    island, pump, nozzle = _find_nozzle(islands_data, island_id, nozzle_id)

    _validate_tank_for_fuel(storage, body.tank_id, nozzle.get('fuel_type'))

    nozzle['tank_id'] = body.tank_id
    _recompute_pump_default_tank(island)
    compute_display_labels(islands_data)

    return {
        "status": "success",
        "island_id": island_id,
        "nozzle_id": nozzle_id,
        "tank_id": body.tank_id,
        "fuel_type": nozzle.get('fuel_type'),
    }


@router.put("/{island_id}/nozzle/{nozzle_id}/fuel-type")
async def update_nozzle_fuel_type(
    island_id: str,
    nozzle_id: str,
    body: NozzleFuelTypeUpdate,
    ctx: dict = Depends(get_station_context),
):
    """
    Atomically change a nozzle's fuel_type AND tank_id. Both fields are
    required in the body. The tank's fuel_type must equal the new fuel_type.

    Cascades: refreshes island.product_type (auto-computed) and pump.tank_id
    (most-common). Display labels are recomputed across all islands.
    """
    if body.fuel_type not in ("Petrol", "Diesel"):
        raise HTTPException(status_code=400, detail="fuel_type must be 'Petrol' or 'Diesel'")

    storage = ctx["storage"]
    islands_data = storage.get('islands', {})
    island, pump, nozzle = _find_nozzle(islands_data, island_id, nozzle_id)

    _validate_tank_for_fuel(storage, body.tank_id, body.fuel_type)

    nozzle['fuel_type'] = body.fuel_type
    nozzle['tank_id'] = body.tank_id

    _recompute_island_product_type(island)
    _recompute_pump_default_tank(island)
    compute_display_labels(islands_data)

    return {
        "status": "success",
        "island_id": island_id,
        "nozzle_id": nozzle_id,
        "fuel_type": body.fuel_type,
        "tank_id": body.tank_id,
        "island_product_type": island.get('product_type'),
        "display_label": nozzle.get('display_label'),
    }


def _resolve_preset_tank(storage: dict, fuel: str, override: Optional[str], context: str) -> str:
    """
    Decide which tank a preset should wire to, given the station's tank inventory.

    - If override is supplied, validate it (exists, fuel matches).
    - If only one tank of that fuel exists, auto-pick it.
    - If multiple exist and no override was given, raise 400 listing options.
    """
    tanks = storage.get('tanks', {})
    matching = [tid for tid, t in tanks.items() if t.get('fuel_type') == fuel]
    if override:
        _validate_tank_for_fuel(storage, override, fuel)
        return override
    if not matching:
        raise HTTPException(
            status_code=400,
            detail=f"No {fuel} tank exists. Create one before applying preset {context!r}.",
        )
    if len(matching) > 1:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Multiple {fuel} tanks exist ({sorted(matching)}). "
                f"Specify tanks.{fuel.lower()}_tank_id in the request body for preset {context!r}."
            ),
        )
    return matching[0]


@router.post("/{island_id}/preset")
async def apply_island_preset(
    island_id: str,
    body: IslandPresetApply,
    ctx: dict = Depends(get_station_context),
):
    """
    Apply a preset configuration to an island's nozzles and tanks.

    Presets:
      - "all_diesel"  — every nozzle dispenses diesel from the chosen diesel tank
      - "all_petrol"  — every nozzle dispenses petrol from the chosen petrol tank
      - "mixed"       — exactly 2 nozzles; A=petrol, B=diesel by convention
      - "custom"      — explicit per-nozzle assignments via body.nozzle_assignments

    Tank picking: if the station has only one tank of a needed fuel, it's
    auto-selected. If multiple exist and no override is supplied in body.tanks,
    the request is rejected with 400 listing the candidates.

    All writes are atomic — the request either applies fully or makes no changes.
    """
    valid_presets = {"all_diesel", "all_petrol", "mixed", "custom"}
    if body.preset not in valid_presets:
        raise HTTPException(
            status_code=400,
            detail=f"preset must be one of {sorted(valid_presets)}",
        )

    storage = ctx["storage"]
    islands_data = storage.get('islands', {})
    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")
    island = islands_data[island_id]
    pump = island.get('pump_station')
    if not pump:
        raise HTTPException(status_code=404, detail="Pump station not found")

    nozzles: List[Dict[str, Any]] = pump.get('nozzles', []) or []
    if not nozzles:
        raise HTTPException(status_code=400, detail="Island has no nozzles to configure")

    # Build the (nozzle, fuel, tank) plan for each nozzle BEFORE mutating anything.
    tanks_override = body.tanks or PresetTanks()
    plan: List[tuple] = []  # (nozzle_dict, fuel_type, tank_id)

    if body.preset == "all_diesel":
        chosen = _resolve_preset_tank(storage, "Diesel", tanks_override.diesel_tank_id, body.preset)
        plan = [(n, "Diesel", chosen) for n in nozzles]

    elif body.preset == "all_petrol":
        chosen = _resolve_preset_tank(storage, "Petrol", tanks_override.petrol_tank_id, body.preset)
        plan = [(n, "Petrol", chosen) for n in nozzles]

    elif body.preset == "mixed":
        if len(nozzles) != 2:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Mixed preset assumes exactly 2 nozzles; this island has {len(nozzles)}. "
                    "Use preset='custom' with explicit nozzle_assignments instead."
                ),
            )
        petrol_tank = _resolve_preset_tank(storage, "Petrol", tanks_override.petrol_tank_id, body.preset)
        diesel_tank = _resolve_preset_tank(storage, "Diesel", tanks_override.diesel_tank_id, body.preset)
        # Convention: nozzle A (first) = petrol, nozzle B (second) = diesel
        plan = [
            (nozzles[0], "Petrol", petrol_tank),
            (nozzles[1], "Diesel", diesel_tank),
        ]

    elif body.preset == "custom":
        assignments = body.nozzle_assignments or []
        if not assignments:
            raise HTTPException(
                status_code=400,
                detail="preset='custom' requires nozzle_assignments[] with one entry per nozzle.",
            )
        nozzle_lookup = {n.get('nozzle_id'): n for n in nozzles}
        seen = set()
        for a in assignments:
            if a.nozzle_id not in nozzle_lookup:
                raise HTTPException(
                    status_code=400,
                    detail=f"Nozzle {a.nozzle_id} is not on island {island_id}",
                )
            if a.nozzle_id in seen:
                raise HTTPException(
                    status_code=400,
                    detail=f"Nozzle {a.nozzle_id} appears twice in nozzle_assignments",
                )
            seen.add(a.nozzle_id)
            tank = storage.get('tanks', {}).get(a.tank_id)
            if not tank:
                raise HTTPException(status_code=404, detail=f"Tank {a.tank_id} not found")
            plan.append((nozzle_lookup[a.nozzle_id], tank.get('fuel_type'), a.tank_id))
        unspecified = set(nozzle_lookup) - seen
        if unspecified:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"preset='custom' requires every nozzle on the island to be assigned. "
                    f"Missing: {sorted(unspecified)}"
                ),
            )

    # Snapshot for atomic-rollback. We deep-copy only the nozzle list since that
    # is all we touch on the hot path; preset re-runs are rare so this is cheap.
    snapshot = copy.deepcopy(pump.get('nozzles', []))
    try:
        applied = []
        for nozzle, fuel, tank_id in plan:
            # Final per-nozzle validation (defense in depth — _resolve_preset_tank
            # already validated, but custom mode bypassed it for arbitrary tank_ids).
            _validate_tank_for_fuel(storage, tank_id, fuel)
            nozzle['fuel_type'] = fuel
            nozzle['tank_id'] = tank_id
            applied.append({
                "nozzle_id": nozzle.get('nozzle_id'),
                "fuel_type": fuel,
                "tank_id": tank_id,
            })

        _recompute_island_product_type(island)
        _recompute_pump_default_tank(island)
        compute_display_labels(islands_data)
    except HTTPException:
        # Roll back nozzles to their pre-call state
        pump['nozzles'] = snapshot
        raise

    return {
        "status": "success",
        "island_id": island_id,
        "preset": body.preset,
        "applied_nozzles": applied,
        "island_product_type": island.get('product_type'),
        "pump_default_tank_id": pump.get('tank_id'),
    }


# ── Owner CRUD endpoints ─────────────────────────────────

@router.post("/")
async def create_island(island: Island, ctx: dict = Depends(get_station_context)):
    """
    Create a new island with pump station and nozzles (Owner only).
    New islands default to inactive with no product_type.

    If any nozzle in the payload carries an explicit tank_id, the tank's
    fuel_type must match that nozzle's fuel_type. Same for pump_station.tank_id
    if used as a default for unassigned nozzles.
    """
    storage = ctx["storage"]
    islands_data = storage.get('islands', {})

    if island.island_id in islands_data:
        raise HTTPException(status_code=400, detail="Island already exists")

    # Validate any nozzle-level tank assignments before persisting
    if island.pump_station:
        for nozzle in island.pump_station.nozzles or []:
            if nozzle.tank_id:
                _validate_tank_for_fuel(storage, nozzle.tank_id, nozzle.fuel_type)

    islands_data[island.island_id] = island.dict()
    return {"status": "success", "island": island}


@router.delete("/{island_id}")
async def delete_island(island_id: str, ctx: dict = Depends(get_station_context)):
    """Delete an island (Owner only)"""
    storage = ctx["storage"]
    islands_data = storage.get('islands', {})

    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    deleted_island = islands_data.pop(island_id)

    return {
        "status": "success",
        "message": f"Island {island_id} deleted successfully",
        "deleted_island": deleted_island["name"],
    }


@router.put("/{island_id}/pump-station/tank")
async def update_pump_tank_mapping(island_id: str, tank_id: str, ctx: dict = Depends(get_station_context)):
    """
    Update which tank the pump station draws fuel from (Owner only).
    Consider using PUT /islands/{island_id}/product instead for standardized config.
    """
    storage = ctx["storage"]
    islands_data = storage.get('islands', {})

    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    if tank_id not in storage.get('tanks', {}):
        raise HTTPException(status_code=404, detail=f"Tank {tank_id} not found")

    pump_station = islands_data[island_id].get("pump_station")
    if not pump_station:
        raise HTTPException(status_code=404, detail="Pump station not found")

    old_tank_id = pump_station.get("tank_id", "Not set")
    pump_station["tank_id"] = tank_id

    return {
        "status": "success",
        "message": f"Pump station now draws from {tank_id}",
        "island_id": island_id,
        "pump_station_id": pump_station["pump_station_id"],
        "old_tank_id": old_tank_id,
        "new_tank_id": tank_id,
    }


@router.post("/{island_id}/nozzle")
async def add_nozzle(island_id: str, nozzle: Nozzle, ctx: dict = Depends(get_station_context)):
    """
    Add a nozzle to an island's pump station (Owner only).
    If tank_id is provided on the nozzle, the tank's fuel_type must match.
    """
    storage = ctx["storage"]
    islands_data = storage.get('islands', {})

    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    pump_station = islands_data[island_id].get("pump_station")
    if not pump_station:
        raise HTTPException(status_code=404, detail="Pump station not found")

    for existing_nozzle in pump_station.get("nozzles", []):
        if existing_nozzle["nozzle_id"] == nozzle.nozzle_id:
            raise HTTPException(status_code=400, detail="Nozzle ID already exists")

    if nozzle.tank_id:
        _validate_tank_for_fuel(storage, nozzle.tank_id, nozzle.fuel_type)

    pump_station["nozzles"].append(nozzle.dict())
    # Refresh derived fields now that the island composition has changed
    _recompute_island_product_type(islands_data[island_id])
    _recompute_pump_default_tank(islands_data[island_id])
    compute_display_labels(islands_data)

    return {
        "status": "success",
        "message": f"Nozzle {nozzle.nozzle_id} added successfully",
        "nozzle": nozzle,
        "island_id": island_id,
        "total_nozzles": len(pump_station["nozzles"]),
    }


@router.delete("/{island_id}/nozzle/{nozzle_id}")
async def remove_nozzle(island_id: str, nozzle_id: str, ctx: dict = Depends(get_station_context)):
    """Remove a nozzle from an island's pump station (Owner only)"""
    storage = ctx["storage"]
    islands_data = storage.get('islands', {})

    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    pump_station = islands_data[island_id].get("pump_station")
    if not pump_station:
        raise HTTPException(status_code=404, detail="Pump station not found")

    nozzles = pump_station.get("nozzles", [])
    original_count = len(nozzles)

    pump_station["nozzles"] = [n for n in nozzles if n["nozzle_id"] != nozzle_id]

    if len(pump_station["nozzles"]) == original_count:
        raise HTTPException(status_code=404, detail="Nozzle not found")

    return {
        "status": "success",
        "message": f"Nozzle {nozzle_id} removed successfully",
        "island_id": island_id,
        "remaining_nozzles": len(pump_station["nozzles"]),
    }
