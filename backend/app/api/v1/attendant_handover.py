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
    POSReceiptItem,
)
from ...config import resolve_fuel_price, resolve_fuel_price_for_shift, apply_due_price_changes
from ...database.storage import get_nozzle, get_tank_id_for_nozzle, save_station_storage
from ...services.inventory import process_credit_sale, reverse_credit_sale, reapply_credit_sale
from .accounts import generate_client_code, generate_auth_reference
from .auth import get_current_user, require_supervisor_or_owner, require_manager_or_owner, require_owner, get_station_context
from ...services.audit_service import log_audit_event
from ...services.notification_service import create_notification
from ...services.shift_status import assert_shift_editable, advance_shift_on_approval
from ...services.stock_service import apply_handover_sales, reverse_handover_sales
from ...database.station_files import load_station_json, save_station_json
from .enter_readings import _load_readings as _load_enter_readings, _save_readings as _save_enter_readings
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


def _missing_dips_for_tanks(
    station_id: str, shift_date: str, shift_type: str, tank_ids, storage: dict,
    require_opening: bool = True,
) -> list:
    """Return tank_ids (restricted to `tank_ids`) that lack a dip reading for
    this exact shift_date + shift_type.

    Matching by date alone used to let a Day-shift dip silently satisfy a
    Night-shift check on the same date — shift_type must match too.
    """
    if not tank_ids:
        return []
    tank_readings = load_station_json(station_id, 'tank_readings.json', default={})
    have_dip = set()
    for r in tank_readings.values():
        if r.get("date") != shift_date or r.get("shift_type") != shift_type:
            continue
        if r.get("closing_dip_cm") is None:
            continue
        if require_opening and r.get("opening_dip_cm") is None:
            continue
        have_dip.add(r.get("tank_id"))
    return [t for t in tank_ids if t not in have_dip]


def _missing_tank_dips(station_id: str, shift_date: str, shift_type: str, storage: dict) -> list:
    """Return tank_ids that lack a COMPLETE (opening + closing) dip for this
    exact shift_date + shift_type.
    """
    tanks_data = storage.get("tanks", {})
    if not tanks_data:
        return []
    return _missing_dips_for_tanks(station_id, shift_date, shift_type, list(tanks_data), storage)


def _require_dips_complete(station_id: str, shift_date: str, shift_type: str, storage: dict):
    """Raise 409 if any active tank lacks a complete dip reading for this shift.

    409 (not 400) is deliberate: callers use the status code to distinguish
    "blocked by missing dips, go capture them" from ordinary validation
    errors — see handover-review.tsx's Close & Approve flow.
    """
    missing = _missing_tank_dips(station_id, shift_date, shift_type, storage)
    if missing:
        tanks_data = storage.get("tanks", {})
        missing_labels = [
            tanks_data[t].get("fuel_type") or tanks_data[t].get("name") or t
            for t in missing
        ]
        raise HTTPException(
            status_code=409,
            detail=f"Tank dips for {shift_date} ({shift_type}) have not been fully recorded (opening and "
                   f"closing) for all tanks ({', '.join(missing_labels)}). Record dips before closing this shift.",
        )


# Start-of-shift opening verification (additive — does not touch the handover
# pipeline). Keyed by f"{shift_id}-{attendant_id}".
def _load_opening_verifications(station_id: str) -> dict:
    return load_station_json(station_id, 'opening_verifications.json', default={})


def _save_opening_verifications(data: dict, station_id: str):
    save_station_json(station_id, 'opening_verifications.json', data)


def _find_previous_shift_readings(shift: dict, storage: dict, station_id: str) -> dict:
    """
    Look up the previous shift's closing readings from attendant_readings.json.
    Night -> same-date Day; Day -> previous-date Night.

    Keyed by nozzle_id, not by attendant: a meter reading belongs to the nozzle,
    not to whoever was assigned to it, so this scans every closing record for the
    previous shift (any attendant) rather than only the current shift's attendant's
    own record. Otherwise, carry-forward silently fails whenever the attendant
    assigned to a nozzle changes between shifts.

    Returns {nozzle_id: {electronic, mechanical}} or empty.
    """
    from datetime import timedelta
    readings_db = _load_enter_readings(station_id)
    shifts_data = storage.get('shifts', {})
    current_date = shift.get("date", "")
    current_type = shift.get("shift_type", "")

    if current_type == "Day":
        try:
            dt = datetime.strptime(current_date, "%Y-%m-%d")
            prev_date = (dt - timedelta(days=1)).strftime("%Y-%m-%d")
        except Exception:
            return {}
        prev_type = "Night"
    else:
        prev_date = current_date
        prev_type = "Day"

    prev_shift_id = None
    for sid, s in shifts_data.items():
        if s.get("date") == prev_date and s.get("shift_type") == prev_type:
            prev_shift_id = sid
            break

    if not prev_shift_id:
        return {}

    prefix = f"AR-{prev_shift_id}-"
    result = {}
    result_from = {}  # nozzle_id -> submitted_at of the record it came from, for conflict resolution
    for key, record in readings_db.items():
        if not (key.startswith(prefix) and key.endswith("-C")):
            continue
        if record.get("voided"):
            continue
        submitted_at = record.get("submitted_at", "")
        for nr in record.get("nozzle_readings", []):
            if nr.get("excluded_from_checks"):
                continue
            nid = nr["nozzle_id"]
            if nid in result and submitted_at <= result_from.get(nid, ""):
                # Two attendants both have a closing reading for this nozzle on the
                # same previous shift — shouldn't happen under exclusive assignment,
                # but don't silently overwrite with an older record if it does.
                import logging
                logging.getLogger(__name__).warning(
                    f"Conflicting previous-shift closing readings for nozzle {nid} "
                    f"in shift {prev_shift_id} — keeping the later submission."
                )
                continue
            result[nid] = {
                "electronic": nr["electronic_reading"],
                "mechanical": nr["mechanical_reading"],
            }
            result_from[nid] = submitted_at
    return result


def _find_conflicting_closing_reading(nozzle_id: str, new_electronic_reading: float,
                                      this_shift_id: str, station_id: str, storage: dict):
    """
    Cross-shift duplicate/decreasing-reading check: nozzle totalizer readings
    are monotonic (only ever increase), so a closing electronic reading that's
    <= a closing reading already on record for the same nozzle under a
    DIFFERENT shift is a strong signal of a duplicate/mistake shift.

    Closing-vs-closing only, never opening — a shift's opening legitimately
    equals the previous shift's closing by design (carry-forward chain), so
    comparing openings would false-positive on every normal shift.

    Returns {"shift_id", "reading"} for the highest conflicting reading found
    across all other shifts, or None.
    """
    readings_db = _load_enter_readings(station_id)
    worst = None
    for sid in storage.get("shifts", {}):
        if sid == this_shift_id:
            continue
        prefix = f"AR-{sid}-"
        for key, record in readings_db.items():
            if not (key.startswith(prefix) and key.endswith("-C")):
                continue
            if record.get("voided"):
                continue
            for nr in record.get("nozzle_readings", []):
                if nr.get("nozzle_id") != nozzle_id:
                    continue
                if nr.get("excluded_from_checks"):
                    continue
                existing = nr.get("electronic_reading")
                if existing is None:
                    continue
                if new_electronic_reading <= existing and (worst is None or existing > worst["reading"]):
                    worst = {"shift_id": sid, "reading": existing}
    return worst


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


def _build_er_review_item(
    shift_id: str,
    att_id: str,
    readings_db: dict,
    storage: dict,
) -> dict | None:
    """
    Build a unified review-queue item from an attendant_readings.json O/C pair.
    attendant_readings.json is the canonical store for raw nozzle readings; this
    helper surfaces those records in the handover review queue alongside financial
    handovers so supervisors review everything from one page.
    Returns None if the opening record is missing (unpaired closing).
    """
    opening_key = f"AR-{shift_id}-{att_id}-O"
    closing_key = f"AR-{shift_id}-{att_id}-C"
    opening_rec = readings_db.get(opening_key)
    closing_rec = readings_db.get(closing_key)
    if not closing_rec or not opening_rec:
        return None

    opening_map: dict = {}
    for nr in opening_rec.get("nozzle_readings", []):
        opening_map[nr["nozzle_id"]] = nr

    threshold = storage.get("validation_thresholds", {}).get("meter_discrepancy_threshold", 0.5)
    nozzle_summaries = []
    has_deviation = False

    for nr in closing_rec.get("nozzle_readings", []):
        nid = nr["nozzle_id"]
        onr = opening_map.get(nid, {})
        elec_open = onr.get("electronic_reading", 0)
        elec_close = nr["electronic_reading"]
        mech_open = onr.get("mechanical_reading", 0)
        mech_close = nr["mechanical_reading"]
        elec_disp = round(elec_close - elec_open, 3)
        mech_disp = round(mech_close - mech_open, 3)
        avg = (elec_disp + mech_disp) / 2
        dev_pct = round(abs(elec_disp - mech_disp) / avg * 100, 4) if avg > 0 else 0.0
        flagged = dev_pct > threshold
        if flagged:
            has_deviation = True

        nozzle_obj = get_nozzle(nid, storage=storage)
        fuel_type = nozzle_obj.get("fuel_type", "Diesel") if nozzle_obj else "Diesel"

        nozzle_summaries.append({
            "nozzle_id": nid,
            "fuel_type": fuel_type,
            "opening_reading": elec_open,
            "closing_reading": elec_close,
            "volume_sold": elec_disp,
            "price_per_liter": 0.0,
            "revenue": 0.0,
            "mechanical_opening": mech_open,
            "mechanical_closing": mech_close,
            "mechanical_volume": mech_disp,
            "meter_deviation_liters": round(abs(elec_disp - mech_disp), 3),
            "meter_deviation_percent": dev_pct,
            "meter_deviation_flagged": flagged,
        })

    return {
        "handover_id": f"ER-{shift_id}-{att_id}",
        "shift_id": shift_id,
        "attendant_id": att_id,
        "attendant_name": closing_rec.get("user_name", att_id),
        "date": "",           # filled by caller
        "shift_type": "",     # filled by caller
        "nozzle_summaries": nozzle_summaries,
        "fuel_revenue": 0.0,
        "lpg_sales": 0.0,
        "lubricant_sales": 0.0,
        "accessory_sales": 0.0,
        "total_expected": 0.0,
        "credit_sales": 0.0,
        "expected_cash": 0.0,
        "actual_cash": 0.0,
        "pos_receipts": 0.0,
        "total_accounted": 0.0,
        "difference": 0.0,
        "status": "submitted",
        "phase": "completed",
        "review_status": closing_rec.get("review_status", "submitted"),
        "auto_flag_reasons": ["meter_deviation"] if has_deviation else None,
        "supervisor_review": closing_rec.get("supervisor_review"),
        "notes": closing_rec.get("notes"),
        "created_at": closing_rec.get("submitted_at", ""),
        "source": "readings",
    }


def _get_fuel_type(nozzle_id: str, storage: dict = None) -> str:
    """Determine fuel type by looking up nozzle data from storage"""
    nozzle = get_nozzle(nozzle_id, storage=storage)
    if nozzle:
        return nozzle.get("fuel_type", "") or "Diesel"
    return "Diesel"


# ===== Shift submission status =====

def _get_shift_submission_status(station_id: str, shift_id: str, storage: dict,
                                  submitted_phases=("completed",)) -> dict:
    """
    For a shift, return which attendants have submitted (phase in submitted_phases)
    and which are still pending. Only attendants in shift.assignments are tracked.
    """
    shift = storage.get("shifts", {}).get(shift_id, {})
    assignments = shift.get("assignments") or []

    handovers = _load_handovers(station_id)
    submitted_ids = {
        ho.get("attendant_id")
        for ho in handovers.values()
        if ho.get("shift_id") == shift_id and ho.get("phase") in submitted_phases
    }

    submitted, pending = [], []
    for a in assignments:
        att_id = a.get("attendant_id", "")
        att_name = a.get("attendant_name", att_id)
        bucket = submitted if att_id in submitted_ids else pending
        bucket.append({"attendant_id": att_id, "attendant_name": att_name})

    return {
        "shift_id": shift_id,
        "date": shift.get("date", ""),
        "shift_type": shift.get("shift_type", ""),
        "total": len(assignments),
        "submitted": submitted,
        "pending": pending,
        "all_submitted": len(pending) == 0,
    }


