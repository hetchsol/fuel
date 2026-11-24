"""
Opening stock count upload: template, checks, all-or-nothing apply, the
blocks (mid-shift, already live, open stock take) and go-live in one step.

All persistence goes to an in-memory dict so no station files are touched.
"""
import asyncio
import copy
import io

import pytest
from fastapi import HTTPException, UploadFile
from openpyxl import load_workbook

from app.services import stock_service as svc
from app.services import stock_count_upload as scu
from app.api.v1 import stores, lubricants_daily, lpg_daily, attendant_handover as ah

ST = "ST_TEST_CU"
LUBES = [{"product_code": "EO-1L", "description": "Engine Oil 1L", "category": "Engine Oil"},
         {"product_code": "GO-4L", "description": "Gear Oil 4L", "category": "Gear Oil"}]
ACCS = [{"product_code": "ACC-HOSE", "description": "Gas Hose"}]
N_ITEMS = 2 + 1 + 2 * len(scu._cylinder_sizes())


@pytest.fixture
def mem(monkeypatch):
    files: dict = {(ST, "lubricant_products.json"): LUBES, (ST, "lpg_accessories_pricing.json"): ACCS}

    def load(station_id, name, default=None):
        return copy.deepcopy(files.get((station_id, name), default))

    def save(station_id, name, data):
        files[(station_id, name)] = copy.deepcopy(data)

    for mod in (svc, scu, stores, lubricants_daily, lpg_daily, ah):
        if hasattr(mod, "load_station_json"):
            monkeypatch.setattr(mod, "load_station_json", load)
        if hasattr(mod, "save_station_json"):
            monkeypatch.setattr(mod, "save_station_json", save)
    monkeypatch.setattr(svc, "log_audit_event", lambda **k: None)
    monkeypatch.setattr(svc, "create_notification", lambda **k: None)
    monkeypatch.setattr(stores, "log_audit_event", lambda **k: None)
    return files


def _sheet(fill=lambda key: (5, 2), edit=None) -> bytes:
    """Download the template and fill the counts; `edit(ws)` can then break rows."""
    wb = load_workbook(io.BytesIO(scu.build_template(ST)))
    ws = wb["Stock Count"]
    for r in range(2, ws.max_row + 1):
        cat, code = ws.cell(r, 1).value, ws.cell(r, 2).value
        if not cat or not code:
            break
        s, f = fill(f"{cat}:{code}")
        ws.cell(r, 4, s)
        ws.cell(r, 5, f)
    if edit:
        edit(ws)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _row_of(ws, key):
    for r in range(2, ws.max_row + 1):
        if f"{ws.cell(r, 1).value}:{ws.cell(r, 2).value}" == key:
            return r
    raise AssertionError(key)


def _blocks(storage=None):
    return stores._count_upload_blocks(ST, storage or {"shifts": {}})


def _apply_route(content, go_live, storage=None):
    up = UploadFile(file=io.BytesIO(content), filename="Stock_Count.xlsx")
    ctx = {"station_id": ST, "storage": storage or {"shifts": {}}, "username": "owner1"}
    return asyncio.run(stores.count_upload_apply(file=up, go_live=go_live, ctx=ctx))


# ── template ────────────────────────────────────────────────────────

def test_template_lists_every_item_with_blank_counts(mem):
    rows = scu.parse_workbook(scu.build_template(ST))
    keys = [f"{r['category']}:{r['product_code']}" for r in rows]
    assert len(keys) == N_ITEMS == len(set(keys))
    assert keys[:3] == ["lubricant:EO-1L", "lubricant:GO-4L", "lpg_accessory:ACC-HOSE"]
    assert "cylinder_full:9kg" in keys and "cylinder_empty:9kg" in keys
    assert all(r["stores"] is None and r["forecourt"] is None for r in rows)


def test_template_includes_items_set_up_only_in_stores(mem):
    svc.upsert_item(ST, "lubricant", "XTRA", "Extra oil")
    svc.upsert_item(ST, "accessory", "MISC", "Not counted")      # outside these categories
    keys = list(scu.expected_items(ST))
    assert "lubricant:XTRA" in keys and "accessory:MISC" not in keys


# ── checks ──────────────────────────────────────────────────────────

def test_clean_sheet_can_apply(mem):
    p = scu.build_preview(ST, _sheet(), "f.xlsx", _blocks())
    assert p["can_apply"] and p["error_rows"] == 0 and not p["missing"]
    assert p["stores_changes"] == N_ITEMS and p["forecourt_changes"] == N_ITEMS
    assert all(r["is_new_item"] for r in p["rows"])


