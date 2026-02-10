
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import router
from app.database.storage import STORAGE

app = FastAPI(title="Fuel Management API (Prototype)", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")

@app.get("/health")
def health():
    return {
        "status": "ok",
        "islands": list(STORAGE.get('islands', {}).keys()),
        "tanks": list(STORAGE.get('tanks', {}).keys()),
        "shifts": len(STORAGE.get('shifts', {})),
    }

