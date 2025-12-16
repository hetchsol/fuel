
from fastapi import APIRouter, Query

router = APIRouter()

@router.get("")
def list_discrepancies(limit: int = Query(20, ge=1, le=200)):
    return []
