
from typing import Dict

def validate_reading(manual_value: float,
                     ocr_value: float,
                     tolerance_abs: float,
                     tolerance_pct: float,
                     ocr_conf: float,
                     min_conf: float = 0.85) -> Dict:
    result = {"status": "VALID", "discrepancy": 0.0, "reasons": []}
    if ocr_conf < min_conf:
        result["status"] = "REVIEW"
        result["reasons"].append(f"OCR low confidence: {ocr_conf:.2f}")
    discrepancy = abs(manual_value - ocr_value)
    result["discrepancy"] = discrepancy
    if discrepancy > tolerance_abs and (discrepancy / max(manual_value, 1e-6)) > tolerance_pct:
        result["status"] = "FLAG"
        result["reasons"].append(
            f"Mismatch exceeds tolerance (abs={discrepancy:.3f}, pct={discrepancy / max(manual_value, 1e-6):.3%})"
        )
    return result
