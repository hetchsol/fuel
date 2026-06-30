"""
Backup & Restore API

Backups are stored in PostgreSQL (persistent on Render) so they survive
server restarts and redeploys. Each snapshot is individually downloadable.

Storage layout (via station_files / PostgreSQL):
  backup_index.json          — list of snapshot metadata
  backup_YYYY-MM-DD.json.gz  — compressed snapshot data (base64-encoded in DB)
"""
import base64
import gzip
import io
import json
import logging
import subprocess
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from ...database.station_files import load_station_json, save_station_json
from ...database.storage import STATIONS_STORAGE, _storage_locks, get_station_storage, save_station_storage
from ...services.audit_service import log_audit_event
from .auth import get_station_context, require_owner, require_manager_or_owner

logger = logging.getLogger(__name__)
router = APIRouter()

_MAX_SNAPSHOTS = 30

# Station JSON files that live outside the main STORAGE dict
_BACKUP_JSON_FILES = [
    "attendant_handovers.json",
    "tank_readings.json",
    "tank_deliveries.json",
    "lpg_daily_entries.json",
    "lpg_accessories_daily.json",
    "lpg_pricing.json",
    "lubricant_daily_entries.json",
    "lubricant_products.json",
    "validated_readings.json",
    "attendant_readings.json",
    "daily_close_offs.json",
    "customers.json",
    "attendant_nozzle_assignments.json",
    "safe_deposits.json",
    "reconciliations.json",
    "store_products.json",
    "store_transactions.json",
    "notifications.json",
    "audit_log.json",
]


# ── Internal helpers ──────────────────────────────────────────────────────────

def _build_payload(station_id: str) -> dict:
    """Collect all station data into a single serialisable dict."""
    storage = get_station_storage(station_id)

    station_files: dict = {}
    for filename in _BACKUP_JSON_FILES:
        data = load_station_json(station_id, filename, default=None)
        if data is not None:
            station_files[filename] = data

    users_data = None
    from ...database.db import is_db_active
    if is_db_active():
        try:
            from ...database.db import db_get_all_users
            users_data = db_get_all_users()
        except Exception:
            pass

    return {
        "backup_version": "1",
        "station_id": station_id,
        "created_at": datetime.now().isoformat(),
        "storage": storage,
        "station_files": station_files,
        "users": users_data,
    }


def _compress(payload: dict) -> bytes:
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
        gz.write(json.dumps(payload, default=str).encode("utf-8"))
    return buf.getvalue()


def _load_index(station_id: str) -> list:
    return load_station_json(station_id, "backup_index.json", default=[]) or []


def _save_index(station_id: str, index: list):
    save_station_json(station_id, "backup_index.json", index)


def _prune_index(station_id: str, index: list) -> list:
    """Remove snapshots beyond _MAX_SNAPSHOTS, deleting their data files too."""
    index_sorted = sorted(index, key=lambda e: e["date"], reverse=True)
    to_delete = index_sorted[_MAX_SNAPSHOTS:]
    for entry in to_delete:
        try:
            save_station_json(station_id, f"backup_{entry['date']}.json.gz", None)
        except Exception:
            pass
    return index_sorted[:_MAX_SNAPSHOTS]


# ── Public: auto-backup called from day close-off ─────────────────────────────

def trigger_auto_backup(station_id: str, triggered_by: str = "system"):
    """
    Save a dated snapshot to PostgreSQL via station_files.
    Called automatically on every day close-off. Never raises.
    """
    try:
        payload = _build_payload(station_id)
        date_str = datetime.now().strftime("%Y-%m-%d")
        compressed = _compress(payload)

        # Store compressed bytes as base64 so they fit in JSON/JSONB
        save_station_json(
            station_id,
            f"backup_{date_str}.json.gz",
            base64.b64encode(compressed).decode("ascii"),
        )

        # Update index
        index = _load_index(station_id)
        # Replace existing entry for this date if present
        index = [e for e in index if e["date"] != date_str]
        index.append({
            "date": date_str,
            "created_at": payload["created_at"],
            "triggered_by": triggered_by,
            "size_bytes": len(compressed),
        })
        index = _prune_index(station_id, index)
        _save_index(station_id, index)

        logger.info(f"[backup] Snapshot saved to DB: {date_str} ({len(compressed):,} bytes, by={triggered_by})")

    except Exception as e:
        logger.error(f"[backup] Auto-backup failed for {station_id}: {e}")


def get_last_backup_at(station_id: str) -> str | None:
    index = _load_index(station_id)
    if not index:
        return None
    latest = max(index, key=lambda e: e["date"])
    return latest.get("created_at")


# ── GET /backup/status ────────────────────────────────────────────────────────

@router.get("/status", dependencies=[Depends(require_manager_or_owner)])
async def backup_status(ctx: dict = Depends(get_station_context)):
    """List all saved snapshots with metadata. Manager+."""
    station_id = ctx["station_id"]
    index = _load_index(station_id)
    index_sorted = sorted(index, key=lambda e: e["date"], reverse=True)
    return {
        "last_backup_at": get_last_backup_at(station_id),
        "snapshots": index_sorted,
        "snapshot_count": len(index_sorted),
    }


