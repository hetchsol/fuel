import os
from fastapi import APIRouter
from ...models.models import ReadingIn, ReadingOut
from ...services.validation import validate_reading
from ...services.ocr import get_ocr_reading
from ...config import TOLERANCE_ABSOLUTE, TOLERANCE_PERCENT

router = APIRouter()

STORAGE_DIR = os.getenv("STORAGE_DIR", "storage")

@router.post("/{nozzle_id}/readings")
def submit_reading(nozzle_id: str, payload: ReadingIn):
    # Get image path if attachment provided
    image_path = None
    if payload.attachment_id:
        image_path = os.path.join(STORAGE_DIR, payload.attachment_id)

    # Run OCR (real or simulated)
    ocr_value, conf, method = get_ocr_reading(image_path, payload.manual_value)

    # Validate reading
    result = validate_reading(
        payload.manual_value,
        ocr_value,
        TOLERANCE_ABSOLUTE,
        TOLERANCE_PERCENT,
        conf,
        payload.ocr_conf_min
    )

    # Add OCR metadata to response
    return {
        "reading_id": f"read-{nozzle_id}-{int(payload.manual_value)}",
        "ocr_method": method,
        "ocr_value": ocr_value,
        "ocr_confidence": conf,
        **result
    }
