"""
Tests for the tank-calibration upload parser: must tolerate real-world
spreadsheet variants (data on a non-active sheet, comma decimals, header rows)
and surface a clear "Found N" message when there genuinely isn't enough data.
"""
import io

import pytest
from openpyxl import Workbook

from app.database import stations_registry


def _xlsx_bytes(builder) -> bytes:
    """Return a workbook (built by `builder(wb)`) serialised to bytes."""
    wb = Workbook()
    wb.remove(wb.active)
    builder(wb)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()


@pytest.fixture
def tank_st001():
    """Seed a tank directly into the ST001 storage so calibration uploads work."""
    from app.database.storage import get_station_storage
    stations_registry.STATIONS.setdefault("ST001", {
        "station_id": "ST001", "name": "Default", "status": "active",
    })
    storage = get_station_storage("ST001")
    storage.setdefault("tanks", {})["TANK-CAL-1"] = {
        "tank_id": "TANK-CAL-1", "fuel_type": "Diesel",
    }
    return "TANK-CAL-1"


def _upload(client, owner_headers, tank_id, content: bytes):
    return client.post(
        f"/api/v1/settings/tank-calibration/upload?tank_id={tank_id}",
        headers={k: v for k, v in owner_headers.items() if k != "Content-Type"},
        files={"file": ("upload.xlsx", content,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )


def test_data_on_non_active_sheet_still_parses(client, owner_headers, tank_st001):
    """Picks the sheet with the most dip/volume pairs (was a 'Found 0' case)."""
    def build(wb):
        info = wb.create_sheet("Info")
        info["A1"] = "Tank manufacturer notes go here."
        data = wb.create_sheet("Chart")
        data.append(["Dip (cm)", "Volume (L)"])
        for d, v in [(0, 0), (5, 250), (10, 520), (15, 1100), (20, 1850), (25, 2700)]:
            data.append([d, v])
    res = _upload(client, owner_headers, tank_st001, _xlsx_bytes(build))
    assert res.status_code == 200, res.text
    assert res.json()["message"].endswith(f"data points for {tank_st001}")


def test_comma_decimal_locale_parses(client, owner_headers, tank_st001):
    """European 10,5 must coerce to 10.5 rather than being silently dropped."""
    def build(wb):
        ws = wb.create_sheet("Calibration")
        ws.append(["Dip (cm)", "Volume (L)"])
        for d, v in [("0", "0"), ("5,5", "250,2"), ("10,5", "520,1"),
                     ("15,5", "1100,7"), ("20,5", "1850,3"), ("25,5", "2700,8")]:
            ws.append([d, v])
    res = _upload(client, owner_headers, tank_st001, _xlsx_bytes(build))
    assert res.status_code == 200, res.text


def test_too_few_points_gives_clear_error(client, owner_headers, tank_st001):
    def build(wb):
        ws = wb.create_sheet("Chart")
        ws.append(["Dip (cm)", "Volume (L)"])
        ws.append([0, 0])
        ws.append([10, 520])
    res = _upload(client, owner_headers, tank_st001, _xlsx_bytes(build))
    assert res.status_code == 400
    detail = res.json()["detail"]
    assert "Found 2" in detail
    assert "column A" in detail and "column B" in detail


def test_template_endpoint_returns_xlsx(client):
    res = client.get("/api/v1/settings/tank-calibration/template")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    # xlsx is a zip — first 2 bytes are 'PK'.
    assert res.content[:2] == b"PK"
