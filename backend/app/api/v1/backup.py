"""
Backup & Restore API
On-demand download, restore from upload, auto-backup on day close-off, and pg_dump.
"""
import gzip
import io
import json
import logging
import os
import subprocess
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from ...database.station_files import STORAGE_ROOT, load_station_json, save_station_json
from ...database.storage import STATIONS_STORAGE, _storage_locks, get_station_storage, save_station_storage
from ...services.audit_service import log_audit_event
from .auth import get_station_context, require_owner

logger = logging.getLogger(__name__)
router = APIRouter()

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

# In-memory record of last successful backup per station
_last_backup: dict[str, str] = {}


def _build_payload(station_id: str) -> dict:
    """Collect all data for a station into a single serialisable dict."""
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


def _backup_dir(station_id: str) -> str:
    path = os.path.normpath(os.path.join(STORAGE_ROOT, "..", "backups", station_id))
    os.makedirs(path, exist_ok=True)
    return path


def _prune(backup_dir: str):
    """Keep the 30 most recent daily snapshots."""
    try:
        files = sorted(
            [f for f in os.listdir(backup_dir) if f.startswith("backup_") and f.endswith(".json.gz")],
            reverse=True,
        )
        for old in files[30:]:
            os.remove(os.path.join(backup_dir, old))
    except Exception:
        pass


def trigger_auto_backup(station_id: str, triggered_by: str = "system"):
    """
    Write a dated snapshot to backups/<station_id>/backup_YYYY-MM-DD.json.gz.
    Called automatically on day close-off. Never raises — failures are logged only.
    """
    try:
        payload = _build_payload(station_id)
        date_str = datetime.now().strftime("%Y-%m-%d")
        filepath = os.path.join(_backup_dir(station_id), f"backup_{date_str}.json.gz")
        with gzip.open(filepath, "wt", encoding="utf-8") as f:
            json.dump(payload, f, default=str)
        _last_backup[station_id] = datetime.now().isoformat()
        logger.info(f"[backup] Snapshot written: {filepath} (by={triggered_by})")
        _prune(_backup_dir(station_id))
    except Exception as e:
        logger.error(f"[backup] Auto-backup failed for {station_id}: {e}")


def get_last_backup_at(station_id: str) -> str | None:
    return _last_backup.get(station_id)


# ── GET /backup/status ────────────────────────────────────────────────────────

@router.get("/status", dependencies=[Depends(require_owner)])
async def backup_status(ctx: dict = Depends(get_station_context)):
    """Return last backup time and list of available snapshots. Owner only."""
    station_id = ctx["station_id"]
    bdir = _backup_dir(station_id)
    files = sorted(
        [f for f in os.listdir(bdir) if f.startswith("backup_") and f.endswith(".json.gz")],
        reverse=True,
    )
    return {
        "last_backup_at": get_last_backup_at(station_id),
        "snapshots": files[:30],
        "snapshot_count": len(files),
    }


# ── GET /backup/download ──────────────────────────────────────────────────────

@router.get("/download", dependencies=[Depends(require_owner)])
async def download_backup(ctx: dict = Depends(get_station_context)):
    """Export all station data as a gzipped JSON file. Owner only."""
    station_id = ctx["station_id"]
    payload = _build_payload(station_id)
    date_str = datetime.now().strftime("%Y-%m-%d_%H-%M")
    fname = f"fuel_backup_{station_id}_{date_str}.json.gz"

    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
        gz.write(json.dumps(payload, default=str).encode("utf-8"))
    buf.seek(0)

    try:
        log_audit_event(
            station_id=station_id,
            action="backup_download",
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


# ── POST /backup/restore ──────────────────────────────────────────────────────

@router.post("/restore", dependencies=[Depends(require_owner)])
async def restore_backup(
    file: UploadFile = File(...),
    ctx: dict = Depends(get_station_context),
):
    """
    Restore station data from a .json.gz backup file. Owner only.
    Overwrites current in-memory state and persists immediately.
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

    # Restore in-memory storage dict
    if payload.get("storage"):
        with _storage_locks[station_id]:
            STATIONS_STORAGE[station_id] = payload["storage"]
        save_station_storage(station_id)

    # Restore station JSON files
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
    Trigger a full PostgreSQL dump (.sql.gz). Owner only.
    Requires DATABASE_URL to be configured and pg_dump to be available on the server.
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
