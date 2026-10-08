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
from datetime import datetime, timedelta
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


# ── 4. fuel loss trend per tank ─────────────────────────────────────

def _week_start(date: str) -> str:
    d = datetime.strptime(date, "%Y-%m-%d")
    return (d - timedelta(days=d.weekday())).strftime("%Y-%m-%d")


def fuel_losses_data(station_id: str, storage: dict, d_from: str, d_to: str) -> dict:
    """
    Per tank: litres that left the tank (dips, after deliveries) minus litres
    the nozzles recorded. Positive = fuel gone without being sold through a
    nozzle (possible leak, theft or meter drift); negative = nozzles recorded
    more than left the tank. Only shifts whose tank-vs-nozzle check was worked
    out at close are counted.
    """
    from ...services.tank_movement import get_pass_threshold, get_warning_threshold
    pass_pct, warn_pct = get_pass_threshold(), get_warning_threshold()
    tanks = storage.get("tanks", {}) or {}
    readings = load_station_json(station_id, "tank_readings.json", default={}) or {}

    shifts, weeks, per_tank = [], {}, {}
    for r in readings.values():
        date = r.get("date") or ""
        if not (d_from <= date <= d_to):
            continue
        moved, sold = r.get("tank_volume_movement"), r.get("total_electronic_dispensed")
        if moved is None or sold is None:
            continue
        tid = r.get("tank_id")
        t = tanks.get(tid, {})
        loss = round(moved - sold, 2)
        pct = round(loss / moved * 100, 2) if moved else 0.0
        price = r.get("price_per_liter") or 0
        status = "within" if abs(pct) <= pass_pct else ("warning" if abs(pct) <= warn_pct else "over")
        label = t.get("name") or (f"{t.get('fuel_type')} ({tid})" if t.get("fuel_type") else tid)
        shifts.append({"date": date, "shift_type": r.get("shift_type"), "tank_id": tid, "tank": label,
                       "fuel_type": t.get("fuel_type"), "tank_movement": round(moved, 2), "nozzles": round(sold, 2),
                       "loss_litres": loss, "loss_percent": pct, "loss_value": _r(loss * price), "status": status})
        wk = weeks.setdefault((tid, _week_start(date)), {"tank_id": tid, "tank": label, "week_start": _week_start(date),
                                                         "tank_movement": 0.0, "nozzles": 0.0, "loss_value": 0.0, "shifts": 0})
        wk["tank_movement"] += moved
        wk["nozzles"] += sold
        wk["loss_value"] += loss * price
        wk["shifts"] += 1
        pt = per_tank.setdefault(tid, {"tank_id": tid, "tank": label, "fuel_type": t.get("fuel_type"),
                                        "tank_movement": 0.0, "nozzles": 0.0, "loss_value": 0.0, "shifts": 0,
                                        "shifts_over": 0})
        pt["tank_movement"] += moved
        pt["nozzles"] += sold
        pt["loss_value"] += loss * price
        pt["shifts"] += 1
        pt["shifts_over"] += status == "over"

    def finish(x):
        x["loss_litres"] = round(x["tank_movement"] - x["nozzles"], 2)
        x["loss_percent"] = round(x["loss_litres"] / x["tank_movement"] * 100, 2) if x["tank_movement"] else 0.0
        x["tank_movement"], x["nozzles"], x["loss_value"] = round(x["tank_movement"], 2), round(x["nozzles"], 2), _r(x["loss_value"])
        return x

    return {
        "pass_percent": pass_pct, "warning_percent": warn_pct,
        "tanks": sorted((finish(x) for x in per_tank.values()), key=lambda x: -x["loss_litres"]),
        "weeks": sorted((finish(x) for x in weeks.values()), key=lambda x: (x["tank"] or "", x["week_start"])),
        "shifts": sorted(shifts, key=lambda s: (s["date"], s["shift_type"] or "", s["tank"] or ""), reverse=True),
    }


