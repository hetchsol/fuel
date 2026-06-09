"""
Attendant Shift Handover API
Allows attendants to submit closing readings and cash handover at end of shift
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import json
import os
from ...models.models import (
    HandoverInput, HandoverOutput, HandoverReviewInput,
    ReadingsVerificationInput, ShiftClosingInput,
    HandoverNozzleReadingInput, HandoverNozzleReadingSummary,
    HandoverCreditSaleItem, ShiftStockSnapshot, UserRole,
)
from ...config import resolve_fuel_price, resolve_fuel_price_for_shift, apply_due_price_changes
from ...database.storage import get_nozzle
from ...services.inventory import process_credit_sale
from .auth import get_current_user, require_supervisor_or_owner, get_station_context
from ...services.audit_service import log_audit_event
from ...services.notification_service import create_notification
from ...services.shift_status import assert_shift_editable, advance_shift_on_approval
from ...services.stock_service import apply_handover_sales
from ...database.station_files import load_station_json, save_station_json
from .enter_readings import _load_readings as _load_enter_readings
from .lpg_daily import (
    load_lpg_pricing, LPG_SIZES, DEFAULT_LPG_ACCESSORIES,
    load_lpg_accessories, save_lpg_accessories,
    load_lpg_daily, save_lpg_daily,
    get_pricing_for_size,
    process_cylinder_trades,
)
from .lubricants_daily import (
    load_product_catalog as load_lubricant_catalog,
    load_lubricant_daily, save_lubricant_daily,
)

router = APIRouter()

# A Phase-1 handover (readings verified) that hasn't been closed (Phase 2)
# within this many hours is considered "stale" — surfaced in the review queue
# and escalated via a notification.
STALE_READINGS_HOURS = 4


def _load_handovers(station_id: str) -> dict:
    return load_station_json(station_id, 'attendant_handovers.json', default={})


def _save_handovers(data: dict, station_id: str):
    save_station_json(station_id, 'attendant_handovers.json', data)


# Start-of-shift opening verification (additive — does not touch the handover
# pipeline). Keyed by f"{shift_id}-{attendant_id}".
def _load_opening_verifications(station_id: str) -> dict:
    return load_station_json(station_id, 'opening_verifications.json', default={})


def _save_opening_verifications(data: dict, station_id: str):
    save_station_json(station_id, 'opening_verifications.json', data)


def notify_stale_readings(station_id: str) -> int:
    """
    Escalate Phase-1 handovers stuck awaiting closing for > STALE_READINGS_HOURS.

    Creates one notification per stale handover (deduped via a `stale_notified`
    flag so repeated scans don't spam), and returns the number newly notified.
    Safe to call repeatedly (startup, manual stale-check).
    """
    handovers = _load_handovers(station_id)
    cutoff = datetime.now().timestamp() - (STALE_READINGS_HOURS * 3600)
    notified = 0
    for hid, h in handovers.items():
        if h.get("phase") != "readings_verified" or h.get("stale_notified"):
            continue
        waited_since = datetime.fromisoformat(
            h.get("phase_1_completed_at") or h.get("created_at", "2000-01-01")).timestamp()
        if waited_since >= cutoff:
            continue
        try:
            create_notification(
                station_id=station_id,
                type="STALE_READINGS",
                severity="warning",
                title="Shift readings awaiting closing",
                message=f"Readings for shift {h.get('shift_id', '')} "
                        f"({h.get('attendant_name', '')}) have been awaiting closing "
                        f"for over {STALE_READINGS_HOURS}h.",
                entity_type="handover",
                entity_id=hid,
            )
        except Exception:
            pass
        h["stale_notified"] = True
        notified += 1
    if notified:
        _save_handovers(handovers, station_id)
    return notified


def _get_fuel_type(nozzle_id: str, storage: dict = None) -> str:
    """Determine fuel type by looking up nozzle data from storage"""
    nozzle = get_nozzle(nozzle_id, storage=storage)
    if nozzle:
        return nozzle.get("fuel_type", "") or "Diesel"
    return "Diesel"


# ===== Extracted helpers for two-phase handover =====

def _validate_shift_and_assignment(shift_id: str, ctx: dict, storage: dict):
    """Validate shift exists, is active, and user is assigned. Returns (shift, my_assignment, allowed_nozzle_ids)."""
    shifts_data = storage.get('shifts', {})
    shift = shifts_data.get(shift_id)
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    if shift.get("status") != "active":
        raise HTTPException(status_code=400, detail="Shift is not active")

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

    allowed_nozzle_ids = set(my_assignment.get("nozzle_ids", []))
    if not allowed_nozzle_ids:
        islands_data = storage.get('islands', {})
        for isl_id in my_assignment.get("island_ids", []):
            island = islands_data.get(isl_id, {})
            ps = island.get("pump_station")
            if ps:
                for nozzle in ps.get("nozzles", []):
                    allowed_nozzle_ids.add(nozzle["nozzle_id"])

    return shift, my_assignment, allowed_nozzle_ids


def _process_nozzle_readings(nozzle_readings, storage, station_id, shift_id, user_id, allowed_nozzle_ids,
                             shift_date=None, shift_type=None):
    """Process nozzle readings and compute summaries. Returns (nozzle_summaries, fuel_revenue, had_er_closing)."""
    for reading in nozzle_readings:
        if reading.nozzle_id not in allowed_nozzle_ids:
            raise HTTPException(status_code=400, detail=f"Nozzle {reading.nozzle_id} is not in your assignment")

    # Apply any due price changes lazily
    apply_due_price_changes(storage, station_id)

    # Check for enter_readings closing data
    enter_readings_db = _load_enter_readings(station_id)
    er_opening_key = f"AR-{shift_id}-{user_id}-O"
    er_closing_key = f"AR-{shift_id}-{user_id}-C"
    er_opening = enter_readings_db.get(er_opening_key)
    er_closing = enter_readings_db.get(er_closing_key)

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

    nozzle_summaries = []
    fuel_revenue = 0.0

    for reading in nozzle_readings:
        fuel_type = _get_fuel_type(reading.nozzle_id, storage=storage)

        if reading.nozzle_id in er_nozzle_map:
            er = er_nozzle_map[reading.nozzle_id]
            opening_val = er["opening"]
            closing_val = er["closing"]
        else:
            opening_val = reading.opening_reading
            closing_val = reading.closing_reading

        volume = closing_val - opening_val
        if volume < 0:
            raise HTTPException(status_code=400, detail=f"Closing reading for {reading.nozzle_id} is less than opening reading")

        # Check for price change during this shift
        price_info = resolve_fuel_price_for_shift(fuel_type, shift_date or "", shift_type or "", storage)

        # Price changeover fields
        changeover_reading_val = None
        changeover_estimated = None
        pre_change_volume = None
        post_change_volume = None
        pre_change_price = None
        post_change_price = None
        pre_change_revenue = None
        post_change_revenue = None

        if price_info["has_price_change"] and volume > 0:
            old_price = price_info["old_price"] or price_info["price"]
            new_price = price_info["new_price"] or price_info["price"]

            if reading.changeover_reading is not None:
                co = reading.changeover_reading
                if co < opening_val or co > closing_val:
                    raise HTTPException(status_code=400,
                        detail=f"Changeover reading for {reading.nozzle_id} must be between opening ({opening_val}) and closing ({closing_val})")
                changeover_reading_val = co
                changeover_estimated = False
            else:
                # Estimate: midnight is 6 hours into a 12-hour night shift (50%)
                co = opening_val + volume * 0.5
                changeover_reading_val = round(co, 3)
                changeover_estimated = True

            pre_change_volume = round(changeover_reading_val - opening_val, 3)
            post_change_volume = round(closing_val - changeover_reading_val, 3)
            pre_change_price = old_price
            post_change_price = new_price
            pre_change_revenue = round(pre_change_volume * old_price, 2)
            post_change_revenue = round(post_change_volume * new_price, 2)
            revenue = round(pre_change_revenue + post_change_revenue, 2)
            price = round(revenue / volume, 2) if volume > 0 else old_price  # weighted average for display
        else:
            price = price_info["price"]
            revenue = round(volume * price, 2)

        fuel_revenue += revenue

        mech_volume = round(reading.mechanical_closing - reading.mechanical_opening, 3)
        deviation_liters = None
        deviation_percent = None
        deviation_flagged = None
        if mech_volume >= 0 and (reading.mechanical_closing > 0 or reading.mechanical_opening > 0):
            deviation_liters = round(abs(volume - mech_volume), 3)
            avg = (volume + mech_volume) / 2
            deviation_percent = round(deviation_liters / avg * 100, 2) if avg > 0 else 0.0
            threshold = storage.get('validation_thresholds', {}).get('meter_discrepancy_threshold', 0.5)
            deviation_flagged = deviation_percent > threshold

        nozzle_summaries.append(HandoverNozzleReadingSummary(
            nozzle_id=reading.nozzle_id,
            fuel_type=fuel_type,
            opening_reading=opening_val,
            closing_reading=closing_val,
            volume_sold=round(volume, 3),
            price_per_liter=price,
            revenue=revenue,
            mechanical_opening=reading.mechanical_opening if (reading.mechanical_closing > 0 or reading.mechanical_opening > 0) else None,
            mechanical_closing=reading.mechanical_closing if (reading.mechanical_closing > 0 or reading.mechanical_opening > 0) else None,
            mechanical_volume=mech_volume if (reading.mechanical_closing > 0 or reading.mechanical_opening > 0) else None,
            meter_deviation_liters=deviation_liters,
            meter_deviation_percent=deviation_percent,
            meter_deviation_flagged=deviation_flagged,
            changeover_reading=changeover_reading_val,
            changeover_estimated=changeover_estimated,
            pre_change_volume=pre_change_volume,
            post_change_volume=post_change_volume,
            pre_change_price=pre_change_price,
            post_change_price=post_change_price,
            pre_change_revenue=pre_change_revenue,
            post_change_revenue=post_change_revenue,
        ))

    return nozzle_summaries, round(fuel_revenue, 2), bool(er_closing)


def _process_stock_snapshot(stock_snapshot, station_id, storage):
    """Process stock counts and compute sales. Returns (lpg_sales, lub_sales, acc_sales, enriched_snapshot, stock_variance_flags)."""
    if not stock_snapshot:
        return 0.0, 0.0, 0.0, None, []

    lpg_pricing_db = load_lpg_pricing(station_id)
    stock_variance_flags = []

    # LPG cylinder trades (upgrades/downgrades) — captured per shift
    trades_input = getattr(stock_snapshot, 'lpg_trades', None) or []
    traded_in_map, traded_out_map, processed_trades, total_trade_revenue = \
        process_cylinder_trades(trades_input, lpg_pricing_db)

    # LPG cylinders
    lpg_sales = 0.0
    enriched_lpg = []
    for row in stock_snapshot.lpg_cylinders:
        total_sold = row.sold_refill + row.sold_with_cylinder
        damaged = getattr(row, 'damaged', 0)
        t_in = traded_in_map.get(row.size_kg, 0)
        t_out = traded_out_map.get(row.size_kg, 0)
        # Filled-stock variance: traded_out leaves as filled; traded_in arrives empty and does not count here.
        expected_closing = row.opening_full - total_sold - damaged - t_out
        variance = expected_closing - row.closing_full
        # Empty-stock variance: refill sales and upgrade trade-ins add to empties; downgrade trade-outs
        # (when the station gives back a smaller empty) reduce them. In the upgrade case the station
        # hands out a filled larger cylinder, so there is no empty-out movement for traded_out.
        expected_closing_empty = row.opening_empty + row.sold_refill + t_in
        empty_variance = expected_closing_empty - row.closing_empty
        pricing = get_pricing_for_size(row.size_kg, lpg_pricing_db)
        value_refill = round(row.sold_refill * pricing["price_refill"], 2)
        value_with_cyl = round(row.sold_with_cylinder * pricing["price_with_cylinder"], 2)
        sales_value = round(value_refill + value_with_cyl, 2)
        lpg_sales += sales_value
        variance_note = getattr(row, 'variance_note', None) or None
        if variance != 0 and not variance_note:
            stock_variance_flags.append(f"LPG {row.size_kg}kg filled: variance {variance}")
        if empty_variance != 0 and not variance_note:
            stock_variance_flags.append(f"LPG {row.size_kg}kg empty: variance {empty_variance}")
        enriched_lpg.append({
            "size_kg": row.size_kg, "opening_full": row.opening_full, "opening_empty": row.opening_empty,
            "additions": row.additions, "closing_full": row.closing_full, "closing_empty": row.closing_empty,
            "total_sold": total_sold, "sold_refill": row.sold_refill, "sold_with_cylinder": row.sold_with_cylinder,
            "damaged": damaged,
            "traded_in": t_in, "traded_out": t_out,
            "expected_closing": expected_closing, "variance": variance,
            "expected_closing_empty": expected_closing_empty, "empty_variance": empty_variance,
            "variance_note": variance_note, "refill_price": pricing["price_refill"],
            "price_with_cylinder": pricing["price_with_cylinder"],
            "value_refill": value_refill, "value_with_cylinder": value_with_cyl, "sales_value": sales_value,
        })
    lpg_sales = round(lpg_sales + total_trade_revenue, 2)

    # Accessories
    accessory_sales = 0.0
    enriched_acc = []
    acc_catalog = storage.get("lpg_accessories", {})
    acc_price_map = {}
    for code, item in acc_catalog.items():
        acc_price_map[code] = item.get("unit_price", 0)
    for item in DEFAULT_LPG_ACCESSORIES:
        if item["product_code"] not in acc_price_map:
            acc_price_map[item["product_code"]] = item.get("selling_price", 0)

    for row in stock_snapshot.accessories:
        sold = getattr(row, 'sold', 0) or max(0, row.opening_stock + row.additions - row.closing_stock)
        damaged = getattr(row, 'damaged', 0)
        expected_closing = row.opening_stock - sold - damaged
        variance = expected_closing - row.closing_stock
        unit_price = acc_price_map.get(row.product_code, 0)
        sales_value = round(sold * unit_price, 2)
        accessory_sales += sales_value
        variance_note = getattr(row, 'variance_note', None) or None
        if variance != 0 and not variance_note:
            stock_variance_flags.append(f"Accessory {row.product_code}: variance {variance}")
        enriched_acc.append({
            "product_code": row.product_code, "description": row.description,
            "opening_stock": row.opening_stock, "additions": row.additions, "sold": sold,
            "damaged": damaged, "closing_stock": row.closing_stock,
            "expected_closing": expected_closing, "variance": variance,
            "variance_note": variance_note, "unit_price": unit_price, "sales_value": sales_value,
        })
    accessory_sales = round(accessory_sales, 2)

    # Lubricants
    lubricant_sales = 0.0
    enriched_lub = []
    lub_catalog = load_lubricant_catalog(station_id)
    lub_price_map = {p["product_code"]: p.get("selling_price", 0) for p in lub_catalog}

    for row in stock_snapshot.lubricants:
        sold = getattr(row, 'sold', 0) or max(0, row.opening_stock + row.additions - row.closing_stock)
        damaged = getattr(row, 'damaged', 0)
        expected_closing = row.opening_stock - sold - damaged
        variance = expected_closing - row.closing_stock
        unit_price = lub_price_map.get(row.product_code, 0)
        sales_value = round(sold * unit_price, 2)
        lubricant_sales += sales_value
        variance_note = getattr(row, 'variance_note', None) or None
        if variance != 0 and not variance_note:
            stock_variance_flags.append(f"Lubricant {row.product_code}: variance {variance}")
        enriched_lub.append({
            "product_code": row.product_code, "description": row.description,
            "opening_stock": row.opening_stock, "additions": row.additions, "sold": sold,
            "damaged": damaged, "closing_stock": row.closing_stock,
            "expected_closing": expected_closing, "variance": variance,
            "variance_note": variance_note, "unit_price": unit_price, "sales_value": sales_value,
        })
    lubricant_sales = round(lubricant_sales, 2)

    enriched_snapshot = {
        "lpg_cylinders": enriched_lpg,
        "accessories": enriched_acc,
        "lubricants": enriched_lub,
        "lpg_trades": [t.model_dump(mode='json') for t in processed_trades],
        "lpg_trade_revenue": total_trade_revenue,
    }
    return lpg_sales, lubricant_sales, accessory_sales, enriched_snapshot, stock_variance_flags


def _process_credit_sales(credit_sale_items, storage, shift_id):
    """Process credit sale line items. Returns (credit_total, credit_sale_details, new_items_to_create)."""
    accounts_data = storage.get('accounts', {})
    credit_sales_data = storage.get('credit_sales', [])

    enriched_items = []
    for item in credit_sale_items:
        account = accounts_data.get(item.account_id)
        if account and account.get("default_price_per_liter"):
            price = account["default_price_per_liter"]
        else:
            price = resolve_fuel_price(item.fuel_type, storage)
        amount = round(item.volume * price, 2)
        enriched_items.append({
            "account_id": item.account_id, "account_name": item.account_name,
            "fuel_type": item.fuel_type, "volume": item.volume,
            "price_per_liter": price, "amount": amount, "source": "handover",
        })

    pre_existing = [s for s in credit_sales_data if s.get("shift_id") == shift_id]
    pre_existing_details = []
    for s in pre_existing:
        pre_existing_details.append({
            "account_id": s.get("account_id", ""),
            "account_name": accounts_data.get(s.get("account_id", ""), {}).get("account_name", s.get("account_id", "")),
            "fuel_type": s.get("fuel_type", ""),
            "volume": s.get("volume", 0),
            "price_per_liter": round(s["amount"] / s["volume"], 2) if s.get("volume") else 0,
            "amount": s.get("amount", 0),
            "source": "pre_existing",
            "sale_id": s.get("sale_id", ""),
        })

    pre_existing_account_ids = {s.get("account_id") for s in pre_existing}
    new_items_to_create = []
    for item in enriched_items:
        if item["account_id"] in pre_existing_account_ids:
            item["source"] = "skipped_duplicate"
        else:
            new_items_to_create.append(item)

    new_total = sum(i["amount"] for i in new_items_to_create)
    pre_existing_total = sum(s.get("amount", 0) for s in pre_existing)
    credit_total = round(new_total + pre_existing_total, 2)

    credit_sale_details = enriched_items + pre_existing_details
    return credit_total, credit_sale_details, new_items_to_create


def _cash_shortage_threshold(storage: dict) -> float:
    """Per-station cash-shortage flag threshold (ZMW). Defaults to 500."""
    return storage.get('fuel_settings', {}).get('cash_shortage_threshold', 500)


def _compute_auto_flags(difference, nozzle_summaries, stock_variance_flags, storage):
    """Compute auto-flag reasons. Returns (auto_flag_reasons, review_status)."""
    auto_flag_reasons = []
    if abs(difference) > _cash_shortage_threshold(storage):
        auto_flag_reasons.append("cash_shortage")
    if any(ns.meter_deviation_flagged for ns in nozzle_summaries):
        auto_flag_reasons.append("meter_deviation")
    nozzle_loss_threshold = storage.get('fuel_settings', {}).get('nozzle_allowable_loss_liters', 0.8)
    if any(ns.meter_deviation_liters is not None and ns.meter_deviation_liters > nozzle_loss_threshold for ns in nozzle_summaries):
        auto_flag_reasons.append("nozzle_loss_exceeded")
    if stock_variance_flags:
        auto_flag_reasons.append("stock_variance_unexplained")
    review_status = "flagged" if auto_flag_reasons else "submitted"
    return auto_flag_reasons, review_status


def _compute_phase1_flags(nozzle_summaries, stock_variance_flags, storage):
    """Compute auto-flags for Phase 1 only (no cash data). Returns list of flag reasons."""
    flags = []
    if any(ns.meter_deviation_flagged for ns in nozzle_summaries):
        flags.append("meter_deviation")
    nozzle_loss_threshold = storage.get('fuel_settings', {}).get('nozzle_allowable_loss_liters', 0.8)
    if any(ns.meter_deviation_liters is not None and ns.meter_deviation_liters > nozzle_loss_threshold for ns in nozzle_summaries):
        flags.append("nozzle_loss_exceeded")
    if stock_variance_flags:
        flags.append("stock_variance_unexplained")
    return flags


def _feed_daily_entries(enriched_snapshot, station_id, user_id, user_name, shift, handover_id):
    """Populate daily entry files from enriched stock snapshot."""
    if not enriched_snapshot:
        return

    shift_date = shift.get("date", "")
    shift_type = shift.get("shift_type", "Day")
    now_iso = datetime.now().isoformat()

    # 1) LPG Cylinders
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
            "size_kg": cyl["size_kg"], "opening_balance": cyl["opening_full"],
            "opening_empty": cyl.get("opening_empty", 0), "receipts": cyl["additions"],
            "traded_in": cyl.get("traded_in", 0), "traded_out": cyl.get("traded_out", 0),
            "sold_refill": cyl.get("sold_refill", 0),
            "sold_with_cylinder": cyl.get("sold_with_cylinder", 0), "balance": cyl["closing_full"],
            "closing_empty": cyl.get("closing_empty", 0),
            "value_refill": val_refill, "value_with_cylinder": val_with_cyl, "total_value": total_val,
        })
    trade_revenue = round(enriched_snapshot.get("lpg_trade_revenue", 0.0), 2)
    trades_out = enriched_snapshot.get("lpg_trades", []) or []
    grand_total = round(grand_total + trade_revenue, 2)
    book_pop = sum(r["balance"] + r.get("closing_empty", 0) for r in cylinder_rows)
    lpg_daily_db[lpg_entry_id] = {
        "entry_id": lpg_entry_id, "date": shift_date, "shift_type": shift_type,
        "salesperson": user_name, "cylinder_rows": cylinder_rows,
        "grand_total_value": grand_total, "book_cylinder_population": book_pop,
        "actual_cylinder_population": None, "population_difference": None,
        "recorded_by": user_id, "created_at": now_iso,
        "trades": trades_out, "total_trade_revenue": trade_revenue,
        "notes": f"Auto-generated from handover {handover_id}",
    }
    save_lpg_daily(lpg_daily_db, station_id)

    # 2) Accessories
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
            "product_code": acc["product_code"], "description": acc["description"],
            "selling_price": acc.get("unit_price", 0), "opening_stock": acc["opening_stock"],
            "additions": acc["additions"], "sold": acc.get("sold", 0),
            "balance": acc["closing_stock"], "sales_value": sv,
        })
    acc_daily_db[acc_entry_id] = {
        "entry_id": acc_entry_id, "date": shift_date, "product_rows": acc_rows,
        "total_daily_sales_value": round(acc_total, 2), "recorded_by": user_id,
        "created_at": now_iso, "notes": f"Auto-generated from handover {handover_id}",
    }
    save_lpg_accessories(acc_daily_db, station_id)

    # 3) Lubricants
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
            "product_code": lub["product_code"], "description": lub["description"],
            "category": cat_item.get("category", ""), "unit_size": cat_item.get("unit_size", ""),
            "selling_price": lub.get("unit_price", 0), "opening_stock": lub["opening_stock"],
            "additions": lub["additions"], "sold_or_drawn": sold,
            "balance": lub["closing_stock"], "sales_value": sv,
        })
    lub_daily_db[lub_entry_id] = {
        "entry_id": lub_entry_id, "date": shift_date, "location": "Island 3",
        "product_rows": lub_rows, "total_daily_sales_value": round(lub_total, 2),
        "total_items_moved": lub_items_moved, "recorded_by": user_id,
        "created_at": now_iso, "notes": f"Auto-generated from handover {handover_id}",
    }
    save_lubricant_daily(lub_daily_db, station_id)


def _create_reconciliation(nozzle_summaries, lpg_sales, lubricant_sales, accessory_sales,
                           credit_sales, expected_cash, actual_cash, difference,
                           shift, user_id, user_name, station_id, storage, notes=None):
    """Create a reconciliation record from handover data."""
    try:
        from .reconciliation import _save_reconciliation_entry
        petrol_revenue = sum(ns.revenue for ns in nozzle_summaries if ns.fuel_type == "Petrol")
        diesel_revenue = sum(ns.revenue for ns in nozzle_summaries if ns.fuel_type == "Diesel")
        recon_entry = {
            "shift_id": shift.get("shift_id", ""),
            "attendant_id": user_id,
            "attendant_name": user_name,
            "date": shift.get("date", ""),
            "shift_type": shift.get("shift_type", ""),
            "petrol_revenue": round(petrol_revenue, 2),
            "diesel_revenue": round(diesel_revenue, 2),
            "lpg_revenue": round(lpg_sales, 2),
            "lubricants_revenue": round(lubricant_sales, 2),
            "accessories_revenue": round(accessory_sales, 2),
            "total_expected": round(petrol_revenue + diesel_revenue + lpg_sales + lubricant_sales + accessory_sales, 2),
            "credit_sales_total": round(credit_sales, 2),
            "expected_cash": round(expected_cash, 2),
            "actual_deposited": round(actual_cash, 2),
            "difference": round(difference, 2),
            "cumulative_difference": 0,
            "notes": notes,
        }
        _save_reconciliation_entry(recon_entry, station_id, storage)
    except Exception:
        pass  # Non-critical


def _update_nozzle_state(nozzle_readings, storage):
    """Update nozzle electronic/mechanical readings in islands data."""
    for reading in nozzle_readings:
        nozzle = get_nozzle(reading.nozzle_id, storage=storage)
        if nozzle:
            nozzle["electronic_reading"] = reading.closing_reading
            nozzle["mechanical_reading"] = reading.mechanical_closing


def _create_credit_sale_records(new_items_to_create, handover_id, handover_output, shift, storage, station_id):
    """Create CreditSale records for new items via process_credit_sale()."""
    accounts_data = storage.get('accounts', {})
    credit_sales_data = storage.get('credit_sales', [])
    handovers = _load_handovers(station_id)
    shift_date = shift.get("date", "")
    for idx, item in enumerate(new_items_to_create):
        sale_id = f"CS-HO-{handover_id}-{idx}"
        sale_data = {
            "sale_id": sale_id, "account_id": item["account_id"],
            "shift_id": shift.get("shift_id", ""), "date": shift_date,
            "fuel_type": item["fuel_type"], "volume": item["volume"],
            "amount": item["amount"], "invoice_number": f"Handover {handover_id}",
        }
        try:
            process_credit_sale(
                accounts=accounts_data, sales_log=credit_sales_data,
                account_id=item["account_id"], amount=item["amount"], sale_data=sale_data,
            )
        except HTTPException:
            item["over_limit"] = True
            for d in handover_output.credit_sale_details or []:
                if d.get("account_id") == item["account_id"] and d.get("source") == "handover":
                    d["over_limit"] = True
                    break
            handovers[handover_id] = handover_output.dict()
            _save_handovers(handovers, station_id)


@router.get("/credit-accounts")
async def get_credit_accounts(ctx: dict = Depends(get_station_context)):
    """
    Return account holders and current global fuel prices so the frontend
    can build credit sale line items with auto-computed amounts.
    """
    storage = ctx["storage"]
    accounts_data = storage.get('accounts', {})

    accounts_list = []
    for acc in accounts_data.values():
        accounts_list.append({
            "account_id": acc["account_id"],
            "account_name": acc["account_name"],
            "account_type": acc.get("account_type", ""),
            "default_price_per_liter": acc.get("default_price_per_liter"),
        })

    fuel_prices = {
        "Diesel": resolve_fuel_price("Diesel", storage),
        "Petrol": resolve_fuel_price("Petrol", storage),
    }

    return {"accounts": accounts_list, "fuel_prices": fuel_prices}


@router.get("/my-shifts")
async def get_my_active_shifts(ctx: dict = Depends(get_station_context)):
    """
    List all active shifts the current user is assigned to.
    Returns lightweight shift info for dropdown selection.
    """
    storage = ctx["storage"]
    user_id = ctx["user_id"]
    user_name = ctx["full_name"]
    shifts_data = storage.get('shifts', {})

    my_shifts = []
    for shift_id, shift in shifts_data.items():
        if shift.get("status") != "active":
            continue
        for assignment in shift.get("assignments", []):
            if assignment.get("attendant_id") == user_id or \
               assignment.get("attendant_name", "").lower() == user_name.lower():
                my_shifts.append({
                    "shift_id": shift.get("shift_id", shift_id),
                    "date": shift.get("date"),
                    "shift_type": shift.get("shift_type"),
                })
                break

    return {"shifts": my_shifts, "count": len(my_shifts)}


@router.get("/my-pending-closings")
async def get_my_pending_closings(ctx: dict = Depends(get_station_context)):
    """
    Return all handovers for the current user that have completed Phase 1
    (readings_verified) but have not yet been closed (Phase 2).
    Used by the attendant shift-closing date picker.
    """
    station_id = ctx["station_id"]
    user_id = ctx["user_id"]
    user_name = ctx["full_name"]
    handovers = _load_handovers(station_id)

    my_pending = []
    for h in handovers.values():
        if h.get("phase") != "readings_verified":
            continue
        if h.get("attendant_id") == user_id or \
           h.get("attendant_name", "").lower() == user_name.lower():
            my_pending.append({
                "handover_id": h.get("handover_id"),
                "shift_id": h.get("shift_id"),
                "date": h.get("date"),
                "shift_type": h.get("shift_type"),
                "attendant_name": h.get("attendant_name"),
                "total_expected": h.get("total_expected"),
                "phase": h.get("phase"),
                "phase_1_completed_at": h.get("phase_1_completed_at"),
            })

    my_pending.sort(key=lambda h: h.get("date", ""), reverse=True)
    return {"handovers": my_pending, "count": len(my_pending)}


@router.get("/my-shift")
async def get_my_shift(shift_id: str = None, ctx: dict = Depends(get_station_context)):
    """
    Find the current user's active shift and return shift info
    with assigned nozzles and their last known readings.
    Optional shift_id param to select a specific active shift.
    """
    storage = ctx["storage"]
    user_id = ctx["user_id"]
    user_name = ctx["full_name"]
    shifts_data = storage.get('shifts', {})
    islands_data = storage.get('islands', {})

    # Search active shifts for one with an assignment matching this user
    my_shift = None
    my_assignment = None

    for sid, shift in shifts_data.items():
        if shift.get("status") != "active":
            continue
        # If shift_id specified, only match that one
        if shift_id and shift.get("shift_id", sid) != shift_id:
            continue
        assignments = shift.get("assignments", [])
        for assignment in assignments:
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

    # Apply any due price changes lazily
    apply_due_price_changes(storage, ctx["station_id"])

    shift_date = my_shift.get("date", "")
    shift_type_val = my_shift.get("shift_type", "")

    nozzle_details = []
    price_change_detected = False
    for nozzle_id in assigned_nozzle_ids:
        nozzle = get_nozzle(nozzle_id, storage=storage)
        if nozzle:
            fuel_type = _get_fuel_type(nozzle_id, storage=storage)
            price_info = resolve_fuel_price_for_shift(fuel_type, shift_date, shift_type_val, storage)
            price = price_info["price"]
            if price_info["has_price_change"]:
                price_change_detected = True
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
                "mechanical_opening_reading": nozzle.get("mechanical_reading") or 0,
                "price_per_liter": price,
                "status": nozzle.get("status", "Active"),
                "display_label": nozzle.get("display_label"),
                "fuel_type_abbrev": fuel_type_abbrev,
                "has_price_change": price_info["has_price_change"],
                "old_price": price_info.get("old_price"),
                "new_price": price_info.get("new_price"),
            })

    # Check enter_readings status
    enter_readings_db = _load_enter_readings(ctx["station_id"])
    shift_id = my_shift.get("shift_id", "")
    er_closing_key = f"AR-{shift_id}-{user_id}-C"
    enter_readings_submitted = er_closing_key in enter_readings_db
    enter_readings_closing = enter_readings_db.get(er_closing_key)

    # Check for existing Phase 1 handover (readings_verified)
    handovers = _load_handovers(ctx["station_id"])
    readings_verified_handover = None
    has_any_handover = False
    for ho in handovers.values():
        if ho.get("shift_id") == shift_id and ho.get("attendant_id") == user_id:
            has_any_handover = True
            if ho.get("phase") == "readings_verified":
                readings_verified_handover = ho

    # Start-of-shift opening verification (additive). A shift that already has a
    # handover (readings/closing in progress) is treated as verified so in-flight
    # shifts are never forced back into the start-of-shift step.
    opening_verification = _load_opening_verifications(ctx["station_id"]).get(f"{shift_id}-{user_id}")
    opening_verified = bool(opening_verification) or has_any_handover

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
        "meter_discrepancy_threshold": storage.get('validation_thresholds', {}).get('meter_discrepancy_threshold', 0.5),
        "nozzle_allowable_loss_liters": storage.get('fuel_settings', {}).get('nozzle_allowable_loss_liters', 0.8),
        "enter_readings_submitted": enter_readings_submitted,
        "enter_readings_closing": enter_readings_closing,
        "readings_verified_handover": readings_verified_handover,
        "opening_verified": opening_verified,
        "opening_verification": opening_verification,
        "price_change_detected": price_change_detected,
    }


class VerifyOpeningInput(BaseModel):
    shift_id: str
    discrepancy_note: Optional[str] = None


@router.post("/verify-opening")
async def verify_opening(data: VerifyOpeningInput, ctx: dict = Depends(get_station_context)):
    """
    Record an attendant's start-of-shift verification of the carried-forward
    opening readings and stock. Additive: it does not create or modify any
    handover, nozzle reading, or stock record — it only stores an acknowledgment
    (with an optional discrepancy note) so the UI can move from the start-of-shift
    step to the closing step, and so the verification is auditable.
    """
    storage = ctx["storage"]
    station_id = ctx["station_id"]
    # Reuse the standard assignment guard (active shift, caller assigned).
    _validate_shift_and_assignment(data.shift_id, ctx, storage)

    verifications = _load_opening_verifications(station_id)
    key = f"{data.shift_id}-{ctx['user_id']}"
    record = {
        "shift_id": data.shift_id,
        "attendant_id": ctx["user_id"],
        "attendant_name": ctx["full_name"],
        "verified_at": datetime.now().isoformat(),
        "discrepancy_note": (data.discrepancy_note or "").strip() or None,
    }
    verifications[key] = record
    _save_opening_verifications(verifications, station_id)

    log_audit_event(
        station_id=station_id,
        action="opening_verified",
        performed_by=ctx["username"],
        entity_type="shift",
        entity_id=data.shift_id,
        details={"discrepancy_note": record["discrepancy_note"]},
    )
    return {"status": "success", "opening_verification": record}


@router.get("/opening-verifications")
async def get_opening_verifications(ctx: dict = Depends(get_station_context)):
    """
    Opening-verification (shift-start) records for this station, keyed by
    f"{shift_id}-{attendant_id}". Lets supervisors see who has started their shift.
    """
    return _load_opening_verifications(ctx["station_id"])


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


@router.post("/submit-readings", response_model=HandoverOutput)
async def submit_readings(data: ReadingsVerificationInput, ctx: dict = Depends(get_station_context)):
    """
    Phase 1: Submit meter readings and stock counts at the forecourt.
    No financial data required. Creates a partial handover with phase='readings_verified'.
    """
    storage = ctx["storage"]
    station_id = ctx["station_id"]
    user_id = ctx["user_id"]
    user_name = ctx["full_name"]

    shift, my_assignment, allowed_nozzle_ids = _validate_shift_and_assignment(data.shift_id, ctx, storage)

    # Prevent duplicate Phase 1 submissions
    handovers = _load_handovers(station_id)
    has_handover = False
    for ho in handovers.values():
        if (ho.get("shift_id") == data.shift_id
            and ho.get("attendant_id") == user_id):
            has_handover = True
            if ho.get("phase") == "readings_verified":
                raise HTTPException(status_code=409, detail="Readings already submitted for this shift. Use redo-readings to replace.")

    # Gate: the attendant must have started the shift (verified the carried-forward
    # opening) before ending it. A shift that already has a handover (e.g. a redo)
    # is exempt so in-flight work is never blocked.
    opening_started = f"{data.shift_id}-{user_id}" in _load_opening_verifications(station_id)
    if not opening_started and not has_handover:
        raise HTTPException(
            status_code=400,
            detail="Start your shift first — verify your opening readings before ending the shift.",
        )

    nozzle_summaries, fuel_revenue, had_er_closing = _process_nozzle_readings(
        data.nozzle_readings, storage, station_id, data.shift_id, user_id, allowed_nozzle_ids,
        shift_date=shift.get("date"), shift_type=shift.get("shift_type"))

    lpg_sales, lubricant_sales, accessory_sales, enriched_snapshot, stock_variance_flags = \
        _process_stock_snapshot(data.stock_snapshot, station_id, storage)

    total_expected = round(fuel_revenue + lpg_sales + lubricant_sales + accessory_sales, 2)

    # Phase 1 flags only (no cash data)
    phase1_flags = _compute_phase1_flags(nozzle_summaries, stock_variance_flags, storage)
    if any(ns.changeover_estimated for ns in nozzle_summaries):
        phase1_flags.append("changeover_estimated")

    handover_id = f"HO-{data.shift_id}-{user_id}-{datetime.now().strftime('%H%M%S')}"
    now_iso = datetime.now().isoformat()

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
        credit_sales=0,
        expected_cash=total_expected,
        actual_cash=0,
        pos_receipts=0,
        total_accounted=0,
        difference=0,
        status="submitted",
        phase="readings_verified",
        phase_1_completed_at=now_iso,
        review_status="submitted",
        auto_flag_reasons=phase1_flags or None,
        notes=data.notes,
        created_at=now_iso,
        stock_snapshot=enriched_snapshot,
    )

    handovers[handover_id] = handover_output.dict()
    _save_handovers(handovers, station_id)

    # Update nozzle state immediately
    if not had_er_closing:
        _update_nozzle_state(data.nozzle_readings, storage)

    # Feed daily entry files
    _feed_daily_entries(enriched_snapshot, station_id, user_id, user_name, shift, handover_id)

    log_audit_event(
        station_id=station_id, action="readings_verified",
        performed_by=ctx["username"], entity_type="handover", entity_id=handover_id,
        details={"shift_id": data.shift_id, "fuel_revenue": fuel_revenue, "total_expected": total_expected},
    )

    create_notification(
        station_id=station_id, type="READINGS_VERIFIED", severity="info",
        title="Readings Verified",
        message=f"Shift {data.shift_id} readings verified by {user_name}. Total expected: K{total_expected:,.2f}",
        entity_type="handover", entity_id=handover_id, created_by=ctx["username"],
    )

    return handover_output


@router.post("/submit-closing", response_model=HandoverOutput)
async def submit_closing(data: ShiftClosingInput, ctx: dict = Depends(get_station_context)):
    """
    Phase 2: Submit financial reconciliation in the office.
    Requires a Phase 1 handover (readings_verified) to exist.
    Can be submitted by the original attendant or a supervisor/manager/owner.
    """
    storage = ctx["storage"]
    station_id = ctx["station_id"]
    user_id = ctx["user_id"]

    handovers = _load_handovers(station_id)
    if data.handover_id not in handovers:
        raise HTTPException(status_code=404, detail="Handover not found")

    handover = handovers[data.handover_id]

    if handover.get("phase") != "readings_verified":
        raise HTTPException(status_code=400, detail="This handover is not in readings_verified phase")

    # Allow: original attendant OR supervisor/manager/owner
    role = ctx["role"]
    role_str = role.value if isinstance(role, UserRole) else str(role)
    is_privileged = role_str in [UserRole.SUPERVISOR.value, UserRole.MANAGER.value, UserRole.OWNER.value]
    if handover.get("attendant_id") != user_id and not is_privileged:
        raise HTTPException(status_code=403, detail="Only the assigned attendant or a supervisor/manager/owner can submit shift closing")

    # Process credit sales
    credit_sale_details = None
    new_items_to_create = []
    credit_sales = data.credit_sales
    shift_id = handover.get("shift_id", "")

    # Block closing edits to a finalized (reconciled / inactive) shift.
    assert_shift_editable(storage.get("shifts", {}).get(shift_id))

    if data.credit_sale_items:
        credit_sales, credit_sale_details, new_items_to_create = \
            _process_credit_sales(data.credit_sale_items, storage, shift_id)

    # Compute financials
    total_expected = handover.get("total_expected", 0)
    total_accounted = round(data.actual_cash + data.pos_receipts + credit_sales, 2)
    difference = round(total_accounted - total_expected, 2)
    expected_cash = round(total_expected - credit_sales, 2)

    # Merge Phase 1 flags with Phase 2 cash flag
    phase1_flags = handover.get("auto_flag_reasons") or []
    all_flags = list(phase1_flags)
    if abs(difference) > _cash_shortage_threshold(storage):
        all_flags.append("cash_shortage")
    review_status = "flagged" if all_flags else "submitted"

    now_iso = datetime.now().isoformat()

    # Update handover record
    handover["phase"] = "completed"
    handover["phase_2_completed_at"] = now_iso
    handover["actual_cash"] = data.actual_cash
    handover["pos_receipts"] = data.pos_receipts
    handover["credit_sales"] = credit_sales
    handover["credit_sale_details"] = credit_sale_details
    handover["expected_cash"] = expected_cash
    handover["total_accounted"] = total_accounted
    handover["difference"] = difference
    handover["auto_flag_reasons"] = all_flags or None
    handover["review_status"] = review_status
    if data.notes:
        existing_notes = handover.get("notes") or ""
        handover["notes"] = f"{existing_notes}\n[Closing] {data.notes}".strip() if existing_notes else data.notes

    _save_handovers(handovers, station_id)

    # Reconstruct nozzle_summaries from stored data for reconciliation
    nozzle_summaries = [HandoverNozzleReadingSummary(**ns) for ns in handover.get("nozzle_summaries", [])]

    # Create credit sale records
    shifts_data = storage.get('shifts', {})
    shift = shifts_data.get(shift_id, {})
    handover_output = HandoverOutput(**handover)

    if new_items_to_create:
        _create_credit_sale_records(new_items_to_create, data.handover_id, handover_output, shift, storage, station_id)

    # Create reconciliation (now has both revenue AND cash)
    _create_reconciliation(
        nozzle_summaries, handover.get("lpg_sales", 0), handover.get("lubricant_sales", 0),
        handover.get("accessory_sales", 0), credit_sales, expected_cash, data.actual_cash,
        difference, shift, handover.get("attendant_id", ""), handover.get("attendant_name", ""),
        station_id, storage, handover.get("notes"))

    # Full audit + notifications
    attendant_name = handover.get("attendant_name", "")
    log_audit_event(
        station_id=station_id, action="handover_submit",
        performed_by=ctx["username"], entity_type="handover", entity_id=data.handover_id,
        details={"shift_id": shift_id, "fuel_revenue": handover.get("fuel_revenue", 0),
                 "total_expected": total_expected, "actual_cash": data.actual_cash,
                 "pos_receipts": data.pos_receipts, "difference": difference},
    )

    create_notification(
        station_id=station_id, type="HANDOVER_SUBMITTED", severity="info",
        title="Shift Closing Submitted",
        message=f"Shift {shift_id} closing for {attendant_name}: Expected K{expected_cash:,.2f}, "
                f"Cash K{data.actual_cash:,.2f}, POS K{data.pos_receipts:,.2f}",
        entity_type="handover", entity_id=data.handover_id, created_by=ctx["username"],
    )

    if difference < -_cash_shortage_threshold(storage):
        create_notification(
            station_id=station_id, type="CASH_SHORTAGE", severity="critical",
            title="Cash Shortage Detected",
            message=f"Shift {shift_id} ({attendant_name}): Shortage of K{abs(difference):,.2f} "
                    f"(Expected K{total_expected:,.2f}, Accounted K{total_accounted:,.2f})",
            entity_type="handover", entity_id=data.handover_id, created_by=ctx["username"],
        )

    for ns in nozzle_summaries:
        if ns.meter_deviation_flagged:
            create_notification(
                station_id=station_id, type="METER_DEVIATION", severity="warning",
                title="Meter Deviation Detected",
                message=f"Nozzle {ns.nozzle_id}: Elec {ns.volume_sold:.3f}L vs Mech {ns.mechanical_volume:.3f}L "
                        f"({ns.meter_deviation_percent:.2f}%) - Shift {shift_id}, {attendant_name}",
                entity_type="handover", entity_id=data.handover_id, created_by=ctx["username"],
            )

    return handover_output


@router.post("/redo-readings")
async def redo_readings(data: dict, ctx: dict = Depends(get_station_context)):
    """
    Mark existing Phase 1 handover as superseded so readings can be resubmitted.
    Only allowed before Phase 2 (shift closing) has been submitted.
    """
    handover_id = data.get("handover_id")
    if not handover_id:
        raise HTTPException(status_code=400, detail="handover_id is required")

    station_id = ctx["station_id"]
    user_id = ctx["user_id"]
    role = ctx["role"]
    role_str = role.value if isinstance(role, UserRole) else str(role)
    is_privileged = role_str in [UserRole.SUPERVISOR.value, UserRole.MANAGER.value, UserRole.OWNER.value]

    handovers = _load_handovers(station_id)
    if handover_id not in handovers:
        raise HTTPException(status_code=404, detail="Handover not found")

    handover = handovers[handover_id]

    if handover.get("phase") != "readings_verified":
        raise HTTPException(status_code=400, detail="Can only redo readings before shift closing is submitted")

    if handover.get("attendant_id") != user_id and not is_privileged:
        raise HTTPException(status_code=403, detail="Only the assigned attendant or a supervisor can redo readings")

    handover["phase"] = "readings_superseded"
    _save_handovers(handovers, station_id)

    log_audit_event(
        station_id=station_id, action="readings_redo",
        performed_by=ctx["username"], entity_type="handover", entity_id=handover_id,
        details={"shift_id": handover.get("shift_id")},
    )

    return {"status": "success", "message": "Readings marked as superseded. You can now submit new readings."}


@router.post("/submit", response_model=HandoverOutput)
async def submit_handover(data: HandoverInput, ctx: dict = Depends(get_station_context)):
    """
    Legacy single-submit handover (backward compatible).
    Submits readings, stock, cash, and credit in one call.
    """
    storage = ctx["storage"]
    station_id = ctx["station_id"]
    user_id = ctx["user_id"]
    user_name = ctx["full_name"]

    shift, my_assignment, allowed_nozzle_ids = _validate_shift_and_assignment(data.shift_id, ctx, storage)

    nozzle_summaries, fuel_revenue, had_er_closing = _process_nozzle_readings(
        data.nozzle_readings, storage, station_id, data.shift_id, user_id, allowed_nozzle_ids,
        shift_date=shift.get("date"), shift_type=shift.get("shift_type"))

    lpg_sales = data.lpg_sales
    lubricant_sales = data.lubricant_sales
    accessory_sales = data.accessory_sales
    enriched_snapshot = None
    stock_variance_flags = []

    if data.stock_snapshot:
        lpg_sales, lubricant_sales, accessory_sales, enriched_snapshot, stock_variance_flags = \
            _process_stock_snapshot(data.stock_snapshot, station_id, storage)

    total_expected = round(fuel_revenue + lpg_sales + lubricant_sales + accessory_sales, 2)

    # Credit sales
    credit_sale_details = None
    new_items_to_create = []
    if data.credit_sale_items:
        data.credit_sales, credit_sale_details, new_items_to_create = \
            _process_credit_sales(data.credit_sale_items, storage, data.shift_id)

    expected_cash = round(total_expected - data.credit_sales, 2)
    difference = round(data.actual_cash - expected_cash, 2)

    auto_flag_reasons, review_status = _compute_auto_flags(difference, nozzle_summaries, stock_variance_flags, storage)

    handovers = _load_handovers(station_id)
    handover_id = f"HO-{data.shift_id}-{user_id}-{datetime.now().strftime('%H%M%S')}"
    now_iso = datetime.now().isoformat()

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
        credit_sale_details=credit_sale_details,
        expected_cash=expected_cash,
        actual_cash=data.actual_cash,
        pos_receipts=0,
        total_accounted=round(data.actual_cash + data.credit_sales, 2),
        difference=difference,
        status="submitted",
        phase="completed",
        phase_1_completed_at=now_iso,
        phase_2_completed_at=now_iso,
        review_status=review_status,
        auto_flag_reasons=auto_flag_reasons or None,
        notes=data.notes,
        created_at=now_iso,
        stock_snapshot=enriched_snapshot,
    )

    handovers[handover_id] = handover_output.dict()
    _save_handovers(handovers, station_id)

    if new_items_to_create:
        _create_credit_sale_records(new_items_to_create, handover_id, handover_output, shift, storage, station_id)

    log_audit_event(
        station_id=station_id, action="handover_submit",
        performed_by=ctx["username"], entity_type="handover", entity_id=handover_id,
        details={"shift_id": data.shift_id, "fuel_revenue": fuel_revenue,
                 "total_expected": total_expected, "actual_cash": data.actual_cash, "difference": difference},
    )

    create_notification(
        station_id=station_id, type="HANDOVER_SUBMITTED", severity="info",
        title="Handover Submitted",
        message=f"Shift {data.shift_id} handover by {user_name}: Expected K{expected_cash:,.2f}, Actual K{data.actual_cash:,.2f}",
        entity_type="handover", entity_id=handover_id, created_by=ctx["username"],
    )

    if difference < -_cash_shortage_threshold(storage):
        create_notification(
            station_id=station_id, type="CASH_SHORTAGE", severity="critical",
            title="Cash Shortage Detected",
            message=f"Shift {data.shift_id} ({user_name}): Cash shortage of K{abs(difference):,.2f}",
            entity_type="handover", entity_id=handover_id, created_by=ctx["username"],
        )

    for ns in nozzle_summaries:
        if ns.meter_deviation_flagged:
            create_notification(
                station_id=station_id, type="METER_DEVIATION", severity="warning",
                title="Meter Deviation Detected",
                message=f"Nozzle {ns.nozzle_id}: Elec {ns.volume_sold:.3f}L vs Mech {ns.mechanical_volume:.3f}L "
                        f"({ns.meter_deviation_percent:.2f}%) - Shift {data.shift_id}, {user_name}. "
                        f"Note: {data.notes or 'N/A'}",
                entity_type="handover", entity_id=handover_id, created_by=ctx["username"],
            )

    _create_reconciliation(nozzle_summaries, lpg_sales, lubricant_sales, accessory_sales,
                          data.credit_sales, expected_cash, data.actual_cash, difference,
                          shift, user_id, user_name, station_id, storage, data.notes)

    if not had_er_closing:
        _update_nozzle_state(data.nozzle_readings, storage)

    _feed_daily_entries(enriched_snapshot, station_id, user_id, user_name, shift, handover_id)

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
    if role_str not in [UserRole.SUPERVISOR.value, UserRole.MANAGER.value, UserRole.OWNER.value]:
        raise HTTPException(
            status_code=403,
            detail="Access forbidden. This endpoint is restricted to supervisors, managers, and owners."
        )

    station_id = ctx["station_id"]
    handovers = _load_handovers(station_id)

    if handover_id not in handovers:
        raise HTTPException(status_code=404, detail="Handover not found")

    handover = handovers[handover_id]

    # Block if the day has been closed off
    close_offs = load_station_json(station_id, "daily_close_offs.json", default={})
    if handover.get("date", "") in close_offs:
        raise HTTPException(status_code=400, detail=f"Cannot reopen handover. Day {handover['date']} has been closed off.")

    if handover.get("status") == "reopened":
        raise HTTPException(status_code=400, detail="Handover is already reopened")

    handover["status"] = "reopened"
    _save_handovers(handovers, station_id)

    return {"status": "success", "message": f"Handover {handover_id} reopened for correction"}


@router.get("/review-queue")
async def get_review_queue(
    shift_id: str = None,
    date: str = None,
    ctx: dict = Depends(get_station_context),
):
    """
    Get handovers pending review. Supervisor/owner only.
    Returns flagged first, then by created_at descending.
    """
    role = ctx["role"]
    role_str = role.value if isinstance(role, UserRole) else str(role)
    if role_str not in [UserRole.SUPERVISOR.value, UserRole.MANAGER.value, UserRole.OWNER.value]:
        raise HTTPException(status_code=403, detail="Access forbidden. Supervisors and owners only.")

    station_id = ctx["station_id"]
    handovers = _load_handovers(station_id)
    results = list(handovers.values())

    # Optional filters
    if shift_id:
        results = [h for h in results if h.get("shift_id") == shift_id]
    if date:
        results = [h for h in results if h.get("date") == date]

    # Separate by review_status (only fully completed handovers)
    pending = [h for h in results
               if h.get("review_status", "submitted") in ["submitted", "flagged"]
               and h.get("phase", "completed") == "completed"]
    approved_today = [
        h for h in results
        if h.get("review_status") == "approved"
        and h.get("supervisor_review", {}).get("reviewed_at", "")[:10] == datetime.now().strftime("%Y-%m-%d")
    ]

    # Sort: flagged first, then by created_at desc
    def sort_key(h):
        is_flagged = 0 if h.get("review_status") == "flagged" else 1
        return (is_flagged, -(datetime.fromisoformat(h.get("created_at", "2000-01-01")).timestamp()))
    pending.sort(key=sort_key)

    flagged_count = sum(1 for h in pending if h.get("review_status") == "flagged")

    # Awaiting closing: Phase 1 done (readings_verified) but Phase 2 not yet
    # submitted. Annotate each with how long it has waited and whether it's stale
    # (> STALE_READINGS_HOURS) so the UI can show actionable rows, not just a count.
    now_ts = datetime.now().timestamp()
    stale_cutoff = now_ts - (STALE_READINGS_HOURS * 3600)
    awaiting_closing = []
    for h in results:
        if h.get("phase") != "readings_verified":
            continue
        waited_since = datetime.fromisoformat(
            h.get("phase_1_completed_at") or h.get("created_at", "2000-01-01")).timestamp()
        row = dict(h)
        row["hours_waiting"] = round((now_ts - waited_since) / 3600, 1)
        row["is_stale"] = waited_since < stale_cutoff
        awaiting_closing.append(row)
    awaiting_closing.sort(key=lambda r: r["hours_waiting"], reverse=True)
    stale_readings = [h for h in awaiting_closing if h["is_stale"]]

    return {
        "pending": len(pending),
        "flagged": flagged_count,
        "approved_today": len(approved_today),
        "awaiting_closing": len(awaiting_closing),
        "stale_readings_count": len(stale_readings),
        "handovers": pending,
        "awaiting_closing_handovers": awaiting_closing,
    }


@router.post("/review")
async def review_handover(data: HandoverReviewInput, ctx: dict = Depends(get_station_context)):
    """
    Approve or return a single handover. Supervisor/owner only.
    """
    role = ctx["role"]
    role_str = role.value if isinstance(role, UserRole) else str(role)
    if role_str not in [UserRole.SUPERVISOR.value, UserRole.MANAGER.value, UserRole.OWNER.value]:
        raise HTTPException(status_code=403, detail="Access forbidden. Supervisors and owners only.")

    if data.action not in ("approve", "return"):
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'return'")
    if data.action == "return" and not data.supervisor_note:
        raise HTTPException(status_code=400, detail="Supervisor note is required when returning a handover")

    station_id = ctx["station_id"]
    handovers = _load_handovers(station_id)

    if data.handover_id not in handovers:
        raise HTTPException(status_code=404, detail="Handover not found")

    handover = handovers[data.handover_id]

    # Block if the attendant hasn't completed shift closing yet (Phase 2 not done)
    if handover.get("phase", "completed") != "completed":
        raise HTTPException(
            status_code=400,
            detail="Cannot review a handover that has not been fully closed by the attendant."
        )

    # Block if the day has been closed off
    close_offs = load_station_json(station_id, "daily_close_offs.json", default={})
    if handover.get("date", "") in close_offs:
        raise HTTPException(status_code=400, detail=f"Cannot modify handover. Day {handover['date']} has been closed off.")

    current_review = handover.get("review_status", "submitted")
    if current_review in ("approved",):
        raise HTTPException(status_code=400, detail="Handover is already approved")

    # Approving a FLAGGED handover (cash shortage / meter deviation) requires a
    # written justification — flagged exceptions must never be rubber-stamped.
    if data.action == "approve" and current_review == "flagged" and not (data.supervisor_note or "").strip():
        raise HTTPException(
            status_code=400,
            detail="A note is required to approve a flagged handover.",
        )

    review_record = {
        "reviewed_by": ctx["user_id"],
        "reviewed_by_name": ctx["full_name"],
        "reviewed_at": datetime.now().isoformat(),
        "action": data.action,
        "note": data.supervisor_note,
    }

    if data.action == "approve":
        handover["review_status"] = "approved"
        handover["supervisor_review"] = review_record
        # Update Stores forecourt stock from this shift's snapshot (once).
        apply_handover_sales(station_id, handover, ctx["username"])
        _save_handovers(handovers, station_id)

        log_audit_event(
            station_id=station_id,
            action="handover_approved",
            performed_by=ctx["username"],
            entity_type="handover",
            entity_id=data.handover_id,
            details={"action": "approve", "note": data.supervisor_note},
        )
        create_notification(
            station_id=station_id,
            type="HANDOVER_APPROVED",
            severity="info",
            title="Handover Approved",
            message=f"Handover {data.handover_id} approved by {ctx['full_name']}",
            entity_type="handover",
            entity_id=data.handover_id,
            created_by=ctx["username"],
        )

        # Auto-advance the shift to 'completed' once all its handovers are approved.
        advance_shift_on_approval(
            handover.get("shift_id", ""), station_id, ctx["storage"], ctx["username"]
        )
    else:
        handover["review_status"] = "returned"
        handover["status"] = "reopened"
        handover["supervisor_review"] = review_record
        _save_handovers(handovers, station_id)

        log_audit_event(
            station_id=station_id,
            action="handover_returned",
            performed_by=ctx["username"],
            entity_type="handover",
            entity_id=data.handover_id,
            details={"action": "return", "note": data.supervisor_note},
        )
        create_notification(
            station_id=station_id,
            type="HANDOVER_RETURNED",
            severity="warning",
            title="Handover Returned",
            message=f"Handover {data.handover_id} returned by {ctx['full_name']}: {data.supervisor_note}",
            entity_type="handover",
            entity_id=data.handover_id,
            created_by=ctx["username"],
        )

    return {"status": "success", "review_status": handover["review_status"], "handover_id": data.handover_id}


@router.post("/batch-approve")
async def batch_approve(data: dict, ctx: dict = Depends(get_station_context)):
    """
    Batch-approve multiple clean (non-flagged) handovers. Supervisor/owner only.
    Expects { "handover_ids": ["HO-...", ...] }
    """
    role = ctx["role"]
    role_str = role.value if isinstance(role, UserRole) else str(role)
    if role_str not in [UserRole.SUPERVISOR.value, UserRole.MANAGER.value, UserRole.OWNER.value]:
        raise HTTPException(status_code=403, detail="Access forbidden. Supervisors and owners only.")

    handover_ids = data.get("handover_ids", [])
    if not handover_ids:
        raise HTTPException(status_code=400, detail="No handover IDs provided")

    station_id = ctx["station_id"]
    handovers = _load_handovers(station_id)
    close_offs = load_station_json(station_id, "daily_close_offs.json", default={})

    approved_count = 0
    skipped_count = 0
    affected_shift_ids = set()
    now_iso = datetime.now().isoformat()

    for hid in handover_ids:
        h = handovers.get(hid)
        if not h:
            skipped_count += 1
            continue
        # Block if the day has been closed off
        if h.get("date", "") in close_offs:
            skipped_count += 1
            continue
        # Skip handovers where the attendant hasn't completed shift closing
        if h.get("phase", "completed") != "completed":
            skipped_count += 1
            continue
        # Only batch-approve clean (submitted) handovers, skip flagged
        if h.get("review_status", "submitted") != "submitted":
            skipped_count += 1
            continue

        h["review_status"] = "approved"
        apply_handover_sales(station_id, h, ctx["username"])
        if h.get("shift_id"):
            affected_shift_ids.add(h["shift_id"])
        h["supervisor_review"] = {
            "reviewed_by": ctx["user_id"],
            "reviewed_by_name": ctx["full_name"],
            "reviewed_at": now_iso,
            "action": "approve",
            "note": "Batch approved",
        }
        approved_count += 1

        log_audit_event(
            station_id=station_id,
            action="handover_approved",
            performed_by=ctx["username"],
            entity_type="handover",
            entity_id=hid,
            details={"action": "batch_approve"},
        )

    _save_handovers(handovers, station_id)

    # Auto-advance any shift whose attendants are now all approved.
    for sid in affected_shift_ids:
        advance_shift_on_approval(sid, station_id, ctx["storage"], ctx["username"])

    return {
        "status": "success",
        "approved": approved_count,
        "skipped": skipped_count,
    }
