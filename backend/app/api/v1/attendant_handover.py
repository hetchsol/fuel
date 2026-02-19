"""
Attendant Shift Handover API
Allows attendants to submit closing readings and cash handover at end of shift
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from datetime import datetime
import json
import os
from ...models.models import (
    HandoverInput, HandoverOutput,
    HandoverNozzleReadingInput, HandoverNozzleReadingSummary,
    ShiftStockSnapshot,
)
from ...config import resolve_fuel_price
from ...database.storage import get_nozzle
from .auth import get_current_user, require_supervisor_or_owner, get_station_context
from ...database.station_files import get_station_file
from .enter_readings import _load_readings as _load_enter_readings
from .lpg_daily import (
    load_lpg_pricing, LPG_SIZES, DEFAULT_LPG_ACCESSORIES,
    load_lpg_accessories, save_lpg_accessories,
    load_lpg_daily, save_lpg_daily,
    get_pricing_for_size,
)
from .lubricants_daily import (
    load_product_catalog as load_lubricant_catalog,
    load_lubricant_daily, save_lubricant_daily,
)

router = APIRouter()


def _load_handovers(station_id: str) -> dict:
    filepath = get_station_file(station_id, 'attendant_handovers.json')
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            return json.load(f)
    return {}


def _save_handovers(data: dict, station_id: str):
    filepath = get_station_file(station_id, 'attendant_handovers.json')
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2)


def _get_fuel_type(nozzle_id: str, storage: dict = None) -> str:
    """Determine fuel type by looking up nozzle data from storage"""
    nozzle = get_nozzle(nozzle_id, storage=storage)
    if nozzle:
        return nozzle.get("fuel_type", "") or "Diesel"
    return "Diesel"


@router.get("/my-shift")
async def get_my_shift(ctx: dict = Depends(get_station_context)):
    """
    Find the current user's active shift and return shift info
    with assigned nozzles and their last known readings.
    """
    storage = ctx["storage"]
    user_id = ctx["user_id"]
    user_name = ctx["full_name"]
    shifts_data = storage.get('shifts', {})
    islands_data = storage.get('islands', {})

    # Search active shifts for one with an assignment matching this user
    my_shift = None
    my_assignment = None

    for shift_id, shift in shifts_data.items():
        if shift.get("status") != "active":
            continue
        assignments = shift.get("assignments", [])
        for assignment in assignments:
            # Match by attendant_id (user_id) or attendant_name
            if assignment.get("attendant_id") == user_id or \
               assignment.get("attendant_name", "").lower() == user_name.lower():
                my_shift = shift
                my_assignment = assignment
                break
        if my_shift:
            break

    if not my_shift:
        return {"found": False, "message": "No active shift assigned to you"}

    # Build nozzle info with current electronic readings as opening readings
    assigned_nozzle_ids = my_assignment.get("nozzle_ids", [])
    assigned_island_ids = my_assignment.get("island_ids", [])

    # If nozzle_ids is empty but island_ids is set, collect all nozzles from those islands
    if not assigned_nozzle_ids and assigned_island_ids:
        for isl_id in assigned_island_ids:
            island = islands_data.get(isl_id, {})
            ps = island.get("pump_station")
            if ps:
                for nozzle in ps.get("nozzles", []):
                    assigned_nozzle_ids.append(nozzle["nozzle_id"])

    nozzle_details = []
    for nozzle_id in assigned_nozzle_ids:
        nozzle = get_nozzle(nozzle_id, storage=storage)
        if nozzle:
            fuel_type = _get_fuel_type(nozzle_id, storage=storage)
            price = resolve_fuel_price(fuel_type, storage)
            # Find parent island for fuel_type_abbrev
            fuel_type_abbrev = None
            for isl in islands_data.values():
                ps = isl.get("pump_station")
                if ps:
                    for nz in ps.get("nozzles", []):
                        if nz.get("nozzle_id") == nozzle_id:
                            fuel_type_abbrev = isl.get("fuel_type_abbrev")
                            break
                    if fuel_type_abbrev:
                        break
            nozzle_details.append({
                "nozzle_id": nozzle_id,
                "fuel_type": fuel_type,
                "opening_reading": nozzle.get("electronic_reading", 0) or 0,
                "price_per_liter": price,
                "status": nozzle.get("status", "Active"),
                "display_label": nozzle.get("display_label"),
                "fuel_type_abbrev": fuel_type_abbrev,
            })

    # Check enter_readings status
    enter_readings_db = _load_enter_readings(ctx["station_id"])
    shift_id = my_shift.get("shift_id", "")
    er_closing_key = f"AR-{shift_id}-{user_id}-C"
    enter_readings_submitted = er_closing_key in enter_readings_db
    enter_readings_closing = enter_readings_db.get(er_closing_key)

    return {
        "found": True,
        "shift": {
            "shift_id": shift_id,
            "date": my_shift.get("date"),
            "shift_type": my_shift.get("shift_type"),
            "status": my_shift.get("status"),
        },
        "assignment": {
            "attendant_id": my_assignment.get("attendant_id"),
            "attendant_name": my_assignment.get("attendant_name"),
            "island_ids": assigned_island_ids,
            "nozzle_ids": assigned_nozzle_ids,
        },
        "nozzles": nozzle_details,
        "enter_readings_submitted": enter_readings_submitted,
        "enter_readings_closing": enter_readings_closing,
    }


@router.get("/stock-opening")
async def get_stock_opening(ctx: dict = Depends(get_station_context)):
    """
    Return consolidated opening stock for the current shift.
    Looks for the most recent handover with stock_snapshot at this station,
    uses its closing values as opening. Falls back to catalog defaults.
    """
    station_id = ctx["station_id"]
    storage = ctx["storage"]

    # --- Find previous handover with stock_snapshot ---
    handovers = _load_handovers(station_id)
    prev_snapshot = None
    if handovers:
        sorted_handovers = sorted(
            handovers.values(),
            key=lambda h: h.get("created_at", ""),
            reverse=True,
        )
        for h in sorted_handovers:
            if h.get("stock_snapshot"):
                prev_snapshot = h["stock_snapshot"]
                break

    # --- LPG pricing ---
    lpg_pricing_db = load_lpg_pricing(station_id)

    # --- LPG Cylinders ---
    lpg_cylinders = []
    prev_lpg_map = {}
    if prev_snapshot:
        for row in prev_snapshot.get("lpg_cylinders", []):
            prev_lpg_map[row["size_kg"]] = row

    for size in LPG_SIZES:
        pricing = get_pricing_for_size(size, lpg_pricing_db)
        prev = prev_lpg_map.get(size)
        if prev:
            opening_full = prev.get("closing_full", 0)
            opening_empty = prev.get("closing_empty", 0)
        else:
            opening_full = 0
            opening_empty = 0
        lpg_cylinders.append({
            "size_kg": size,
            "opening_full": opening_full,
            "opening_empty": opening_empty,
            "refill_price": pricing["price_refill"],
            "price_with_cylinder": pricing["price_with_cylinder"],
        })

    # --- LPG Accessories ---
    accessories = []
    prev_acc_map = {}
    if prev_snapshot:
        for row in prev_snapshot.get("accessories", []):
            prev_acc_map[row["product_code"]] = row

    # Use in-memory catalog first, fall back to defaults
    acc_catalog = storage.get("lpg_accessories", {})
    if acc_catalog:
        for code, item in acc_catalog.items():
            prev = prev_acc_map.get(code)
            opening = prev.get("closing_stock", 0) if prev else item.get("current_stock", 0)
            accessories.append({
                "product_code": code,
                "description": item.get("description", ""),
                "opening_stock": opening,
                "unit_price": item.get("unit_price", 0),
            })
    else:
        for item in DEFAULT_LPG_ACCESSORIES:
            code = item["product_code"]
            prev = prev_acc_map.get(code)
            opening = prev.get("closing_stock", 0) if prev else 0
            accessories.append({
                "product_code": code,
                "description": item["description"],
                "opening_stock": opening,
                "unit_price": item.get("selling_price", 0),
            })

    # --- Lubricants (Island 3 only) ---
    lubricants = []
    prev_lub_map = {}
    if prev_snapshot:
        for row in prev_snapshot.get("lubricants", []):
            prev_lub_map[row["product_code"]] = row

    lub_catalog = load_lubricant_catalog(station_id)
    # Get current stock from most recent lubricant daily entry
    lub_daily_db = load_lubricant_daily(station_id)
    lub_current_stock = {}
    island3_entries = [
        e for e in lub_daily_db.values()
        if e.get("location") == "Island 3"
    ]
    if island3_entries:
        island3_entries.sort(key=lambda x: x.get("date", ""), reverse=True)
        for row in island3_entries[0].get("product_rows", []):
            lub_current_stock[row["product_code"]] = row.get("balance", 0)

    for product in lub_catalog:
        code = product["product_code"]
        prev = prev_lub_map.get(code)
        if prev:
            opening = prev.get("closing_stock", 0)
        else:
            opening = lub_current_stock.get(code, 0)
        # Only include products with stock > 0 (or that had previous snapshot data)
        if opening > 0 or prev:
            lubricants.append({
                "product_code": code,
                "description": product["description"],
                "opening_stock": opening,
                "unit_price": product.get("selling_price", 0),
                "category": product.get("category", ""),
            })

    return {
        "lpg_cylinders": lpg_cylinders,
        "accessories": accessories,
        "lubricants": lubricants,
    }


@router.post("/submit", response_model=HandoverOutput)
async def submit_handover(data: HandoverInput, ctx: dict = Depends(get_station_context)):
    """
    Submit shift handover with closing nozzle readings, other sales, and actual cash.
    Computes volumes, revenue, expected cash, and difference.
    """
    storage = ctx["storage"]
    station_id = ctx["station_id"]
    shifts_data = storage.get('shifts', {})

    # Validate shift exists and is active
    shift = shifts_data.get(data.shift_id)
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    if shift.get("status") != "active":
        raise HTTPException(status_code=400, detail="Shift is not active")

    # Find user's assignment in this shift
    user_id = ctx["user_id"]
    user_name = ctx["full_name"]
    my_assignment = None
    for assignment in shift.get("assignments", []):
        if assignment.get("attendant_id") == user_id or \
           assignment.get("attendant_name", "").lower() == user_name.lower():
            my_assignment = assignment
            break

    if not my_assignment:
        raise HTTPException(status_code=403, detail="You are not assigned to this shift")

    # Build allowed nozzle set
    allowed_nozzle_ids = set(my_assignment.get("nozzle_ids", []))
    if not allowed_nozzle_ids:
        # Derive from island_ids
        islands_data = storage.get('islands', {})
        for isl_id in my_assignment.get("island_ids", []):
            island = islands_data.get(isl_id, {})
            ps = island.get("pump_station")
            if ps:
                for nozzle in ps.get("nozzles", []):
                    allowed_nozzle_ids.add(nozzle["nozzle_id"])

    # Validate all submitted nozzle_ids belong to this user's assignment
    for reading in data.nozzle_readings:
        if reading.nozzle_id not in allowed_nozzle_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Nozzle {reading.nozzle_id} is not in your assignment"
            )

    # Check for enter_readings closing data — use those values when available
    enter_readings_db = _load_enter_readings(station_id)
    er_opening_key = f"AR-{data.shift_id}-{user_id}-O"
    er_closing_key = f"AR-{data.shift_id}-{user_id}-C"
    er_opening = enter_readings_db.get(er_opening_key)
    er_closing = enter_readings_db.get(er_closing_key)

    # Build lookup from enter_readings for nozzle opening/closing
    er_nozzle_map = {}
    if er_opening and er_closing:
        opening_map = {}
        for nr in er_opening.get("nozzle_readings", []):
            opening_map[nr["nozzle_id"]] = nr
        for nr in er_closing.get("nozzle_readings", []):
            nid = nr["nozzle_id"]
            onr = opening_map.get(nid, {})
            er_nozzle_map[nid] = {
                "opening": onr.get("electronic_reading", 0),
                "closing": nr["electronic_reading"],
            }

    # Process each nozzle reading
    nozzle_summaries = []
    fuel_revenue = 0.0

    for reading in data.nozzle_readings:
        fuel_type = _get_fuel_type(reading.nozzle_id, storage=storage)

        # If enter_readings data exists for this nozzle, prefer it
        if reading.nozzle_id in er_nozzle_map:
            er = er_nozzle_map[reading.nozzle_id]
            opening_val = er["opening"]
            closing_val = er["closing"]
        else:
            opening_val = reading.opening_reading
            closing_val = reading.closing_reading

        volume = closing_val - opening_val

        if volume < 0:
            raise HTTPException(
                status_code=400,
                detail=f"Closing reading for {reading.nozzle_id} is less than opening reading"
            )

        price = resolve_fuel_price(fuel_type, storage)
        revenue = round(volume * price, 2)
        fuel_revenue += revenue

        nozzle_summaries.append(HandoverNozzleReadingSummary(
            nozzle_id=reading.nozzle_id,
            fuel_type=fuel_type,
            opening_reading=opening_val,
            closing_reading=closing_val,
            volume_sold=round(volume, 3),
            price_per_liter=price,
            revenue=revenue,
        ))

    fuel_revenue = round(fuel_revenue, 2)

    # --- Stock snapshot processing: compute sales from stock counts ---
    lpg_sales = data.lpg_sales
    lubricant_sales = data.lubricant_sales
    accessory_sales = data.accessory_sales
    enriched_snapshot = None

    if data.stock_snapshot:
        lpg_pricing_db = load_lpg_pricing(station_id)

        # LPG cylinders: total_sold = opening_full + additions - closing_full
        # Attendant splits into sold_refill + sold_with_cylinder (priced differently)
        lpg_sales = 0.0
        enriched_lpg = []
        for row in data.stock_snapshot.lpg_cylinders:
            total_sold = max(0, row.opening_full + row.additions - row.closing_full)
            pricing = get_pricing_for_size(row.size_kg, lpg_pricing_db)
            # Fallback: if split not provided but total_sold > 0, assume all refill
            if row.sold_refill + row.sold_with_cylinder == 0 and total_sold > 0:
                value_refill = round(total_sold * pricing["price_refill"], 2)
                value_with_cyl = 0.0
            else:
                value_refill = round(row.sold_refill * pricing["price_refill"], 2)
                value_with_cyl = round(row.sold_with_cylinder * pricing["price_with_cylinder"], 2)
            sales_value = round(value_refill + value_with_cyl, 2)
            lpg_sales += sales_value
            enriched_lpg.append({
                "size_kg": row.size_kg,
                "opening_full": row.opening_full,
                "opening_empty": row.opening_empty,
                "additions": row.additions,
                "closing_full": row.closing_full,
                "closing_empty": row.closing_empty,
                "total_sold": total_sold,
                "sold_refill": row.sold_refill,
                "sold_with_cylinder": row.sold_with_cylinder,
                "refill_price": pricing["price_refill"],
                "price_with_cylinder": pricing["price_with_cylinder"],
                "value_refill": value_refill,
                "value_with_cylinder": value_with_cyl,
                "sales_value": sales_value,
            })
        lpg_sales = round(lpg_sales, 2)

        # Accessories: sold = opening_stock + additions - closing_stock
        accessory_sales = 0.0
        enriched_acc = []
        # Build price lookup from stock-opening data or catalog
        acc_catalog = storage.get("lpg_accessories", {})
        acc_price_map = {}
        for code, item in acc_catalog.items():
            acc_price_map[code] = item.get("unit_price", 0)
        for item in DEFAULT_LPG_ACCESSORIES:
            if item["product_code"] not in acc_price_map:
                acc_price_map[item["product_code"]] = item.get("selling_price", 0)

        for row in data.stock_snapshot.accessories:
            sold = max(0, row.opening_stock + row.additions - row.closing_stock)
            unit_price = acc_price_map.get(row.product_code, 0)
            sales_value = round(sold * unit_price, 2)
            accessory_sales += sales_value
            enriched_acc.append({
                "product_code": row.product_code,
                "description": row.description,
                "opening_stock": row.opening_stock,
                "additions": row.additions,
                "closing_stock": row.closing_stock,
                "sold": sold,
                "unit_price": unit_price,
                "sales_value": sales_value,
            })
        accessory_sales = round(accessory_sales, 2)

        # Lubricants: sold = opening_stock + additions - closing_stock
        lubricant_sales = 0.0
        enriched_lub = []
        lub_catalog = load_lubricant_catalog(station_id)
        lub_price_map = {p["product_code"]: p.get("selling_price", 0) for p in lub_catalog}

        for row in data.stock_snapshot.lubricants:
            sold = max(0, row.opening_stock + row.additions - row.closing_stock)
            unit_price = lub_price_map.get(row.product_code, 0)
            sales_value = round(sold * unit_price, 2)
            lubricant_sales += sales_value
            enriched_lub.append({
                "product_code": row.product_code,
                "description": row.description,
                "opening_stock": row.opening_stock,
                "additions": row.additions,
                "closing_stock": row.closing_stock,
                "sold": sold,
                "unit_price": unit_price,
                "sales_value": sales_value,
            })
        lubricant_sales = round(lubricant_sales, 2)

        enriched_snapshot = {
            "lpg_cylinders": enriched_lpg,
            "accessories": enriched_acc,
            "lubricants": enriched_lub,
        }

    total_expected = round(fuel_revenue + lpg_sales + lubricant_sales + accessory_sales, 2)
    expected_cash = round(total_expected - data.credit_sales, 2)
    difference = round(data.actual_cash - expected_cash, 2)

    # Generate handover ID
    handovers = _load_handovers(station_id)
    handover_id = f"HO-{data.shift_id}-{user_id}-{datetime.now().strftime('%H%M%S')}"

    handover_output = HandoverOutput(
        handover_id=handover_id,
        shift_id=data.shift_id,
        attendant_id=user_id,
        attendant_name=user_name,
        date=shift.get("date", ""),
        shift_type=shift.get("shift_type", ""),
        nozzle_summaries=nozzle_summaries,
        fuel_revenue=fuel_revenue,
        lpg_sales=lpg_sales,
        lubricant_sales=lubricant_sales,
        accessory_sales=accessory_sales,
        total_expected=total_expected,
        credit_sales=data.credit_sales,
        expected_cash=expected_cash,
        actual_cash=data.actual_cash,
        difference=difference,
        status="submitted",
        notes=data.notes,
        created_at=datetime.now().isoformat(),
        stock_snapshot=enriched_snapshot,
    )

    # Save handover
    handovers[handover_id] = handover_output.dict()
    _save_handovers(handovers, station_id)

    # Update nozzle electronic readings in islands data
    # Skip if enter_readings already handled nozzle state updates
    if not er_closing:
        for reading in data.nozzle_readings:
            nozzle = get_nozzle(reading.nozzle_id, storage=storage)
            if nozzle:
                nozzle["electronic_reading"] = reading.closing_reading

    # --- Feed daily entry files from stock snapshot ---
    if enriched_snapshot:
        shift_date = shift.get("date", "")
        shift_type = shift.get("shift_type", "Day")
        now_iso = datetime.now().isoformat()

        # 1) LPG Cylinders → lpg_daily_entries.json (shift-level, overwrites by date+shift_type)
        lpg_daily_db = load_lpg_daily(station_id)
        lpg_entry_id = None
        for eid, entry in lpg_daily_db.items():
            if entry.get("date") == shift_date and entry.get("shift_type") == shift_type:
                lpg_entry_id = eid
                break
        if not lpg_entry_id:
            import uuid
            lpg_entry_id = f"LPG-{shift_date}-{shift_type[0]}-{uuid.uuid4().hex[:8]}"

        cylinder_rows = []
        grand_total = 0.0
        for cyl in enriched_snapshot["lpg_cylinders"]:
            val_refill = cyl.get("value_refill", 0.0)
            val_with_cyl = cyl.get("value_with_cylinder", 0.0)
            total_val = round(val_refill + val_with_cyl, 2)
            grand_total += total_val
            cylinder_rows.append({
                "size_kg": cyl["size_kg"],
                "opening_balance": cyl["opening_full"],
                "receipts": cyl["additions"],
                "sold_refill": cyl.get("sold_refill", 0),
                "sold_with_cylinder": cyl.get("sold_with_cylinder", 0),
                "balance": cyl["closing_full"],
                "value_refill": val_refill,
                "value_with_cylinder": val_with_cyl,
                "total_value": total_val,
            })

        lpg_daily_db[lpg_entry_id] = {
            "entry_id": lpg_entry_id,
            "date": shift_date,
            "shift_type": shift_type,
            "salesperson": user_name,
            "cylinder_rows": cylinder_rows,
            "grand_total_value": round(grand_total, 2),
            "book_cylinder_population": None,
            "actual_cylinder_population": None,
            "population_difference": None,
            "recorded_by": user_id,
            "created_at": now_iso,
            "notes": f"Auto-generated from handover {handover_id}",
        }
        save_lpg_daily(lpg_daily_db, station_id)

        # 2) LPG Accessories → lpg_accessories_daily.json (date-level, overwrites by date)
        acc_daily_db = load_lpg_accessories(station_id)
        acc_entry_id = None
        for eid, entry in acc_daily_db.items():
            if entry.get("date") == shift_date:
                acc_entry_id = eid
                break
        if not acc_entry_id:
            import uuid
            acc_entry_id = f"LPGA-{shift_date}-{uuid.uuid4().hex[:8]}"

        acc_rows = []
        acc_total = 0.0
        for acc in enriched_snapshot["accessories"]:
            sv = acc.get("sales_value", 0.0)
            acc_total += sv
            acc_rows.append({
                "product_code": acc["product_code"],
                "description": acc["description"],
                "selling_price": acc.get("unit_price", 0),
                "opening_stock": acc["opening_stock"],
                "additions": acc["additions"],
                "sold": acc.get("sold", 0),
                "balance": acc["closing_stock"],
                "sales_value": sv,
            })

        acc_daily_db[acc_entry_id] = {
            "entry_id": acc_entry_id,
            "date": shift_date,
            "product_rows": acc_rows,
            "total_daily_sales_value": round(acc_total, 2),
            "recorded_by": user_id,
            "created_at": now_iso,
            "notes": f"Auto-generated from handover {handover_id}",
        }
        save_lpg_accessories(acc_daily_db, station_id)

        # 3) Lubricants → lubricant_daily_entries.json (date+location "Island 3", overwrites)
        lub_daily_db = load_lubricant_daily(station_id)
        lub_entry_id = None
        for eid, entry in lub_daily_db.items():
            if entry.get("date") == shift_date and entry.get("location") == "Island 3":
                lub_entry_id = eid
                break
        if not lub_entry_id:
            import uuid
            lub_entry_id = f"LUB-LI3-{shift_date}-{uuid.uuid4().hex[:8]}"

        lub_rows = []
        lub_total = 0.0
        lub_items_moved = 0
        lub_cat = load_lubricant_catalog(station_id)
        lub_cat_map = {p["product_code"]: p for p in lub_cat}
        for lub in enriched_snapshot["lubricants"]:
            sv = lub.get("sales_value", 0.0)
            sold = lub.get("sold", 0)
            lub_total += sv
            lub_items_moved += sold
            cat_item = lub_cat_map.get(lub["product_code"], {})
            lub_rows.append({
                "product_code": lub["product_code"],
                "description": lub["description"],
                "category": cat_item.get("category", ""),
                "unit_size": cat_item.get("unit_size", ""),
                "selling_price": lub.get("unit_price", 0),
                "opening_stock": lub["opening_stock"],
                "additions": lub["additions"],
                "sold_or_drawn": sold,
                "balance": lub["closing_stock"],
                "sales_value": sv,
            })

        lub_daily_db[lub_entry_id] = {
            "entry_id": lub_entry_id,
            "date": shift_date,
            "location": "Island 3",
            "product_rows": lub_rows,
            "total_daily_sales_value": round(lub_total, 2),
            "total_items_moved": lub_items_moved,
            "recorded_by": user_id,
            "created_at": now_iso,
            "notes": f"Auto-generated from handover {handover_id}",
        }
        save_lubricant_daily(lub_daily_db, station_id)

    return handover_output


@router.get("/entries")
async def list_handovers(
    shift_id: str = None,
    date: str = None,
    ctx: dict = Depends(get_station_context),
):
    """
    List handover entries. Regular users see only their own; supervisors/owners see all.
    """
    handovers = _load_handovers(ctx["station_id"])
    results = list(handovers.values())

    # Filter by role: regular users see only their own
    if ctx["role"] == "user":
        results = [h for h in results if h.get("attendant_id") == ctx["user_id"]]

    # Optional filters
    if shift_id:
        results = [h for h in results if h.get("shift_id") == shift_id]
    if date:
        results = [h for h in results if h.get("date") == date]

    # Sort by created_at descending
    results.sort(key=lambda h: h.get("created_at", ""), reverse=True)

    return results


@router.delete("/{handover_id}/reopen")
async def reopen_handover(
    handover_id: str,
    ctx: dict = Depends(get_station_context),
):
    """
    Reopen a submitted handover for correction (supervisor/owner only).
    """
    # Check supervisor/owner role
    from ...models.models import UserRole
    role = ctx["role"]
    role_str = role.value if isinstance(role, UserRole) else str(role)
    if role_str not in [UserRole.SUPERVISOR.value, UserRole.OWNER.value]:
        raise HTTPException(
            status_code=403,
            detail="Access forbidden. This endpoint is restricted to supervisors and owners only."
        )

    station_id = ctx["station_id"]
    handovers = _load_handovers(station_id)

    if handover_id not in handovers:
        raise HTTPException(status_code=404, detail="Handover not found")

    handover = handovers[handover_id]
    if handover.get("status") == "reopened":
        raise HTTPException(status_code=400, detail="Handover is already reopened")

    handover["status"] = "reopened"
    _save_handovers(handovers, station_id)

    return {"status": "success", "message": f"Handover {handover_id} reopened for correction"}