def _require_all_attendants_readings_submitted(station_id: str, shift_id: str, storage: dict,
                                                also_submitted: str = None):
    """
    Raise 400 unless every attendant assigned to the shift has at least submitted
    their readings (phase readings_verified or later). Blocks closing any single
    attendant's handover until the whole shift's readings are in, so reconciliation
    never runs against a partial day. `also_submitted` credits the attendant
    currently submitting in this same call (their own handover record does not
    exist yet when this is enforced from the legacy one-shot submit endpoint).
    """
    status = _get_shift_submission_status(
        station_id, shift_id, storage, submitted_phases=("readings_verified", "completed"))
    pending = [a for a in status["pending"] if a["attendant_id"] != also_submitted]
    if pending:
        pending_names = ", ".join(a["attendant_name"] for a in pending)
        raise HTTPException(
            status_code=400,
            detail=f"Cannot close this shift yet — {pending_names} still need to submit "
                   "readings. All attendants on this shift must submit readings before "
                   "any of them can be closed.",
        )


def _notify_shift_pending(station_id: str, shift_id: str, submitter_name: str, storage: dict):
    """Fire a notification after a submission listing who is still pending on the shift."""
    status = _get_shift_submission_status(station_id, shift_id, storage)
    pending_names = [a["attendant_name"] for a in status["pending"]]
    date_label = f"{status.get('date', '')} {status.get('shift_type', '')}".strip()

    if pending_names:
        names_str = ", ".join(pending_names)
        create_notification(
            station_id=station_id,
            type="SHIFT_PENDING_SUBMISSIONS",
            severity="high",
            title="Shift not fully closed",
            message=(
                f"{submitter_name} submitted for shift {date_label}. "
                f"Still waiting on: {names_str}."
            ),
            entity_type="shift",
            entity_id=shift_id,
            created_by="system",
        )
    else:
        create_notification(
            station_id=station_id,
            type="SHIFT_ALL_SUBMITTED",
            severity="info",
            title="All attendants submitted",
            message=f"All attendants on shift {date_label} have submitted their closing readings.",
            entity_type="shift",
            entity_id=shift_id,
            created_by="system",
        )


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
    """Process nozzle readings and compute summaries. Returns (nozzle_summaries, fuel_revenue)."""
    submitted_ids = set()
    for reading in nozzle_readings:
        if reading.nozzle_id not in allowed_nozzle_ids:
            raise HTTPException(status_code=400, detail=f"Nozzle {reading.nozzle_id} is not in your assignment")
        submitted_ids.add(reading.nozzle_id)

    # The reverse direction matters just as much: a nozzle silently absent
    # from the submission (rather than present with a bad value) would never
    # be flagged by anything downstream — its sales for the shift just never
    # get recorded. Require the submission to cover every assigned nozzle.
    missing_ids = allowed_nozzle_ids - submitted_ids
    if missing_ids:
        raise HTTPException(
            status_code=400,
            detail=f"Missing readings for assigned nozzle(s): {', '.join(sorted(missing_ids))}. "
                   "All assigned nozzles must be submitted together.",
        )

    # Apply any due price changes lazily
    apply_due_price_changes(storage, station_id)

    nozzle_summaries = []
    fuel_revenue = 0.0

    for reading in nozzle_readings:
        fuel_type = _get_fuel_type(reading.nozzle_id, storage=storage)

        opening_val = reading.opening_reading
        closing_val = reading.closing_reading

        volume = closing_val - opening_val
        if volume < 0:
            raise HTTPException(status_code=400, detail=f"Closing reading for {reading.nozzle_id} is less than opening reading")

        # Cross-shift duplicate/decreasing-reading gate — blocked by default,
        # but the attendant can push through immediately by explaining why
        # (e.g. a genuine meter replacement). The override still gets flagged
        # for owner review, same as any other auto-flag.
        duplicate_flagged = False
        duplicate_conflict_shift_id = None
        duplicate_note = None
        conflict = _find_conflicting_closing_reading(reading.nozzle_id, closing_val, shift_id, station_id, storage)
        if conflict:
            if not (reading.duplicate_reading_note and reading.duplicate_reading_note.strip()):
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "duplicate_reading",
                        "nozzle_id": reading.nozzle_id,
                        "reading": closing_val,
                        "conflict_shift_id": conflict["shift_id"],
                        "conflict_reading": conflict["reading"],
                        "message": (
                            f"Closing reading for {reading.nozzle_id} ({closing_val}) was already "
                            f"recorded for this nozzle on shift {conflict['shift_id']} "
                            f"(reading {conflict['reading']}). If this is correct (e.g. the meter was "
                            "replaced), provide a note explaining why and resubmit."
                        ),
                    },
                )
            duplicate_flagged = True
            duplicate_conflict_shift_id = conflict["shift_id"]
            duplicate_note = reading.duplicate_reading_note.strip()

        # Plausibility gate — a single shift's volume sold shouldn't blow
        # past a sane per-nozzle ceiling; this is usually a digit/decimal
        # entry error, not a real sales event. Same hybrid pattern as the
        # duplicate-reading gate: blocked unless explained, still flagged
        # for owner review when overridden.
        implausible_flagged = False
        implausible_note = None
        max_plausible_volume = storage.get('fuel_settings', {}).get('max_plausible_shift_volume_liters', 10000.0)
        if volume > max_plausible_volume:
            if not (reading.implausible_volume_note and reading.implausible_volume_note.strip()):
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "implausible_volume",
                        "nozzle_id": reading.nozzle_id,
                        "volume": round(volume, 3),
                        "threshold": max_plausible_volume,
                        "message": (
                            f"Volume sold for {reading.nozzle_id} this shift ({round(volume, 3)}L) exceeds "
                            f"the plausible single-shift limit ({max_plausible_volume}L) — likely a reading "
                            "entry error. If this is correct, provide a note explaining why and resubmit."
                        ),
                    },
                )
            implausible_flagged = True
            implausible_note = reading.implausible_volume_note.strip()

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

            # Resolve changeover reading: attendant-submitted field > blind snapshot > time estimate
            price_change_ref = None
            if price_info.get("effective_date") and price_info.get("effective_time"):
                price_change_ref = f"{price_info['effective_date']}T{price_info['effective_time']}"

            snapshot_reading = None
            if price_change_ref and shift_id:
                shift_obj = storage.get("shifts", {}).get(shift_id, {})
                snapshot_reading = (
                    shift_obj.get("price_change_readings", {})
                    .get(reading.nozzle_id, {})
                    .get(price_change_ref)
                )
                if snapshot_reading:
                    snapshot_reading = snapshot_reading.get("reading_value")

            if reading.changeover_reading is not None:
                co = reading.changeover_reading
                if co < opening_val or co > closing_val:
                    raise HTTPException(status_code=400,
                        detail=f"Changeover reading for {reading.nozzle_id} must be between opening ({opening_val}) and closing ({closing_val})")
                changeover_reading_val = co
                changeover_estimated = False
            elif snapshot_reading is not None and opening_val <= snapshot_reading <= closing_val:
                # Blind entry captured at the price-change moment — use actual reading
                changeover_reading_val = snapshot_reading
                changeover_estimated = False
            else:
                # Estimate split by actual proportion of shift elapsed before the price change
                shift_start = price_info.get("shift_start")
                shift_end   = price_info.get("shift_end")
                change_dt   = price_info.get("change_dt")
                if shift_start and shift_end and change_dt:
                    total_secs = (shift_end - shift_start).total_seconds()
                    pre_secs   = (change_dt - shift_start).total_seconds()
                    proportion = pre_secs / total_secs if total_secs > 0 else 0.5
                else:
                    proportion = 0.5
                co = opening_val + volume * proportion
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
            duplicate_reading_flagged=duplicate_flagged,
            duplicate_reading_conflict_shift_id=duplicate_conflict_shift_id,
            duplicate_reading_note=duplicate_note,
            implausible_volume_flagged=implausible_flagged,
            implausible_volume_note=implausible_note,
        ))

    return nozzle_summaries, round(fuel_revenue, 2)


def _process_stock_snapshot(stock_snapshot, station_id, storage, my_assignment=None, role=None):
    """Process stock counts and compute sales. Returns (lpg_sales, lub_sales, acc_sales, enriched_snapshot, stock_variance_flags).

    Mirrors _process_nozzle_readings' two assignment checks: an attendant not assigned to a
    product line must not be able to submit (and thereby overwrite) data for it, and an
    attendant who IS assigned must submit it — a silently-empty submission from the right
    attendant must not be able to sail through un-flagged, the same way "missing readings
    for assigned nozzle(s)" blocks a partial nozzle submission. Unlike nozzles, assignment
    here is a whole-category flag rather than per-item IDs, so both checks are category-level
    rather than per-row.

    Only enforced for attendants (role == "user") — supervisors/managers/owners closing
    their own personal shift have always been able to fill these sections regardless of
    their own assignment flags (see the `!isAttendant` visibility bypass in my-shift.tsx),
    since assignment flags are a per-attendant roster concept, not something set on a
    supervisor's own shift record.
    """
    lpg_rows = stock_snapshot.lpg_cylinders if stock_snapshot else []
    acc_rows = stock_snapshot.accessories if stock_snapshot else []
    lub_rows = stock_snapshot.lubricants if stock_snapshot else []

    if role == "user":
        assignment = my_assignment or {}
        if lpg_rows and not assignment.get("assigned_lpg", False):
            raise HTTPException(status_code=400, detail="You are not assigned to LPG for this shift")
        if acc_rows and not assignment.get("assigned_accessories", False):
            raise HTTPException(status_code=400, detail="You are not assigned to Accessories for this shift")
        if lub_rows and not assignment.get("assigned_lubricants", False):
            raise HTTPException(status_code=400, detail="You are not assigned to Lubricants for this shift")

        # Reverse direction: assigned but nothing submitted for it. A quiet shift still
        # submits a full row set with closing == opening (the "Confirm No Sales" flow in
        # my-shift.tsx), so a genuinely empty list here means the category was skipped
        # entirely, not that nothing sold.
        if assignment.get("assigned_lpg", False) and not lpg_rows:
            raise HTTPException(status_code=400, detail="Missing LPG closing stock — you are assigned to LPG for this shift.")
        if assignment.get("assigned_accessories", False) and not acc_rows:
            raise HTTPException(status_code=400, detail="Missing Accessories closing stock — you are assigned to Accessories for this shift.")
        if assignment.get("assigned_lubricants", False) and not lub_rows:
            raise HTTPException(status_code=400, detail="Missing Lubricants closing stock — you are assigned to Lubricants for this shift.")

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


def _generate_slip_number(client_code: str, shift_date: str, storage: dict) -> str:
    """Legacy sequential reference: {client_code}{DDMMYYYY}-{NNN}. Used as fallback when no coupon details."""
    try:
        y, m, d = shift_date.split('-')
        date_part = f"{d}{m}{y}"
    except Exception:
        date_part = datetime.now().strftime("%d%m%Y")
    seq_key = f"_credit_slip_seq_{shift_date}"
    seq = storage.get(seq_key, 0) + 1
    storage[seq_key] = seq
    return f"{client_code}{date_part}-{seq:03d}"


def _build_credit_ref(client_code: str, item: dict, shift_date: str, storage: dict) -> tuple[str, str]:
    """Return (auth_reference, slip_number) for a credit sale item.
    Uses new format when vehicle_reg and coupon_serial are present; falls back to sequential slip."""
    vehicle_reg = item.get("vehicle_reg") or ""
    coupon_serial = item.get("coupon_serial") or ""
    if vehicle_reg and coupon_serial:
        ref = generate_auth_reference(client_code, vehicle_reg, shift_date, coupon_serial)
        return ref, ""
    slip = _generate_slip_number(client_code, shift_date, storage)
    return "", slip


def _ensure_client_code(account_id: str, storage: dict) -> str:
    """Return existing client_code or generate+persist one for legacy accounts."""
    accounts_data = storage.get('accounts', {})
    account = accounts_data.get(account_id, {})
    code = account.get('client_code', '')
    if not code:
        existing_codes = {a.get('client_code', '') for a in accounts_data.values()}
        code = generate_client_code(account.get('account_name', account_id), existing_codes)
        account['client_code'] = code
        accounts_data[account_id] = account
    return code


