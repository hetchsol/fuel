"""
Comprehensive Shift Reconciliation API
Matches the Summary sheet functionality from the Excel spreadsheet
"""
from fastapi import APIRouter, HTTPException
from typing import List
from ...models.models import ShiftReconciliation, TankReconciliation
from ...config import PETROL_PRICE_PER_LITER, DIESEL_PRICE_PER_LITER

router = APIRouter()

# In-memory storage
reconciliations_data = []
tank_reconciliations_data = []

@router.post("/shift", response_model=ShiftReconciliation)
def create_shift_reconciliation(recon: ShiftReconciliation):
    """
    Create comprehensive shift reconciliation
    Matches Summary sheet in Excel
    """
    reconciliations_data.append(recon.dict())
    return recon

@router.get("/shift/{shift_id}", response_model=ShiftReconciliation)
def get_shift_reconciliation(shift_id: str):
    """
    Get reconciliation for a specific shift
    """
    recon = next((r for r in reconciliations_data if r["shift_id"] == shift_id), None)

    if not recon:
        raise HTTPException(status_code=404, detail="Reconciliation not found")

    return ShiftReconciliation(**recon)

@router.get("/date/{date}")
def get_date_reconciliation(date: str):
    """
    Get both Day and Night shift reconciliations for a specific date
    """
    date_recons = [
        ShiftReconciliation(**r) for r in reconciliations_data
        if r["date"] == date
    ]
    return date_recons

@router.post("/shift/{shift_id}/deposit")
def record_bank_deposit(shift_id: str, amount: float, deposit_slip: str = None):
    """
    Record actual amount deposited to bank
    Updates difference and calculates variance
    """
    recon = next((r for r in reconciliations_data if r["shift_id"] == shift_id), None)

    if not recon:
        raise HTTPException(status_code=404, detail="Reconciliation not found for this shift")

    recon["actual_deposited"] = amount
    recon["difference"] = amount - recon["expected_cash"]

    # Update cumulative difference
    previous_recons = [r for r in reconciliations_data if r["date"] < recon["date"]]
    previous_cumulative = sum(r.get("difference", 0) or 0 for r in previous_recons)
    recon["cumulative_difference"] = previous_cumulative + recon["difference"]

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
def create_tank_reconciliation(tank_recon: TankReconciliation):
    """
    Create tank reconciliation for a shift
    Compares electronic sales vs tank movement
    """
    tank_reconciliations_data.append(tank_recon.dict())
    return tank_recon

@router.get("/tank/{shift_id}/{tank_id}")
def get_tank_reconciliation(shift_id: str, tank_id: str):
    """
    Get tank reconciliation for specific shift and tank
    """
    tank_recon = next(
        (r for r in tank_reconciliations_data if r["shift_id"] == shift_id and r["tank_id"] == tank_id),
        None
    )

    if not tank_recon:
        raise HTTPException(status_code=404, detail="Tank reconciliation not found")

    return TankReconciliation(**tank_recon)


@router.get("/shift/{shift_id}/tank-analysis")
def calculate_tank_volume_movement_analysis(shift_id: str):
    """
    Calculate comprehensive shift reconciliation including tank volume movement analysis
    Automatically computes from shift data, tank dip readings, and sales
    """
    from ...database.storage import STORAGE

    shifts = STORAGE.get('shifts', {})
    sales = STORAGE.get('sales', [])
    tanks = STORAGE.get('tanks', {})

    if shift_id not in shifts:
        raise HTTPException(status_code=404, detail="Shift not found")

    shift = shifts[shift_id]
    tank_dip_readings = shift.get('tank_dip_readings', [])

    if not tank_dip_readings:
        raise HTTPException(
            status_code=400,
            detail="No tank dip readings found for this shift. Please record opening and closing dip readings."
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

        # Get sales for this shift and fuel type
        shift_sales = [
            s for s in sales
            if s.get('shift_id') == shift_id and s.get('fuel_type') == fuel_type
        ]

        # Calculate total electronic and mechanical sales
        total_electronic = sum(s.get('electronic_volume', 0) or 0 for s in shift_sales)
        total_mechanical = sum(s.get('mechanical_volume', 0) or 0 for s in shift_sales)

        # Calculate discrepancies (variance between tank movement and sales)
        electronic_vs_tank_discrepancy = tank_movement - total_electronic
        mechanical_vs_tank_discrepancy = tank_movement - total_mechanical

        # Calculate percentage discrepancies
        electronic_discrepancy_percent = (electronic_vs_tank_discrepancy / tank_movement * 100) if tank_movement > 0 else 0
        mechanical_discrepancy_percent = (mechanical_vs_tank_discrepancy / tank_movement * 100) if tank_movement > 0 else 0

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
            "message": f"Tank movement: {tank_movement:.2f}L, Electronic sales: {total_electronic:.2f}L, Variance: {electronic_vs_tank_discrepancy:.2f}L ({electronic_discrepancy_percent:.2f}%)"
        })

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
        }
    }

@router.post("/calculate/{shift_id}")
def calculate_shift_reconciliation(shift_id: str, nozzle_summaries: dict, lpg_revenue: float = 0, lubricants_revenue: float = 0, accessories_revenue: float = 0, credit_sales: List[dict] = []):
    """
    Calculate comprehensive reconciliation for a shift
    Takes nozzle summaries and calculates all revenue
    """
    # Calculate fuel revenues
    petrol_volume = sum(
        summary["electronic_movement"]
        for nozzle_id, summary in nozzle_summaries.items()
        if nozzle_id.startswith("UNL")
    )

    diesel_volume = sum(
        summary["electronic_movement"]
        for nozzle_id, summary in nozzle_summaries.items()
        if nozzle_id.startswith("LSD")
    )

    petrol_revenue = petrol_volume * PETROL_PRICE_PER_LITER
    diesel_revenue = diesel_volume * DIESEL_PRICE_PER_LITER

    # Calculate totals
    total_expected = petrol_revenue + diesel_revenue + lpg_revenue + lubricants_revenue + accessories_revenue

    # Calculate credit sales total
    credit_sales_total = sum(sale["amount"] for sale in credit_sales)

    # Calculate expected cash (total - credit sales)
    expected_cash = total_expected - credit_sales_total

    # Get cumulative difference
    previous_recons = [r for r in reconciliations_data]
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
def get_monthly_summary(year: int, month: int):
    """
    Get monthly reconciliation summary
    Similar to month-end totals in Excel
    """
    month_str = f"{year}-{month:02d}"

    month_recons = [
        r for r in reconciliations_data
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
def get_discrepancies_analysis():
    """
    Analyze all discrepancies across reconciliations
    Helps identify patterns
    """
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
