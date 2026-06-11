"""
Fuel Tank Inventory API
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from typing import List, Optional
from ...models.models import FuelTankLevel, StockDelivery
from ...config import TANK_CONVERSION_FACTOR, get_allowable_loss_percent
from .auth import get_station_context
from .sales import load_sales
from ...services.notification_service import create_notification
from ...services.dip_conversion import register_tank_calibration, TANK_CALIBRATION
from ...services.naming_convention import compute_tank_display_name
import logging

_tanks_logger = logging.getLogger(__name__)

router = APIRouter()


def _dip_volume(tank_id: str, dip_cm: float) -> float:
    """Dip (cm) -> volume (L) via the tank's uploaded calibration chart.
    Raises HTTPException 400 if no chart exists — upload one first."""
    from ...services.dip_conversion import dip_to_volume
    try:
        return dip_to_volume(tank_id, dip_cm)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/levels", response_model=List[FuelTankLevel])
def get_tank_levels(ctx: dict = Depends(get_station_context)):
    """
    Get current fuel levels for all tanks
    """
    storage = ctx["storage"]
    tank_data = storage.get('tanks', {})

    tanks = []
    for tank_id, data in tank_data.items():
        percentage = (data["current_level"] / data["capacity"]) * 100
        tanks.append(FuelTankLevel(
            tank_id=data["tank_id"],
            fuel_type=data["fuel_type"],
            current_level=data["current_level"],
            capacity=data["capacity"],
            last_updated=data["last_updated"],
            percentage=percentage,
            display_name=compute_tank_display_name(tank_id, tank_data),
        ))
    return tanks

@router.post("/update/{tank_id}")
def update_tank_level(tank_id: str, volume_dispensed: float, ctx: dict = Depends(get_station_context)):
    """
    Update tank level after fuel dispensing
    Called after each sale to reduce tank level
    """
    storage = ctx["storage"]
    tank_data = storage.get('tanks', {})
    delivery_history = storage.get('delivery_history', [])
    dip_readings_data = storage.get('dip_readings_data', {})

    if tank_id not in tank_data:
        return {"error": "Tank not found"}

    tank_data[tank_id]["current_level"] -= volume_dispensed
    tank_data[tank_id]["last_updated"] = datetime.now().isoformat()

    percentage = (tank_data[tank_id]["current_level"] / tank_data[tank_id]["capacity"]) * 100

    return {
        "tank_id": tank_id,
        "current_level": tank_data[tank_id]["current_level"],
        "percentage": percentage,
        "status": "updated"
    }

@router.put("/{tank_id}/set-level")
def set_tank_level(tank_id: str, level: float, ctx: dict = Depends(get_station_context)):
    """Set the current level of a tank directly (owner only, for initial stock entry)"""
    storage = ctx["storage"]
    tank_data = storage.get('tanks', {})
    if tank_id not in tank_data:
        raise HTTPException(status_code=404, detail="Tank not found")
    tank_data[tank_id]["current_level"] = min(level, tank_data[tank_id]["capacity"])
    tank_data[tank_id]["last_updated"] = datetime.now().isoformat()
    from ...database.storage import save_station_storage
    save_station_storage(ctx["station_id"])
    return {"tank_id": tank_id, "current_level": tank_data[tank_id]["current_level"], "status": "level_set"}

@router.put("/{tank_id}/name")
def set_tank_name(tank_id: str, name: str = "", ctx: dict = Depends(get_station_context)):
    """
    Set or clear a tank's custom display name (owner). An empty name reverts to
    the auto-generated size-based name (e.g. "Diesel Tank 2 — 14,000 L").
    tank_id is never changed — this is a display label only.
    """
    storage = ctx["storage"]
    tank_data = storage.get('tanks', {})
    if tank_id not in tank_data:
        raise HTTPException(status_code=404, detail="Tank not found")

    clean = (name or "").strip()
    old = tank_data[tank_id].get("custom_name")
    if clean:
        tank_data[tank_id]["custom_name"] = clean
    else:
        tank_data[tank_id].pop("custom_name", None)

    from ...database.storage import save_station_storage
    save_station_storage(ctx["station_id"])

    try:
        from ...services.audit_service import log_audit_event
        log_audit_event(
            station_id=ctx.get("station_id", ""),
            action="tank_rename",
            performed_by=ctx.get("username") or ctx.get("user_id", ""),
            entity_type="tank",
            entity_id=tank_id,
            details={"old": old, "new": clean or None},
        )
    except Exception:
        pass

    return {
        "tank_id": tank_id,
        "display_name": compute_tank_display_name(tank_id, tank_data),
        "custom": bool(clean),
        "status": "renamed",
    }

@router.post("/refill/{tank_id}")
def refill_tank(tank_id: str, volume_added: float, ctx: dict = Depends(get_station_context)):
    """
    Refill a tank with new fuel
    """
    storage = ctx["storage"]
    tank_data = storage.get('tanks', {})
    delivery_history = storage.get('delivery_history', [])
    dip_readings_data = storage.get('dip_readings_data', {})

    if tank_id not in tank_data:
        return {"error": "Tank not found"}

    tank_data[tank_id]["current_level"] += volume_added
    # Don't exceed capacity
    if tank_data[tank_id]["current_level"] > tank_data[tank_id]["capacity"]:
        tank_data[tank_id]["current_level"] = tank_data[tank_id]["capacity"]

    tank_data[tank_id]["last_updated"] = datetime.now().isoformat()

    percentage = (tank_data[tank_id]["current_level"] / tank_data[tank_id]["capacity"]) * 100

    return {
        "tank_id": tank_id,
        "current_level": tank_data[tank_id]["current_level"],
        "percentage": percentage,
        "status": "refilled"
    }

@router.post("/delivery")
def receive_delivery(delivery: StockDelivery, ctx: dict = Depends(get_station_context)):
    """
    Receive a fuel delivery and update tank levels.
    Calculates actual loss vs expected loss.
    """
    storage = ctx["storage"]
    tank_data = storage.get('tanks', {})
    delivery_history = storage.get('delivery_history', [])
    dip_readings_data = storage.get('dip_readings_data', {})

    if delivery.tank_id not in tank_data:
        return {"error": "Tank not found"}

    # Calculate loss during delivery
    actual_loss = delivery.expected_volume - delivery.volume_delivered
    actual_loss_percent = (actual_loss / delivery.expected_volume) * 100 if delivery.expected_volume > 0 else 0

    # Get allowable loss from config
    allowable_loss_percent = get_allowable_loss_percent(delivery.fuel_type)
    allowable_loss = (allowable_loss_percent / 100) * delivery.expected_volume

    # Determine if loss is within acceptable range
    loss_status = "acceptable" if actual_loss <= allowable_loss else "excessive"

    # Update tank level
    previous_level = tank_data[delivery.tank_id]["current_level"]
    tank_data[delivery.tank_id]["current_level"] += delivery.volume_delivered

    # Don't exceed capacity
    if tank_data[delivery.tank_id]["current_level"] > tank_data[delivery.tank_id]["capacity"]:
        tank_data[delivery.tank_id]["current_level"] = tank_data[delivery.tank_id]["capacity"]

    tank_data[delivery.tank_id]["last_updated"] = datetime.now().isoformat()

    new_level = tank_data[delivery.tank_id]["current_level"]
    percentage = (new_level / tank_data[delivery.tank_id]["capacity"]) * 100

    # Record delivery in history
    delivery_record = {
        "delivery_id": f"DEL-{len(delivery_history) + 1:04d}",
        "timestamp": datetime.now().isoformat(),
        "tank_id": delivery.tank_id,
        "fuel_type": delivery.fuel_type,
        "expected_volume": delivery.expected_volume,
        "volume_delivered": delivery.volume_delivered,
        "flowmeter_volume": delivery.flowmeter_volume,
        "actual_loss": actual_loss,
        "actual_loss_percent": actual_loss_percent,
        "allowable_loss": allowable_loss,
        "allowable_loss_percent": allowable_loss_percent,
        "loss_status": loss_status,
        "previous_level": previous_level,
        "new_level": new_level,
        "supplier": delivery.supplier,
        "delivery_note": delivery.delivery_note
    }
    delivery_history.append(delivery_record)

    # Notifications
    station_id = ctx["station_id"]
    create_notification(
        station_id=station_id,
        type="DELIVERY_RECEIVED",
        severity="medium",
        title="Delivery Received",
        message=f"{delivery.fuel_type} delivery of {delivery.volume_delivered}L from {delivery.supplier}",
        entity_type="delivery",
        entity_id=delivery_record["delivery_id"],
        created_by=ctx.get("username", "system"),
    )

    if loss_status == "excessive":
        create_notification(
            station_id=station_id,
            type="DELIVERY_LOSS_EXCESSIVE",
            severity="high",
            title="Excessive Delivery Loss",
            message=f"Delivery {delivery_record['delivery_id']}: Loss {actual_loss:.2f}L ({actual_loss_percent:.2f}%) exceeds allowable {allowable_loss:.2f}L ({allowable_loss_percent}%)",
            entity_type="delivery",
            entity_id=delivery_record["delivery_id"],
            created_by=ctx.get("username", "system"),
        )

    # Tank level check after delivery
    capacity = tank_data[delivery.tank_id]["capacity"]
    if capacity > 0:
        pct = (new_level / capacity) * 100
        if pct < 10:
            create_notification(
                station_id=station_id,
                type="TANK_LEVEL_CRITICAL",
                severity="critical",
                title="Critical Tank Level",
                message=f"Tank {delivery.tank_id} is at {pct:.1f}% capacity ({new_level:.0f}L / {capacity:.0f}L)",
                entity_type="tank",
                entity_id=delivery.tank_id,
            )
        elif pct < 25:
            create_notification(
                station_id=station_id,
                type="TANK_LEVEL_LOW",
                severity="medium",
                title="Low Tank Level",
                message=f"Tank {delivery.tank_id} is at {pct:.1f}% capacity ({new_level:.0f}L / {capacity:.0f}L)",
                entity_type="tank",
                entity_id=delivery.tank_id,
            )

    # Flowmeter analysis (if provided)
    flowmeter_analysis = None
    if delivery.flowmeter_volume is not None and delivery.expected_volume > 0:
        fm_vs_invoice = round(delivery.expected_volume - delivery.flowmeter_volume, 2)
        fm_vs_delivered = round(delivery.flowmeter_volume - delivery.volume_delivered, 2)
        flowmeter_analysis = {
            "flowmeter_volume": delivery.flowmeter_volume,
            "invoice_vs_flowmeter": fm_vs_invoice,
            "flowmeter_vs_delivered": fm_vs_delivered,
        }

    return {
        "status": "success",
        "message": f"Delivery received for {delivery.fuel_type} tank",
        "delivery_id": delivery_record["delivery_id"],
        "tank_id": delivery.tank_id,
        "previous_level": previous_level,
        "new_level": new_level,
        "percentage": percentage,
        "volume_added": delivery.volume_delivered,
        "loss_analysis": {
            "actual_loss": actual_loss,
            "actual_loss_percent": round(actual_loss_percent, 2),
            "allowable_loss": allowable_loss,
            "allowable_loss_percent": allowable_loss_percent,
            "status": loss_status,
            "message": f"Loss is {loss_status}. Actual: {actual_loss:.2f}L ({actual_loss_percent:.2f}%), Allowable: {allowable_loss:.2f}L ({allowable_loss_percent}%)"
        },
        "flowmeter_analysis": flowmeter_analysis,
    }

@router.get("/deliveries")
def get_delivery_history(limit: int = 50, ctx: dict = Depends(get_station_context)):
    """
    Get fuel delivery history
    """
    storage = ctx["storage"]
    tank_data = storage.get('tanks', {})
    delivery_history = storage.get('delivery_history', [])
    dip_readings_data = storage.get('dip_readings_data', {})

    return sorted(delivery_history, key=lambda x: x["timestamp"], reverse=True)[:limit]

@router.get("/{tank_id}/movements")
def get_stock_movements(tank_id: str, date: Optional[str] = None, limit: int = 50, ctx: dict = Depends(get_station_context)):
    """
    Get unified stock movements (deliveries + sales) for a tank on a given date.
    Returns chronological list of all movements with summary totals.
    """
    storage = ctx["storage"]
    tank_data = storage.get('tanks', {})
    delivery_history = storage.get('delivery_history', [])
    station_id = ctx["station_id"]

    if tank_id not in tank_data:
        raise HTTPException(status_code=404, detail="Tank not found")

    tank = tank_data[tank_id]
    fuel_type = tank["fuel_type"]
    target_date = date or datetime.now().strftime("%Y-%m-%d")

    movements = []

    # 1. Gather deliveries for this tank on the target date
    for delivery in delivery_history:
        if delivery.get("tank_id") != tank_id:
            continue
        delivery_ts = delivery.get("timestamp", "")
        if delivery_ts.startswith(target_date):
            movements.append({
                "timestamp": delivery_ts,
                "type": "DELIVERY",
                "volume": delivery.get("volume_delivered", 0),
                "reference_id": delivery.get("delivery_id", ""),
                "description": f"Delivery from {delivery.get('supplier', 'Unknown')}",
                "supplier": delivery.get("supplier"),
            })

    # 2. Gather sales for this tank on the target date
    #    Prefer tank_id match, fall back to fuel_type for old sales without tank_id
    sales = load_sales(station_id)
    for sale in sales:
        if sale.get("date") != target_date:
            continue
        if sale.get("validation_status") != "PASS":
            continue
        sale_tank = sale.get("tank_id")
        if sale_tank:
            if sale_tank != tank_id:
                continue
        else:
            if sale.get("fuel_type") != fuel_type:
                continue

        avg_vol = sale.get("average_volume", 0)
        mech_vol = sale.get("mechanical_volume", 0)
        elec_vol = sale.get("electronic_volume", 0)
        movements.append({
            "timestamp": sale.get("created_at", ""),
            "type": "SALE",
            "volume": -avg_vol,
            "reference_id": sale.get("sale_id", ""),
            "description": f"{sale.get('shift_id', '')} sale (electronic: {elec_vol:.0f}L, mechanical: {mech_vol:.0f}L)",
            "shift_id": sale.get("shift_id"),
        })

    # Sort chronologically
    movements.sort(key=lambda m: m["timestamp"])

    # Apply limit
    movements = movements[:limit]

    # Calculate summary
    total_delivered = sum(m["volume"] for m in movements if m["type"] == "DELIVERY")
    total_sold = sum(abs(m["volume"]) for m in movements if m["type"] == "SALE")

    return {
        "tank_id": tank_id,
        "fuel_type": fuel_type,
        "date": target_date,
        "movements": movements,
        "summary": {
            "total_delivered": total_delivered,
            "total_sold": total_sold,
            "net_change": total_delivered - total_sold,
            "movement_count": len(movements),
        }
    }


@router.post("/dip-reading/{tank_id}")
def record_dip_reading(tank_id: str, opening_dip: float = None, closing_dip: float = None, user: str = None, ctx: dict = Depends(get_station_context)):
    """
    Record tank dip readings and calculate volume from dip measurement
    Dip measurement in cm, converted to liters based on tank dimensions

    Standard cylindrical tank conversion: 1 cm height ~ 78.54 liters (for 10m diameter tank)
    For more accuracy, use actual tank dimensions
    """
    storage = ctx["storage"]
    tank_data = storage.get('tanks', {})
    delivery_history = storage.get('delivery_history', [])
    dip_readings_data = storage.get('dip_readings_data', {})

    if tank_id not in tank_data:
        return {"error": "Tank not found"}

    # Get or initialize dip readings for this tank
    if tank_id not in dip_readings_data:
        dip_readings_data[tank_id] = {
            "opening_dip": None,
            "closing_dip": None,
            "opening_volume": None,
            "closing_volume": None,
            "last_updated": None,
            "updated_by": None
        }

    # Update readings
    if opening_dip is not None:
        dip_readings_data[tank_id]["opening_dip"] = opening_dip
        dip_readings_data[tank_id]["opening_volume"] = _dip_volume(tank_id, opening_dip)

    if closing_dip is not None:
        dip_readings_data[tank_id]["closing_dip"] = closing_dip
        dip_readings_data[tank_id]["closing_volume"] = _dip_volume(tank_id, closing_dip)
        # Update tank current level based on closing dip
        tank_data[tank_id]["current_level"] = _dip_volume(tank_id, closing_dip)

    dip_readings_data[tank_id]["last_updated"] = datetime.now().isoformat()
    dip_readings_data[tank_id]["updated_by"] = user or "Unknown"

    # Update tank last_updated timestamp
    tank_data[tank_id]["last_updated"] = datetime.now().isoformat()

    from ...database.storage import save_station_storage
    save_station_storage(ctx["station_id"])

    percentage = (tank_data[tank_id]["current_level"] / tank_data[tank_id]["capacity"]) * 100

    return {
        "status": "success",
        "tank_id": tank_id,
        "dip_readings": dip_readings_data[tank_id],
        "current_level": tank_data[tank_id]["current_level"],
        "percentage": percentage,
        "message": "Dip readings recorded successfully"
    }

@router.get("/dip-reading/{tank_id}")
def get_dip_reading(tank_id: str, ctx: dict = Depends(get_station_context)):
    """
    Get stored dip readings for a tank
    """
    storage = ctx["storage"]
    tank_data = storage.get('tanks', {})
    delivery_history = storage.get('delivery_history', [])
    dip_readings_data = storage.get('dip_readings_data', {})

    if tank_id not in tank_data:
        return {"error": "Tank not found"}

    if tank_id not in dip_readings_data:
        return {
            "tank_id": tank_id,
            "opening_dip": None,
            "closing_dip": None,
            "opening_volume": None,
            "closing_volume": None
        }

    return {
        "tank_id": tank_id,
        **dip_readings_data[tank_id]
    }


@router.post("/create")
def create_tank(tank_id: str, fuel_type: str, capacity: float, initial_level: float = 0.0, ctx: dict = Depends(get_station_context)):
    """
    Create a new tank (Owner only)

    Args:
        tank_id: Tank ID (e.g., TANK-DIESEL, TANK-PETROL, TANK-DIESEL-2)
        fuel_type: Fuel type (Diesel or Petrol)
        capacity: Tank capacity in liters
        initial_level: Initial fuel level in liters (default: 0.0)
    """
    storage = ctx["storage"]
    tank_data = storage.get('tanks', {})
    delivery_history = storage.get('delivery_history', [])
    dip_readings_data = storage.get('dip_readings_data', {})

    # Validate tank doesn't already exist
    if tank_id in tank_data:
        raise HTTPException(status_code=400, detail=f"Tank {tank_id} already exists")

    # Validate fuel type
    if fuel_type not in ["Diesel", "Petrol"]:
        raise HTTPException(status_code=400, detail="Fuel type must be 'Diesel' or 'Petrol'")

    # Validate capacity
    if capacity <= 0:
        raise HTTPException(status_code=400, detail="Capacity must be greater than 0")

    # Validate initial level
    if initial_level < 0:
        raise HTTPException(status_code=400, detail="Initial level cannot be negative")

    if initial_level > capacity:
        raise HTTPException(
            status_code=400,
            detail=f"Initial level ({initial_level}L) cannot exceed capacity ({capacity}L)"
        )

    # Create the tank
    percentage = (initial_level / capacity) * 100 if capacity > 0 else 0
    tank_data[tank_id] = {
        "tank_id": tank_id,
        "fuel_type": fuel_type,
        "current_level": initial_level,
        "capacity": capacity,
        "last_updated": datetime.now().isoformat(),
        "percentage": percentage
    }

    # Calibration must be uploaded per tank (force-upload). We intentionally do NOT
    # clone a sibling tank's chart here: a cloned chart silently produced wrong
    # volumes for a tank of a different size (e.g. two diesel tanks of 30,000 L vs
    # 14,000 L). A new tank starts with no chart until one is uploaded.
    _tanks_logger.info(f"Tank {tank_id} created without a calibration chart - upload one before recording dips.")

    return {
        "status": "success",
        "message": f"Tank {tank_id} created successfully",
        "tank": tank_data[tank_id]
    }


@router.delete("/{tank_id}")
def delete_tank(tank_id: str, ctx: dict = Depends(get_station_context)):
    """
    Delete a tank (Owner only)

    Args:
        tank_id: Tank ID to delete
    """
    storage = ctx["storage"]
    tank_data = storage.get('tanks', {})
    delivery_history = storage.get('delivery_history', [])
    dip_readings_data = storage.get('dip_readings_data', {})

    if tank_id not in tank_data:
        raise HTTPException(status_code=404, detail="Tank not found")

    # Check if tank is being used by any pump station OR any nozzle.
    # Nozzle-level assignments win over pump-level (since the multi-fuel refactor),
    # so both must be checked before the tank can be safely removed.
    islands_data = storage.get('islands', {})
    blocking_pumps = []      # list of (pump_station_id, island_id)
    blocking_nozzles = []    # list of (nozzle_id, island_id)

    for island_id, island in islands_data.items():
        pump_station = island.get("pump_station") or {}
        if pump_station.get("tank_id") == tank_id:
            blocking_pumps.append((pump_station.get("pump_station_id"), island_id))
        for nozzle in pump_station.get("nozzles", []) or []:
            if nozzle.get("tank_id") == tank_id:
                blocking_nozzles.append((nozzle.get("nozzle_id"), island_id))

    if blocking_pumps or blocking_nozzles:
        parts = [f"Cannot delete tank {tank_id} — still in use."]
        if blocking_pumps:
            pump_list = ", ".join(f"{pid} (island {iid})" for pid, iid in blocking_pumps)
            parts.append(f"Pump stations: {pump_list}.")
        if blocking_nozzles:
            nozzle_list = ", ".join(f"{nid} (island {iid})" for nid, iid in blocking_nozzles)
            parts.append(f"Nozzles: {nozzle_list}.")
        parts.append("Reassign these to a different tank, then retry.")
        raise HTTPException(status_code=400, detail=" ".join(parts))

    # Delete the tank
    deleted_tank = tank_data.pop(tank_id)

    return {
        "status": "success",
        "message": f"Tank {tank_id} deleted successfully",
        "deleted_tank": deleted_tank
    }


@router.put("/{tank_id}/capacity")
def update_tank_capacity(tank_id: str, new_capacity: float, ctx: dict = Depends(get_station_context)):
    """
    Update tank capacity (Owner only)

    Args:
        tank_id: Tank ID (TANK-DIESEL or TANK-PETROL)
        new_capacity: New capacity in liters
    """
    storage = ctx["storage"]
    tank_data = storage.get('tanks', {})
    delivery_history = storage.get('delivery_history', [])
    dip_readings_data = storage.get('dip_readings_data', {})

    if tank_id not in tank_data:
        raise HTTPException(status_code=404, detail="Tank not found")

    if new_capacity <= 0:
        raise HTTPException(status_code=400, detail="Capacity must be greater than 0")

    tank = tank_data[tank_id]
    old_capacity = tank["capacity"]

    # Check if new capacity is less than current level
    if new_capacity < tank["current_level"]:
        raise HTTPException(
            status_code=400,
            detail=f"New capacity ({new_capacity}L) cannot be less than current level ({tank['current_level']}L). "
                   f"Please reduce tank level first."
        )

    # Update capacity
    tank["capacity"] = new_capacity

    # Recalculate percentage
    tank["percentage"] = (tank["current_level"] / new_capacity) * 100

    # Update timestamp
    tank["last_updated"] = datetime.now().isoformat()

    return {
        "status": "success",
        "message": f"Tank capacity updated from {old_capacity}L to {new_capacity}L",
        "tank_id": tank_id,
        "fuel_type": tank["fuel_type"],
        "old_capacity": old_capacity,
        "new_capacity": new_capacity,
        "current_level": tank["current_level"],
        "new_percentage": tank["percentage"]
    }