@router.get("/fuel-losses", dependencies=[Depends(require_owner)])
def fuel_losses(date_from: Optional[str] = Query(None, alias="from"),
                date_to: Optional[str] = Query(None, alias="to"),
                ctx: dict = Depends(get_station_context)):
    d_from, d_to = _range(date_from, date_to)
    return {"from": date_from, "to": date_to, **fuel_losses_data(ctx["station_id"], ctx["storage"], d_from, d_to)}


# ── 5. credit account exposure ──────────────────────────────────────

def credit_exposure_data(station_id: str, storage: dict, today: Optional[str] = None) -> dict:
    """
    Every credit account: what it owes (Post-Paid) or has left (Pre-Paid)
    against its limit, how old the unpaid sales are, and when it last paid.
    Payments are not stored per sale, so age assumes payments clear the
    oldest sales first: the unpaid balance is the most recent sales.
    """
    today = today or datetime.now().strftime("%Y-%m-%d")
    today_dt = datetime.strptime(today, "%Y-%m-%d")
    sales_by_acc = defaultdict(list)
    for s in storage.get("credit_sales", []) or []:
        if not s.get("voided"):
            sales_by_acc[s.get("account_id")].append(s)
    last_paid = {}
    for e in load_station_json(station_id, "audit_log.json", default=[]) or []:
        if e.get("action") in ("account_payment", "account_top_up"):
            last_paid[e.get("entity_id")] = max(last_paid.get(e.get("entity_id"), ""), (e.get("timestamp") or "")[:10])

    rows, buckets_total = [], {"0-30": 0.0, "31-60": 0.0, "61-90": 0.0, "90+": 0.0}
    for acc_id, a in (storage.get("accounts", {}) or {}).items():
        prepaid = a.get("account_type") == "Pre-Paid"
        balance = a.get("current_balance", 0) or 0
        limit = a.get("credit_limit", 0) or 0
        overdraft = a.get("approved_overdraft", 0) or 0
        sales = sorted(sales_by_acc.get(acc_id, []), key=lambda s: s.get("date") or "", reverse=True)
        last_sale = sales[0].get("date") if sales else None
        sold_30 = sum(s.get("amount", 0) or 0 for s in sales
                      if s.get("date") and (today_dt - datetime.strptime(s["date"], "%Y-%m-%d")).days <= 30)
        buckets = {"0-30": 0.0, "31-60": 0.0, "61-90": 0.0, "90+": 0.0}
        oldest_unpaid = None
        if prepaid:
            available = balance + overdraft
            used_pct = None
            opening = a.get("opening_balance") or 0
            status = ("suspended" if a.get("is_suspended") else "empty" if available <= 0
                      else "low" if opening and balance <= 0.2 * opening else "ok")
        else:
            available = limit + overdraft - balance
            used_pct = round(balance / limit * 100, 1) if limit else None
            remaining = balance
            for s in sales:                       # newest first: the unpaid balance
                if remaining <= 0:
                    break
                part = min(remaining, s.get("amount", 0) or 0)
                remaining -= part
                age = (today_dt - datetime.strptime(s["date"], "%Y-%m-%d")).days if s.get("date") else 0
                key = "0-30" if age <= 30 else "31-60" if age <= 60 else "61-90" if age <= 90 else "90+"
                buckets[key] += part
                oldest_unpaid = s.get("date")
            for k in buckets:
                buckets_total[k] += buckets[k]
            status = ("suspended" if a.get("is_suspended") else "over_limit" if limit and balance > limit + overdraft
                      else "near_limit" if limit and balance >= 0.9 * limit else "ok")
        rows.append({
            "account_id": acc_id, "account_name": a.get("account_name"), "client_code": a.get("client_code"),
            "account_type": "Pre-Paid" if prepaid else "Post-Paid",
            "owed": _r(0 if prepaid else balance), "prepaid_balance": _r(balance if prepaid else 0),
            "credit_limit": _r(limit), "overdraft": _r(overdraft), "available": _r(available),
            "used_percent": used_pct, "status": status, "aging": {k: _r(v) for k, v in buckets.items()},
            "oldest_unpaid_sale": oldest_unpaid,
            "oldest_unpaid_days": (today_dt - datetime.strptime(oldest_unpaid, "%Y-%m-%d")).days if oldest_unpaid else None,
            "last_sale": last_sale, "last_payment": last_paid.get(acc_id), "sales_last_30_days": _r(sold_30),
        })
    order = {"over_limit": 0, "empty": 1, "near_limit": 2, "low": 3, "suspended": 4, "ok": 5}
    rows.sort(key=lambda r: (order.get(r["status"], 9), -r["owed"]))
    return {"as_of": today, "accounts": rows,
            "total_owed": _r(sum(r["owed"] for r in rows)),
            "total_prepaid_held": _r(sum(r["prepaid_balance"] for r in rows)),
            "aging_total": {k: _r(v) for k, v in buckets_total.items()}}


