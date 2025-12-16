
from fastapi import APIRouter
from ...models.models import ReadingIn, ReadingOut
from ...services.validation import validate_reading

router = APIRouter()

TOL_ABS = 0.2
TOL_PCT = 0.05

@router.post("/{nozzle_id}/readings")
def submit_reading(nozzle_id: str, payload: ReadingIn):
    # Mock OCR outcome
    ocr_value, conf = payload.manual_value + 0.03, 0.90
    result = validate_reading(payload.manual_value, ocr_value, TOL_ABS, TOL_PCT, conf, payload.ocr_conf_min)
    return {"reading_id": "mock-id", **result}
