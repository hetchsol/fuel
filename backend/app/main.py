
import os
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import router
from app.database.stations_registry import load_stations
import app.database.stations_registry as stations_registry
from app.database.station_files import migrate_existing_data
from app.database.storage import get_station_storage, save_all_stations_storage
from app.database.seed_defaults import seed_station_defaults
from app.database.db import init_db, close_db, is_db_active, DATABASE_URL
from app.services.shift_auto_close import check_and_close_stale_shifts
import app.database.storage as storage_module

logger = logging.getLogger(__name__)


def _seed_default_users():
    """Seed default users into PostgreSQL when the users table is empty.

    Gated by SEED_DEFAULT_USERS env var (default "true" for dev).
    Set SEED_DEFAULT_USERS=false in production to prevent test credentials.
    """
    if os.getenv("SEED_DEFAULT_USERS", "true").lower() == "false":
        logger.info("[seed] SEED_DEFAULT_USERS=false — skipping user seed")
        return

    from app.database.db import db_get_all_users, db_create_user
    existing = db_get_all_users()
    if existing:
        logger.info(f"[seed] Users table has {len(existing)} users — skipping seed")
        return

    import bcrypt

    default_users = [
        ("O001", "owner1", "owner123", "Business Owner", "owner", None),
    ]

    for user_id, username, password, full_name, role, station_id in default_users:
        hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        db_create_user(user_id, username, hashed, full_name, role, station_id)
        logger.info(f"[seed] Created user: {username} ({role})")

    logger.info(f"[seed] Seeded {len(default_users)} default users")


def _migrate_owner_name():
    """One-time migration: rename legacy owner 'Kanyembo Ndhlovu' to 'Business Owner'."""
    from app.database.db import db_get_all_users, db_update_user
    for user in db_get_all_users():
        if user["full_name"] == "Kanyembo Ndhlovu" and user["role"] == "owner":
            db_update_user(user["username"], {"full_name": "Business Owner"})
            logger.info(f"[migrate] Renamed owner '{user['username']}' to 'Business Owner'")


def _ensure_owner_account():
    """Ensure owner1 account exists with known password. Resets password if account exists."""
    import bcrypt
    from app.database.db import db_get_user_by_username, db_create_user, db_update_user

    user = db_get_user_by_username("owner1")
    hashed = bcrypt.hashpw("owner123".encode(), bcrypt.gensalt()).decode()

    if user:
        # Reset password to known default
        db_update_user("owner1", {"password": hashed, "is_active": True})
        logger.info("[migrate] Reset owner1 password and ensured account is active")
    else:
        # Create the account if it doesn't exist
        db_create_user("O001", "owner1", hashed, "Business Owner", "owner", None)
        logger.info("[migrate] Created missing owner1 account")


ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")

app = FastAPI(title="Fuel Management API (Prototype)", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")


@app.on_event("startup")
def startup():
    logger.info("[startup] Beginning startup sequence...")

    # Step 1: Initialize PostgreSQL if DATABASE_URL is set
    logger.info("[startup] Step 1: Database initialization...")
    db_ok = init_db()
    if db_ok:
        logger.info("[startup] PostgreSQL initialized successfully")
        _seed_default_users()
        _migrate_owner_name()
        _ensure_owner_account()
        from app.database.db import db_cleanup_expired_sessions
        db_cleanup_expired_sessions()
    else:
        logger.info("[startup] Using file-based storage")

    # Step 2: Migrate flat files to station directories (file-mode only)
    if not is_db_active():
        logger.info("[startup] Step 2: Migrating file data...")
        migrate_existing_data()

    # Step 3: Load station registry (seeds ST001 if empty)
    logger.info("[startup] Step 3: Loading stations...")
    load_stations()

    # Step 4: Initialize storage and seed defaults for all stations
    logger.info("[startup] Step 4: Seeding station defaults...")
    for station_id in list(stations_registry.STATIONS.keys()):
        storage = get_station_storage(station_id)
        seed_station_defaults(storage)
        logger.info(f"[startup] Applied defaults/migrations for station {station_id}")
        check_and_close_stale_shifts(storage, station_id)

    # Sync station name from business name in system_settings
    from app.database.stations_registry import save_stations
    st001 = stations_registry.STATIONS.get("ST001")
    if st001:
        st001_storage = get_station_storage("ST001")
        sys_settings = st001_storage.get("system_settings", {})
        biz_name = sys_settings.get("business_name", "")
        biz_location = sys_settings.get("station_location", "")
        current_name = st001.get("name", "")
        # Sync if station still has a placeholder name and business name is set
        if current_name in ("Luanshya Station", "My Station") and biz_name and biz_name != "Fuel Management System":
            st001["name"] = biz_name
            if biz_location:
                st001["location"] = biz_location
            save_stations()
            logger.info(f"[migrate] Synced station name to business name: '{biz_name}'")

    # Step 5: Persist seeded data to DB if available
    if is_db_active():
        logger.info("[startup] Step 5: Persisting to database...")
        save_all_stations_storage()

    # Backward compat: global STORAGE points to ST001
    st001 = get_station_storage("ST001")
    storage_module.STORAGE = st001

    logger.info("[startup] Startup complete!")


@app.on_event("shutdown")
def shutdown():
    # Flush all in-memory storage to DB before shutting down
    if is_db_active():
        save_all_stations_storage()
        logger.info("[shutdown] Storage flushed to database")
    close_db()


@app.middleware("http")
async def auto_flush_storage(request: Request, call_next):
    """After each mutating request, flush in-memory storage to PostgreSQL."""
    response = await call_next(request)
    if is_db_active() and request.method in ("POST", "PUT", "PATCH", "DELETE"):
        try:
            save_all_stations_storage()
        except Exception as e:
            logger.error(f"[flush] Failed to save storage: {e}")
    return response


@app.get("/health")
def health():
    return {"status": "ok", "storage": "postgresql" if is_db_active() else "file"}
