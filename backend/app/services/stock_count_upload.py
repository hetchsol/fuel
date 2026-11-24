"""
Opening stock count upload (lubricants, LPG cylinders, LPG accessories).

Before a station goes live on Forecourt counts, the owner counts every item
at a shift change, fills in the "Stock Count" sheet (Category | Product Code |
Name | Stores Qty | Forecourt Qty | Check) and uploads it. The upload is
previewed first, then applied all-or-nothing: each Stores and Forecourt
count that differs is set (as an `adjust` movement), and the station can go
live on those counts in the same step.

Only the figures in Stores change. No handover, shift or past record is
touched (forward-only).
"""
import hashlib
import io
from datetime import datetime
from typing import Optional

from fastapi import HTTPException

from ..database.station_files import load_station_json, save_station_json
from . import stock_service as svc

SHEET = "Stock Count"
CATEGORIES = ("lubricant", "lpg_accessory", "cylinder_full", "cylinder_empty")
HEADERS = ["Category", "Product Code", "Name", "Stores Qty", "Forecourt Qty", "Check"]
UPLOADS_FILE = "stock_count_uploads.json"
MAX_BYTES = 2_000_000
# Same sizes Stores seeds a full + empty item for (stores._CYLINDER_SIZES)
_CYLINDER_SIZES = [3, 6, 9, 19, 45, 48]


# ── which items the sheet must cover ────────────────────────────────

def _cylinder_sizes() -> list:
    try:
        from ..api.v1.lpg_daily import LPG_SIZES
        return sorted(set(_CYLINDER_SIZES) | set(LPG_SIZES))
    except Exception:
        return list(_CYLINDER_SIZES)


def expected_items(station_id: str) -> dict:
    """
    Every item the count must cover, in sheet order: what Stores already holds
    in these categories plus what going live would create (the lubricant and
    accessory price lists and the cylinder sizes). {item_key: {category,
    product_code, name, unit}}. Name comes from Stores, else the price list.
    """
    from ..api.v1.lubricants_daily import load_product_catalog
    from ..api.v1.lpg_daily import load_accessories_catalog

    items = svc.load_items(station_id)
    out: dict = {}

    def add(category, code, name, unit="ea"):
        code = str(code).strip()
        if not code:
            return
        key = f"{category}:{code}"
        if key in out:
            return
        existing = items.get(key) or {}
        out[key] = {"item_key": key, "category": category, "product_code": code,
                    "name": existing.get("name") or name or code, "unit": unit}

    lubes = load_product_catalog(station_id) or []
    for p in (lubes.values() if isinstance(lubes, dict) else lubes):
        if p.get("product_code"):
            add("lubricant", p["product_code"], p.get("description"))
    for a in load_accessories_catalog(station_id) or []:
        if a.get("product_code"):
            add("lpg_accessory", a["product_code"], a.get("description"))
    for size in _cylinder_sizes():
        add("cylinder_full", f"{size}kg", f"{size}kg cylinder (full)", "cylinder")
        add("cylinder_empty", f"{size}kg", f"{size}kg cylinder (empty)", "cylinder")
    # Items set up directly in Stores but missing from the price lists
    for key, it in sorted(items.items(), key=lambda kv: (kv[1].get("category", ""), kv[1].get("name", ""))):
        if it.get("category") in CATEGORIES:
            add(it["category"], it.get("product_code") or key.split(":", 1)[1], it.get("name"),
                it.get("unit") or "ea")
    order = {c: i for i, c in enumerate(CATEGORIES)}
    return dict(sorted(out.items(), key=lambda kv: order[kv[1]["category"]]))


# ── template ────────────────────────────────────────────────────────