@router.get("/credit-exposure", dependencies=[Depends(require_owner)])
def credit_exposure(ctx: dict = Depends(get_station_context)):
    return credit_exposure_data(ctx["station_id"], ctx["storage"])


# ── 6. banking check ────────────────────────────────────────────────

def banking_data(station_id: str, d_from: str, d_to: str) -> dict:
    """
    Per day: cash the attendants handed in (actual cash at close) against what
    was banked at Daily Close-Off. A day not closed off yet shows its cash as
    not yet banked. The running gap is the cumulative banked minus cash.
    """
    close_offs = load_station_json(station_id, "daily_close_offs.json", default={}) or {}
    cash_by_day = defaultdict(float)
    for h in _live_handovers(station_id, d_from, d_to):
        if h.get("phase") == "completed":
            cash_by_day[h.get("date")] += h.get("actual_cash", 0) or 0
    days = sorted(set(cash_by_day) | {d for d in close_offs if d_from <= d <= d_to})
    rows, running = [], 0.0
    for d in days:
        rec = close_offs.get(d)
        cash = (rec.get("summary") or {}).get("total_actual_cash", cash_by_day.get(d, 0)) if rec else cash_by_day.get(d, 0)
        banked = (rec.get("bank_deposit") or {}).get("amount") if rec else None
        gap = round((banked or 0) - cash, 2)
        running = round(running + gap, 2)
        rows.append({"date": d, "closed": bool(rec), "cash": _r(cash), "banked": None if banked is None else _r(banked),
                     "gap": gap, "running_gap": running,
                     "reference": (rec.get("bank_deposit") or {}).get("reference") if rec else None})
    return {"days": list(reversed(rows)), "total_cash": _r(sum(r["cash"] for r in rows)),
            "total_banked": _r(sum(r["banked"] or 0 for r in rows)), "running_gap": running,
            "days_not_closed": sum(1 for r in rows if not r["closed"])}


@router.get("/banking", dependencies=[Depends(require_owner)])
def banking(date_from: Optional[str] = Query(None, alias="from"),
            date_to: Optional[str] = Query(None, alias="to"),
            ctx: dict = Depends(get_station_context)):
    d_from, d_to = _range(date_from, date_to)
    return {"from": date_from, "to": date_to, **banking_data(ctx["station_id"], d_from, d_to)}


# ── 7. reorder suggestions ──────────────────────────────────────────

