"""
Comprehensive Shift Reconciliation API
Matches the Summary sheet functionality from the Excel spreadsheet
Station-aware: all data lives in ctx["storage"]
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from ...models.models import ShiftReconciliation, TankReconciliation
from ...config import resolve_fuel_price
from ...database.storage import get_nozzle, get_tank_id_for_nozzle
from .auth import get_station_context
from ...database.station_files import load_station_json, save_station_json

router = APIRouter()


def _load_station_tank_readings(station_id: str) -> dict:
    """Load tank readings from station-specific storage."""
    return load_station_json(station_id, 'tank_readings.json', default={})


def load_reconciliations(station_id: str) -> list:
    """Load persisted reconciliations from station JSON file."""
    return load_station_json(station_id, 'reconciliations.json', default=[])


def save_reconciliations(data: list, station_id: str):
    """Save reconciliations to station JSON file."""
    save_station_json(station_id, 'reconciliations.json', data)


def _get_reconciliations(station_id: str, storage: dict) -> list:
    """
    Get reconciliations from persisted file, falling back to in-memory storage.
    Merges both sources (file takes priority, in-memory fills gaps).
    """
    file_data = load_reconciliations(station_id)
    mem_data = storage.get('reconciliations_data', [])

    if file_data:
        # Merge any in-memory entries not already in file (by shift_id)
        file_shift_ids = {r.get('shift_id') for r in file_data}
        for r in mem_data:
            if r.get('shift_id') not in file_shift_ids:
                file_data.append(r)
        return file_data
    elif mem_data:
        return mem_data
    return []


def _save_reconciliation_entry(entry: dict, station_id: str, storage: dict):
    """
    Save a reconciliation entry: update if shift_id exists, append otherwise.
    Persists to both in-memory storage and JSON file.
    """
    recons = _get_reconciliations(station_id, storage)
    # Check for existing entry by shift_id + attendant_id (avoid duplicates)
    shift_id = entry.get('shift_id')
    attendant_id = entry.get('attendant_id', '')
    found = False
    for i, r in enumerate(recons):
        if r.get('shift_id') == shift_id and r.get('attendant_id', '') == attendant_id:
            recons[i] = entry
            found = True
            break
    if not found:
        recons.append(entry)

    # Persist to file
    save_reconciliations(recons, station_id)
    # Keep in-memory in sync
    storage['reconciliations_data'] = recons


@router.post("/shift", response_model=ShiftReconciliation)
def create_shift_reconciliation(recon: ShiftReconciliation, ctx: dict = Depends(get_station_context)):
    """
    Create comprehensive shift reconciliation
    Matches Summary sheet in Excel
    """
    _save_reconciliation_entry(recon.dict(), ctx["station_id"], ctx["storage"])
    return recon

@router.get("/shift/{shift_id}", response_model=ShiftReconciliation)
def get_shift_reconciliation(shift_id: str, ctx: dict = Depends(get_station_context)):
    """
    Get reconciliation for a specific shift
    """
    recons = _get_reconciliations(ctx["station_id"], ctx["storage"])
    recon = next((r for r in recons if r["shift_id"] == shift_id), None)

    if not recon:
        raise HTTPException(status_code=404, detail="Reconciliation not found")

    return ShiftReconciliation(**recon)

@router.get("/date/{date}")
def get_date_reconciliation(date: str, ctx: dict = Depends(get_station_context)):
    """
    Get both Day and Night shift reconciliations for a specific date
    """
    recons = _get_reconciliations(ctx["station_id"], ctx["storage"])
    date_recons = [
        ShiftReconciliation(**r) for r in recons
        if r["date"] == date
    ]
    return date_recons

@router.post("/shift/{shift_id}/deposit")
def record_bank_deposit(shift_id: str, amount: float, deposit_slip: str = None, ctx: dict = Depends(get_station_context)):
    """
    Record actual amount deposited to bank
    Updates difference and calculates variance
    """
    station_id = ctx["station_id"]
    storage = ctx["storage"]
    recons = _get_reconciliations(station_id, storage)
    recon = next((r for r in recons if r["shift_id"] == shift_id), None)

    if not recon:
        raise HTTPException(status_code=404, detail="Reconciliation not found for this shift")

    recon["actual_deposited"] = amount
    recon["difference"] = amount - recon["expected_cash"]

    # Update cumulative difference
    previous_recons = [r for r in recons if r["date"] < recon["date"]]
    previous_cumulative = sum(r.get("difference", 0) or 0 for r in previous_recons)
    recon["cumulative_difference"] = previous_cumulative + recon["difference"]

    # Persist
    save_reconciliations(recons, station_id)
    storage['reconciliations_data'] = recons

    return {
        "status": "success",
        "shift_id": shift_id,
        "expected_cash": recon["expected_cash"],
        "actual_deposited": amount,
        "difference": recon["difference"],
        "cumulative_difference": recon["cumulative_difference"],
        "deposit_slip": deposit_slip
    }

@router.post("/tank", response_model=TankReconciliation)
def create_tank_reconciliation(tank_recon: TankReconciliation, ctx: dict = Depends(get_station_context)):
    """
    Create tank reconciliation for a shift
    Compares electronic sales vs tank movement
    """
    storage = ctx["storage"]
    storage.get('tank_reconciliations_data', []).append(tank_recon.dict())
    return tank_recon

@router.get("/tank/{shift_id}/{tank_id}")
def get_tank_reconciliation(shift_id: str, tank_id: str, ctx: dict = Depends(get_station_context)):
    """
    Get tank reconciliation for specific shift and tank
    """
    storage = ctx["storage"]
    tank_recon = next(
        (r for r in storage.get('tank_reconciliations_data', []) if r["shift_id"] == shift_id and r["tank_id"] == tank_id),
        None
    )

    if not tank_recon:
        raise HTTPException(status_code=404, detail="Tank reconciliation not found")

    return TankReconciliation(**tank_recon)


@router.get("/shift/{shift_id}/tank-analysis")
def calculate_tank_volume_movement_analysis(shift_id: str, ctx: dict = Depends(get_station_context)):
    """
    Calculate comprehensive shift reconciliation including tank volume movement analysis
    Automatically computes from shift data, tank dip readings, and sales
    """
    storage = ctx["storage"]

    shifts = storage.get('shifts', {})
    sales = storage.get('sales', [])
    tanks = storage.get('tanks', {})

    if shift_id not in shifts:
        raise HTTPException(status_code=404, detail="Shift not found")

    shift = shifts[shift_id]
    shift_date = shift.get('date', '')
    shift_type_str = shift.get('shift_type', '')
    tank_dip_readings = shift.get('tank_dip_readings', [])

    # Fallback: if shift has no inline dip readings, look in tank_readings.json
    # (data entered via Operations > Daily Tank Readings page)
    station_tank_readings = _load_station_tank_readings(ctx["station_id"])
    tank_reading_entries = {}  # tank_id -> tank_readings.json entry (for nozzle fallback)

    if not tank_dip_readings:
        for tr in station_tank_readings.values():
            if tr.get('date') == shift_date and tr.get('shift_type') == shift_type_str:
                tank_id = tr.get('tank_id', '')
                tank_reading_entries[tank_id] = tr
                tank_dip_readings.append({
                    'tank_id': tank_id,
                    'opening_dip_cm': tr.get('opening_dip_cm'),
                    'closing_dip_cm': tr.get('closing_dip_cm'),
                    'opening_volume_liters': tr.get('opening_volume'),
                    'closing_volume_liters': tr.get('closing_volume'),
                })
    else:
        # Even with shift dips, index tank_readings for nozzle/delivery fallback
        for tr in station_tank_readings.values():
            if tr.get('date') == shift_date and tr.get('shift_type') == shift_type_str:
                tank_reading_entries[tr.get('tank_id', '')] = tr

    if not tank_dip_readings:
        raise HTTPException(
            status_code=400,
            detail="No tank dip readings found for this shift. Record readings via Operations > Daily Tank Readings or Shifts > Tank Dip Readings."
        )

    # Calculate tank reconciliation for each tank
    tank_reconciliations = []

    for tank_reading in tank_dip_readings:
        tank_id = tank_reading['tank_id']

        # Get tank info
        if tank_id not in tanks:
            continue

        tank = tanks[tank_id]
        fuel_type = tank['fuel_type']

        # Get opening and closing volumes
        opening_volume = tank_reading.get('opening_volume_liters', 0) or 0
        closing_volume = tank_reading.get('closing_volume_liters', 0) or 0

        # Calculate tank volume movement (decrease in tank level)
        tank_movement = opening_volume - closing_volume

        # Get sales for this shift and tank — three-tier filter:
        # 1. tank_id on sale record (set by Phase 1 nozzle resolution)
        # 2. nozzle_id → tank resolution
        # 3. fuel_type match (backward compat for single-tank setups)
        shift_sales = []
        for s in sales:
            if s.get('shift_id') != shift_id:
                continue
            sale_tank = s.get('tank_id')
            if sale_tank:
                if sale_tank == tank_id:
                    shift_sales.append(s)
                continue
            sale_nozzle = s.get('nozzle_id')
            if sale_nozzle:
                resolved = get_tank_id_for_nozzle(nozzle_id=sale_nozzle, storage=storage)
                if resolved == tank_id:
                    shift_sales.append(s)
                continue
            # Last resort: fuel_type match
            if s.get('fuel_type') == fuel_type:
                shift_sales.append(s)

        # Calculate total electronic and mechanical sales
        total_electronic = sum(s.get('electronic_volume', 0) or 0 for s in shift_sales)
        total_mechanical = sum(s.get('mechanical_volume', 0) or 0 for s in shift_sales)

        # Fallback: if no sales records found, use nozzle readings from tank_readings.json
        if total_electronic == 0 and total_mechanical == 0 and tank_id in tank_reading_entries:
            tr_entry = tank_reading_entries[tank_id]
            total_electronic = tr_entry.get('total_electronic_dispensed', 0) or 0
            total_mechanical = tr_entry.get('total_mechanical_dispensed', 0) or 0

        # Calculate discrepancies (variance between tank movement and sales)
        electronic_vs_tank_discrepancy = tank_movement - total_electronic
        mechanical_vs_tank_discrepancy = tank_movement - total_mechanical

        # Calculate percentage discrepancies
        electronic_discrepancy_percent = (electronic_vs_tank_discrepancy / tank_movement * 100) if tank_movement > 0 else 0
        mechanical_discrepancy_percent = (mechanical_vs_tank_discrepancy / tank_movement * 100) if tank_movement > 0 else 0

        # Look up delivery data from tank readings store (already indexed above)
        delivery_data = None
        deliveries_list = []
        if tank_id in tank_reading_entries:
            tr = tank_reading_entries[tank_id]
            deliveries_list = tr.get('deliveries', [])
            delivery_data = tr.get('delivery_timeline')

        tank_reconciliations.append({
            "tank_id": tank_id,
            "fuel_type": fuel_type,
            "shift_id": shift_id,
            "opening_dip_cm": tank_reading.get('opening_dip_cm'),
            "closing_dip_cm": tank_reading.get('closing_dip_cm'),
            "opening_volume_liters": opening_volume,
            "closing_volume_liters": closing_volume,
            "tank_movement": tank_movement,
            "total_electronic_sales": total_electronic,
            "total_mechanical_sales": total_mechanical,
            "electronic_vs_tank_discrepancy": electronic_vs_tank_discrepancy,
            "mechanical_vs_tank_discrepancy": mechanical_vs_tank_discrepancy,
            "electronic_discrepancy_percent": round(electronic_discrepancy_percent, 2),
            "mechanical_discrepancy_percent": round(mechanical_discrepancy_percent, 2),
            "status": "acceptable" if abs(electronic_discrepancy_percent) < 2.0 else "warning" if abs(electronic_discrepancy_percent) < 5.0 else "critical",
            "message": f"Tank movement: {tank_movement:.2f}L, Electronic sales: {total_electronic:.2f}L, Variance: {electronic_vs_tank_discrepancy:.2f}L ({electronic_discrepancy_percent:.2f}%)",
            "deliveries": deliveries_list,
            "delivery_timeline": delivery_data,
        })

    # Auto-create notifications for critical variances
    critical_tanks = [t for t in tank_reconciliations if t['status'] == 'critical']
    if critical_tanks:
        try:
            from ...services.notification_service import create_notification
            for ct in critical_tanks:
                create_notification(
                    station_id=ctx["station_id"],
                    type="CRITICAL_VARIANCE",
                    severity="critical",
                    title="Critical Tank Variance Detected",
                    message=f"Tank {ct['tank_id']} ({ct['fuel_type']}): {ct['electronic_discrepancy_percent']}% variance "
                            f"({ct['electronic_vs_tank_discrepancy']:.1f}L) during {shift.get('shift_type', '')} shift on {shift.get('date', '')}",
                    entity_type="tank_reconciliation",
                    entity_id=f"{shift_id}-{ct['tank_id']}",
                    created_by="system",
                )
        except Exception:
            pass  # Non-critical: don't break analysis if notification fails

    return {
        "shift_id": shift_id,
        "shift_date": shift.get('date'),
        "shift_type": shift.get('shift_type'),
        "tank_reconciliations": tank_reconciliations,
        "summary": {
            "total_tanks_reconciled": len(tank_reconciliations),
            "critical_variances": len([t for t in tank_reconciliations if t['status'] == 'critical']),
            "warnings": len([t for t in tank_reconciliations if t['status'] == 'warning']),
            "acceptable": len([t for t in tank_reconciliations if t['status'] == 'acceptable'])
        },
        "fuel_prices": {
            "Diesel": resolve_fuel_price("Diesel", storage),
            "Petrol": resolve_fuel_price("Petrol", storage),
        }
    }

@router.post("/calculate/{shift_id}")
def calculate_shift_reconciliation(shift_id: str, nozzle_summaries: dict, lpg_revenue: float = 0, lubricants_revenue: float = 0, accessories_revenue: float = 0, credit_sales: List[dict] = [], ctx: dict = Depends(get_station_context)):
    """
    Calculate comprehensive reconciliation for a shift
    Takes nozzle summaries and calculates all revenue
    """
    storage = ctx["storage"]

    # Try to use stored handover revenue (frozen at submission time) instead of recalculating
    # This ensures price changes after submission don't corrupt historical reconciliation
    station_id = ctx["station_id"]
    handovers_db = load_station_json(station_id, 'attendant_handovers.json', default={})
    shift_handovers = [h for h in handovers_db.values()
                       if h.get("shift_id") == shift_id and h.get("phase", "completed") == "completed"]

    petrol_volume = 0.0
    diesel_volume = 0.0
    petrol_revenue = 0.0
    diesel_revenue = 0.0

    if shift_handovers:
        # Use stored revenue from handover nozzle summaries
        for ho in shift_handovers:
            for ns in ho.get("nozzle_summaries", []):
                if ns.get("fuel_type") == "Petrol":
                    petrol_volume += ns.get("volume_sold", 0)
                    petrol_revenue += ns.get("revenue", 0)
                elif ns.get("fuel_type") == "Diesel":
                    diesel_volume += ns.get("volume_sold", 0)
                    diesel_revenue += ns.get("revenue", 0)
    else:
        # Fallback: recalculate from nozzle_summaries param (backward compat)
        for nozzle_id, summary in nozzle_summaries.items():
            nozzle = get_nozzle(nozzle_id, storage=storage)
            fuel_type = nozzle.get("fuel_type", "") if nozzle else ""
            if fuel_type == "Petrol":
                petrol_volume += summary["electronic_movement"]
            elif fuel_type == "Diesel":
                diesel_volume += summary["electronic_movement"]
        petrol_revenue = petrol_volume * resolve_fuel_price("Petrol", storage)
        diesel_revenue = diesel_volume * resolve_fuel_price("Diesel", storage)

    # Calculate totals
    total_expected = petrol_revenue + diesel_revenue + lpg_revenue + lubricants_revenue + accessories_revenue

    # Calculate credit sales total
    credit_sales_total = sum(sale["amount"] for sale in credit_sales)

    # Calculate expected cash (total - credit sales)
    expected_cash = total_expected - credit_sales_total

    # Get cumulative difference
    previous_recons = _get_reconciliations(ctx["station_id"], storage)
    previous_cumulative = sum(r.get("difference", 0) or 0 for r in previous_recons)

    result = {
        "petrol_volume": petrol_volume,
        "petrol_revenue": petrol_revenue,
        "diesel_volume": diesel_volume,
        "diesel_revenue": diesel_revenue,
        "lpg_revenue": lpg_revenue,
        "lubricants_revenue": lubricants_revenue,
        "accessories_revenue": accessories_revenue,
        "total_expected": total_expected,
        "credit_sales_total": credit_sales_total,
        "expected_cash": expected_cash,
        "cumulative_difference": previous_cumulative
    }

    return result

@router.get("/summary/month/{year}/{month}")
def get_monthly_summary(year: int, month: int, ctx: dict = Depends(get_station_context)):
    """
    Get monthly reconciliation summary
    Similar to month-end totals in Excel
    """
    storage = ctx["storage"]
    month_str = f"{year}-{month:02d}"

    month_recons = [
        r for r in _get_reconciliations(ctx["station_id"], storage)
        if r["date"].startswith(month_str)
    ]

    if not month_recons:
        return {
            "year": year,
            "month": month,
            "total_shifts": 0,
            "message": "No reconciliations found for this month"
        }

    total_petrol_revenue = sum(r["petrol_revenue"] for r in month_recons)
    total_diesel_revenue = sum(r["diesel_revenue"] for r in month_recons)
    total_lpg_revenue = sum(r["lpg_revenue"] for r in month_recons)
    total_lubricants_revenue = sum(r["lubricants_revenue"] for r in month_recons)
    total_accessories_revenue = sum(r["accessories_revenue"] for r in month_recons)
    total_expected = sum(r["total_expected"] for r in month_recons)
    total_credit_sales = sum(r["credit_sales_total"] for r in month_recons)
    total_cash_expected = sum(r["expected_cash"] for r in month_recons)
    total_cash_deposited = sum(r.get("actual_deposited", 0) or 0 for r in month_recons)
    final_cumulative_diff = month_recons[-1].get("cumulative_difference", 0) if month_recons else 0

    return {
        "year": year,
        "month": month,
        "total_shifts": len(month_recons),
        "petrol_revenue": total_petrol_revenue,
        "diesel_revenue": total_diesel_revenue,
        "lpg_revenue": total_lpg_revenue,
        "lubricants_revenue": total_lubricants_revenue,
        "accessories_revenue": total_accessories_revenue,
        "total_revenue": total_expected,
        "credit_sales": total_credit_sales,
        "cash_expected": total_cash_expected,
        "cash_deposited": total_cash_deposited,
        "final_cumulative_difference": final_cumulative_diff
    }

@router.get("/discrepancies/analysis")
def get_discrepancies_analysis(ctx: dict = Depends(get_station_context)):
    """
    Analyze all discrepancies across reconciliations
    Helps identify patterns
    """
    storage = ctx["storage"]
    reconciliations_data = _get_reconciliations(ctx["station_id"], storage)

    if not reconciliations_data:
        return {"message": "No reconciliations found"}

    total_shifts = len(reconciliations_data)
    shifts_with_discrepancies = len([r for r in reconciliations_data if r.get("difference", 0) != 0])
    total_shortages = sum(r.get("difference", 0) for r in reconciliations_data if r.get("difference", 0) < 0)
    total_overages = sum(r.get("difference", 0) for r in reconciliations_data if r.get("difference", 0) > 0)

    return {
        "total_shifts_analyzed": total_shifts,
        "shifts_with_discrepancies": shifts_with_discrepancies,
        "perfect_reconciliations": total_shifts - shifts_with_discrepancies,
        "total_shortages": abs(total_shortages),
        "total_overages": total_overages,
        "net_variance": total_overages + total_shortages,
        "accuracy_rate": ((total_shifts - shifts_with_discrepancies) / total_shifts * 100) if total_shifts > 0 else 0
    }


# =======================================================================================
# THREE-WAY RECONCILIATION (NEW) - Tank, Nozzle, Cash
# =======================================================================================

@router.get("/three-way/{reading_id}")
def get_three_way_reconciliation(reading_id: str, ctx: dict = Depends(get_station_context)):
    """
    Get three-way reconciliation report for a specific tank reading.

    Compares three independent sources:
    - Physical: Tank movement (dip readings)
    - Operational: Nozzle sales (electronic/mechanical)
    - Financial: Cash collected (actual banking)

    Returns root cause analysis and recommendations.
    """
    from ...services.reconciliation_service import get_reconciliation_summary_for_shift

    tank_readings_db = _load_station_tank_readings(ctx["station_id"])

    # Find the reading
    reading = tank_readings_db.get(reading_id)

    if not reading:
        raise HTTPException(status_code=404, detail=f"Reading {reading_id} not found")

    # Get reconciliation (already calculated during reading creation)
    reconciliation = reading.get('reconciliation')

    if not reconciliation:
        # Calculate if not present (for old readings)
        reconciliation = get_reconciliation_summary_for_shift(reading, storage=ctx["storage"])

    # Add reading metadata
    reconciliation['reading_metadata'] = {
        'reading_id': reading_id,
        'tank_id': reading.get('tank_id'),
        'date': reading.get('date'),
        'shift_type': reading.get('shift_type'),
        'recorded_by': reading.get('recorded_by')
    }

    return reconciliation


@router.get("/three-way/daily-summary/{date}")
def get_daily_three_way_summary(date: str, ctx: dict = Depends(get_station_context)):
    """
    Get three-way reconciliation summary for all shifts on a specific date.

    Returns:
    - Summary across all tanks and shifts
    - List of shifts requiring investigation
    - Overall station performance
    """
    from ...services.reconciliation_service import get_reconciliation_summary_for_shift

    tank_readings_db = _load_station_tank_readings(ctx["station_id"])

    # Get all readings for the date
    date_readings = []
    for r_id, r_data in tank_readings_db.items():
        if r_data.get('date') == date:
            reconciliation = r_data.get('reconciliation')
            if not reconciliation:
                reconciliation = get_reconciliation_summary_for_shift(r_data, storage=ctx["storage"])

            date_readings.append({
                'reading_id': r_id,
                'tank_id': r_data.get('tank_id'),
                'shift_type': r_data.get('shift_type'),
                'reconciliation': reconciliation
            })

    if not date_readings:
        raise HTTPException(
            status_code=404,
            detail=f"No readings found for date {date}"
        )

    # Aggregate summary
    summary = {
        'date': date,
        'total_shifts': len(date_readings),
        'balanced_shifts': sum(1 for r in date_readings if r['reconciliation']['status'] == 'BALANCED'),
        'variance_shifts': sum(1 for r in date_readings if 'VARIANCE' in r['reconciliation']['status']),
        'critical_shifts': sum(1 for r in date_readings if r['reconciliation']['status'] == 'DISCREPANCY_CRITICAL'),
        'shifts_requiring_investigation': [],
        'overall_status': 'GOOD'
    }

    # Identify shifts requiring attention
    for reading in date_readings:
        if reading['reconciliation']['status'] in ['VARIANCE_INVESTIGATION', 'DISCREPANCY_CRITICAL']:
            summary['shifts_requiring_investigation'].append({
                'reading_id': reading['reading_id'],
                'tank_id': reading['tank_id'],
                'shift_type': reading['shift_type'],
                'status': reading['reconciliation']['status'],
                'outlier_source': reading['reconciliation']['root_cause_analysis'].get('outlier_source')
            })

    # Determine overall status
    if summary['critical_shifts'] > 0:
        summary['overall_status'] = 'CRITICAL'
    elif summary['variance_shifts'] > summary['total_shifts'] * 0.5:
        summary['overall_status'] = 'NEEDS_ATTENTION'
    elif summary['balanced_shifts'] == summary['total_shifts']:
        summary['overall_status'] = 'EXCELLENT'

    summary['all_shifts'] = date_readings

    return summary


@router.get("/three-way/patterns/{tank_id}")
def get_reconciliation_patterns(tank_id: str, days: int = 30, ctx: dict = Depends(get_station_context)):
    """
    Analyze reconciliation patterns over time for a specific tank.

    Identifies:
    - Recurring variance patterns
    - Systematic issues with specific measurement sources
    - Trends over time
    - Average variance levels
    """
    from ...services.reconciliation_service import get_historical_variance_pattern

    tank_readings_db = _load_station_tank_readings(ctx["station_id"])

    # Get readings for the tank
    readings = []
    for r_id, r_data in tank_readings_db.items():
        if r_data.get('tank_id') == tank_id:
            readings.append(r_data)

    # Limit to most recent 'days' worth
    readings = readings[-days:] if len(readings) > days else readings

    if not readings:
        raise HTTPException(
            status_code=404,
            detail=f"No readings found for tank {tank_id}"
        )

    # Perform pattern analysis
    pattern_analysis = get_historical_variance_pattern(readings, storage=ctx["storage"])

    # Add metadata
    pattern_analysis['tank_id'] = tank_id
    pattern_analysis['analysis_period_days'] = days
    pattern_analysis['readings_analyzed'] = len(readings)

    return pattern_analysis


@router.get("/three-way/config")
def get_three_way_config(ctx: dict = Depends(get_station_context)):
    """
    Get current three-way reconciliation tolerance configuration.

    Returns tolerance thresholds for:
    - Volume variances (liters and percentage)
    - Cash variances (monetary units and percentage)
    """
    from ...services.reconciliation_service import ReconciliationConfig

    config = ReconciliationConfig(storage=ctx["storage"])

    mode = config.VOLUME_TOLERANCE_MODE
    volume_info = {'mode': mode}
    if mode == 'fixed':
        volume_info['minor_liters'] = config.VOLUME_TOLERANCE_MINOR
        volume_info['investigation_liters'] = config.VOLUME_TOLERANCE_INVESTIGATION
    elif mode == 'percentage':
        volume_info['minor_percent'] = config.PERCENT_TOLERANCE_MINOR
        volume_info['investigation_percent'] = config.PERCENT_TOLERANCE_INVESTIGATION
    elif mode == 'hybrid':
        volume_info['minor_percent'] = config.PERCENT_TOLERANCE_MINOR
        volume_info['investigation_percent'] = config.PERCENT_TOLERANCE_INVESTIGATION
        volume_info['cap_minor_liters'] = config.VOLUME_CAP_MINOR if config.VOLUME_CAP_MINOR > 0 else None
        volume_info['cap_investigation_liters'] = config.VOLUME_CAP_INVESTIGATION if config.VOLUME_CAP_INVESTIGATION > 0 else None
    elif mode == 'tiered':
        volume_info['tiers'] = config.VOLUME_TIERS

    return {
        'volume_tolerances': volume_info,
        'cash_tolerances': {
            'minor_amount': config.CASH_TOLERANCE_MINOR,
            'investigation_amount': config.CASH_TOLERANCE_INVESTIGATION
        },
        'thresholds': {
            'minor': 'Up to these values is acceptable variance',
            'investigation': 'Between minor and investigation requires review',
            'critical': 'Above investigation threshold is critical'
        }
    }


# =======================================================================================
# INVESTIGATIONS - Track and resolve flagged discrepancies
# =======================================================================================

def _load_investigations(station_id: str) -> list:
    return load_station_json(station_id, 'investigations.json', default=[])


def _save_investigations(data: list, station_id: str):
    save_station_json(station_id, 'investigations.json', data)


@router.get("/investigations")
def list_investigations(status: str = None, ctx: dict = Depends(get_station_context)):
    """
    List all investigations, optionally filtered by status (open, resolved, all).
    """
    investigations = _load_investigations(ctx["station_id"])
    if status and status != "all":
        investigations = [i for i in investigations if i.get("status") == status]
    return investigations


@router.post("/investigations")
def create_investigation(body: dict, ctx: dict = Depends(get_station_context)):
    """
    Create a new investigation record for a flagged discrepancy.

    Expected body: {
        "type": "tank_variance" | "cash_shortage" | "three_way",
        "reference_id": "<reading_id or shift_id>",
        "tank_id": "<optional>",
        "date": "<YYYY-MM-DD>",
        "shift_type": "<Day|Night>",
        "severity": "warning" | "critical",
        "description": "<what was flagged>",
        "assigned_to": "<optional attendant name>"
    }
    """
    from datetime import datetime

    investigations = _load_investigations(ctx["station_id"])

    inv_id = f"INV-{datetime.now().strftime('%Y%m%d%H%M%S')}-{len(investigations)+1}"
    investigation = {
        "investigation_id": inv_id,
        "type": body.get("type", "general"),
        "reference_id": body.get("reference_id", ""),
        "tank_id": body.get("tank_id"),
        "date": body.get("date", ""),
        "shift_type": body.get("shift_type", ""),
        "severity": body.get("severity", "warning"),
        "description": body.get("description", ""),
        "assigned_to": body.get("assigned_to"),
        "status": "open",
        "notes": [],
        "created_at": datetime.now().isoformat(),
        "created_by": ctx.get("username", "system"),
        "resolved_at": None,
    }
    investigations.append(investigation)
    _save_investigations(investigations, ctx["station_id"])
    return investigation


@router.put("/investigations/{investigation_id}")
def update_investigation(investigation_id: str, body: dict, ctx: dict = Depends(get_station_context)):
    """
    Update an investigation: add notes, assign, or resolve.

    Body can include:
    - "note": string to append to notes list
    - "assigned_to": reassign
    - "status": "open" | "resolved"
    """
    from datetime import datetime

    investigations = _load_investigations(ctx["station_id"])
    inv = next((i for i in investigations if i["investigation_id"] == investigation_id), None)
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    if "note" in body:
        inv["notes"].append({
            "text": body["note"],
            "by": ctx.get("username", "unknown"),
            "at": datetime.now().isoformat(),
        })
    if "assigned_to" in body:
        inv["assigned_to"] = body["assigned_to"]
    if "status" in body:
        inv["status"] = body["status"]
        if body["status"] == "resolved":
            inv["resolved_at"] = datetime.now().isoformat()

    _save_investigations(investigations, ctx["station_id"])
    return inv