# ── GET /backup/snapshots/{date} ──────────────────────────────────────────────

@router.get("/snapshots/{date}", dependencies=[Depends(require_manager_or_owner)])
async def download_snapshot(date: str, ctx: dict = Depends(get_station_context)):
    """Download a specific saved auto-backup snapshot by date (YYYY-MM-DD). Manager+."""
    station_id = ctx["station_id"]

    b64_data = load_station_json(station_id, f"backup_{date}.json.gz", default=None)
    if not b64_data:
        raise HTTPException(status_code=404, detail=f"No snapshot found for {date}.")

    try:
        compressed = base64.b64decode(b64_data)
    except Exception:
        raise HTTPException(status_code=500, detail="Snapshot data is corrupted.")

    fname = f"fuel_backup_{station_id}_{date}.json.gz"
    return StreamingResponse(
        io.BytesIO(compressed),
        media_type="application/gzip",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )


# ── GET /backup/download ──────────────────────────────────────────────────────

@router.get("/download", dependencies=[Depends(require_manager_or_owner)])
async def download_backup(ctx: dict = Depends(get_station_context)):
    """Export a live snapshot of all current station data. Manager+."""
    station_id = ctx["station_id"]
    payload = _build_payload(station_id)
    date_str = datetime.now().strftime("%Y-%m-%d_%H-%M")
    fname = f"fuel_backup_{station_id}_{date_str}.json.gz"

    compressed = _compress(payload)

    try:
        log_audit_event(
            station_id=station_id,
            action="backup_download",
            performed_by=ctx.get("username", ""),
            entity_type="backup",
            entity_id=date_str,
            details={"filename": fname, "size_bytes": len(compressed)},
        )
    except Exception:
        pass

    return StreamingResponse(
        io.BytesIO(compressed),
        media_type="application/gzip",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )


# ── POST /backup/restore ──────────────────────────────────────────────────────

@router.post("/restore", dependencies=[Depends(require_owner)])
async def restore_backup(
    file: UploadFile = File(...),
    ctx: dict = Depends(get_station_context),
):
    """
    Restore station data from a .json.gz backup file. Owner only.
    Accepts files downloaded from this system or from USB media.
    """
    station_id = ctx["station_id"]

    if not (file.filename or "").endswith(".json.gz"):
        raise HTTPException(status_code=400, detail="File must be a .json.gz backup file.")

    try:
        raw = await file.read()
        payload = json.loads(gzip.decompress(raw).decode("utf-8"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read backup file: {e}")

    if payload.get("backup_version") != "1":
        raise HTTPException(status_code=400, detail="Unrecognised backup format.")

    if payload.get("storage"):
        with _storage_locks[station_id]:
            STATIONS_STORAGE[station_id] = payload["storage"]
        save_station_storage(station_id)

    for filename, data in (payload.get("station_files") or {}).items():
        save_station_json(station_id, filename, data)

    try:
        log_audit_event(
            station_id=station_id,
            action="backup_restore",
            performed_by=ctx.get("username", ""),
            entity_type="backup",
            entity_id=payload.get("created_at", ""),
            details={
                "source_date": payload.get("created_at"),
                "source_station": payload.get("station_id"),
            },
        )
    except Exception:
        pass

    return {
        "status": "ok",
        "restored_from": payload.get("created_at"),
        "station_id": station_id,
    }


# ── GET /backup/pg-dump ───────────────────────────────────────────────────────

@router.get("/pg-dump", dependencies=[Depends(require_owner)])
async def pg_dump_backup(ctx: dict = Depends(get_station_context)):
    """
    Full PostgreSQL dump (.sql.gz). Owner only.
    Requires DATABASE_URL and pg_dump on the server.
    """
    from ...database.db import DATABASE_URL, is_db_active

    if not DATABASE_URL or not is_db_active():
        raise HTTPException(
            status_code=400,
            detail="PostgreSQL is not configured. This endpoint requires DATABASE_URL.",
        )

    try:
        subprocess.run(["pg_dump", "--version"], capture_output=True, timeout=5, check=True)
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        raise HTTPException(status_code=400, detail="pg_dump is not available on this server.")

    try:
        result = subprocess.run(
            ["pg_dump", DATABASE_URL, "--no-password"],
            capture_output=True,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="pg_dump timed out.")

    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=f"pg_dump failed: {result.stderr.decode()[:500]}")

    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
        gz.write(result.stdout)
    buf.seek(0)

    date_str = datetime.now().strftime("%Y-%m-%d_%H-%M")
    fname = f"fuel_db_dump_{date_str}.sql.gz"

    try:
        log_audit_event(
            station_id=ctx["station_id"],
            action="pg_dump",
            performed_by=ctx.get("username", ""),
            entity_type="backup",
            entity_id=date_str,
            details={"filename": fname},
        )
    except Exception:
        pass

    return StreamingResponse(
        buf,
        media_type="application/gzip",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )
