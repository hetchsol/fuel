
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import router
from app.database.stations_registry import load_stations
import app.database.stations_registry as stations_registry
from app.database.station_files import migrate_existing_data
from app.database.storage import get_station_storage
from app.database.seed_defaults import seed_station_defaults
import app.database.storage as storage_module

app = FastAPI(title="Fuel Management API (Prototype)", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")


@app.on_event("startup")
def startup():
    # Migrate flat files to station directories
    migrate_existing_data()

    # Load station registry (seeds ST001 if empty)
    load_stations()

    # Initialize storage and seed defaults for all stations
    for station_id in list(stations_registry.STATIONS.keys()):
        storage = get_station_storage(station_id)
        seed_station_defaults(storage)

    # Backward compat: global STORAGE points to ST001
    st001 = get_station_storage("ST001")
    storage_module.STORAGE = st001


@app.get("/health")
def health():
    return {"status": "ok"}

