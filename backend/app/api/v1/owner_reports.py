"""
Owner reports (owner only, read-only).

  /owner-reports/attendant-scorecard  each attendant's cash, stock, count and deposit record
  /owner-reports/payment-totals       non-cash totals per day by provider, with the slips behind them
  /owner-reports/stock-losses         stock lost per item per month, valued at selling price

They read records as they were saved and never change anything. Only live
handovers count: voided entries and attempts replaced by a resubmission are
left out. Features that started recently (deposits bound to attendants and
slip references, shift-start counts) are reported with the date they began,
so older periods are not mistaken for clean results.
"""
import re
from collections import defaultdict
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from .auth import get_station_context, require_owner
from ...database.station_files import load_station_json
from ...services.handover_lookup import is_handover_canonical
from ...services import safe_deposit_service as deps
from ...services import stock_service as stock
from .lpg_daily import load_lpg_pricing, load_accessories_catalog, get_pricing_for_size
from .lubricants_daily import load_product_catalog as load_lubricant_catalog

router = APIRouter()

_CODE = re.compile(r"^[a-z_]+$")


# ── shared ──────────────────────────────────────────────────────────

def _range(date_from: Optional[str], date_to: Optional[str]) -> tuple:
    for d in (date_from, date_to):
        if d:
            try:
                datetime.strptime(d, "%Y-%m-%d")
            except ValueError:
                raise HTTPException(status_code=400, detail="Dates must be YYYY-MM-DD.")
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=400, detail="'From' must be on or before 'to'.")
    return date_from or "0000-00-00", date_to or "9999-12-31"


def _live_handovers(station_id: str, d_from: str, d_to: str) -> list:
    handovers = load_station_json(station_id, "attendant_handovers.json", default={})
    return [h for h in handovers.values()
            if d_from <= (h.get("date") or "") <= d_to
            and h.get("review_status") != "voided" and is_handover_canonical(h)]


def _feature_dates(station_id: str) -> dict:
    """When each recently added record started, so older periods are labelled."""
    pos = load_station_json(station_id, "pos_settings.json", default={}) or {}
    st = stock.load_settings(station_id) or {}
    return {
        "deposits_and_slip_refs_from": pos.get("slip_references_required_from"),
        "shift_start_counts_from": (st.get("forecourt_live_since") or "")[:10] or None,
    }


def _r(v) -> float:
    return round(v or 0, 2)


# ── 1. attendant scorecard ──────────────────────────────────────────

def _snapshot_shortfalls(snap: dict) -> tuple:
    """(units missing at close, their value at selling price) from a handover's stock rows."""
    units, value = 0.0, 0.0
    for r in (snap or {}).get("lpg_cylinders", []) or []:
        full_short = max(0, r.get("variance", 0) or 0)
        empty_short = max(0, r.get("empty_variance", 0) or 0)
        deposit = max(0, (r.get("price_with_cylinder", 0) or 0) - (r.get("refill_price", 0) or 0))
        units += full_short + empty_short
        value += full_short * (r.get("price_with_cylinder", 0) or 0) + empty_short * deposit
    for field in ("accessories", "lubricants"):
        for r in (snap or {}).get(field, []) or []:
            short = max(0, r.get("variance", 0) or 0)
            units += short
            value += short * (r.get("unit_price", 0) or 0)
    return units, value


