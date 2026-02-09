"""
OCR Service for reading numbers from nozzle meter images
"""
import re
import os
from PIL import Image
import pytesseract

# Configure Tesseract path (Windows default location)
# If Tesseract is not installed, this will be None and OCR will be simulated
TESSERACT_PATHS = [
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    "/usr/bin/tesseract",  # Linux
    "/usr/local/bin/tesseract",  # macOS
]

TESSERACT_AVAILABLE = False
for path in TESSERACT_PATHS:
    if os.path.exists(path):
        pytesseract.pytesseract.tesseract_cmd = path
        TESSERACT_AVAILABLE = True
        break


def extract_number_from_image(image_path: str) -> tuple[float | None, float]:
    """
    Extract a numeric reading from a nozzle meter image using OCR.

    Args:
        image_path: Path to the image file

    Returns:
        Tuple of (extracted_value, confidence)
        - extracted_value: The numeric reading, or None if extraction failed
        - confidence: Confidence score between 0 and 1
    """
    if not TESSERACT_AVAILABLE:
        # Tesseract not installed - return simulated OCR
        return None, 0.0

    try:
        # Open and preprocess image
        image = Image.open(image_path)

        # Convert to grayscale for better OCR accuracy
        image = image.convert('L')

        # Run OCR with configuration optimized for numbers
        # PSM 6 = Assume a single uniform block of text
        # Whitelist only digits and decimal point
        custom_config = r'--oem 3 --psm 6 -c tessedit_char_whitelist=0123456789.'

        # Extract text
        text = pytesseract.image_to_string(image, config=custom_config)

        # Get confidence data
        data = pytesseract.image_to_data(image, config=custom_config, output_type=pytesseract.Output.DICT)

        # Calculate average confidence for numeric characters
        confidences = [
            int(conf) for conf, txt in zip(data['conf'], data['text'])
            if conf != '-1' and txt.strip() and any(c.isdigit() for c in txt)
        ]
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0
        confidence = avg_confidence / 100.0  # Convert to 0-1 range

        # Extract numeric value
        # Look for patterns like: 12345.67, 12345, 1,234.56
        text_clean = text.strip().replace(',', '').replace(' ', '')

        # Find all numbers (including decimals)
        numbers = re.findall(r'\d+\.?\d*', text_clean)

        if not numbers:
            return None, 0.0

        # Take the longest number (most likely to be the full reading)
        longest_number = max(numbers, key=len)
        value = float(longest_number)

        return value, confidence

    except Exception as e:
        print(f"OCR Error: {e}")
        return None, 0.0


def simulate_ocr(manual_value: float) -> tuple[float, float]:
    """
    Simulate OCR by adding a small offset to the manual value.
    Used when Tesseract is not installed or for testing.

    Args:
        manual_value: The manually entered value

    Returns:
        Tuple of (simulated_ocr_value, confidence)
    """
    # Add small random-looking offset for simulation
    import random
    random.seed(int(manual_value * 100))  # Deterministic but varies per value
    offset = random.uniform(-0.05, 0.05)
    simulated_value = manual_value + offset
    confidence = 0.90

    return simulated_value, confidence


def get_ocr_reading(image_path: str | None, manual_value: float) -> tuple[float, float, str]:
    """
    Get OCR reading from image, falling back to simulation if needed.

    Args:
        image_path: Path to image file, or None
        manual_value: Manual reading value

    Returns:
        Tuple of (ocr_value, confidence, method)
        - ocr_value: The OCR reading
        - confidence: Confidence score 0-1
        - method: "real_ocr", "simulated", or "no_image"
    """
    # No image provided
    if not image_path or not os.path.exists(image_path):
        ocr_value, confidence = simulate_ocr(manual_value)
        return ocr_value, confidence, "no_image"

    # Try real OCR
    if TESSERACT_AVAILABLE:
        ocr_value, confidence = extract_number_from_image(image_path)
        if ocr_value is not None and ocr_value > 0:
            return ocr_value, confidence, "real_ocr"

    # Fallback to simulation
    ocr_value, confidence = simulate_ocr(manual_value)
    return ocr_value, confidence, "simulated"


def preview_ocr_from_image(image_path: str) -> tuple[float | None, float, str]:
    """
    Preview OCR extraction from an image without manual value.
    Returns None for ocr_value if OCR is not available or failed.

    Args:
        image_path: Path to image file

    Returns:
        Tuple of (ocr_value, confidence, method)
        - ocr_value: The OCR reading, or None if unavailable
        - confidence: Confidence score 0-1
        - method: "real_ocr" or "not_available"
    """
    if not os.path.exists(image_path):
        return None, 0.0, "file_not_found"

    # Only return real OCR results, not simulated
    if TESSERACT_AVAILABLE:
        ocr_value, confidence = extract_number_from_image(image_path)
        if ocr_value is not None and ocr_value > 0:
            return ocr_value, confidence, "real_ocr"

    # OCR not available - return None to indicate we can't extract
    return None, 0.0, "not_available"
