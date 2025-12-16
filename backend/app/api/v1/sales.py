
from fastapi import APIRouter, HTTPException
from ...models.models import SaleIn

router = APIRouter()
EPS = 0.05

@router.post("")
def record_sale(payload: SaleIn):
    expected = payload.post_reading - payload.pre_reading
    if abs(expected - payload.volume_dispensed) > EPS:
        raise HTTPException(400, detail=f"Volume mismatch: expected {expected:.3f}")
    return {"sale_id": "mock-sale"}