def build_template(station_id: str) -> bytes:
    """The Stock Count sheet with this station's live product list and blank counts."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.formatting.rule import FormulaRule

    f = "Arial"
    norm, bold = Font(name=f, size=10), Font(name=f, size=10, bold=True)
    fill_in = PatternFill("solid", fgColor="FFF2CC")
    fill_calc = PatternFill("solid", fgColor="EDEDED")
    thin = Side(style="thin", color="BFBFBF")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    wb = Workbook()
    ws = wb.active
    ws.title = SHEET
    for i, (h, w) in enumerate(zip(HEADERS, [15, 18, 32, 12, 13, 30]), start=1):
        c = ws.cell(row=1, column=i, value=h)
        c.font = Font(name=f, size=10, bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="1F3864")
        c.border = border
        c.alignment = Alignment(vertical="center")
        ws.column_dimensions[c.column_letter].width = w
    ws.row_dimensions[1].height = 22
    ws.freeze_panes = "A2"

    rows = list(expected_items(station_id).values())
    last = len(rows) + 1
    for r, it in enumerate(rows, start=2):
        for i, v in enumerate((it["category"], it["product_code"], it["name"]), start=1):
            ws.cell(row=r, column=i, value=v)
        for i in range(1, 7):
            c = ws.cell(row=r, column=i)
            c.font, c.border = norm, border
            c.fill = fill_in if i in (4, 5) else fill_calc
        for col in "DE":
            ws[f"{col}{r}"].number_format = '#,##0;(#,##0);"-"'
        ws[f"F{r}"] = (f'=IF(OR(D{r}="",E{r}=""),"Enter both counts (0 if none)",'
                       f'IF(AND(ISNUMBER(D{r}),ISNUMBER(E{r}),D{r}>=0,E{r}>=0,D{r}=INT(D{r}),E{r}=INT(E{r})),'
                       f'"OK","Whole numbers only"))')
    if rows:
        rng = f"F2:F{last}"
        ws.conditional_formatting.add(rng, FormulaRule(formula=['F2="OK"'],
                                                       font=Font(name=f, size=10, bold=True, color="006100")))
        ws.conditional_formatting.add(rng, FormulaRule(formula=['F2<>"OK"'],
                                                       fill=PatternFill("solid", fgColor="F8CBAD")))
        ws.cell(row=last + 2, column=1, value="Not counted yet:").font = bold
        ws.cell(row=last + 2, column=3, value=f'=COUNTIF(F2:F{last},"<>OK")').font = bold

    hw = wb.create_sheet("How to use")
    hw.column_dimensions["A"].width = 100
    for i, t in enumerate([
        "Stock Count - Lubricants, LPG, Accessories",
        "",
        "1. Count at a shift change, with no attendant shift open.",
        "2. Type only in the yellow columns: Stores Qty (backroom) and Forecourt Qty (sales floor). Whole numbers; 0 if none.",
        "3. Count full and empty cylinders separately - they are separate rows.",
        "4. Done when every Check says OK and 'Not counted yet' at the bottom shows 0.",
        "5. Upload it on the Stores page (Opening stock upload).",
        "",
        "Do not change the grey columns or add rows. If a product is missing, add it in the system first and download a new sheet.",
    ], start=1):
        c = hw.cell(row=i, column=1, value=t)
        c.font = Font(name=f, size=14, bold=True) if i == 1 else norm
        c.alignment = Alignment(wrap_text=True)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ── parsing + checks ────────────────────────────────────────────────

def _text(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def _count(v):
    """(whole number, None) or (None, reason)."""
    if v is None or (isinstance(v, str) and not v.strip()):
        return None, "missing"
    if isinstance(v, bool):
        return None, "not a number"
    if isinstance(v, str):
        try:
            v = float(v.strip().replace(",", ""))
        except ValueError:
            return None, "not a number"
    if not isinstance(v, (int, float)):
        return None, "not a number"
    if v < 0:
        return None, "below zero"
    if float(v) != int(v):
        return None, "not a whole number"
    return int(v), None


def parse_workbook(content: bytes) -> list:
    """Rows of the Stock Count sheet, stopping at the first row with no category and no code."""
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="File is too large for a stock count sheet.")
    try:
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(content), data_only=True, read_only=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read the file. Upload the .xlsx stock count sheet.")
    ws = wb[SHEET] if SHEET in wb.sheetnames else wb.worksheets[0]
    rows_iter = ws.iter_rows(values_only=True)
    header = [_text(h).lower() for h in (next(rows_iter, None) or [])]
    cols = {}
    for name in HEADERS[:5]:
        if name.lower() not in header:
            raise HTTPException(status_code=400,
                                detail=f"Column '{name}' not found. Use the stock count sheet downloaded from this page.")
        cols[name] = header.index(name.lower())
    out = []
    for n, row in enumerate(rows_iter, start=2):
        row = list(row or [])
        get = lambda name: row[cols[name]] if cols[name] < len(row) else None
        category, code = _text(get("Category")).lower(), _text(get("Product Code"))
        if not category and not code:
            break
        out.append({"row": n, "category": category, "product_code": code, "name": _text(get("Name")),
                    "stores": get("Stores Qty"), "forecourt": get("Forecourt Qty")})
    wb.close()
    return out


def build_preview(station_id: str, content: bytes, file_name: str, blocks: list) -> dict:
    """
    Check every row against Stores and say what applying would change.
    `blocks` are station-level reasons not to apply now (mid-shift, already
    live, ...), worked out by the caller. Writes nothing.
    """
    expected = expected_items(station_id)
    # Product codes are matched ignoring capitals; the system's own code is used.
    by_lower = {k.lower(): k for k in expected}
    items = svc.load_items(station_id)
    rows, seen = [], {}
    for r in parse_workbook(content):
        errors = []
        key = None
        if r["category"] not in CATEGORIES:
            errors.append("Category must be lubricant, lpg_accessory, cylinder_full or cylinder_empty")
        elif not r["product_code"]:
            errors.append("Product code missing")
        else:
            key = by_lower.get(f"{r['category']}:{r['product_code']}".lower())
            if not key:
                errors.append("Not in the system - add the product first, then download a new sheet")
            elif key in seen:
                errors.append(f"Same item as row {seen[key]}")
            else:
                seen[key] = r["row"]
        counts = {}
        for bin, label in (("stores", "Stores"), ("forecourt", "Forecourt")):
            qty, why = _count(r[bin])
            if why == "missing":
                errors.append(f"{label} count missing (enter 0 if none)")
            elif why:
                errors.append(f"{label} count is {why}")
            else:
                counts[bin] = qty
        it = items.get(key) if key else None
        rows.append({
            "row": r["row"], "item_key": key, "category": r["category"], "product_code": r["product_code"],
            "name": (expected[key]["name"] if key else r["name"]) or r["product_code"],
            "stores_now": (it or {}).get("stores") if it else None,
            "forecourt_now": (it or {}).get("forecourt") if it else None,
            "stores_new": counts.get("stores"), "forecourt_new": counts.get("forecourt"),
            "is_new_item": bool(key) and not it,
            "errors": errors,
        })
    for row in rows:
        row["stores_changes"] = row["stores_new"] is not None and row["stores_new"] != (row["stores_now"] or 0)
        row["forecourt_changes"] = row["forecourt_new"] is not None and row["forecourt_new"] != (row["forecourt_now"] or 0)

    missing = [{"item_key": k, "name": v["name"]} for k, v in expected.items() if k not in seen]
    error_rows = sum(1 for r in rows if r["errors"])
    return {
        "file_name": file_name,
        "file_hash": hashlib.sha256(content).hexdigest(),
        "rows": rows,
        "missing": missing,
        "error_rows": error_rows,
        "stores_changes": sum(1 for r in rows if r["stores_changes"] and not r["errors"]),
        "forecourt_changes": sum(1 for r in rows if r["forecourt_changes"] and not r["errors"]),
        "blocks": blocks,
        "can_apply": not blocks and not error_rows and not missing and bool(rows),
    }


# ── apply ───────────────────────────────────────────────────────────

def load_uploads(station_id: str) -> dict:
    return load_station_json(station_id, UPLOADS_FILE, default={})


def apply_upload(station_id: str, content: bytes, file_name: str, blocks: list,
                 performed_by: str) -> dict:
    """
    Re-check the file (counts may have moved since the preview) and, only if
    every row is clean and nothing blocks it, create any items Stores does not
    have yet and set the counts. All or nothing.
    """
    preview = build_preview(station_id, content, file_name, blocks)
    if not preview["can_apply"]:
        reasons = list(blocks)
        if preview["error_rows"]:
            reasons.append(f"{preview['error_rows']} row(s) have problems")
        if preview["missing"]:
            reasons.append(f"{len(preview['missing'])} item(s) are not on the sheet")
        if not preview["rows"]:
            reasons.append("the sheet has no rows")
        raise HTTPException(status_code=400, detail="Nothing was changed: " + "; ".join(reasons) + ".")

    expected = expected_items(station_id)
    created = 0
    for row in preview["rows"]:
        if row["is_new_item"]:
            e = expected[row["item_key"]]
            svc.upsert_item(station_id, e["category"], e["product_code"], e["name"], e["unit"])
            created += 1

    upload_id = f"CU-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    targets = {r["item_key"]: {"stores": r["stores_new"], "forecourt": r["forecourt_new"]} for r in preview["rows"]}
    changes = svc.set_counts_bulk(station_id, targets, performed_by,
                                  reason=f"Opening count upload {upload_id}", ref=upload_id)
    record = {
        "upload_id": upload_id, "file_name": file_name, "file_hash": preview["file_hash"],
        "uploaded_by": performed_by, "uploaded_at": datetime.now().isoformat(),
        "rows": len(preview["rows"]), "items_created": created,
        "stores_changed": sum(1 for c in changes if c["bin"] == "stores"),
        "forecourt_changed": sum(1 for c in changes if c["bin"] == "forecourt"),
        "went_live": False,
    }
    uploads = load_uploads(station_id)
    uploads[upload_id] = record
    save_station_json(station_id, UPLOADS_FILE, uploads)
    return record


def mark_went_live(station_id: str, upload_id: str):
    uploads = load_uploads(station_id)
    if upload_id in uploads:
        uploads[upload_id]["went_live"] = True
        save_station_json(station_id, UPLOADS_FILE, uploads)
