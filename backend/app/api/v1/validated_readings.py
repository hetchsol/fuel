"""
API endpoints for validated readings (Mechanical, Electronic, Dip)
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List
import json
import os
from datetime import datetime

from ...models.models import ValidatedReadingInput, ValidatedReadingOutput
from ...services.reading_validation import create_validated_reading
from .auth import get_station_context
from ...database.station_files import get_station_file

router = APIRouter()


def load_validated_readings(station_id: str) -> List[dict]:
    """Load validated readings from station-specific file"""
    filepath = get_station_file(station_id, 'validated_readings.json')
    if not os.path.exists(filepath):
        return []

    try:
        with open(filepath, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading validated readings: {e}")
        return []


def save_validated_readings(readings: List[dict], station_id: str):
    """Save validated readings to station-specific file"""
    filepath = get_station_file(station_id, 'validated_readings.json')

    try:
        with open(filepath, 'w') as f:
            json.dump(readings, f, indent=2)
    except Exception as e:
        print(f"Error saving validated readings: {e}")
        raise


@router.post("/validated-readings", response_model=ValidatedReadingOutput)
def create_new_validated_reading(payload: ValidatedReadingInput, ctx: dict = Depends(get_station_context)):
    """
    Create a new validated reading record
    Validates mechanical, electronic, and dip readings for consistency
    """
    try:
        # Create validated reading with validation logic
        validated_reading = create_validated_reading(
            shift_id=payload.shift_id,
            tank_id=payload.tank_id,
            reading_type=payload.reading_type,
            mechanical_reading=payload.mechanical_reading,
            electronic_reading=payload.electronic_reading,
            dip_reading_cm=payload.dip_reading_cm,
            recorded_by=payload.recorded_by,
            notes=payload.notes
        )

        # Load existing readings
        readings = load_validated_readings(ctx["station_id"])

        # Add new reading
        readings.append(validated_reading)

        # Save back to file
        save_validated_readings(readings, ctx["station_id"])

        return ValidatedReadingOutput(**validated_reading)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating validated reading: {str(e)}")


@router.get("/validated-readings", response_model=List[ValidatedReadingOutput])
def get_all_validated_readings(
    shift_id: str = None,
    tank_id: str = None,
    validation_status: str = None,
    ctx: dict = Depends(get_station_context),
):
    """
    Get all validated readings with optional filtering

    Args:
        shift_id: Filter by shift ID
        tank_id: Filter by tank ID
        validation_status: Filter by validation status (PASS, WARNING, FAIL)
    """
    try:
        readings = load_validated_readings(ctx["station_id"])

        # Apply filters
        if shift_id:
            readings = [r for r in readings if r.get("shift_id") == shift_id]

        if tank_id:
            readings = [r for r in readings if r.get("tank_id") == tank_id]

        if validation_status:
            readings = [r for r in readings if r.get("validation_status") == validation_status]

        return [ValidatedReadingOutput(**r) for r in readings]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving validated readings: {str(e)}")


@router.get("/validated-readings/{reading_id}", response_model=ValidatedReadingOutput)
def get_validated_reading_by_id(reading_id: str, ctx: dict = Depends(get_station_context)):
    """Get a specific validated reading by ID"""
    try:
        readings = load_validated_readings(ctx["station_id"])

        # Find reading by ID
        reading = next((r for r in readings if r.get("reading_id") == reading_id), None)

        if not reading:
            raise HTTPException(status_code=404, detail=f"Validated reading {reading_id} not found")

        return ValidatedReadingOutput(**reading)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving validated reading: {str(e)}")


@router.get("/validated-readings/shift/{shift_id}/summary")
def get_shift_validated_readings_summary(shift_id: str, ctx: dict = Depends(get_station_context)):
    """
    Get summary of validated readings for a specific shift

    Returns:
        Statistics about validated readings for the shift
    """
    try:
        readings = load_validated_readings(ctx["station_id"])
        shift_readings = [r for r in readings if r.get("shift_id") == shift_id]

        if not shift_readings:
            return {
                "shift_id": shift_id,
                "total_readings": 0,
                "pass_count": 0,
                "warning_count": 0,
                "fail_count": 0,
                "readings": []
            }

        # Count by status
        pass_count = len([r for r in shift_readings if r.get("validation_status") == "PASS"])
        warning_count = len([r for r in shift_readings if r.get("validation_status") == "WARNING"])
        fail_count = len([r for r in shift_readings if r.get("validation_status") == "FAIL"])

        return {
            "shift_id": shift_id,
            "total_readings": len(shift_readings),
            "pass_count": pass_count,
            "warning_count": warning_count,
            "fail_count": fail_count,
            "readings": [ValidatedReadingOutput(**r) for r in shift_readings]
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving shift summary: {str(e)}")