def test_each_bad_row_is_flagged(mem):
    def edit(ws):
        ws.cell(_row_of(ws, "lubricant:EO-1L"), 4, 2.5)
        ws.cell(_row_of(ws, "lubricant:GO-4L"), 5).value = None
        ws.cell(_row_of(ws, "lpg_accessory:ACC-HOSE"), 4, -1)
        r = _row_of(ws, "cylinder_full:3kg"); ws.cell(r, 2, "12kg")
        r = _row_of(ws, "cylinder_full:6kg"); ws.cell(r, 1, "accessory")
        r = _row_of(ws, "cylinder_full:9kg"); ws.cell(r, 2, "19kg")       # duplicates 19kg row
    p = scu.build_preview(ST, _sheet(edit=edit), "f.xlsx", _blocks())
    errs = {r["row"]: " | ".join(r["errors"]) for r in p["rows"] if r["errors"]}
    text = " || ".join(errs.values())
    assert "Stores count is not a whole number" in text
    assert "Forecourt count missing" in text
    assert "Stores count is below zero" in text
    assert "Not in the system" in text
    assert "Category must be" in text
    assert "Same item as row" in text
    assert not p["can_apply"]
    # rows renamed away leave their real items uncovered
    assert {m["item_key"] for m in p["missing"]} >= {"cylinder_full:3kg", "cylinder_full:6kg"}


def test_codes_match_ignoring_capitals(mem):
    def edit(ws):
        ws.cell(_row_of(ws, "lubricant:EO-1L"), 2, "eo-1l")
    p = scu.build_preview(ST, _sheet(edit=edit), "f.xlsx", _blocks())
    assert p["can_apply"]
    assert p["rows"][0]["item_key"] == "lubricant:EO-1L"


def test_counts_typed_as_text_are_accepted(mem):
    def edit(ws):
        ws.cell(_row_of(ws, "lubricant:EO-1L"), 4, " 12 ")
    p = scu.build_preview(ST, _sheet(edit=edit), "f.xlsx", _blocks())
    assert p["can_apply"] and p["rows"][0]["stores_new"] == 12


def test_wrong_file_is_rejected(mem):
    with pytest.raises(HTTPException) as e:
        scu.parse_workbook(b"not a spreadsheet")
    assert e.value.status_code == 400


# ── apply ───────────────────────────────────────────────────────────

def test_apply_sets_counts_and_creates_items(mem):
    counts = {"lubricant:EO-1L": (10, 4), "cylinder_empty:9kg": (0, 7)}
    rec = scu.apply_upload(ST, _sheet(lambda k: counts.get(k, (0, 0))), "f.xlsx", _blocks(), "owner1")
    items = svc.load_items(ST)
    assert len(items) == N_ITEMS and rec["items_created"] == N_ITEMS
    assert (items["lubricant:EO-1L"]["stores"], items["lubricant:EO-1L"]["forecourt"]) == (10, 4)
    assert items["cylinder_empty:9kg"]["forecourt"] == 7
    moves = svc.load_movements(ST)
    assert len(moves) == 3 and all(m["type"] == "adjust" and m["ref"] == rec["upload_id"] for m in moves)
    assert rec["stores_changed"] == 1 and rec["forecourt_changed"] == 2
    assert rec["upload_id"] in scu.load_uploads(ST)


def test_reapplying_same_sheet_changes_nothing(mem):
    content = _sheet(lambda k: (3, 1))
    scu.apply_upload(ST, content, "f.xlsx", _blocks(), "owner1")
    before = len(svc.load_movements(ST))
    rec = scu.apply_upload(ST, content, "f.xlsx", _blocks(), "owner1")
    assert rec["stores_changed"] == rec["forecourt_changed"] == rec["items_created"] == 0
    assert len(svc.load_movements(ST)) == before


def test_one_bad_row_changes_nothing(mem):
    svc.upsert_item(ST, "lubricant", "EO-1L", "Engine Oil 1L")
    before = copy.deepcopy(svc.load_items(ST))

    def edit(ws):
        ws.cell(_row_of(ws, "lubricant:GO-4L"), 4, 1.5)
    with pytest.raises(HTTPException) as e:
        scu.apply_upload(ST, _sheet(edit=edit), "f.xlsx", _blocks(), "owner1")
    assert "1 row(s) have problems" in e.value.detail
    assert svc.load_items(ST) == before and svc.load_movements(ST) == []


def test_a_missing_item_changes_nothing(mem):
    def edit(ws):
        r = _row_of(ws, "lpg_accessory:ACC-HOSE")
        for c in range(1, 6):
            ws.cell(r, c).value = None
    # Blanking a row ends the sheet there, so everything after it is missing too
    with pytest.raises(HTTPException) as e:
        scu.apply_upload(ST, _sheet(edit=edit), "f.xlsx", _blocks(), "owner1")
    assert "not on the sheet" in e.value.detail
    assert svc.load_items(ST) == {}


# ── blocks ──────────────────────────────────────────────────────────

def _shift_started(mem, handed_over=False):
    mem[(ST, "opening_verifications.json")] = {
        "S1-A1": {"shift_id": "S1", "attendant_id": "A1", "attendant_name": "Mary", "verified_at": "2026-12-01T06:00:00"}}
    if handed_over:
        mem[(ST, "attendant_handovers.json")] = {
            "HO-1": {"handover_id": "HO-1", "shift_id": "S1", "attendant_id": "A1", "status": "submitted"}}
    return {"shifts": {"S1": {"shift_id": "S1", "status": "active"}}}


