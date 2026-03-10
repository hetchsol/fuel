"""
Export API — CSV and Excel downloads for tank readings, sales, reconciliation.
Requires supervisor or owner role.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from typing import Optional
import io
import json
import os

from .auth import require_supervisor_or_owner, get_station_context
from ...database.station_files import load_station_json
from ...services.export_service import (
    tank_readings_to_csv, tank_readings_to_excel,
    sales_to_csv, sales_to_excel,
    reconciliation_to_csv, reconciliation_to_excel,
)

router = APIRouter()


def _load_json(station_id: str, filename: str):
    return load_station_json(station_id, filename, default={})


def _stream(content: bytes | str, filename: str, media_type: str):
    if isinstance(content, str):
        content = content.encode("utf-8")
    return StreamingResponse(
        io.BytesIO(content),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------- Tank Readings ----------

@router.get("/tank-readings", dependencies=[Depends(require_supervisor_or_owner)])
def export_tank_readings(
    format: str = "excel",
    tank_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    ctx: dict = Depends(get_station_context),
):
    """Download tank readings as CSV or Excel."""
    station_id = ctx["station_id"]
    data = _load_json(station_id, "tank_readings.json")

    readings = list(data.values()) if isinstance(data, dict) else data

    # Apply filters
    if tank_id:
        readings = [r for r in readings if r.get("tank_id") == tank_id]
    if start_date:
        readings = [r for r in readings if r.get("date", "") >= start_date]
    if end_date:
        readings = [r for r in readings if r.get("date", "") <= end_date]

    # Sort by date descending
    readings.sort(key=lambda r: r.get("date", ""), reverse=True)

    if not readings:
        raise HTTPException(status_code=404, detail="No tank readings found for the given filters")

    if format == "csv":
        content = tank_readings_to_csv(readings)
        return _stream(content, "tank_readings.csv", "text/csv")
    else:
        content = tank_readings_to_excel(readings, station_name=station_id)
        return _stream(content, "tank_readings.xlsx",
                       "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


# ---------- Sales ----------

@router.get("/sales", dependencies=[Depends(require_supervisor_or_owner)])
def export_sales(
    format: str = "excel",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    ctx: dict = Depends(get_station_context),
):
    """Download sales records as CSV or Excel."""
    station_id = ctx["station_id"]
    data = _load_json(station_id, "sales.json")

    sales = data if isinstance(data, list) else list(data.values())

    if start_date:
        sales = [s for s in sales if s.get("date", "") >= start_date]
    if end_date:
        sales = [s for s in sales if s.get("date", "") <= end_date]

    sales.sort(key=lambda s: s.get("date", ""), reverse=True)

    if not sales:
        raise HTTPException(status_code=404, detail="No sales found for the given filters")

    if format == "csv":
        content = sales_to_csv(sales)
        return _stream(content, "sales.csv", "text/csv")
    else:
        content = sales_to_excel(sales, station_name=station_id)
        return _stream(content, "sales.xlsx",
                       "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


# ---------- Reconciliation ----------

@router.get("/reconciliation", dependencies=[Depends(require_supervisor_or_owner)])
def export_reconciliation(
    format: str = "excel",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    ctx: dict = Depends(get_station_context),
):
    """Download reconciliation records as CSV or Excel."""
    storage = ctx["storage"]
    recon_data = list(storage.get("reconciliations_data", []))

    if start_date:
        recon_data = [r for r in recon_data if r.get("date", "") >= start_date]
    if end_date:
        recon_data = [r for r in recon_data if r.get("date", "") <= end_date]

    recon_data.sort(key=lambda r: r.get("date", ""), reverse=True)

    if not recon_data:
        raise HTTPException(status_code=404, detail="No reconciliation data found for the given filters")

    if format == "csv":
        content = reconciliation_to_csv(recon_data)
        return _stream(content, "reconciliation.csv", "text/csv")
    else:
        content = reconciliation_to_excel(recon_data, station_name=ctx["station_id"])
        return _stream(content, "reconciliation.xlsx",
                       "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
