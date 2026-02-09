"""
Fuel Tank Inventory API
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from typing import List
from ...models.models import FuelTankLevel, StockDelivery
from ...config import TANK_CONVERSION_FACTOR, get_allowable_loss_percent
from .auth import get_station_context

router = APIRouter()


@router.get("/levels", response_model=List[FuelTankLevel])
def get_tank_levels(ctx: dict = Depends(get_station_context)):
    """
    Get current fuel levels for all tanks
    """
    storage = ctx["storage"]
    tank_data = storage['tanks']

    tanks = []
    for tank_id, data in tank_data.items():
        percentage = (data["current_level"] / data["capacity"]) * 100
        tanks.append(FuelTankLevel(
            tank_id=data["tank_id"],
            fuel_type=data["fuel_type"],
            current_level=data["current_level"],
            capacity=data["capacity"],
            last_updated=data["last_updated"],
            percentage=percentage
        ))
    return tanks

@router.post("/update/{tank_id}")
def update_tank_level(tank_id: str, volume_dispensed: float, ctx: dict = Depends(get_station_context)):
    """
    Update tank level after fuel dispensing
    Called after each sale to reduce tank level
    """
    storage = ctx["storage"]
    tank_data = storage['tanks']
    delivery_history = storage['delivery_history']
    dip_readings_data = storage['dip_readings_data']

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

@router.post("/refill/{tank_id}")
def refill_tank(tank_id: str, volume_added: float, ctx: dict = Depends(get_station_context)):
    """
    Refill a tank with new fuel
    """
    storage = ctx["storage"]
    tank_data = storage['tanks']
    delivery_history = storage['delivery_history']
    dip_readings_data = storage['dip_readings_data']

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
    tank_data = storage['tanks']
    delivery_history = storage['delivery_history']
    dip_readings_data = storage['dip_readings_data']

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
        }
    }

@router.get("/deliveries")
def get_delivery_history(limit: int = 50, ctx: dict = Depends(get_station_context)):
    """
    Get fuel delivery history
    """
    storage = ctx["storage"]
    tank_data = storage['tanks']
    delivery_history = storage['delivery_history']
    dip_readings_data = storage['dip_readings_data']

    return sorted(delivery_history, key=lambda x: x["timestamp"], reverse=True)[:limit]

@router.post("/dip-reading/{tank_id}")
def record_dip_reading(tank_id: str, opening_dip: float = None, closing_dip: float = None, user: str = None, ctx: dict = Depends(get_station_context)):
    """
    Record tank dip readings and calculate volume from dip measurement
    Dip measurement in cm, converted to liters based on tank dimensions

    Standard cylindrical tank conversion: 1 cm height ~ 78.54 liters (for 10m diameter tank)
    For more accuracy, use actual tank dimensions
    """
    storage = ctx["storage"]
    tank_data = storage['tanks']
    delivery_history = storage['delivery_history']
    dip_readings_data = storage['dip_readings_data']

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
        dip_readings_data[tank_id]["opening_volume"] = opening_dip * TANK_CONVERSION_FACTOR

    if closing_dip is not None:
        dip_readings_data[tank_id]["closing_dip"] = closing_dip
        dip_readings_data[tank_id]["closing_volume"] = closing_dip * TANK_CONVERSION_FACTOR
        # Update tank current level based on closing dip
        tank_data[tank_id]["current_level"] = closing_dip * TANK_CONVERSION_FACTOR

    dip_readings_data[tank_id]["last_updated"] = datetime.now().isoformat()
    dip_readings_data[tank_id]["updated_by"] = user or "Unknown"

    # Update tank last_updated timestamp
    tank_data[tank_id]["last_updated"] = datetime.now().isoformat()

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
    tank_data = storage['tanks']
    delivery_history = storage['delivery_history']
    dip_readings_data = storage['dip_readings_data']

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
    tank_data = storage['tanks']
    delivery_history = storage['delivery_history']
    dip_readings_data = storage['dip_readings_data']

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
    tank_data = storage['tanks']
    delivery_history = storage['delivery_history']
    dip_readings_data = storage['dip_readings_data']

    if tank_id not in tank_data:
        raise HTTPException(status_code=404, detail="Tank not found")

    # Check if tank is being used by any pump station
    islands_data = storage.get('islands', {})

    for island_id, island in islands_data.items():
        pump_station = island.get("pump_station", {})
        if pump_station.get("tank_id") == tank_id:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete tank {tank_id}. It is currently used by pump station {pump_station.get('pump_station_id')} on island {island_id}. Please reassign the pump station first."
            )

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
    tank_data = storage['tanks']
    delivery_history = storage['delivery_history']
    dip_readings_data = storage['dip_readings_data']

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