def _process_credit_sales(credit_sale_items, storage, shift_id):
    """
    Process credit sale line items.
    Dedup key: (account_id, fuel_type) per shift — same account cannot buy the
    same fuel type twice in one shift.
    Returns (credit_total, credit_sale_details, new_items_to_create, duplicates).
    """
    accounts_data = storage.get('accounts', {})
    credit_sales_data = storage.get('credit_sales', [])

    enriched_items = []
    for item in credit_sale_items:
        account = accounts_data.get(item.account_id)
        if account and account.get("is_suspended"):
            raise HTTPException(
                status_code=400,
                detail=f"Account '{item.account_name}' is suspended and cannot receive credit sales.",
            )
        # An explicit client-supplied price wins — it's how a manager charges a
        # negotiated credit rate that differs from the cash price, and it's also
        # the only price source for a non-fuel product (lubricant/accessory),
        # since resolve_fuel_price only knows Diesel/Petrol. Falls back to the
        # account's standing override, then the live fuel price, in that order.
        if item.price_per_liter and item.price_per_liter > 0:
            price = item.price_per_liter
        elif account and account.get("default_price_per_liter"):
            price = account["default_price_per_liter"]
        else:
            try:
                price = resolve_fuel_price(item.fuel_type, storage)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"No price available for '{item.fuel_type}'. Enter a price for this item.",
                )
        if price <= 0:
            raise HTTPException(status_code=400, detail=f"Price for '{item.fuel_type}' must be greater than zero.")
        amount = round(item.volume * price, 2)
        enriched_items.append({
            "account_id": item.account_id, "account_name": item.account_name,
            "fuel_type": item.fuel_type, "volume": item.volume,
            "price_per_liter": price, "amount": amount, "source": "handover",
            "driver_name": item.driver_name, "vehicle_reg": item.vehicle_reg,
            "coupon_serial": item.coupon_serial,
        })

    pre_existing = [s for s in credit_sales_data if s.get("shift_id") == shift_id and not s.get("voided")]
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
            "driver_name": s.get("driver_name"),
            "vehicle_reg": s.get("vehicle_reg"),
            "coupon_serial": s.get("coupon_serial"),
            "auth_reference": s.get("auth_reference"),
            "slip_number": s.get("slip_number"),
        })

    # Dedup key: coupon_serial when present (each coupon is a distinct trip), else (account_id, fuel_type)
    def _pre_existing_key(s):
        cs = s.get("coupon_serial")
        return ("coupon", s.get("account_id"), cs) if cs else ("ft", s.get("account_id"), s.get("fuel_type"))

    pre_existing_keys = {_pre_existing_key(s) for s in pre_existing}
    new_items_to_create = []
    duplicates = []
    seen_in_submission = set()
    for item in enriched_items:
        cs = item.get("coupon_serial")
        key = ("coupon", item["account_id"], cs) if cs else ("ft", item["account_id"], item["fuel_type"])
        if key in pre_existing_keys or key in seen_in_submission:
            item["source"] = "skipped_duplicate"
            label = f"coupon {cs}" if cs else item["fuel_type"]
            duplicates.append({
                "account_name": item["account_name"],
                "fuel_type": item["fuel_type"],
                "volume": item["volume"],
                "reason": f"{item['account_name']} / {label} already recorded for this shift",
            })
        else:
            new_items_to_create.append(item)
            seen_in_submission.add(key)

    new_total = sum(i["amount"] for i in new_items_to_create)
    pre_existing_total = sum(s.get("amount", 0) for s in pre_existing)
    credit_total = round(new_total + pre_existing_total, 2)

    credit_sale_details = enriched_items + pre_existing_details
    return credit_total, credit_sale_details, new_items_to_create, duplicates


def _cash_shortage_threshold(storage: dict) -> float:
    """Per-station cash-shortage flag threshold (ZMW). Defaults to 500."""
    return storage.get('fuel_settings', {}).get('cash_shortage_threshold', 500)


def _recalculate_reconciliation(handover: dict, storage: dict) -> None:
    """
    Recompute expected_cash, total_accounted, and difference from the current
    values of actual_cash, pos_receipts, credit_sales, and total_expected.
    Re-evaluates the cash_shortage flag only; all other auto_flag_reasons
    (meter_deviation, nozzle_loss, pos_terminal_variance, etc.) are preserved.
    Mutates the handover dict in place.
    """
    total_expected = handover.get("total_expected") or 0.0
    actual_cash    = handover.get("actual_cash") or 0.0
    pos_receipts   = handover.get("pos_receipts") or 0.0
    credit_sales   = handover.get("credit_sales") or 0.0

    expected_cash   = round(total_expected - credit_sales, 2)
    total_accounted = round(actual_cash + pos_receipts + credit_sales, 2)
    difference      = round(total_accounted - total_expected, 2)

    handover["expected_cash"]   = expected_cash
    handover["total_accounted"] = total_accounted
    handover["difference"]      = difference

    # Re-evaluate cash_shortage flag only; preserve everything else
    existing_flags = [f for f in (handover.get("auto_flag_reasons") or []) if f != "cash_shortage"]
    if abs(difference) > _cash_shortage_threshold(storage):
        existing_flags.append("cash_shortage")
    handover["auto_flag_reasons"] = existing_flags or None
    handover["review_status"] = "flagged" if existing_flags else (
        handover.get("review_status") if handover.get("review_status") == "approved" else "submitted"
    )


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
    if any(ns.duplicate_reading_flagged for ns in nozzle_summaries):
        auto_flag_reasons.append("duplicate_meter_reading")
    if any(ns.implausible_volume_flagged for ns in nozzle_summaries):
        auto_flag_reasons.append("implausible_volume")
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
    if any(ns.duplicate_reading_flagged for ns in nozzle_summaries):
        flags.append("duplicate_meter_reading")
    if any(ns.implausible_volume_flagged for ns in nozzle_summaries):
        flags.append("implausible_volume")
    if stock_variance_flags:
        flags.append("stock_variance_unexplained")
    return flags


def _nozzle_summary_field(ns, field):
    """Read a field off a nozzle summary that may be a Pydantic object or a plain dict."""
    return ns.get(field) if isinstance(ns, dict) else getattr(ns, field, None)


def _compute_tank_nozzle_variance(station_id: str, shift_id: str, storage: dict,
                                   current_attendant_id: str = None, current_nozzle_summaries=None):
    """
    Shift-wide check: sum electronic nozzle volume sold per tank across every
    attendant assigned to the shift, and compare it to that tank's dip-derived
    movement (opening - closing + deliveries) for the same date/shift.

    Only runs once every assigned attendant has at least submitted readings —
    summing a partial shift would misrepresent it, not just under-report it.
    `current_attendant_id`/`current_nozzle_summaries` let a caller include its
    own in-flight submission before it's been persisted.

    Returns (flags, details):
      flags   - auto_flag_reasons to merge in (e.g. "tank_nozzle_variance",
                "tank_calibration_stale", "tank_no_calibration")
      details - {"status": ..., "tanks": {tank_id: {...}}} for manager review
    """
    shift = storage.get("shifts", {}).get(shift_id, {})
    shift_date = shift.get("date", "")
    shift_type = shift.get("shift_type", "")
    if not shift_date or not shift_type:
        return [], {"status": "unknown_shift"}

    status = _get_shift_submission_status(
        station_id, shift_id, storage, submitted_phases=("readings_verified", "completed"))
    if not status["all_submitted"]:
        return [], {"status": "incomplete"}

    # Gather every attendant's nozzle summaries, keyed by attendant so the
    # caller's own (possibly not-yet-saved) submission always wins over
    # whatever is already on disk for that same attendant. Also track each
    # attendant's phase/actual_cash — needed below to know when a tank's
    # cash figure is actually ready to persist (every contributing
    # attendant financially closed, not just readings-submitted).
    handovers = _load_handovers(station_id)
    by_attendant: dict = {}
    attendant_financials: dict = {}
    for ho in handovers.values():
        if ho.get("shift_id") == shift_id and ho.get("phase") in ("readings_verified", "completed"):
            aid = ho.get("attendant_id")
            by_attendant[aid] = ho.get("nozzle_summaries") or []
            attendant_financials[aid] = {"phase": ho.get("phase"), "actual_cash": ho.get("actual_cash")}
    if current_attendant_id is not None:
        by_attendant[current_attendant_id] = current_nozzle_summaries or []
        attendant_financials.setdefault(current_attendant_id, {"phase": None, "actual_cash": None})

    nozzle_volume_by_tank: dict = {}
    mechanical_volume_by_tank: dict = {}
    attendants_by_tank: dict = {}
    tank_price: dict = {}
    for attendant_id, nozzle_summaries in by_attendant.items():
        for ns in nozzle_summaries:
            nid = _nozzle_summary_field(ns, "nozzle_id")
            vol = _nozzle_summary_field(ns, "volume_sold")
            mech_vol = _nozzle_summary_field(ns, "mechanical_volume")
            price = _nozzle_summary_field(ns, "price_per_liter")
            tank_id = get_tank_id_for_nozzle(nid, storage=storage)
            if not tank_id:
                continue
            nozzle_volume_by_tank[tank_id] = nozzle_volume_by_tank.get(tank_id, 0.0) + (vol or 0.0)
            mechanical_volume_by_tank[tank_id] = mechanical_volume_by_tank.get(tank_id, 0.0) + (mech_vol or 0.0)
            attendants_by_tank.setdefault(tank_id, set()).add(attendant_id)
            if price and tank_id not in tank_price:
                tank_price[tank_id] = price

    if not nozzle_volume_by_tank:
        return [], {"status": "no_nozzle_data"}

    from types import SimpleNamespace
    from ...services.tank_movement import calculate_tank_volume_movement_v2, calculate_variance, determine_variance_status
    from ...services.dip_conversion import calibration_status_for_dip

    tank_readings_db = load_station_json(station_id, 'tank_readings.json', default={})
    tank_deliveries_db = load_station_json(station_id, 'tank_deliveries.json', default={})

    flags = set()
    per_tank = {}
    tank_readings_changed = False
    for tank_id, nozzle_total in nozzle_volume_by_tank.items():
        dip_rec = next(
            (r for r in tank_readings_db.values()
             if r.get("tank_id") == tank_id and r.get("date") == shift_date
             and r.get("shift_type", "").lower() == shift_type.lower()),
            None
        )
        if not dip_rec or dip_rec.get("opening_volume") is None or dip_rec.get("closing_volume") is None:
            per_tank[tank_id] = {"status": "no_dip", "nozzle_total": round(nozzle_total, 2)}
            continue

        cal_status = calibration_status_for_dip(
            tank_id, dip_rec.get("opening_calibration_version"), dip_rec.get("closing_calibration_version"))
        if cal_status == "stale":
            flags.add("tank_calibration_stale")
        elif cal_status == "no_calibration":
            flags.add("tank_no_calibration")

        delivered = 0.0
        delivery_id = dip_rec.get("delivery_id")
        if delivery_id and delivery_id in tank_deliveries_db:
            delivered = tank_deliveries_db[delivery_id].get("actual_volume_delivered") or 0.0

        tank_movement = calculate_tank_volume_movement_v2(
            dip_rec["opening_volume"], dip_rec["closing_volume"],
            deliveries=[SimpleNamespace(volume_delivered=delivered)] if delivered else [])

        variance = calculate_variance(tank_movement, nozzle_total)
        status_label = determine_variance_status(abs(variance["variance_percent"]))
        per_tank[tank_id] = {
            "status": status_label,
            "tank_movement": round(tank_movement, 2),
            "nozzle_total": round(nozzle_total, 2),
            "variance": round(variance["variance"], 2),
            "variance_percent": round(variance["variance_percent"], 2),
            "calibration_status": cal_status,
        }
        # Only trust the variance as a real signal when the chart backing it
        # is current — a stale/missing chart makes the number itself suspect,
        # so that gets its own flag above instead of a possibly-bogus variance.
        if status_label != "PASS" and cal_status not in ("stale", "no_calibration"):
            flags.add("tank_nozzle_variance")

        # Persist onto the dip record so Three-Way Reconciliation (which
        # reads tank_readings.json directly) has real numbers instead of
        # the zeros it gets from the lightweight daily dip-capture flow.
        dip_rec["tank_volume_movement"] = round(tank_movement, 3)
        dip_rec["total_electronic_dispensed"] = round(nozzle_total, 3)
        dip_rec["total_mechanical_dispensed"] = round(mechanical_volume_by_tank.get(tank_id, 0.0), 3)
        if tank_id in tank_price:
            dip_rec["price_per_liter"] = tank_price[tank_id]
        tank_readings_changed = True

        # Cash is only ready once every attendant feeding this tank has
        # actually financially closed (not just submitted readings) —
        # otherwise a partial cash figure would misrepresent the shift.
        contributing = attendants_by_tank.get(tank_id, set())
        if contributing and all(
            attendant_financials.get(aid, {}).get("phase") == "completed"
            and attendant_financials.get(aid, {}).get("actual_cash") is not None
            for aid in contributing
        ):
            dip_rec["actual_cash_banked"] = round(
                sum(attendant_financials[aid]["actual_cash"] for aid in contributing), 2
            )

    if tank_readings_changed:
        save_station_json(station_id, 'tank_readings.json', tank_readings_db)

    return list(flags), {"status": "computed", "tanks": per_tank}


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