@router.get("/attendant-scorecard", dependencies=[Depends(require_owner)])
def attendant_scorecard(date_from: Optional[str] = Query(None, alias="from"),
                        date_to: Optional[str] = Query(None, alias="to"),
                        ctx: dict = Depends(get_station_context)):
    station_id = ctx["station_id"]
    storage = ctx["storage"]
    d_from, d_to = _range(date_from, date_to)
    threshold = storage.get("fuel_settings", {}).get("cash_shortage_threshold", 500)
    shifts = storage.get("shifts", {})

    def blank(aid, name):
        return {"attendant_id": aid, "attendant_name": name, "shifts_closed": 0, "sales": 0.0,
                "cash_short": 0.0, "cash_over": 0.0, "shifts_short_over_threshold": 0,
                "stock_short_units": 0.0, "stock_short_value": 0.0,
                "count_differences": 0, "count_differences_their_responsibility": 0,
                "flags": defaultdict(int), "flagged_shifts": 0,
                "deposits": 0, "deposit_total": 0.0, "deposits_voided": 0, "deposits_moved_away": 0,
                "overdue_reminders": 0, "shifts": []}

    people: dict = {}

    def person(aid, name):
        if aid not in people:
            people[aid] = blank(aid, name)
        elif name and not people[aid]["attendant_name"]:
            people[aid]["attendant_name"] = name
        return people[aid]

    for h in _live_handovers(station_id, d_from, d_to):
        if h.get("phase") != "completed":
            continue
        p = person(h.get("attendant_id"), h.get("attendant_name"))
        diff = h.get("difference", 0) or 0
        short_units, short_value = _snapshot_shortfalls(h.get("stock_snapshot"))
        flags = h.get("auto_flag_reasons") or []
        p["shifts_closed"] += 1
        p["sales"] += h.get("total_expected", 0) or 0
        if diff < 0:
            p["cash_short"] += -diff
            if -diff > threshold:
                p["shifts_short_over_threshold"] += 1
        else:
            p["cash_over"] += diff
        p["stock_short_units"] += short_units
        p["stock_short_value"] += short_value
        if flags:
            p["flagged_shifts"] += 1
        for f in flags:
            key = f if _CODE.match(f) else ("stock_difference" if "variance" in f.lower()
                                           else "count_difference" if f.lower().startswith("opening count")
                                           else "other")
            p["flags"][key] += 1
        p["shifts"].append({
            "date": h.get("date"), "shift_type": h.get("shift_type"), "handover_id": h.get("handover_id"),
            "sales": _r(h.get("total_expected")), "difference": _r(diff),
            "safe_deposits_total": h.get("safe_deposits_total"),
            "stock_short_units": short_units, "stock_short_value": _r(short_value),
            "flags": flags, "review_status": h.get("review_status"),
        })

    for v in stock.load_opening_variances(station_id).values():
        if d_from <= (v.get("date") or "") <= d_to:
            p = person(v.get("attendant_id"), v.get("attendant_name"))
            p["count_differences"] += 1
            if v.get("responsibility") == "this_attendant":
                p["count_differences_their_responsibility"] += 1

    for shift_id, block in deps.load_deposits(station_id).items():
        date = (shifts.get(shift_id) or {}).get("date") or ""
        if not (d_from <= date <= d_to):
            continue
        for d in (block or {}).get("deposits", []):
            for move in d.get("reassignments", []) or []:
                person(move.get("from_attendant_id"), move.get("from_attendant_name"))["deposits_moved_away"] += 1
            p = person(d.get("attendant_id"), d.get("attendant_name"))
            if deps.is_live(d):
                p["deposits"] += 1
                p["deposit_total"] += d.get("amount", 0) or 0
            else:
                p["deposits_voided"] += 1

    for n in load_station_json(station_id, "notifications.json", default=[]) or []:
        if n.get("type") != "DEPOSIT_OVERDUE":
            continue
        entity = n.get("entity_id") or ""
        for shift_id, s in shifts.items():
            prefix = f"{shift_id}-"
            if entity.startswith(prefix) and d_from <= (s.get("date") or "") <= d_to:
                aid = entity[len(prefix):]
                name = next((a.get("attendant_name") for a in s.get("assignments", []) or []
                             if a.get("attendant_id") == aid), None)
                person(aid, name)["overdue_reminders"] += 1
                break

    rows = []
    for p in people.values():
        if not p["attendant_id"]:
            continue
        p["flags"] = dict(p["flags"])
        p["shifts"].sort(key=lambda s: (s["date"] or "", s["shift_type"] or ""), reverse=True)
        for k in ("sales", "cash_short", "cash_over", "stock_short_value", "deposit_total"):
            p[k] = _r(p[k])
        p["net_cash"] = _r(p["cash_over"] - p["cash_short"])
        rows.append(p)
    rows.sort(key=lambda p: (p["net_cash"], p["attendant_name"] or ""))
    return {"from": date_from, "to": date_to, "cash_shortage_threshold": threshold,
            "feature_dates": _feature_dates(station_id), "attendants": rows}


# ── 2. payment totals by provider ───────────────────────────────────

