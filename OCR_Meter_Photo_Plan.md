# Mechanical Meter Photo Evidence — Implementation Plan

**NextStop Fuel Management System**
**Document Date:** April 2026 | **Status:** PLANNED

---

## 1. Context

Attendants manually type mechanical meter readings. There is no way to verify they typed what the meter actually shows. Adding **mandatory photo capture** of the mechanical meter creates an evidence trail. The supervisor can visually verify the reading during handover review.

---

## 2. Industry SOP Alignment

- **Electronic reading** = primary sales record (typed from pump display)
- **Mechanical reading** = backup verification (typed from analog meter)
- **Photo** = timestamped evidence for audit/dispute (captured via camera)
- **OCR** = background hint shown to supervisor (informational only, not used for flagging)

---

## 3. What Changes

### For the Attendant

**Before:** Type mechanical_closing number → done

**After:** Type mechanical_closing number → take photo of meter → done

The photo is **mandatory** to proceed. No photo = can't submit handover. The attendant cannot fake a reading because the supervisor sees both the typed number and the actual photo.

### For the Supervisor

**Before:** See typed mechanical reading, trust the attendant

**After:** See typed mechanical reading + "View Photo" button. Click to see the actual meter. If the typed number doesn't match the photo → return handover. OCR hint shown as secondary info (greyed out, informational only).

---

## 4. Backend Implementation

### 4.1 New Endpoint: POST /handover/meter-photo

**File:** `backend/app/api/v1/attendant_handover.py`

```
Input: UploadFile (photo) + nozzle_id + shift_id (query params)
Process:
  1. Save photo via attachments (permanent storage)
  2. Run OCR in background (best effort, non-blocking)
  3. Return { attachment_id, ocr_hint, ocr_confidence }
```

- Photo saved permanently as evidence
- OCR runs but result is informational only — never blocks or flags
- If Tesseract unavailable, returns `ocr_hint: null` — no error

### 4.2 Extend Data Models

**File:** `backend/app/models/models.py`

Add to HandoverNozzleReadingInput and HandoverNozzleReadingSummary:

```python
meter_photo_id: Optional[str] = None       # Attachment ID of mechanical meter photo
ocr_hint: Optional[float] = None           # OCR-extracted value (informational)
ocr_confidence: Optional[float] = None     # 0-1 confidence score
```

### 4.3 No Change to Deviation Logic

Electronic vs mechanical comparison stays exactly the same. OCR is not compared to anything for flagging purposes.

### 4.4 Install Tesseract on Render

Add to build command in `render.yaml`:

```yaml
buildCommand: apt-get update && apt-get install -y tesseract-ocr && pip install -r requirements.txt
```

If install fails, app still works — OCR returns null.

---

## 5. Frontend Implementation

### 5.1 Camera Button on Mechanical Reading

**File:** `frontend/pages/my-shift.tsx`

Each nozzle row gets a camera icon button next to the mechanical_closing input:

```
| Mech Close: [____input____] [camera] |
```

- Click camera → opens device camera (mobile) or file picker (desktop)
- Photo captured → uploaded to `/handover/meter-photo`
- Success: green checkmark replaces camera icon, shows "Photo saved"
- OCR hint value shown as small grey text below (informational)

### 5.2 Make Photo Mandatory

```typescript
const allPhotosUploaded = nozzleRows.every(r => r.meter_photo_id)
const canProceedToReview = ... && allPhotosUploaded
```

Button text: "Take photos of all meters to continue" when photos missing.

### 5.3 Camera Capture Method

```html
<input type="file" accept="image/*" capture="environment" />
```

Opens rear camera on mobile, file picker on desktop. Works on all browsers. No permissions API needed.

Client-side: resize image to max 1280px width, JPEG 80% quality before upload (~200KB per photo).

### 5.4 Photo in Handover Review

**File:** `frontend/pages/handover-review.tsx`

- New "Photo" column in nozzle readings table
- "View" link → opens photo in modal/lightbox
- OCR hint shown below photo in grey text
- Supervisor visually compares typed value to photo

---

## 6. Files to Modify

| File | Change |
|------|--------|
| `backend/app/api/v1/attendant_handover.py` | Add POST /meter-photo endpoint |
| `backend/app/models/models.py` | Add meter_photo_id, ocr_hint, ocr_confidence fields |
| `backend/app/services/ocr.py` | Ensure Tesseract path detection works on Render |
| `render.yaml` | Add tesseract-ocr to build command |
| `frontend/pages/my-shift.tsx` | Camera button, photo mandatory check, OCR hint display |
| `frontend/pages/handover-review.tsx` | Photo view column + OCR hint in nozzle table |

---

## 7. What This Does NOT Touch

- Electronic reading capture — unchanged
- Manual mechanical reading capture — unchanged (still typed)
- Deviation calculation (electronic vs mechanical) — unchanged
- Inline deviation validation + mandatory explanation — unchanged
- Cash handover flow — unchanged
- LPG/lubricant/accessory sections — unchanged
- Safe deposits — unchanged

---

## 8. Potential Breaks & Mitigations

| # | Risk | Mitigation |
|---|------|------------|
| 1 | Tesseract not available on Render | OCR hint returns null. Photo still saved. Feature works without OCR. |
| 2 | Attendant can't take photo (broken camera) | File picker fallback. Upload from gallery. Emergency: supervisor overrides via return. |
| 3 | Bad photo quality (blurry, dark) | Low OCR confidence shown. Supervisor relies on visual inspection. |
| 4 | Large photos slow upload | Client-side compression (1280px, 80% JPEG). Under 200KB per photo. |
| 5 | Storage growth from photos | ~3.2MB/day = ~1.2GB/year. Cleanup for photos older than 90 days if needed. |
| 6 | Old handovers have no photos | All fields Optional with default None. Photo column shows "—". |

---

## 9. Verification Checklist

1. Attendant enters mechanical closing → types number manually (unchanged)
2. Taps camera icon → phone camera opens → takes photo of meter
3. Photo uploads → green checkmark appears → OCR hint shown in grey
4. All nozzles have photos → "Review My Entries" button enabled
5. Missing any photo → button disabled: "Take photos of all meters to continue"
6. Submit handover → photo IDs stored in handover record
7. Supervisor opens handover review → sees "View" link in Photo column
8. Clicks "View" → photo opens in modal
9. OCR hint shown below photo (grey, informational)
10. Old handovers → Photo column shows "—", no errors

---

## 10. Storage Architecture

Photos stored via existing attachments system:

- Path: `storage/{uuid}.jpg`
- Referenced by `meter_photo_id` in handover record
- Permanent — survives shift close, daily close-off, etc.
- ~200KB per photo x 8 nozzles x 2 shifts/day = ~3.2MB/day

---

## 11. Data Flow

```
1. Attendant enters electronic closing (typed from pump display)
2. Attendant enters mechanical closing (typed from analog meter)
3. Attendant taps camera icon on the nozzle row
4. Camera opens → takes photo of analog meter
5. Photo uploaded to server → saved as attachment
6. Tesseract OCR extracts number (best effort) → returns hint
7. OCR hint displayed as grey text (informational only)
8. System compares electronic vs mechanical (existing deviation check)
9. If deviation flagged → mandatory explanation (existing logic)
10. On handover submit → all values + photo ID stored
11. Supervisor reviews → sees typed values + "View Photo" link
12. Supervisor visually verifies typed mechanical matches photo
13. If mismatch → supervisor returns handover for correction
```

---

*NextStop Fuel Management System — Implementation Plan — April 2026*