def admin_override_close(
    station_id: str, handover_ids: list, reason: str,
    performed_by: str, performed_by_name: str, storage: dict,
) -> tuple:
    """
    Owner-only administrative closure for a backlog of stuck handovers — no
    real cash count, no dip verification. Carries the *expected* figures
    forward (difference=0) rather than fabricating a verified reconciliation,
    and stamps every record with an admin_override marker so it stays
    permanently distinguishable from a real close wherever it's viewed later.

    Replicates the end state of submit_closing + review_handover(approve) in
    one step per handover; skips (does not raise on) anything not eligible so
    one stale id in a bulk selection doesn't abort the rest of the batch.
    Returns (closed: list[handover_id], skipped: list[{handover_id, reason}]).
    """
    handovers = _load_handovers(station_id)
    shifts_data = storage.get("shifts", {})
    closed, skipped = [], []
    now_iso = datetime.now().isoformat()

    for handover_id in handover_ids:
        handover = handovers.get(handover_id)
        if not handover:
            skipped.append({"handover_id": handover_id, "reason": "Handover not found"})
            continue
        if handover.get("phase") != "readings_verified":
            skipped.append({"handover_id": handover_id, "reason": f"Not awaiting closing (phase={handover.get('phase')})"})
            continue

        shift_id = handover.get("shift_id", "")
        total_expected = handover.get("total_expected", 0)
        credit_sales = handover.get("credit_sales", 0) or 0
        expected_cash = round(total_expected - credit_sales, 2)

        handover["phase"] = "completed"
        handover["phase_2_completed_at"] = now_iso
        handover["actual_cash"] = expected_cash
        handover["expected_cash"] = expected_cash
        handover["total_accounted"] = total_expected
        handover["difference"] = 0
        handover["review_status"] = "approved"
        handover["admin_override"] = {
            "reason": reason,
            "overridden_by": performed_by,
            "overridden_by_name": performed_by_name,
            "overridden_at": now_iso,
        }
        handover["supervisor_review"] = {
            "reviewed_by": performed_by,
            "reviewed_by_name": performed_by_name,
            "reviewed_at": now_iso,
            "action": "approve",
            "note": f"[Administrative override] {reason}",
        }
        _save_handovers(handovers, station_id)

        try:
            apply_handover_sales(station_id, handover, performed_by)
        except Exception:
            pass  # Stock sync is best-effort — must not block the close itself.

        nozzle_summaries = [HandoverNozzleReadingSummary(**ns) for ns in handover.get("nozzle_summaries", [])]
        shift = shifts_data.get(shift_id, {})
        _create_reconciliation(
            nozzle_summaries, handover.get("lpg_sales", 0), handover.get("lubricant_sales", 0),
            handover.get("accessory_sales", 0), credit_sales, expected_cash, expected_cash,
            0, shift, handover.get("attendant_id", ""), handover.get("attendant_name", ""),
            station_id, storage, f"[Administrative override] {reason}")

        advance_shift_on_approval(shift_id, station_id, storage, performed_by)

        log_audit_event(
            station_id=station_id, action="handover_admin_override_close",
            performed_by=performed_by, entity_type="handover", entity_id=handover_id,
            details={"shift_id": shift_id, "reason": reason, "total_expected": total_expected},
        )
        closed.append(handover_id)

    return closed, skipped


def _update_nozzle_state(nozzle_readings, storage, shift_date=None, shift_type=None, attendant_name=None):
    """Update nozzle electronic/mechanical readings in islands data."""
    for reading in nozzle_readings:
        nozzle = get_nozzle(reading.nozzle_id, storage=storage)
        if nozzle:
            nozzle["electronic_reading"] = reading.closing_reading
            nozzle["mechanical_reading"] = reading.mechanical_closing
            if shift_date:
                nozzle["last_reading_shift_date"] = shift_date
            if shift_type:
                nozzle["last_reading_shift_type"] = shift_type
            if attendant_name:
                nozzle["last_reading_attendant"] = attendant_name


def _create_credit_sale_records(new_items_to_create, handover_id, handover_output, shift, storage, station_id):
    """Create CreditSale records for new items, generating auth_reference or legacy slip number."""
    accounts_data = storage.get('accounts', {})
    credit_sales_data = storage.setdefault('credit_sales', [])
    handovers = _load_handovers(station_id)
    shift_date = shift.get("date", "")
    for idx, item in enumerate(new_items_to_create):
        sale_id = f"CS-HO-{handover_id}-{idx}"
        client_code = _ensure_client_code(item["account_id"], storage)
        auth_reference, slip_number = _build_credit_ref(client_code, item, shift_date, storage)
        item["auth_reference"] = auth_reference
        item["slip_number"] = slip_number
        sale_data = {
            "sale_id": sale_id, "account_id": item["account_id"],
            "shift_id": shift.get("shift_id", ""), "date": shift_date,
            "fuel_type": item["fuel_type"], "volume": item["volume"],
            "amount": item["amount"], "invoice_number": f"Handover {handover_id}",
            "driver_name": item.get("driver_name"),
            "vehicle_reg": item.get("vehicle_reg"),
            "coupon_serial": item.get("coupon_serial"),
            "auth_reference": auth_reference,
            "slip_number": slip_number,
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


@router.get("/shift-submission-status/{shift_id}")
async def get_shift_submission_status(shift_id: str, bar: str = "completed",
                                       ctx: dict = Depends(get_station_context)):
    """
    Return submitted/pending attendants for a shift. Available to all assigned users.
    `bar=completed` (default) reports who has fully closed out (both phases).
    `bar=readings` reports who has at least submitted readings (readings_verified
    or later) — the same bar enforced by the shift-closing gate.
    """
    submitted_phases = ("readings_verified", "completed") if bar == "readings" else ("completed",)
    return _get_shift_submission_status(ctx["station_id"], shift_id, ctx["storage"],
                                         submitted_phases=submitted_phases)


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
                    "is_retrospective": shift.get("is_retrospective", False),
                })
                break

    return {"shifts": my_shifts, "count": len(my_shifts)}


@router.get("/pending-price-prompts")
async def get_pending_price_prompts(ctx: dict = Depends(get_station_context)):
    """
    Return any pending price-change snapshot prompts for the current user's active shift.
    The frontend uses this to show a blind meter-reading entry card.
    """
    storage = ctx["storage"]
    user_id = ctx["user_id"]
    shifts  = storage.get("shifts", {})

    for shift in shifts.values():
        assigned = shift.get("assigned_attendants") or []
        if user_id not in assigned:
            continue
        if shift.get("status") not in ("active", "started"):
            continue
        pending = [
            p for p in shift.get("price_change_prompts", [])
            if p.get("status") == "pending"
        ]
        if pending:
            # Include only nozzle_id and price_change_ref — nothing that reveals previous readings
            return {
                "shift_id": shift.get("shift_id"),
                "prompts": [
                    {"nozzle_id": p["nozzle_id"], "price_change_ref": p["price_change_ref"]}
                    for p in pending
                ],
            }
    return {"shift_id": None, "prompts": []}


@router.post("/price-change-reading")
async def submit_price_change_reading(data: dict, ctx: dict = Depends(get_station_context)):
    """
    Blind meter reading submitted by an attendant at a price-change boundary.
    Accepts: shift_id, nozzle_id, price_change_ref, reading_value.
    Returns only {status: recorded} — no volume, no revenue, no previous reading.
    """
    from ...database.storage import save_station_storage
    storage    = ctx["storage"]
    station_id = ctx["station_id"]
    user_id    = ctx["user_id"]
    username   = ctx["username"]

    shift_id         = data.get("shift_id")
    nozzle_id        = data.get("nozzle_id")
    price_change_ref = data.get("price_change_ref")
    reading_value    = data.get("reading_value")

    if not all([shift_id, nozzle_id, price_change_ref, reading_value is not None]):
        raise HTTPException(status_code=422, detail="shift_id, nozzle_id, price_change_ref, and reading_value are required")

    try:
        reading_value = float(reading_value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="reading_value must be a number")
    if reading_value < 0:
        raise HTTPException(status_code=422, detail="reading_value must be non-negative")

    shifts = storage.get("shifts", {})
    shift  = shifts.get(shift_id)
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    assigned = shift.get("assigned_attendants") or []
    if user_id not in assigned:
        raise HTTPException(status_code=403, detail="Not assigned to this shift")

    prompts = shift.get("price_change_prompts", [])
    matched = None
    for p in prompts:
        if p.get("nozzle_id") == nozzle_id and p.get("price_change_ref") == price_change_ref:
            matched = p
            break
    if not matched:
        raise HTTPException(status_code=404, detail="No matching price-change prompt found")
    if matched.get("status") != "pending":
        raise HTTPException(status_code=409, detail="Reading already submitted for this prompt")

    from datetime import datetime
    now_iso = datetime.now().isoformat()
    matched["status"]       = "completed"
    matched["reading_value"] = reading_value
    matched["submitted_at"]  = now_iso
    matched["submitted_by"]  = username

    # Also store in shift's price_change_readings for use by the revenue calculation
    readings = shift.setdefault("price_change_readings", {})
    readings.setdefault(nozzle_id, {})[price_change_ref] = {
        "reading_value": reading_value,
        "submitted_at":  now_iso,
        "submitted_by":  username,
    }

    save_station_storage(station_id)
    return {"status": "recorded"}


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

    shift_id = my_shift.get("shift_id", "")
    shift_date = my_shift.get("date", "")
    shift_type_val = my_shift.get("shift_type", "")

    # 3-tier opening priority per nozzle:
    # 1. Already-submitted opening record for this shift (attendant_readings.json)
    # 2. Previous shift's closing from attendant_readings.json
    # 3. Nozzle's current electronic_reading in station storage
    ar_db = _load_enter_readings(ctx["station_id"])
    opening_key_ar = f"AR-{shift_id}-{user_id}-O"
    opening_record_ar = ar_db.get(opening_key_ar, {})
    opening_map_ar = {}
    for nr in opening_record_ar.get("nozzle_readings", []):
        opening_map_ar[nr["nozzle_id"]] = {
            "electronic": nr["electronic_reading"],
            "mechanical": nr["mechanical_reading"],
        }
    prev_readings = _find_previous_shift_readings(my_shift, storage, ctx["station_id"])

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
            if nozzle_id in opening_map_ar:
                elec_open = opening_map_ar[nozzle_id]["electronic"]
                mech_open = opening_map_ar[nozzle_id]["mechanical"]
            elif nozzle_id in prev_readings:
                elec_open = prev_readings[nozzle_id]["electronic"]
                mech_open = prev_readings[nozzle_id]["mechanical"]
            else:
                elec_open = nozzle.get("electronic_reading", 0) or 0
                mech_open = nozzle.get("mechanical_reading", 0) or 0
            nozzle_details.append({
                "nozzle_id": nozzle_id,
                "fuel_type": fuel_type,
                "opening_reading": elec_open,
                "mechanical_opening_reading": mech_open,
                "price_per_liter": price,
                "status": nozzle.get("status", "Active"),
                "display_label": nozzle.get("display_label"),
                "fuel_type_abbrev": fuel_type_abbrev,
                "has_price_change": price_info["has_price_change"],
                "old_price": price_info.get("old_price"),
                "new_price": price_info.get("new_price"),
            })

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
            "is_retrospective": my_shift.get("is_retrospective", False),
        },
        "assignment": {
            "attendant_id": my_assignment.get("attendant_id"),
            "attendant_name": my_assignment.get("attendant_name"),
            "island_ids": assigned_island_ids,
            "nozzle_ids": assigned_nozzle_ids,
            "assigned_lpg": my_assignment.get("assigned_lpg", False),
            "assigned_lubricants": my_assignment.get("assigned_lubricants", False),
            "assigned_accessories": my_assignment.get("assigned_accessories", False),
        },
        "nozzles": nozzle_details,
        "meter_discrepancy_threshold": storage.get('validation_thresholds', {}).get('meter_discrepancy_threshold', 0.5),
        "nozzle_allowable_loss_liters": storage.get('fuel_settings', {}).get('nozzle_allowable_loss_liters', 0.8),
        "readings_verified_handover": readings_verified_handover,
        "opening_verified": opening_verified,
        "opening_verification": opening_verification,
        "price_change_detected": price_change_detected,
    }