@router.get("/payment-totals", dependencies=[Depends(require_owner)])
def payment_totals(date_from: Optional[str] = Query(None, alias="from"),
                   date_to: Optional[str] = Query(None, alias="to"),
                   ctx: dict = Depends(get_station_context)):
    station_id = ctx["station_id"]
    d_from, d_to = _range(date_from, date_to)
    from .attendant_handover import _shift_pos_check, _pos_rules
    terminal, _ = _pos_rules(station_id)

    totals: dict = {}
    slips = []
    shift_ids = {}
    for h in _live_handovers(station_id, d_from, d_to):
        if h.get("phase") != "completed":
            continue
        shift_ids[h.get("shift_id")] = (h.get("date"), h.get("shift_type"))
        for e in h.get("pos_breakdown") or []:
            type_id = e.get("type_id")
            bank = e.get("bank") if type_id in terminal else None
            key = (h.get("date"), type_id, bank)
            t = totals.setdefault(key, {"date": h.get("date"), "type_id": type_id,
                                        "type_name": e.get("type_name") or type_id,
                                        "bank": bank, "is_terminal": type_id in terminal,
                                        "amount": 0.0, "slips": 0, "without_reference": 0})
            t["amount"] += e.get("amount", 0) or 0
            t["slips"] += 1
            if not (e.get("reference") or "").strip():
                t["without_reference"] += 1
            slips.append({"date": h.get("date"), "shift_type": h.get("shift_type"),
                          "attendant_name": h.get("attendant_name"), "type_id": type_id,
                          "type_name": e.get("type_name") or type_id, "bank": bank,
                          "reference": e.get("reference"), "amount": _r(e.get("amount"))})

    rows = sorted(({**t, "amount": _r(t["amount"])} for t in totals.values()),
                  key=lambda t: (t["date"] or "", t["type_name"] or "", t["bank"] or ""), reverse=True)
    slips.sort(key=lambda s: (s["date"] or "", s["shift_type"] or "", s["attendant_name"] or ""), reverse=True)

    card_checks = []
    for sid, (date, shift_type) in sorted(shift_ids.items(), key=lambda kv: kv[1][0] or "", reverse=True):
        try:
            c = _shift_pos_check(station_id, ctx["storage"], sid)
            card_checks.append({"shift_id": sid, "date": date, "shift_type": shift_type,
                                "status": c["status"], "slips_total": c["slips_total"],
                                "machine_total": c["machine_total"], "difference": c["difference"]})
        except Exception:
            pass

    by_type: dict = {}
    for t in rows:
        label = t["type_name"] + (f" ({t['bank']})" if t["bank"] else (" (bank not specified)" if t["is_terminal"] else ""))
        b = by_type.setdefault(label, {"label": label, "amount": 0.0, "slips": 0, "without_reference": 0})
        b["amount"] = _r(b["amount"] + t["amount"])
        b["slips"] += t["slips"]
        b["without_reference"] += t["without_reference"]

    return {"from": date_from, "to": date_to, "feature_dates": _feature_dates(station_id),
            "totals": rows, "by_type": sorted(by_type.values(), key=lambda b: -b["amount"]),
            "slips": slips, "card_checks": card_checks}


# ── 3. stock losses ─────────────────────────────────────────────────

def _selling_prices(station_id: str) -> tuple:
    """({item_key: selling price}, {item_key: name}) for lubricants, accessories and cylinders."""
    prices, names = {}, {}
    for p in load_lubricant_catalog(station_id) or []:
        key = f"lubricant:{p.get('product_code')}"
        prices[key] = p.get("selling_price", 0) or 0
        names[key] = p.get("description") or p.get("product_code")
    for a in load_accessories_catalog(station_id) or []:
        key = f"lpg_accessory:{a.get('product_code')}"
        prices[key] = a.get("selling_price", a.get("unit_price", 0)) or 0
        names[key] = a.get("description") or a.get("product_code")
    pricing_db = load_lpg_pricing(station_id)
    from .lpg_daily import LPG_SIZES
    for size in LPG_SIZES:
        pr = get_pricing_for_size(size, pricing_db)
        prices[f"cylinder_full:{size}kg"] = pr["price_with_cylinder"]
        prices[f"cylinder_empty:{size}kg"] = max(0, pr["price_with_cylinder"] - pr["price_refill"])
        names[f"cylinder_full:{size}kg"] = f"{size}kg cylinder (full)"
        names[f"cylinder_empty:{size}kg"] = f"{size}kg cylinder (empty)"
    for key, item in stock.load_items(station_id).items():
        names.setdefault(key, item.get("name") or key)
    return prices, names


