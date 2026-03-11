
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
from app.database.db import init_db, close_db, DATABASE_URL
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
        ("O001", "owner1", "owner123", "Kanyembo Ndhlovu", "owner", None),
        ("S001", "supervisor1", "super123", "Barbara Banda", "supervisor", "ST001"),
        ("U001", "user1", "password123", "Fashon Sakala", "user", "ST001"),
        ("STF001", "shaka", "shaka123", "Shaka", "user", "ST001"),
        ("STF002", "trevor", "trevor123", "Trevor", "user", "ST001"),
        ("STF003", "violet", "violet123", "Violet", "user", "ST001"),
        ("STF004", "chileshe", "chileshe123", "Chileshe", "user", "ST001"),
        ("STF005", "matthew", "matthew123", "Matthew", "user", "ST001"),
        ("STF006", "mubanga", "mubanga123", "Mubanga", "user", "ST001"),
        ("STF007", "prosper", "prosper123", "Prosper", "user", "ST001"),
    ]

    for user_id, username, password, full_name, role, station_id in default_users:
        hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        db_create_user(user_id, username, hashed, full_name, role, station_id)
        logger.info(f"[seed] Created user: {username} ({role})")

    logger.info(f"[seed] Seeded {len(default_users)} default users")

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
    # Initialize PostgreSQL if DATABASE_URL is set
    db_ok = init_db()
    if db_ok:
        logger.info("[startup] PostgreSQL initialized")
        # Seed default users and clean up expired sessions
        _seed_default_users()
        from app.database.db import db_cleanup_expired_sessions
        db_cleanup_expired_sessions()
    else:
        logger.info("[startup] Using file-based storage (no DATABASE_URL)")

    # Migrate flat files to station directories (file-mode only)
    if not DATABASE_URL:
        migrate_existing_data()

    # Load station registry (seeds ST001 if empty)
    load_stations()

    # Initialize storage and seed defaults for all stations
    for station_id in list(stations_registry.STATIONS.keys()):
        storage = get_station_storage(station_id)
        # Only seed defaults if station hasn't been initialized yet
        if not storage.get('tanks'):
            seed_station_defaults(storage)
            logger.info(f"[startup] Seeded defaults for station {station_id}")
        else:
            logger.info(f"[startup] Station {station_id} already initialized — skipping seed")
        check_and_close_stale_shifts(storage, station_id)

    # Persist seeded data to DB if this is a fresh start
    if DATABASE_URL:
        save_all_stations_storage()

    # Backward compat: global STORAGE points to ST001
    st001 = get_station_storage("ST001")
    storage_module.STORAGE = st001


@app.on_event("shutdown")
def shutdown():
    # Flush all in-memory storage to DB before shutting down
    if DATABASE_URL:
        save_all_stations_storage()
        logger.info("[shutdown] Storage flushed to database")
    close_db()


@app.middleware("http")
async def auto_flush_storage(request: Request, call_next):
    """After each mutating request, flush in-memory storage to PostgreSQL."""
    response = await call_next(request)
    if DATABASE_URL and request.method in ("POST", "PUT", "PATCH", "DELETE"):
        try:
            save_all_stations_storage()
        except Exception as e:
            logger.error(f"[flush] Failed to save storage: {e}")
    return response


@app.get("/health")
def health():
    return {"status": "ok", "storage": "postgresql" if DATABASE_URL else "file"}