class VerifyOpeningInput(BaseModel):
    shift_id: str
    discrepancy_note: Optional[str] = None
    # Retrospective shifts only: attendant manually enters opening readings
    # when there is no previous shift to auto-derive them from, or to correct
    # an auto-derived value. Each item: {nozzle_id, electronic_reading, mechanical_reading}
    manual_nozzle_readings: Optional[List[dict]] = None


@router.post("/verify-opening")
async def verify_opening(data: VerifyOpeningInput, ctx: dict = Depends(get_station_context)):
    """
    Record an attendant's start-of-shift verification of the carried-forward
    opening readings and stock. For retrospective shifts, also accepts
    manual_nozzle_readings which are persisted as the opening record so the
    closing submission uses them as the opening baseline.
    """
    storage = ctx["storage"]
    station_id = ctx["station_id"]
    user_id = ctx["user_id"]
    _validate_shift_and_assignment(data.shift_id, ctx, storage)

    # For retrospective shifts: write the manually confirmed opening readings so
    # the 3-tier priority chain uses them as the authoritative opening baseline.
    if data.manual_nozzle_readings:
        ar_db = load_station_json(station_id, 'attendant_readings.json', default={})
        opening_key = f"AR-{data.shift_id}-{user_id}-O"
        ar_db[opening_key] = {
            "shift_id": data.shift_id,
            "user_id": user_id,
            "phase": "opening",
            "submitted_at": datetime.now().isoformat(),
            "nozzle_readings": [
                {
                    "nozzle_id": nr["nozzle_id"],
                    "electronic_reading": float(nr.get("electronic_reading", 0)),
                    "mechanical_reading": float(nr.get("mechanical_reading", 0)),
                }
                for nr in data.manual_nozzle_readings
                if nr.get("nozzle_id")
            ],
        }
        save_station_json(station_id, 'attendant_readings.json', ar_db)

    verifications = _load_opening_verifications(station_id)
    key = f"{data.shift_id}-{user_id}"
    record = {
        "shift_id": data.shift_id,
        "attendant_id": user_id,
        "attendant_name": ctx["full_name"],
        "verified_at": datetime.now().isoformat(),
        "discrepancy_note": (data.discrepancy_note or "").strip() or None,
        "retrospective": bool(data.manual_nozzle_readings),
    }
    verifications[key] = record
    _save_opening_verifications(verifications, station_id)

    log_audit_event(
        station_id=station_id,
        action="opening_verified",
        performed_by=ctx["username"],
        entity_type="shift",
        entity_id=data.shift_id,
        details={
            "discrepancy_note": record["discrepancy_note"],
            "retrospective": record["retrospective"],
        },
    )
    return {"status": "success", "opening_verification": record}


class ManagerRetroNozzleInput(BaseModel):
    nozzle_id: str
    # Optional so an omitted reading is distinguishable from a genuine 0 —
    # a defaulted 0.0 here previously meant a forgotten opening reading could
    # silently make the full closing meter value look like that shift's sales.
    electronic_reading: Optional[float] = None
    mechanical_reading: float = 0.0
    duplicate_reading_note: Optional[str] = None  # required override when the closing reading collides with another shift
    implausible_volume_note: Optional[str] = None  # required override when volume_sold exceeds the plausibility threshold


class ManagerRetroEntryInput(BaseModel):
    shift_id: str
    attendant_id: str
    opening_readings: List[ManagerRetroNozzleInput]
    closing_readings: List[ManagerRetroNozzleInput]
    actual_cash: float = 0.0
    pos_receipts: float = 0.0
    pos_items: List = []   # List[POSReceiptItem] — typed at runtime via models import
    pos_terminal_batch_total: Optional[float] = None
    credit_sales: float = 0.0
    notes: Optional[str] = None


