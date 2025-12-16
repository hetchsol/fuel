
from fastapi import APIRouter

router = APIRouter()

@router.get("/daily")
def daily_summary(date: str | None = None):
    return {"date": date, "volumes": [], "cash_variance": [], "flags": []}
