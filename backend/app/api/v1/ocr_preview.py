"""
OCR Preview endpoint - Extract numbers from images without full validation
"""
import os
from fastapi import APIRouter, HTTPException
from ...services.ocr import preview_ocr_from_image, TESSERACT_AVAILABLE

router = APIRouter()
STORAGE_DIR = os.getenv("STORAGE_DIR", "storage")

@router.post("/preview/{attachment_id}")
def preview_ocr(attachment_id: str):
    """
    Preview OCR result from an uploaded image.
    Returns the extracted number without full validation.
    """
    image_path = os.path.join(STORAGE_DIR, attachment_id)

    if not os.path.exists(image_path):
        raise HTTPException(404, "Image not found")

    # Try to extract number from image
    ocr_value, confidence, method = preview_ocr_from_image(image_path)

    return {
        "ocr_value": ocr_value,
        "confidence": confidence,
        "method": method,
        "success": ocr_value is not None and ocr_value > 0,
        "tesseract_available": TESSERACT_AVAILABLE,
        "message": "Real OCR extraction successful" if method == "real_ocr"
                   else "Tesseract OCR not installed - cannot extract numbers from image"
    }