@router.post("/manager-retro-entry", dependencies=[Depends(require_manager_or_owner)])
async def manager_retro_entry(data: ManagerRetroEntryInput, ctx: dict = Depends(get_station_context)):
    """
    Manager/owner-only: submit opening + closing readings and financials for a
    retrospective shift on behalf of an attendant in a single operation.
    Only available when the shift has is_retrospective=True.
    """
    storage = ctx["storage"]
    station_id = ctx["station_id"]
    manager_id = ctx["user_id"]
    manager_name = ctx["full_name"]

    shifts_data = storage.get("shifts", {})
    shift = shifts_data.get(data.shift_id)
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    if shift.get("status") != "active":
        raise HTTPException(status_code=400, detail="Shift is not active")
    if not shift.get("is_retrospective", False):
        raise HTTPException(status_code=400, detail="Manager entry is only available for retrospective shifts")

    # Retrospective entry closes the shift the same as a normal close — it must
    # not become a way to finish a shift without ever recording its tank dips.
    _require_dips_complete(station_id, shift.get("date", ""), shift.get("shift_type", ""), storage)

    # Find attendant assignment
    attendant_assignment = None
    attendant_name = None
    for assignment in shift.get("assignments", []):
        if assignment.get("attendant_id") == data.attendant_id:
            attendant_assignment = assignment
            attendant_name = assignment.get("attendant_name", data.attendant_id)
            break
    if not attendant_assignment:
        raise HTTPException(status_code=404, detail="Attendant not assigned to this shift")

    # Block duplicate entry
    handovers = _load_handovers(station_id)
    for ho in handovers.values():
        if ho.get("shift_id") == data.shift_id and ho.get("attendant_id") == data.attendant_id:
            if ho.get("phase") in ("readings_verified", "completed"):
                raise HTTPException(
                    status_code=409,
                    detail=f"Readings already submitted for {attendant_name}. Use handover review to correct.",
                )

    allowed_nozzle_ids = set(attendant_assignment.get("nozzle_ids", []))
    opening_map = {nr.nozzle_id: nr for nr in data.opening_readings}
    closing_map = {nr.nozzle_id: nr for nr in data.closing_readings}

    # Every nozzle assigned to this attendant needs BOTH an opening and a
    # closing electronic reading. Silently defaulting a missing opening to
    # 0.0 (the old behavior) would make the full closing meter value look
    # like that shift's sales; silently dropping a nozzle missing from
    # closing_readings would lose its sales entirely. Neither is acceptable,
    # so require the full pair up front and name exactly what's missing.
    incomplete = []
    for nid in sorted(allowed_nozzle_ids):
        closing_nr = closing_map.get(nid)
        opening_nr = opening_map.get(nid)
        if closing_nr is None or closing_nr.electronic_reading is None:
            incomplete.append(f"{nid} (missing closing reading)")
        elif opening_nr is None or opening_nr.electronic_reading is None:
            incomplete.append(f"{nid} (missing opening reading)")
    if incomplete:
        raise HTTPException(
            status_code=400,
            detail=f"Both opening and closing readings are required for every assigned nozzle: "
                   f"{', '.join(incomplete)}",
        )

    # Build HandoverNozzleReadingInput objects for _process_nozzle_readings
    nozzle_inputs: List[HandoverNozzleReadingInput] = []
    for nid in allowed_nozzle_ids:
        opening_nr = opening_map[nid]
        closing_nr = closing_map[nid]
        nozzle_inputs.append(HandoverNozzleReadingInput(
            nozzle_id=nid,
            opening_reading=opening_nr.electronic_reading,
            closing_reading=closing_nr.electronic_reading,
            mechanical_opening=opening_nr.mechanical_reading,
            mechanical_closing=closing_nr.mechanical_reading,
            duplicate_reading_note=closing_nr.duplicate_reading_note,
            implausible_volume_note=closing_nr.implausible_volume_note,
        ))

    if not nozzle_inputs:
        raise HTTPException(status_code=400, detail="No valid nozzle readings provided for this attendant's assignment")

    now_iso = datetime.now().isoformat()

    # Write opening record to attendant_readings.json
    ar_db = load_station_json(station_id, "attendant_readings.json", default={})
    opening_key = f"AR-{data.shift_id}-{data.attendant_id}-O"
    ar_db[opening_key] = {
        "shift_id": data.shift_id,
        "user_id": data.attendant_id,
        "user_name": attendant_name,
        "phase": "opening",
        "submitted_at": now_iso,
        "submitted_by_manager": manager_id,
        "nozzle_readings": [
            {"nozzle_id": nr.nozzle_id, "electronic_reading": nr.electronic_reading, "mechanical_reading": nr.mechanical_reading}
            for nr in data.opening_readings
        ],
    }
    save_station_json(station_id, "attendant_readings.json", ar_db)

    # Write opening verification so normal review queue sees this as started
    verifications = _load_opening_verifications(station_id)
    verifications[f"{data.shift_id}-{data.attendant_id}"] = {
        "shift_id": data.shift_id,
        "attendant_id": data.attendant_id,
        "attendant_name": attendant_name,
        "verified_at": now_iso,
        "manager_entered": True,
        "manager_id": manager_id,
        "manager_name": manager_name,
        "retrospective": True,
    }
    _save_opening_verifications(verifications, station_id)

    nozzle_summaries, fuel_revenue = _process_nozzle_readings(
        nozzle_inputs, storage, station_id, data.shift_id, data.attendant_id, allowed_nozzle_ids,
        shift_date=shift.get("date"), shift_type=shift.get("shift_type"),
    )

    # POS: if breakdown items provided, derive sum from them
    retro_pos_breakdown = None
    if data.pos_items:
        retro_pos_breakdown = [item if isinstance(item, dict) else item.model_dump() for item in data.pos_items]
        retro_pos_total = round(sum((item.get("amount", 0) if isinstance(item, dict) else item.amount) for item in data.pos_items), 2)
    else:
        retro_pos_total = data.pos_receipts

    retro_pos_terminal_batch_total = data.pos_terminal_batch_total
    retro_pos_terminal_variance = None
    if retro_pos_terminal_batch_total is not None:
        retro_pos_terminal_variance = round(retro_pos_total - retro_pos_terminal_batch_total, 2)

    total_expected = round(fuel_revenue, 2)
    expected_cash = round(total_expected - data.credit_sales, 2)
    total_accounted = round(data.actual_cash + retro_pos_total + data.credit_sales, 2)
    difference = round(total_accounted - total_expected, 2)

    auto_flag_reasons, review_status = _compute_auto_flags(difference, nozzle_summaries, [], storage)

    pos_settings = load_station_json(station_id, "pos_settings.json", default={})
    pos_variance_threshold = pos_settings.get("variance_threshold", 5.0)
    if retro_pos_terminal_variance is not None and abs(retro_pos_terminal_variance) > pos_variance_threshold:
        auto_flag_reasons = (auto_flag_reasons or []) + ["pos_terminal_variance"]
        review_status = "flagged"

    # Shift-wide tank dip vs. nozzle-sales reconciliation. This handover
    # doesn't exist on disk yet, so this attendant's own submission has to
    # be passed in explicitly alongside whatever siblings are already saved.
    tank_flags, tank_details = _compute_tank_nozzle_variance(
        station_id, data.shift_id, storage, current_attendant_id=data.attendant_id, current_nozzle_summaries=nozzle_summaries)
    if tank_flags:
        auto_flag_reasons = (auto_flag_reasons or []) + tank_flags
        review_status = "flagged"

    handover_id = f"HO-{data.shift_id}-{data.attendant_id}-MRE-{datetime.now().strftime('%H%M%S')}"

    handover_out = HandoverOutput(
        handover_id=handover_id,
        shift_id=data.shift_id,
        attendant_id=data.attendant_id,
        attendant_name=attendant_name,
        date=shift.get("date", ""),
        shift_type=shift.get("shift_type", ""),
        nozzle_summaries=nozzle_summaries,
        fuel_revenue=fuel_revenue,
        lpg_sales=0.0,
        lubricant_sales=0.0,
        accessory_sales=0.0,
        total_expected=total_expected,
        credit_sales=data.credit_sales,
        expected_cash=expected_cash,
        actual_cash=data.actual_cash,
        pos_receipts=retro_pos_total,
        pos_breakdown=retro_pos_breakdown,
        pos_terminal_batch_total=retro_pos_terminal_batch_total,
        pos_terminal_variance=retro_pos_terminal_variance,
        total_accounted=total_accounted,
        difference=difference,
        status="submitted",
        phase="completed",
        phase_1_completed_at=now_iso,
        phase_2_completed_at=now_iso,
        review_status=review_status,
        auto_flag_reasons=auto_flag_reasons or None,
        notes=data.notes,
        created_at=now_iso,
    )

    handovers[handover_id] = handover_out.dict()
    handovers[handover_id]["tank_nozzle_reconciliation"] = tank_details
    _save_handovers(handovers, station_id)

    # Mirror to attendant_readings.json (O and C keys used by the chain logic)
    ar_db = load_station_json(station_id, "attendant_readings.json", default={})
    closing_key = f"AR-{data.shift_id}-{data.attendant_id}-C"
    ar_db[opening_key] = {
        "shift_id": data.shift_id, "user_id": data.attendant_id, "user_name": attendant_name,
        "reading_type": "Opening",
        "nozzle_readings": [{"nozzle_id": ns.nozzle_id, "electronic_reading": ns.opening_reading, "mechanical_reading": ns.mechanical_opening or 0} for ns in nozzle_summaries],
        "submitted_at": now_iso, "review_status": "submitted", "source": "manager_retro_entry",
    }
    ar_db[closing_key] = {
        "shift_id": data.shift_id, "user_id": data.attendant_id, "user_name": attendant_name,
        "reading_type": "Closing",
        "nozzle_readings": [{"nozzle_id": ns.nozzle_id, "electronic_reading": ns.closing_reading, "mechanical_reading": ns.mechanical_closing or 0} for ns in nozzle_summaries],
        "submitted_at": now_iso, "review_status": "submitted", "source": "manager_retro_entry",
    }
    save_station_json(station_id, "attendant_readings.json", ar_db)

    _update_nozzle_state(
        nozzle_inputs, storage,
        shift_date=shift.get("date"), shift_type=shift.get("shift_type"),
        attendant_name=attendant_name,
    )
    save_station_storage(station_id)

    _create_reconciliation(
        nozzle_summaries, 0.0, 0.0, 0.0, data.credit_sales, expected_cash,
        data.actual_cash, difference, shift, data.attendant_id, attendant_name,
        station_id, storage, data.notes,
    )

    log_audit_event(
        station_id=station_id, action="manager_retro_entry",
        performed_by=ctx["username"], entity_type="handover", entity_id=handover_id,
        details={
            "shift_id": data.shift_id, "attendant_id": data.attendant_id,
            "attendant_name": attendant_name, "fuel_revenue": fuel_revenue,
            "actual_cash": data.actual_cash, "difference": difference,
            "manager_override": True,
        },
    )

    return {
        "status": "success",
        "handover_id": handover_id,
        "attendant_name": attendant_name,
        "fuel_revenue": fuel_revenue,
        "total_expected": total_expected,
        "difference": difference,
        "review_status": review_status,
    }


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

    # The manager is on-site at shift close — block the handover until they've
    # dipped every tank this attendant's nozzles draw from, so the tank-vs-nozzle
    # variance check below has real data instead of silently no-oping later.
    tank_ids = {get_tank_id_for_nozzle(nid, storage=storage) for nid in allowed_nozzle_ids}
    tank_ids.discard(None)
    missing_dip_tanks = _missing_dips_for_tanks(
        station_id, shift.get("date", ""), shift.get("shift_type", ""), tank_ids, storage,
        require_opening=False)
    if missing_dip_tanks:
        tanks_data = storage.get("tanks", {})
        missing_labels = [
            tanks_data.get(t, {}).get("fuel_type") or tanks_data.get(t, {}).get("name") or t
            for t in missing_dip_tanks
        ]
        raise HTTPException(
            status_code=400,
            detail=f"Manager must record the closing tank dip for {', '.join(missing_labels)} "
                   f"before this handover can be submitted.",
        )

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

    nozzle_summaries, fuel_revenue = _process_nozzle_readings(
        data.nozzle_readings, storage, station_id, data.shift_id, user_id, allowed_nozzle_ids,
        shift_date=shift.get("date"), shift_type=shift.get("shift_type"))

    lpg_sales, lubricant_sales, accessory_sales, enriched_snapshot, stock_variance_flags = \
        _process_stock_snapshot(data.stock_snapshot, station_id, storage, my_assignment, ctx["role"])

    total_expected = round(fuel_revenue + lpg_sales + lubricant_sales + accessory_sales, 2)

    # Phase 1 flags only (no cash data)
    phase1_flags = _compute_phase1_flags(nozzle_summaries, stock_variance_flags, storage)
    if any(ns.changeover_estimated for ns in nozzle_summaries):
        phase1_flags.append("changeover_estimated")

    # The dip gate above guarantees every tank this attendant's nozzles draw
    # from already has a closing dip, so the tank-vs-nozzle reconciliation can
    # run right now instead of silently no-oping until cash close.
    variance_flags, _ = _compute_tank_nozzle_variance(
        station_id, data.shift_id, storage,
        current_attendant_id=user_id, current_nozzle_summaries=nozzle_summaries)
    for f in variance_flags:
        if f not in phase1_flags:
            phase1_flags.append(f)

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

    # Mirror nozzle readings into attendant_readings.json so nozzle-readings-for-tank
    # can find them regardless of which path the attendant used.
    try:
        ar_db = load_station_json(station_id, 'attendant_readings.json', default={})
        opening_key = f"AR-{data.shift_id}-{user_id}-O"
        closing_key = f"AR-{data.shift_id}-{user_id}-C"
        ar_db[opening_key] = {
            "shift_id": data.shift_id,
            "user_id": user_id,
            "user_name": user_name,
            "reading_type": "Opening",
            "nozzle_readings": [
                {
                    "nozzle_id": ns.nozzle_id,
                    "electronic_reading": ns.opening_reading,
                    "mechanical_reading": ns.mechanical_opening or 0,
                }
                for ns in nozzle_summaries
            ],
            "submitted_at": now_iso,
            "review_status": "submitted",
            "source": "handover",
        }
        ar_db[closing_key] = {
            "shift_id": data.shift_id,
            "user_id": user_id,
            "user_name": user_name,
            "reading_type": "Closing",
            "nozzle_readings": [
                {
                    "nozzle_id": ns.nozzle_id,
                    "electronic_reading": ns.closing_reading,
                    "mechanical_reading": ns.mechanical_closing or 0,
                }
                for ns in nozzle_summaries
            ],
            "submitted_at": now_iso,
            "review_status": "submitted",
            "source": "handover",
        }
        save_station_json(station_id, 'attendant_readings.json', ar_db)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(
            "Handover write-through to attendant_readings.json failed: %s", exc
        )

    # Update nozzle state and persist so carry-forward survives server restarts
    _update_nozzle_state(data.nozzle_readings, storage,
                         shift_date=shift.get("date"), shift_type=shift.get("shift_type"),
                         attendant_name=user_name)
    save_station_storage(station_id)

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

    # Block closing if tank dips are missing for this shift's date
    _require_dips_complete(station_id, handover.get("date", ""), handover.get("shift_type", ""), storage)

    # Block closing this attendant's handover until every attendant on the
    # shift has at least submitted their readings.
    _require_all_attendants_readings_submitted(station_id, handover.get("shift_id", ""), storage)

    # Process credit sales
    credit_sale_details = None
    new_items_to_create = []
    credit_sales = data.credit_sales
    shift_id = handover.get("shift_id", "")

    # Block closing edits to a finalized (reconciled / inactive) shift.
    assert_shift_editable(storage.get("shifts", {}).get(shift_id))

    if data.credit_sale_items:
        credit_sales, credit_sale_details, new_items_to_create, _ = \
            _process_credit_sales(data.credit_sale_items, storage, shift_id)

    # POS: if breakdown items provided, derive sum from them
    pos_breakdown = None
    if data.pos_items:
        pos_breakdown = [item.model_dump() for item in data.pos_items]
        pos_total = round(sum(item.amount for item in data.pos_items), 2)
    else:
        pos_total = data.pos_receipts

    # Terminal batch reconciliation
    pos_terminal_batch_total = data.pos_terminal_batch_total
    pos_terminal_variance = None
    if pos_terminal_batch_total is not None:
        pos_terminal_variance = round(pos_total - pos_terminal_batch_total, 2)

    # Compute financials
    total_expected = handover.get("total_expected", 0)
    total_accounted = round(data.actual_cash + pos_total + credit_sales, 2)
    difference = round(total_accounted - total_expected, 2)
    expected_cash = round(total_expected - credit_sales, 2)

    # Merge Phase 1 flags with Phase 2 cash + POS variance flags
    pos_settings = load_station_json(station_id, "pos_settings.json", default={})
    pos_variance_threshold = pos_settings.get("variance_threshold", 5.0)
    phase1_flags = handover.get("auto_flag_reasons") or []
    all_flags = list(phase1_flags)
    if abs(difference) > _cash_shortage_threshold(storage):
        all_flags.append("cash_shortage")
    if pos_terminal_variance is not None and abs(pos_terminal_variance) > pos_variance_threshold:
        all_flags.append("pos_terminal_variance")

    # Shift-wide tank dip vs. nozzle-sales reconciliation. Every attendant on
    # the shift is already guaranteed to have submitted by this point (see
    # the gate above), so this attendant's own on-disk data is sufficient —
    # no need to pass it in separately.
    tank_flags, tank_details = _compute_tank_nozzle_variance(station_id, shift_id, storage)
    all_flags.extend(tank_flags)

    review_status = "flagged" if all_flags else "submitted"

    now_iso = datetime.now().isoformat()

    # Update handover record
    handover["phase"] = "completed"
    handover["phase_2_completed_at"] = now_iso
    handover["actual_cash"] = data.actual_cash
    handover["pos_receipts"] = pos_total
    handover["pos_breakdown"] = pos_breakdown
    handover["pos_terminal_batch_total"] = pos_terminal_batch_total
    handover["pos_terminal_variance"] = pos_terminal_variance
    handover["credit_sales"] = credit_sales
    handover["credit_sale_details"] = credit_sale_details
    handover["expected_cash"] = expected_cash
    handover["total_accounted"] = total_accounted
    handover["difference"] = difference
    handover["auto_flag_reasons"] = all_flags or None
    handover["review_status"] = review_status
    handover["tank_nozzle_reconciliation"] = tank_details
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
                 "pos_receipts": pos_total, "difference": difference},
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

    _notify_shift_pending(station_id, shift_id, attendant_name, storage)

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

    nozzle_summaries, fuel_revenue = _process_nozzle_readings(
        data.nozzle_readings, storage, station_id, data.shift_id, user_id, allowed_nozzle_ids,
        shift_date=shift.get("date"), shift_type=shift.get("shift_type"))

    lpg_sales = data.lpg_sales
    lubricant_sales = data.lubricant_sales
    accessory_sales = data.accessory_sales
    enriched_snapshot = None
    stock_variance_flags = []

    if data.stock_snapshot:
        lpg_sales, lubricant_sales, accessory_sales, enriched_snapshot, stock_variance_flags = \
            _process_stock_snapshot(data.stock_snapshot, station_id, storage, my_assignment, ctx["role"])

    total_expected = round(fuel_revenue + lpg_sales + lubricant_sales + accessory_sales, 2)

    # Block closing if tank dips are missing for this shift's date
    _require_dips_complete(station_id, shift.get("date", ""), shift.get("shift_type", ""), storage)

    # Block closing this attendant's handover until every attendant on the
    # shift has at least submitted their readings (this call itself counts
    # as the current attendant's submission).
    _require_all_attendants_readings_submitted(station_id, data.shift_id, storage, also_submitted=user_id)

    # Credit sales
    credit_sale_details = None
    new_items_to_create = []
    if data.credit_sale_items:
        data.credit_sales, credit_sale_details, new_items_to_create, _ = \
            _process_credit_sales(data.credit_sale_items, storage, data.shift_id)

    expected_cash = round(total_expected - data.credit_sales, 2)
    difference = round(data.actual_cash - expected_cash, 2)

    auto_flag_reasons, review_status = _compute_auto_flags(difference, nozzle_summaries, stock_variance_flags, storage)

    # Shift-wide tank dip vs. nozzle-sales reconciliation. This handover
    # doesn't exist on disk yet, so this attendant's own submission has to
    # be passed in explicitly alongside whatever siblings are already saved.
    tank_flags, tank_details = _compute_tank_nozzle_variance(
        station_id, data.shift_id, storage, current_attendant_id=user_id, current_nozzle_summaries=nozzle_summaries)
    if tank_flags:
        auto_flag_reasons = auto_flag_reasons + tank_flags
        review_status = "flagged"

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
    handovers[handover_id]["tank_nozzle_reconciliation"] = tank_details
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

    try:
        ar_db = load_station_json(station_id, 'attendant_readings.json', default={})
        opening_key = f"AR-{data.shift_id}-{user_id}-O"
        closing_key = f"AR-{data.shift_id}-{user_id}-C"
        ar_db[opening_key] = {
            "shift_id": data.shift_id,
            "user_id": user_id,
            "user_name": user_name,
            "reading_type": "Opening",
            "nozzle_readings": [
                {
                    "nozzle_id": ns.nozzle_id,
                    "electronic_reading": ns.opening_reading,
                    "mechanical_reading": ns.mechanical_opening or 0,
                }
                for ns in nozzle_summaries
            ],
            "submitted_at": now_iso,
            "review_status": "submitted",
            "source": "handover",
        }
        ar_db[closing_key] = {
            "shift_id": data.shift_id,
            "user_id": user_id,
            "user_name": user_name,
            "reading_type": "Closing",
            "nozzle_readings": [
                {
                    "nozzle_id": ns.nozzle_id,
                    "electronic_reading": ns.closing_reading,
                    "mechanical_reading": ns.mechanical_closing or 0,
                }
                for ns in nozzle_summaries
            ],
            "submitted_at": now_iso,
            "review_status": "submitted",
            "source": "handover",
        }
        save_station_json(station_id, 'attendant_readings.json', ar_db)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(
            "Legacy handover write-through to attendant_readings.json failed: %s", exc
        )

    _update_nozzle_state(data.nozzle_readings, storage,
                         shift_date=shift.get("date"), shift_type=shift.get("shift_type"),
                         attendant_name=user_name)
    save_station_storage(station_id)

    _feed_daily_entries(enriched_snapshot, station_id, user_id, user_name, shift, handover_id)

    _notify_shift_pending(station_id, data.shift_id, user_name, storage)

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