def test_attendant_mid_shift_blocks(mem):
    storage = _shift_started(mem)
    blocks = _blocks(storage)
    assert len(blocks) == 1 and "Mary" in blocks[0]
    with pytest.raises(HTTPException):
        scu.apply_upload(ST, _sheet(), "f.xlsx", blocks, "owner1")
    assert svc.load_items(ST) == {}


def test_handed_over_attendant_does_not_block(mem):
    assert _blocks(_shift_started(mem, handed_over=True)) == []


def test_closed_shift_does_not_block(mem):
    storage = _shift_started(mem)
    storage["shifts"]["S1"]["status"] = "completed"
    assert _blocks(storage) == []


def test_open_stock_take_blocks(mem):
    svc.upsert_item(ST, "lubricant", "EO-1L", "Engine Oil 1L")
    svc.create_stock_take(ST, "forecourt", performed_by="mgr")
    assert any("stock take is still open" in b for b in _blocks())


def test_already_live_blocks(mem):
    svc.set_forecourt_live(ST, "owner1", "current_counts")
    assert any("already live" in b for b in _blocks())


# ── go-live in the same step ────────────────────────────────────────

def test_apply_with_go_live_then_sales_come_off_uploaded_counts(mem):
    res = _apply_route(_sheet(lambda k: (10, 6) if k == "lubricant:EO-1L" else (0, 0)), go_live=True)
    assert res["went_live"] and res["live_since"]
    assert svc.forecourt_live_since(ST) == res["live_since"]
    assert scu.load_uploads(ST)[res["upload_id"]]["went_live"] is True

    # First shift after go-live: a sale of 2 comes off the uploaded 6
    handover = {"handover_id": "HO-9", "counts_live": True,
                "stock_snapshot": {"lubricants": [{"product_code": "EO-1L", "sold": 2, "damaged": 0}]}}
    svc.apply_handover_sales(ST, handover)
    item = svc.load_items(ST)["lubricant:EO-1L"]
    assert (item["stores"], item["forecourt"]) == (10, 4)

    # A second upload is refused once live
    with pytest.raises(HTTPException) as e:
        _apply_route(_sheet(), go_live=False)
    assert "already live" in e.value.detail


def test_apply_without_go_live_leaves_station_not_live(mem):
    res = _apply_route(_sheet(), go_live=False)
    assert not res["went_live"] and res["live_since"] is None
    assert svc.forecourt_live_since(ST) is None


# ── over HTTP (multipart file + go_live form field, owner gate) ────

@pytest.fixture
def mem_any_station(mem, monkeypatch):
    """Same in-memory files, whatever station the logged-in owner resolves to."""
    def load(station_id, name, default=None):
        return copy.deepcopy(mem.get((ST, name), default))

    def save(station_id, name, data):
        mem[(ST, name)] = copy.deepcopy(data)

    for mod in (svc, scu, stores, lubricants_daily, lpg_daily, ah):
        if hasattr(mod, "load_station_json"):
            monkeypatch.setattr(mod, "load_station_json", load)
        if hasattr(mod, "save_station_json"):
            monkeypatch.setattr(mod, "save_station_json", save)
    monkeypatch.setattr(stores, "_attendants_mid_shift", lambda station_id, storage: [])
    return mem


def test_http_template_preview_apply_and_go_live(client, owner_headers, mem_any_station):
    auth = {k: v for k, v in owner_headers.items() if k.lower() != "content-type"}
    res = client.get("/api/v1/stores/count-template", headers=auth)
    assert res.status_code == 200
    assert "attachment" in res.headers["content-disposition"]
    assert len(scu.parse_workbook(res.content)) == N_ITEMS

    content = _sheet(lambda k: (4, 3))
    xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    res = client.post("/api/v1/stores/count-upload/preview", headers=auth,
                      files={"file": ("Stock_Count.xlsx", content, xlsx)})
    assert res.status_code == 200, res.text
    assert res.json()["can_apply"] is True
    assert svc.load_items(ST) == {}                     # preview writes nothing

    res = client.post("/api/v1/stores/count-upload/apply", headers=auth,
                      files={"file": ("Stock_Count.xlsx", content, xlsx)}, data={"go_live": "true"})
    assert res.status_code == 200, res.text
    assert res.json()["went_live"] is True
    assert svc.load_items(ST)["lubricant:EO-1L"]["forecourt"] == 3

    res = client.post("/api/v1/stores/count-upload/preview", headers=auth,
                      files={"file": ("notes.csv", b"a,b", "text/csv")})
    assert res.status_code == 400


def test_http_non_owner_is_refused(client, staff_token, mem_any_station):
    res = client.get("/api/v1/stores/count-template", headers={"Authorization": f"Bearer {staff_token}"})
    assert res.status_code == 403