def reorder_data(station_id: str, days: int = 28, cover_days: int = 14, today: Optional[str] = None) -> dict:
    """
    For each Stores item: how fast it sells (forecourt sales over the last
    `days`), how many days the stock on hand lasts, and a suggested order
    that brings it to `cover_days` of sales (at least the item's re-order
    quantity) when it is at or below its re-order level or would run out
    within `cover_days`.
    """
    now = datetime.strptime(today, "%Y-%m-%d") if today else datetime.now()
    since = (now - timedelta(days=days)).strftime("%Y-%m-%d")
    sold = defaultdict(float)
    for m in stock.load_movements(station_id):
        if m.get("type") == "sale" and (m.get("timestamp") or "")[:10] >= since:
            sold[m.get("item_key")] += m.get("qty", 0) or 0
    prices, names = _selling_prices(station_id)
    rows = []
    for key, it in stock.load_items(station_id).items():
        on_hand = (it.get("stores", 0) or 0) + (it.get("forecourt", 0) or 0)
        rate = sold.get(key, 0) / days
        cover = round(on_hand / rate, 1) if rate else None
        level = it.get("reorder_level", 0) or 0
        needs = (level and on_hand <= level) or (cover is not None and cover < cover_days)
        suggest = 0
        if needs:
            suggest = max(it.get("reorder_qty", 0) or 0, int(-(-(rate * cover_days - on_hand) // 1)) if rate else 0)
        if key.startswith("cylinder_empty"):
            continue  # empties are returned to the supplier, not ordered
        rows.append({"item_key": key, "name": it.get("name") or names.get(key, key), "category": it.get("category"),
                     "stores": it.get("stores", 0), "forecourt": it.get("forecourt", 0), "on_hand": on_hand,
                     "sold": round(sold.get(key, 0), 2), "per_day": round(rate, 2), "days_cover": cover,
                     "reorder_level": level, "reorder_qty": it.get("reorder_qty", 0) or 0,
                     "suggested_order": suggest, "suggested_value": _r(suggest * prices.get(key, 0))})
    rows.sort(key=lambda r: (r["suggested_order"] == 0, r["days_cover"] if r["days_cover"] is not None else 1e9, r["name"] or ""))
    return {"days": days, "cover_days": cover_days, "items": rows,
            "to_order": sum(1 for r in rows if r["suggested_order"]),
            "order_value": _r(sum(r["suggested_value"] for r in rows))}


@router.get("/reorder", dependencies=[Depends(require_owner)])
def reorder(days: int = 28, cover_days: int = 14, ctx: dict = Depends(get_station_context)):
    if not (1 <= days <= 365) or not (1 <= cover_days <= 120):
        raise HTTPException(status_code=400, detail="days must be 1-365 and cover_days 1-120.")
    return reorder_data(ctx["station_id"], days, cover_days)


# ── 8. sensitive actions log ────────────────────────────────────────

SENSITIVE_ACTIONS = {
    "Handovers": ["handover_voided", "handover_unvoided", "handover_deleted", "handover_admin_override_close",
                  "handover_backfill_superseded", "handover_returned", "readings_redo", "manager_retro_entry",
                  "shift_reopened", "shift_deleted", "daily_close_off_reopen"],
    "Cash and payments": ["safe_deposit_void", "safe_deposit_reassign", "pos_receipt_removed", "pos_receipt_edited",
                          "pos_machine_totals_set"],
    "Credit": ["credit_sale_removed", "credit_sale_edited", "account_overdraft_approved", "account_delete",
               "account_top_up", "account_payment", "account_unsuspend"],
    "Stock": ["stock_adjust", "stock_damage", "stock_delete", "stock_take_approve", "opening_count_resolved",
              "forecourt_go_live", "damage_authorise"],
    "Prices": ["price_change", "price_change_scheduled", "price_change_cancelled", "price_correction_applied",
               "price_correction_delegation_granted"],
    "Readings and tanks": ["reading_excluded_from_checks", "dip_reading_edit", "calibration_upload", "calibration_clear"],
    "Users and settings": ["user_create", "user_delete", "user_password_reset", "user_update", "threshold_update",
                           "reconciliation_tolerance_update", "pos_settings_update", "settings_update",
                           "email_settings_update", "backup_restore"],
}
_ACTION_GROUP = {a: g for g, acts in SENSITIVE_ACTIONS.items() for a in acts}


def sensitive_actions_data(station_id: str, d_from: str, d_to: str) -> list:
    out = []
    for e in load_station_json(station_id, "audit_log.json", default=[]) or []:
        action = e.get("action")
        date = (e.get("timestamp") or "")[:10]
        if action in _ACTION_GROUP and d_from <= date <= d_to:
            out.append({"timestamp": e.get("timestamp"), "action": action, "group": _ACTION_GROUP[action],
                        "performed_by": e.get("performed_by"), "entity_type": e.get("entity_type"),
                        "entity_id": e.get("entity_id"), "details": e.get("details"), "notes": e.get("notes")})
    out.sort(key=lambda e: e["timestamp"] or "", reverse=True)
    return out


@router.get("/sensitive-actions", dependencies=[Depends(require_owner)])
def sensitive_actions(date_from: Optional[str] = Query(None, alias="from"),
                      date_to: Optional[str] = Query(None, alias="to"),
                      ctx: dict = Depends(get_station_context)):
    d_from, d_to = _range(date_from, date_to)
    return {"from": date_from, "to": date_to, "groups": list(SENSITIVE_ACTIONS),
            "entries": sensitive_actions_data(ctx["station_id"], d_from, d_to)}


# ── 9. station comparison ───────────────────────────────────────────

def station_figures(station_id: str, storage: dict, date_from: Optional[str], date_to: Optional[str]) -> dict:
    """Headline figures for one station; date_from/date_to as the caller received them (None = open)."""
    d_from, d_to = _range(date_from, date_to)
    ctx = {"station_id": station_id, "storage": storage}
    sc = attendant_scorecard(date_from, date_to, ctx)
    fl = fuel_losses_data(station_id, storage, d_from, d_to)
    sl = stock_losses(date_from, date_to, ctx)
    bk = banking_data(station_id, d_from, d_to)
    cr = credit_exposure_data(station_id, storage)
    checks = payment_totals(date_from, date_to, ctx)["card_checks"]
    people = sc["attendants"]
    moved = sum(t["tank_movement"] for t in fl["tanks"])
    lost_l = sum(t["loss_litres"] for t in fl["tanks"])
    return {
        "shifts": sum(p["shifts_closed"] for p in people),
        "sales": _r(sum(p["sales"] for p in people)),
        "net_cash": _r(sum(p["net_cash"] for p in people)),
        "flagged_shifts": sum(p["flagged_shifts"] for p in people),
        "fuel_loss_litres": round(lost_l, 2),
        "fuel_loss_percent": round(lost_l / moved * 100, 2) if moved else 0.0,
        "stock_net_lost_value": _r(sum(m["net_lost_value"] for m in sl["months"])),
        "card_mismatches": sum(1 for c in checks if c["status"] == "mismatch"),
        "card_not_entered": sum(1 for c in checks if c["status"] == "not_entered"),
        "banking_gap": bk["running_gap"],
        "days_not_closed": bk["days_not_closed"],
        "credit_owed": cr["total_owed"],
        "accounts_over_limit": sum(1 for a in cr["accounts"] if a["status"] == "over_limit"),
    }


@router.get("/station-comparison", dependencies=[Depends(require_owner)])
def station_comparison(date_from: Optional[str] = Query(None, alias="from"),
                       date_to: Optional[str] = Query(None, alias="to"),
                       ctx: dict = Depends(get_station_context)):
    from ...database import stations_registry
    from ...database.storage import get_station_storage
    _range(date_from, date_to)  # validate once
    rows = []
    for st in stations_registry.list_stations():
        sid = st.get("station_id") or st.get("id")
        if not sid or st.get("status") == "disabled" or st.get("is_test_station"):
            continue
        try:
            figures = station_figures(sid, get_station_storage(sid), date_from, date_to)
        except Exception as exc:
            figures = {"error": str(exc)}
        rows.append({"station_id": sid, "name": st.get("name") or sid, "location": st.get("location"), **figures})
    rows.sort(key=lambda r: r["name"] or "")
    return {"from": date_from, "to": date_to, "stations": rows}