class POSReceiptsInput(BaseModel):
    pos_items: List[POSReceiptItem]


@router.patch("/{handover_id}/pos-receipts", dependencies=[Depends(require_manager_or_owner)])
async def patch_pos_receipts(
    handover_id: str,
    data: POSReceiptsInput,
    ctx: dict = Depends(get_station_context),
):
    """
    Append POS receipts to an existing handover (manager/owner only).
    Each incoming item is checked against the current breakdown:
      - If a reference is provided, any existing item with the same reference is a duplicate.
      - If no reference, same type_id + amount (rounded to 2dp) is a duplicate.
    Duplicates are rejected with detail listing the conflicts; non-duplicates are appended.
    """
    station_id = ctx["station_id"]
    handovers = _load_handovers(station_id)

    if handover_id not in handovers:
        raise HTTPException(status_code=404, detail="Handover not found")

    handover = handovers[handover_id]

    if handover.get("review_status") == "approved":
        raise HTTPException(status_code=400, detail="Cannot modify an approved handover")

    close_offs = load_station_json(station_id, "daily_close_offs.json", default={})
    if handover.get("date", "") in close_offs:
        raise HTTPException(status_code=400, detail=f"Cannot modify handover. Day {handover['date']} has been closed off.")

    existing: list = handover.get("pos_breakdown") or []

    # Build lookup sets from existing entries
    existing_refs = {
        e["reference"].strip().lower()
        for e in existing
        if e.get("reference") and e["reference"].strip()
    }
    existing_type_amounts = {
        (e["type_id"], round(e["amount"], 2))
        for e in existing
        if not (e.get("reference") and e["reference"].strip())
    }

    accepted = []
    duplicates = []
    for item in data.pos_items:
        ref = (item.reference or "").strip()
        if ref:
            if ref.lower() in existing_refs:
                duplicates.append({"type_name": item.type_name, "amount": item.amount, "reference": ref,
                                   "reason": f"Reference '{ref}' already recorded"})
            else:
                accepted.append(item)
                existing_refs.add(ref.lower())  # guard within the same submission too
        else:
            key = (item.type_id, round(item.amount, 2))
            if key in existing_type_amounts:
                duplicates.append({"type_name": item.type_name, "amount": item.amount, "reference": None,
                                   "reason": f"{item.type_name} K{item.amount:.2f} already recorded"})
            else:
                accepted.append(item)
                existing_type_amounts.add(key)

    if duplicates and not accepted:
        raise HTTPException(
            status_code=409,
            detail={"message": "All submitted items are duplicates.", "duplicates": duplicates},
        )

    new_items = [item.model_dump() for item in accepted]
    merged = existing + new_items
    pos_total = round(sum(e["amount"] for e in merged), 2)

    handover["pos_breakdown"] = merged
    handover["pos_receipts"] = pos_total
    storage = ctx["storage"]
    _recalculate_reconciliation(handover, storage)
    _save_handovers(handovers, station_id)

    log_audit_event(
        station_id=station_id, action="pos_receipts_updated",
        performed_by=ctx["username"], entity_type="handover", entity_id=handover_id,
        details={
            "pos_total": pos_total, "added": len(new_items), "duplicates_rejected": len(duplicates),
            "difference": handover["difference"], "expected_cash": handover["expected_cash"],
        },
    )

    return {
        "handover_id": handover_id,
        "pos_breakdown": merged,
        "pos_receipts": pos_total,
        "added": len(new_items),
        "duplicates": duplicates,
        "expected_cash": handover["expected_cash"],
        "total_accounted": handover["total_accounted"],
        "difference": handover["difference"],
    }


class CreditSalesInput(BaseModel):
    credit_items: List[HandoverCreditSaleItem]


@router.patch("/{handover_id}/credit-sales", dependencies=[Depends(require_manager_or_owner)])
async def patch_credit_sales(
    handover_id: str,
    data: CreditSalesInput,
    ctx: dict = Depends(get_station_context),
):
    """
    Append credit sales to an existing handover (manager/owner only).
    Uses the same processing as Phase 2 — deduplication, price resolution,
    account balance updates, and CreditSale record creation.
    """
    station_id = ctx["station_id"]
    storage = ctx["storage"]
    handovers = _load_handovers(station_id)

    if handover_id not in handovers:
        raise HTTPException(status_code=404, detail="Handover not found")

    handover = handovers[handover_id]

    if handover.get("review_status") == "approved":
        raise HTTPException(status_code=400, detail="Cannot modify an approved handover")

    close_offs = load_station_json(station_id, "daily_close_offs.json", default={})
    if handover.get("date", "") in close_offs:
        raise HTTPException(status_code=400, detail=f"Cannot modify handover. Day {handover['date']} has been closed off.")

    shift_id = handover.get("shift_id", "")
    shift = storage.get("shifts", {}).get(shift_id, {})

    credit_total, credit_sale_details, new_items_to_create, duplicates = \
        _process_credit_sales(data.credit_items, storage, shift_id)

    if duplicates and not new_items_to_create:
        raise HTTPException(
            status_code=409,
            detail={"message": "All submitted items are duplicates.", "duplicates": duplicates},
        )

    # Create account records, generate auth references, update balances
    accounts_data = storage.get('accounts', {})
    credit_sales_data = storage.setdefault('credit_sales', [])
    shift_date = shift.get("date", "")
    for idx, item in enumerate(new_items_to_create):
        sale_id = f"CS-HO-{handover_id}-P{idx}"
        client_code = _ensure_client_code(item["account_id"], storage)
        auth_reference, slip_number = _build_credit_ref(client_code, item, shift_date, storage)
        item["auth_reference"] = auth_reference
        item["slip_number"] = slip_number
        sale_data = {
            "sale_id": sale_id, "account_id": item["account_id"],
            "shift_id": shift_id, "date": shift_date,
            "fuel_type": item["fuel_type"], "volume": item["volume"],
            "amount": item["amount"], "invoice_number": f"Handover {handover_id}",
            "driver_name": item.get("driver_name"),
            "vehicle_reg": item.get("vehicle_reg"),
            "coupon_serial": item.get("coupon_serial"),
            "auth_reference": auth_reference,
            "slip_number": slip_number,
        }
        try:
            process_credit_sale(
                accounts=accounts_data, sales_log=credit_sales_data,
                account_id=item["account_id"], amount=item["amount"], sale_data=sale_data,
            )
        except HTTPException:
            item["over_limit"] = True

    handover["credit_sale_details"] = credit_sale_details
    handover["credit_sales"] = credit_total
    _recalculate_reconciliation(handover, storage)
    _save_handovers(handovers, station_id)
    save_station_storage(station_id)

    log_audit_event(
        station_id=station_id, action="credit_sales_updated",
        performed_by=ctx["username"], entity_type="handover", entity_id=handover_id,
        details={
            "credit_total": credit_total, "added": len(new_items_to_create), "duplicates_rejected": len(duplicates),
            "difference": handover["difference"], "expected_cash": handover["expected_cash"],
        },
    )

    return {
        "handover_id": handover_id,
        "credit_sales": credit_total,
        "credit_sale_details": credit_sale_details,
        "added": len(new_items_to_create),
        "duplicates": duplicates,
        "expected_cash": handover["expected_cash"],
        "total_accounted": handover["total_accounted"],
        "difference": handover["difference"],
    }


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
    # Inject enter-readings closing records that have no corresponding financial handover.
    # attendant_readings.json is the canonical store for raw nozzle readings; these items
    # appear here so supervisors review everything from one page.
    er_readings_db = _load_enter_readings(station_id)
    shifts_data = ctx["storage"].get("shifts", {})

    # Index (shift_id, attendant_id) pairs that already have a financial handover so
    # we don't show duplicate rows.
    financial_pairs: set = {
        (h.get("shift_id", ""), h.get("attendant_id", ""))
        for h in handovers.values()
        if h.get("phase") in ("completed", "readings_verified")
    }

    for key, rec in er_readings_db.items():
        if not key.endswith("-C"):
            continue
        rec_status = rec.get("review_status", "submitted")
        if rec_status not in ("submitted", "flagged"):
            continue

        rec_shift_id = rec.get("shift_id", "")
        rec_att_id = rec.get("user_id", "")

        if shift_id and rec_shift_id != shift_id:
            continue

        # Skip if a financial handover exists for this attendant+shift
        if (rec_shift_id, rec_att_id) in financial_pairs:
            continue

        shift_obj = shifts_data.get(rec_shift_id, {})
        shift_date = shift_obj.get("date", rec.get("submitted_at", "")[:10])

        if date and shift_date != date:
            continue

        er_item = _build_er_review_item(rec_shift_id, rec_att_id, er_readings_db, ctx["storage"])
        if er_item is None:
            continue

        er_item["date"] = shift_date
        er_item["shift_type"] = shift_obj.get("shift_type", "")
        pending.append(er_item)

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


class VoidHandoverInput(BaseModel):
    shift_id: str
    attendant_id: str
    note: str


