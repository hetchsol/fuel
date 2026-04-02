"""
Tank Calibration Upload API

Allows owner to upload Excel calibration charts (dip cm → volume L)
per tank. Charts are stored per-station and loaded on startup for
accurate dip-to-volume conversions.
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from datetime import datetime
from typing import Optional
import io
import logging

from .auth import get_station_context, require_owner, get_current_user
from ...database.station_files import load_station_json, save_station_json
from ...services.audit_service import log_audit_event
from ...services.dip_conversion import register_tank_calibration, _dynamic_calibrations

logger = logging.getLogger(__name__)

router = APIRouter()

CALIBRATION_FILE = 'tank_calibrations.json'


def _load_calibrations(station_id: str) -> dict:
    return load_station_json(station_id, CALIBRATION_FILE, default={})


def _save_calibrations(station_id: str, data: dict):
    save_station_json(station_id, CALIBRATION_FILE, data)


@router.get("/template")
def download_template(current_user: dict = Depends(get_current_user)):
    """Download an Excel template for tank calibration data."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment

    wb = Workbook()
    ws = wb.active
    ws.title = "Tank Calibration"

    # Instructions
    ws.merge_cells('A1:B1')
    ws['A1'] = "Enter dip stick readings (cm) and corresponding volumes (liters) from the manufacturer's calibration chart"
    ws['A1'].font = Font(italic=True, color="666666")

    # Headers
    header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF")
    for col, header in [(1, "Dip (cm)"), (2, "Volume (L)")]:
        cell = ws.cell(row=2, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")

    # Example data (guide)
    examples = [(0, 0), (10, 520), (20, 1850)]
    for i, (dip, vol) in enumerate(examples):
        ws.cell(row=3 + i, column=1, value=dip)
        ws.cell(row=3 + i, column=2, value=vol)

    # Note
    ws.cell(row=7, column=1, value="Replace examples with your actual calibration data")
    ws['A7'].font = Font(italic=True, color="999999")

    ws.column_dimensions['A'].width = 15
    ws.column_dimensions['B'].width = 15

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="tank_calibration_template.xlsx"'},
    )


@router.post("/upload")
async def upload_calibration(
    tank_id: str = Query(...),
    file: UploadFile = File(...),
    ctx: dict = Depends(require_owner),
):
    """Upload an Excel calibration chart for a tank (owner only)."""
    station_id = ctx["station_id"]
    storage = ctx["storage"]

    # Validate tank exists
    tanks = storage.get('tanks', {})
    if tank_id not in tanks:
        raise HTTPException(status_code=404, detail=f"Tank {tank_id} not found")

    # Validate file type
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="File must be an Excel file (.xlsx)")

    # Parse Excel
    try:
        from openpyxl import load_workbook
        content = await file.read()
        wb = load_workbook(io.BytesIO(content), data_only=True)
        ws = wb.active
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read Excel file: {str(e)}")

    # Extract dip/volume pairs
    chart = {}
    errors = []
    row_num = 0

    for row in ws.iter_rows(min_row=1, max_col=2, values_only=True):
        row_num += 1
        dip_val, vol_val = row

        # Skip empty rows, header rows, instruction rows
        if dip_val is None or vol_val is None:
            continue
        if isinstance(dip_val, str) and not dip_val.replace('.', '').replace('-', '').isdigit():
            continue

        try:
            dip = float(dip_val)
            vol = float(vol_val)
        except (ValueError, TypeError):
            errors.append(f"Row {row_num}: invalid numeric values ({dip_val}, {vol_val})")
            continue

        if dip < 0:
            errors.append(f"Row {row_num}: dip cannot be negative ({dip})")
            continue
        if vol < 0:
            errors.append(f"Row {row_num}: volume cannot be negative ({vol})")
            continue

        chart[dip] = vol

    if errors:
        raise HTTPException(status_code=400, detail=f"Validation errors: {'; '.join(errors[:5])}")

    if len(chart) < 5:
        raise HTTPException(status_code=400, detail=f"At least 5 calibration points required. Found {len(chart)}.")

    # Validate ascending order
    dips = sorted(chart.keys())
    vols = [chart[d] for d in dips]
    for i in range(1, len(vols)):
        if vols[i] < vols[i - 1]:
            raise HTTPException(status_code=400, detail=f"Volume must increase with dip. At dip {dips[i]}cm, volume {vols[i]}L is less than previous {vols[i-1]}L")

    # Build sorted chart
    sorted_chart = {str(d): chart[d] for d in dips}

    # Get tank info for registration
    tank = tanks[tank_id]
    capacity = tank.get("capacity", max(vols) if vols else 50000)

    # Save to station file
    calibrations = _load_calibrations(station_id)
    calibrations[tank_id] = {
        "tank_id": tank_id,
        "chart": sorted_chart,
        "uploaded_at": datetime.now().isoformat(),
        "uploaded_by": ctx["username"],
        "point_count": len(sorted_chart),
    }
    _save_calibrations(station_id, calibrations)

    # Register for immediate use
    float_chart = {float(k): v for k, v in sorted_chart.items()}
    register_tank_calibration(tank_id, float_chart, capacity=capacity)

    log_audit_event(
        station_id=station_id,
        action="calibration_upload",
        performed_by=ctx["username"],
        entity_type="tank_calibration",
        entity_id=tank_id,
        details={"point_count": len(sorted_chart), "max_dip": dips[-1], "max_volume": vols[-1]},
    )

    return {
        "status": "success",
        "message": f"Calibration uploaded for {tank_id}: {len(sorted_chart)} data points",
        "tank_id": tank_id,
        "point_count": len(sorted_chart),
        "max_dip_cm": dips[-1],
        "max_volume_l": vols[-1],
    }


@router.get("/{tank_id}")
def get_calibration(tank_id: str, ctx: dict = Depends(get_station_context)):
    """Get the current calibration chart for a tank."""
    station_id = ctx["station_id"]
    calibrations = _load_calibrations(station_id)

    if tank_id in calibrations:
        return {"found": True, **calibrations[tank_id]}

    return {"found": False, "tank_id": tank_id, "message": "No custom calibration. Using system default."}


@router.delete("/{tank_id}")
def clear_calibration(tank_id: str, ctx: dict = Depends(require_owner)):
    """Clear a tank's custom calibration (owner only). Reverts to system default."""
    station_id = ctx["station_id"]
    calibrations = _load_calibrations(station_id)

    if tank_id not in calibrations:
        raise HTTPException(status_code=404, detail=f"No custom calibration found for {tank_id}")

    del calibrations[tank_id]
    _save_calibrations(station_id, calibrations)

    # Remove from runtime registry
    _dynamic_calibrations.pop(tank_id, None)

    log_audit_event(
        station_id=station_id,
        action="calibration_clear",
        performed_by=ctx["username"],
        entity_type="tank_calibration",
        entity_id=tank_id,
    )

    return {"status": "success", "message": f"Calibration cleared for {tank_id}. Using system default."}


def load_saved_calibrations(station_id: str):
    """Load saved calibrations from JSON and register them. Called at startup."""
    try:
        calibrations = _load_calibrations(station_id)
        for tank_id, cal_data in calibrations.items():
            chart = cal_data.get("chart", {})
            float_chart = {float(k): v for k, v in chart.items()}
            if float_chart:
                register_tank_calibration(tank_id, float_chart)
                logger.info(f"[calibration] Loaded {len(float_chart)} points for {tank_id} at station {station_id}")
    except Exception as e:
        logger.warning(f"[calibration] Failed to load calibrations for station {station_id}: {e}")