@router.get("/stock-losses", dependencies=[Depends(require_owner)])
def stock_losses(date_from: Optional[str] = Query(None, alias="from"),
                 date_to: Optional[str] = Query(None, alias="to"),
                 ctx: dict = Depends(get_station_context)):
    """
    Per item per month. `lost` = what actually reduced the stock count:
    write-offs (Stores damage, damage recorded at shift close) and downward
    count corrections (stock takes, shift-start count resolutions). Upward
    corrections are `found`. Go-live adjustments are left out. Attendants'
    closing shortfalls are reported separately as `closing_shortfall` and are
    NOT part of `lost`: the same missing units usually show up again at the
    next count, and adding both would count them twice.
    """
    station_id = ctx["station_id"]
    d_from, d_to = _range(date_from, date_to)
    prices, names = _selling_prices(station_id)
    rows: dict = {}

    def row(month, key):
        return rows.setdefault((month, key), {
            "month": month, "item_key": key, "name": names.get(key, key), "category": key.split(":")[0],
            "price": prices.get(key, 0), "written_off": 0.0, "count_corrections_lost": 0.0,
            "found": 0.0, "closing_shortfall": 0.0})

    for m in stock.load_movements(station_id):
        date = (m.get("timestamp") or "")[:10]
        if not (d_from <= date <= d_to):
            continue
        key, qty = m.get("item_key"), m.get("qty", 0) or 0
        if m.get("type") == "damage":
            row(date[:7], key)["written_off"] += qty
        elif m.get("type") == "adjust":
            if (m.get("note") or "").startswith("Forecourt go-live"):
                continue
            if qty < 0:
                row(date[:7], key)["count_corrections_lost"] += -qty
            elif qty > 0:
                row(date[:7], key)["found"] += qty

    for h in _live_handovers(station_id, d_from, d_to):
        snap = h.get("stock_snapshot") or {}
        month = (h.get("date") or "")[:7]
        for r in snap.get("lpg_cylinders", []) or []:
            size = r.get("size_kg")
            full, empty = f"cylinder_full:{size}kg", f"cylinder_empty:{size}kg"
            if r.get("damaged"):
                row(month, full)["written_off"] += r["damaged"]
            if (r.get("variance") or 0) > 0:
                row(month, full)["closing_shortfall"] += r["variance"]
            if (r.get("empty_variance") or 0) > 0:
                row(month, empty)["closing_shortfall"] += r["empty_variance"]
        for field, prefix in (("accessories", "lpg_accessory"), ("lubricants", "lubricant")):
            for r in snap.get(field, []) or []:
                key = f"{prefix}:{r.get('product_code')}"
                if r.get("damaged"):
                    row(month, key)["written_off"] += r["damaged"]
                if (r.get("variance") or 0) > 0:
                    row(month, key)["closing_shortfall"] += r["variance"]

    out = []
    for r in rows.values():
        lost = r["written_off"] + r["count_corrections_lost"]
        if not (lost or r["found"] or r["closing_shortfall"]):
            continue
        out.append({**r, "lost": round(lost, 4),
                    "lost_value": _r(lost * r["price"]),
                    "found_value": _r(r["found"] * r["price"]),
                    "net_lost_value": _r((lost - r["found"]) * r["price"]),
                    "closing_shortfall_value": _r(r["closing_shortfall"] * r["price"])})
    # Newest month first; within a month, the costliest losses first
    out.sort(key=lambda r: (r["month"], r["lost_value"], r["closing_shortfall_value"]), reverse=True)

    months = sorted({r["month"] for r in out}, reverse=True)
    month_totals = [{"month": mo,
                     "lost_value": _r(sum(r["lost_value"] for r in out if r["month"] == mo)),
                     "found_value": _r(sum(r["found_value"] for r in out if r["month"] == mo)),
                     "net_lost_value": _r(sum(r["net_lost_value"] for r in out if r["month"] == mo)),
                     "closing_shortfall_value": _r(sum(r["closing_shortfall_value"] for r in out if r["month"] == mo))}
                    for mo in months]
    return {"from": date_from, "to": date_to, "valued_at": "selling price",
            "feature_dates": _feature_dates(station_id), "rows": out, "months": month_totals}