@router.post("/void", dependencies=[Depends(require_owner)])
async def void_handover(data: VoidHandoverInput, ctx: dict = Depends(get_station_context)):
    """
    Void an attendant's entire entry for a shift — nozzle readings, cash
    handover, stock movement, credit sales — with zero impact on sales
    totals or stock levels once voided. Owner only: unlike Approve/Return,
    this can reverse already-approved stock and credit-sale effects, so it
    carries the strictest gate in the app.

    Not a normal correction path — if the attendant never submitted
    anything for this shift, there's nothing here to void; edit the
    shift's assignments instead.
    """
    if not data.note or not data.note.strip():
        raise HTTPException(status_code=400, detail="A reason is required to void an entry")

    station_id = ctx["station_id"]
    handovers = _load_handovers(station_id)
    matches = [
        (hid, h) for hid, h in handovers.items()
        if h.get("shift_id") == data.shift_id and h.get("attendant_id") == data.attendant_id
    ]
    if not matches:
        raise HTTPException(
            status_code=404,
            detail="No handover entry found for this attendant on this shift. "
                   "If nothing was ever submitted, edit the shift's assignments instead.",
        )

    close_offs = load_station_json(station_id, "daily_close_offs.json", default={})

    voided_ids = []
    for handover_id, handover in matches:
        if handover.get("review_status") == "voided":
            continue
        if handover.get("date", "") in close_offs:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot void. Day {handover['date']} has been closed off — reopen the day first.",
            )

        # Reverse already-applied stock effects, if any.
        if handover.get("stock_applied"):
            reverse_handover_sales(station_id, handover, ctx["username"])

        # Reverse credit sales created by this specific handover — sale_id is
        # prefixed CS-HO-{handover_id}-, so this never touches a co-attendant's
        # credit sales on the same shift.
        accounts_data = ctx["storage"].get("accounts", {})
        credit_sales_data = ctx["storage"].get("credit_sales", [])
        prefix = f"CS-HO-{handover_id}-"
        for sale in credit_sales_data:
            if sale.get("sale_id", "").startswith(prefix) and not sale.get("voided"):
                reverse_credit_sale(accounts_data, sale.get("account_id", ""), sale.get("amount", 0) or 0)
                sale["voided"] = True

        handover["pre_void_review_status"] = handover.get("review_status", "submitted")
        handover["review_status"] = "voided"
        handover["voided_by"] = ctx["username"]
        handover["voided_at"] = datetime.now().isoformat()
        handover["void_reason"] = data.note
        voided_ids.append(handover_id)

    if not voided_ids:
        raise HTTPException(status_code=400, detail="This entry has already been voided")

    _save_handovers(handovers, station_id)
    save_station_storage(station_id)

    # Tag the raw reading records too, so opening-reading carry-forward and the
    # duplicate-reading gate both stop treating this shift's numbers as real
    # history for other shifts.
    readings_db = _load_enter_readings(station_id)
    changed = False
    for key in (f"AR-{data.shift_id}-{data.attendant_id}-O", f"AR-{data.shift_id}-{data.attendant_id}-C"):
        if key in readings_db:
            readings_db[key]["voided"] = True
            changed = True
    if changed:
        _save_enter_readings(readings_db, station_id)

    for handover_id in voided_ids:
        log_audit_event(
            station_id=station_id,
            action="handover_voided",
            performed_by=ctx["username"],
            entity_type="handover",
            entity_id=handover_id,
            details={"shift_id": data.shift_id, "attendant_id": data.attendant_id, "note": data.note},
        )
        create_notification(
            station_id=station_id,
            type="HANDOVER_VOIDED",
            severity="warning",
            title="Handover Voided",
            message=f"Handover {handover_id} voided by {ctx['full_name']}: {data.note}",
            entity_type="handover",
            entity_id=handover_id,
            created_by=ctx["username"],
        )

    return {"status": "success", "voided_handover_ids": voided_ids}


class UnvoidHandoverInput(BaseModel):
    shift_id: str
    attendant_id: str


@router.post("/unvoid", dependencies=[Depends(require_owner)])
async def unvoid_handover(data: UnvoidHandoverInput, ctx: dict = Depends(get_station_context)):
    """
    Reverse a mistaken Void — restores the entry to whatever review status
    it had before voiding, re-applying stock and credit-sale effects if it
    had already been approved at the time it was voided. Owner only, same
    gate as Void.
    """
    station_id = ctx["station_id"]
    handovers = _load_handovers(station_id)
    matches = [
        (hid, h) for hid, h in handovers.items()
        if h.get("shift_id") == data.shift_id and h.get("attendant_id") == data.attendant_id
        and h.get("review_status") == "voided"
    ]
    if not matches:
        raise HTTPException(status_code=404, detail="No voided entry found for this attendant on this shift.")

    close_offs = load_station_json(station_id, "daily_close_offs.json", default={})

    unvoided_ids = []
    for handover_id, handover in matches:
        if handover.get("date", "") in close_offs:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot un-void. Day {handover['date']} has been closed off — reopen the day first.",
            )

        restored_status = handover.get("pre_void_review_status", "submitted")
        handover["review_status"] = restored_status

        if restored_status == "approved":
            if not handover.get("stock_applied"):
                apply_handover_sales(station_id, handover, ctx["username"])

            accounts_data = ctx["storage"].get("accounts", {})
            credit_sales_data = ctx["storage"].get("credit_sales", [])
            prefix = f"CS-HO-{handover_id}-"
            for sale in credit_sales_data:
                if sale.get("sale_id", "").startswith(prefix) and sale.get("voided"):
                    reapply_credit_sale(accounts_data, sale.get("account_id", ""), sale.get("amount", 0) or 0)
                    sale["voided"] = False

        handover["unvoided_by"] = ctx["username"]
        handover["unvoided_at"] = datetime.now().isoformat()
        unvoided_ids.append(handover_id)

    _save_handovers(handovers, station_id)
    save_station_storage(station_id)

    readings_db = _load_enter_readings(station_id)
    changed = False
    for key in (f"AR-{data.shift_id}-{data.attendant_id}-O", f"AR-{data.shift_id}-{data.attendant_id}-C"):
        if key in readings_db and readings_db[key].get("voided"):
            del readings_db[key]["voided"]
            changed = True
    if changed:
        _save_enter_readings(readings_db, station_id)

    for handover_id in unvoided_ids:
        handover = handovers[handover_id]
        log_audit_event(
            station_id=station_id,
            action="handover_unvoided",
            performed_by=ctx["username"],
            entity_type="handover",
            entity_id=handover_id,
            details={"shift_id": data.shift_id, "attendant_id": data.attendant_id,
                     "restored_status": handover.get("review_status")},
        )
        create_notification(
            station_id=station_id,
            type="HANDOVER_UNVOIDED",
            severity="info",
            title="Handover Restored",
            message=f"Handover {handover_id} un-voided by {ctx['full_name']}",
            entity_type="handover",
            entity_id=handover_id,
            created_by=ctx["username"],
        )
        # A restored 'approved' handover may now let its shift complete.
        if handover.get("review_status") == "approved":
            advance_shift_on_approval(handover.get("shift_id", ""), station_id, ctx["storage"], ctx["username"])

    return {
        "status": "success",
        "unvoided_handover_ids": unvoided_ids,
        "restored_statuses": [handovers[hid].get("review_status") for hid in unvoided_ids],
    }


class DeleteVoidedHandoverInput(BaseModel):
    shift_id: str
    attendant_id: str


@router.post("/delete-voided", dependencies=[Depends(require_owner)])
async def delete_voided_handover(data: DeleteVoidedHandoverInput, ctx: dict = Depends(get_station_context)):
    """
    Permanently remove a voided entry — the handover record, its raw
    reading records, and any credit-sale log entries it created. Only ever
    operates on entries already in review_status 'voided' (void first,
    then decide this one wasn't a mistake and doesn't need to be kept).
    Irreversible — the audit log entry (which captures the full deleted
    record) is the only trace left afterward.
    """
    station_id = ctx["station_id"]
    handovers = _load_handovers(station_id)
    matches = [
        (hid, h) for hid, h in handovers.items()
        if h.get("shift_id") == data.shift_id and h.get("attendant_id") == data.attendant_id
        and h.get("review_status") == "voided"
    ]
    if not matches:
        raise HTTPException(
            status_code=404,
            detail="No voided entry found for this attendant on this shift. "
                   "Only a voided entry can be permanently deleted — void it first.",
        )

    deleted_ids = []
    for handover_id, handover in matches:
        prefix = f"CS-HO-{handover_id}-"
        ctx["storage"]["credit_sales"] = [
            s for s in ctx["storage"].get("credit_sales", [])
            if not s.get("sale_id", "").startswith(prefix)
        ]

        log_audit_event(
            station_id=station_id,
            action="handover_deleted",
            performed_by=ctx["username"],
            entity_type="handover",
            entity_id=handover_id,
            details={"shift_id": data.shift_id, "attendant_id": data.attendant_id, "deleted_record": handover},
        )
        del handovers[handover_id]
        deleted_ids.append(handover_id)

    _save_handovers(handovers, station_id)
    save_station_storage(station_id)

    readings_db = _load_enter_readings(station_id)
    changed = False
    for key in (f"AR-{data.shift_id}-{data.attendant_id}-O", f"AR-{data.shift_id}-{data.attendant_id}-C"):
        if key in readings_db:
            del readings_db[key]
            changed = True
    if changed:
        _save_enter_readings(readings_db, station_id)

    return {"status": "success", "deleted_handover_ids": deleted_ids}


class ExcludeReadingInput(BaseModel):
    shift_id: str
    attendant_id: str
    nozzle_id: str
    reason: str


@router.post("/exclude-reading", dependencies=[Depends(require_owner)])
async def exclude_reading(data: ExcludeReadingInput, ctx: dict = Depends(get_station_context)):
    """
    Mark one historical nozzle reading as bad data — excluded from future
    duplicate/decreasing-reading checks and opening-reading carry-forward,
    without touching that handover's review status, sales, or stock.

    Deliberately the opposite of Void in scope: this never requires the
    day to be reopened (there's nothing financial to protect), and works
    on an already-approved, already-closed-off handover — the whole point
    is defusing a stray bad number from a shift whose figures are
    otherwise correct and already banked.
    """
    if not data.reason or not data.reason.strip():
        raise HTTPException(status_code=400, detail="A reason is required to exclude a reading")

    station_id = ctx["station_id"]
    reason = data.reason.strip()
    now_iso = datetime.now().isoformat()

    readings_db = _load_enter_readings(station_id)
    closing_key = f"AR-{data.shift_id}-{data.attendant_id}-C"
    record = readings_db.get(closing_key)
    if not record:
        raise HTTPException(status_code=404, detail="No closing reading record found for this attendant on this shift.")

    nozzle_reading = next(
        (nr for nr in record.get("nozzle_readings", []) if nr.get("nozzle_id") == data.nozzle_id), None
    )
    if not nozzle_reading:
        raise HTTPException(status_code=404, detail=f"No reading found for nozzle {data.nozzle_id} on this shift.")

    nozzle_reading["excluded_from_checks"] = True
    nozzle_reading["excluded_reason"] = reason
    nozzle_reading["excluded_by"] = ctx["username"]
    nozzle_reading["excluded_at"] = now_iso
    _save_enter_readings(readings_db, station_id)

    # Mirror onto the handover's own nozzle_summaries so Handover Review
    # shows this was excluded when browsing that shift.
    handovers = _load_handovers(station_id)
    handover = next(
        (h for h in handovers.values()
         if h.get("shift_id") == data.shift_id and h.get("attendant_id") == data.attendant_id),
        None,
    )
    if handover:
        summary = next(
            (ns for ns in handover.get("nozzle_summaries", []) if ns.get("nozzle_id") == data.nozzle_id), None
        )
        if summary:
            summary["excluded_from_checks"] = True
            summary["excluded_reason"] = reason
            _save_handovers(handovers, station_id)

    log_audit_event(
        station_id=station_id,
        action="reading_excluded_from_checks",
        performed_by=ctx["username"],
        entity_type="nozzle_reading",
        entity_id=f"{data.shift_id}-{data.attendant_id}-{data.nozzle_id}",
        details={"shift_id": data.shift_id, "attendant_id": data.attendant_id, "nozzle_id": data.nozzle_id,
                 "excluded_reading": nozzle_reading.get("electronic_reading"), "reason": reason},
    )

    return {"status": "success", "excluded_reading": nozzle_reading.get("electronic_reading")}


class AdminOverrideCloseInput(BaseModel):
    handover_ids: List[str]
    reason: str


@router.post("/admin-override-close", dependencies=[Depends(require_owner)])
async def admin_override_close_endpoint(data: AdminOverrideCloseInput, ctx: dict = Depends(get_station_context)):
    """
    Owner-only bulk administrative closure for a stuck backlog — see
    admin_override_close() for what this does and doesn't verify.
    """
    if not (data.reason or "").strip():
        raise HTTPException(status_code=400, detail="A reason is required to administratively close shifts.")
    if not data.handover_ids:
        raise HTTPException(status_code=400, detail="No shifts selected")

    station_id = ctx["station_id"]
    closed, skipped = admin_override_close(
        station_id, data.handover_ids, data.reason.strip(), ctx["username"], ctx["full_name"], ctx["storage"])

    if closed:
        create_notification(
            station_id=station_id, type="HANDOVER_ADMIN_OVERRIDE_CLOSE", severity="high",
            title="Shifts Administratively Closed",
            message=f"{ctx['full_name']} administratively closed {len(closed)} shift(s) without cash/dip "
                    f"verification. Reason: {data.reason.strip()}",
            entity_type="handover", created_by=ctx["username"],
        )

    return {"status": "success", "closed": closed, "skipped": skipped}


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
