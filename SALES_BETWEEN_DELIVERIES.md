# Sales Between Deliveries Feature

## Overview

The Sales Between Deliveries feature provides comprehensive timeline analysis for shifts with multiple fuel deliveries. It accurately tracks and calculates sales that occur between each delivery, maintaining a complete chronological record of all tank level changes throughout a shift.

## Problem Statement

In a typical fuel station shift, multiple deliveries may occur throughout the day. Sales happen continuously between these deliveries, making it essential to track:
- When each delivery occurred
- The tank level immediately before and after each delivery
- Sales volumes in each period between deliveries
- Validation that all volumes add up correctly

## Solution

The system creates a detailed timeline showing:
1. Shift opening volume
2. Sales before first delivery
3. Each delivery (time, supplier, volume)
4. Sales between consecutive deliveries
5. Sales after the last delivery
6. Shift closing volume

### Example Timeline

```
Shift Start: 06:00
├─ Opening: 20,000 L
├─ Sales: -1,000 L → Level: 19,000 L
├─ 08:30 - DELIVERY #1 (Shell): +8,000 L → Level: 27,000 L
├─ Sales: -3,000 L → Level: 24,000 L
├─ 12:00 - DELIVERY #2 (Total): +12,000 L → Level: 36,000 L
├─ Sales: -4,000 L → Level: 32,000 L
├─ 16:00 - DELIVERY #3 (Puma): +7,000 L → Level: 39,000 L
├─ Sales: -1,000 L → Level: 38,000 L
└─ Closing: 38,000 L
Shift End: 18:00

Formula Verification:
(Opening - Closing) + Total Deliveries = Total Sales
(20,000 - 38,000) + (8,000 + 12,000 + 7,000) = 9,000 L ✓
Actual Sales: 1,000 + 3,000 + 4,000 + 1,000 = 9,000 L ✓
```

## Implementation

### Backend Components

#### 1. Delivery Timeline Service (`backend/app/services/delivery_timeline.py`)

**Main Function: `calculate_inter_delivery_sales()`**

```python
def calculate_inter_delivery_sales(
    deliveries: List[Dict],
    opening_volume: float,
    closing_volume: float
) -> Dict:
    """
    Calculate sales between deliveries and build comprehensive timeline.

    Returns:
        - has_deliveries: bool
        - number_of_deliveries: int
        - total_delivered: float
        - total_sales: float
        - formula_sales: float (verification)
        - inter_delivery_sales: List[Dict] (breakdown by period)
        - timeline: List[Dict] (chronological events)
        - validation: Dict (errors, warnings, sales_match)
        - summary: Dict (opening, closing, net_change, etc.)
    """
```

**Algorithm:**
1. Sort deliveries chronologically by delivery_time
2. Create SHIFT_START event with opening volume
3. For each delivery:
   - Calculate sales = current_level - delivery.before_volume
   - Create SALES event if sales > 0
   - Create DELIVERY event
   - Update current_level = delivery.after_volume
4. Calculate sales after last delivery
5. Create SHIFT_END event
6. Verify total_sales matches formula: (Opening - Closing) + Total Deliveries

#### 2. Data Models (`backend/app/models/models.py`)

**TankVolumeReadingOutput Model:**
```python
class TankVolumeReadingOutput(BaseModel):
    # ... existing fields ...

    # Multiple deliveries support
    deliveries: List[DeliveryReference] = []
    total_delivery_volume: float = 0.0
    delivery_count: int = 0

    # Inter-delivery sales timeline
    delivery_timeline: Optional[dict] = None
```

**DeliveryReference Model:**
```python
class DeliveryReference(BaseModel):
    delivery_id: Optional[str]
    volume_delivered: float
    delivery_time: str  # HH:MM format
    supplier: str
    invoice_number: Optional[str]
    before_volume: float  # Tank level before delivery
    after_volume: float   # Tank level after delivery
    before_dip_cm: Optional[float]
    after_dip_cm: Optional[float]
```

#### 3. API Endpoints (`backend/app/api/v1/tank_readings.py`)

**Create Reading with Multiple Deliveries:**
```http
POST /api/v1/tank-readings/readings
Authorization: Bearer {token}
Content-Type: application/json

{
  "tank_id": "TANK-DIESEL",
  "date": "2026-01-16",
  "shift": "day",
  "shift_type": "Day",
  "opening_dip_cm": 150,
  "closing_dip_cm": 170,
  "opening_volume": 30000,
  "closing_volume": 41000,
  "recorded_by": "supervisor1",
  "deliveries": [
    {
      "supplier": "Shell",
      "volume_delivered": 10000,
      "delivery_time": "10:00",
      "before_volume": 28000,
      "after_volume": 38000,
      "delivery_receipt_number": "DEL-001",
      "before_dip_cm": 145,
      "after_dip_cm": 165
    },
    {
      "supplier": "Total",
      "volume_delivered": 8000,
      "delivery_time": "14:00",
      "before_volume": 35000,
      "after_volume": 43000,
      "delivery_receipt_number": "DEL-002",
      "before_dip_cm": 160,
      "after_dip_cm": 175
    }
  ]
}
```

**Get Delivery Timeline:**
```http
GET /api/v1/tank-readings/readings/{reading_id}/timeline

Response:
{
  "has_deliveries": true,
  "number_of_deliveries": 2,
  "total_delivered": 18000.0,
  "total_sales": 7000.0,
  "formula_sales": 7000.0,
  "inter_delivery_sales": [
    {
      "period": "Opening to Delivery 1",
      "sales_volume": 2000.0,
      "start_level": 30000.0,
      "end_level": 28000.0,
      "start_time": "Opening",
      "end_time": "10:00"
    },
    {
      "period": "Delivery 1 to Delivery 2",
      "sales_volume": 3000.0,
      "start_level": 38000.0,
      "end_level": 35000.0,
      "start_time": "10:00",
      "end_time": "14:00"
    },
    {
      "period": "Delivery 2 to Closing",
      "sales_volume": 2000.0,
      "start_level": 43000.0,
      "end_level": 41000.0,
      "start_time": "14:00",
      "end_time": "Closing"
    }
  ],
  "timeline": [
    {
      "sequence": 1,
      "event_type": "SHIFT_START",
      "time": "Opening",
      "tank_level": 30000.0,
      "change": 0,
      "description": "Shift opening volume: 30,000 L"
    },
    {
      "sequence": 2,
      "event_type": "SALES",
      "time": "Before 10:00",
      "tank_level": 28000.0,
      "change": -2000.0,
      "description": "Sales before delivery #1: 2,000 L"
    },
    {
      "sequence": 3,
      "event_type": "DELIVERY",
      "time": "10:00",
      "tank_level": 38000.0,
      "change": 10000.0,
      "description": "Delivery #1 from Shell: +10,000 L",
      "delivery_number": 1,
      "supplier": "Shell"
    }
    // ... more events ...
  ],
  "validation": {
    "is_valid": true,
    "errors": [],
    "warnings": [],
    "sales_match": true
  },
  "summary": {
    "opening": 30000.0,
    "closing": 41000.0,
    "net_change": 11000.0,
    "deliveries": 18000.0,
    "sales": 7000.0,
    "periods_with_sales": 3
  }
}
```

#### 4. Validation Fix (`backend/app/services/tank_movement.py`)

Updated `validate_tank_readings()` to support both legacy single-delivery and new multi-delivery formats:

```python
def validate_tank_readings(
    opening: float,
    closing: float,
    before_offload: Optional[float] = None,
    after_offload: Optional[float] = None,
    tank_capacity: Optional[float] = None,
    deliveries: Optional[List] = None  # NEW: Support multi-delivery
) -> Dict[str, any]:
    # Check if ANY delivery format is used
    has_deliveries = (before_offload is not None or after_offload is not None or
                     (deliveries and len(deliveries) > 0))

    # Only apply "no delivery" validation if NO deliveries present
    if not has_deliveries:
        if closing > opening:
            errors.append("Closing volume is greater than opening without delivery")
```

**Critical Fix:** Previously, the validation would reject readings where `closing > opening` even when multiple deliveries were present, because it only checked for the legacy `before_offload/after_offload` parameters and didn't consider the new `deliveries` list.

## Validation Rules

### Timeline Validation

1. **Sales Consistency:** Sales can only reduce tank level (never increase)
2. **Delivery Sequence:** Each delivery's before_volume must be ≤ previous after_volume
3. **First Delivery:** before_volume must be ≤ opening volume
4. **Last Delivery:** closing_volume must be ≤ last delivery's after_volume
5. **Formula Match:** `(Opening - Closing) + Total Deliveries = Total Sales` (tolerance: 0.1L)

### Event Types

- `SHIFT_START`: Beginning of shift with opening volume
- `SALES`: Fuel dispensed to customers (negative change)
- `DELIVERY`: Fuel received from supplier (positive change)
- `SHIFT_END`: End of shift with closing volume

## Testing

### Test Cases Verified

#### Test 1: Two Deliveries
- Opening: 30,000 L
- Delivery 1 (10:00): 10,000 L
- Delivery 2 (14:00): 8,000 L
- Closing: 41,000 L
- Total Sales: 7,000 L ✓
- Periods: 3 (before D1, between D1-D2, after D2)

#### Test 2: Three Deliveries
- Opening: 20,000 L
- Delivery 1 (08:30): 8,000 L
- Delivery 2 (12:00): 12,000 L
- Delivery 3 (16:00): 7,000 L
- Closing: 38,000 L
- Total Sales: 9,000 L ✓
- Periods: 4 (before D1, D1-D2, D2-D3, after D3)

### Manual Testing

```bash
# Login
curl -X POST "http://localhost:8000/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username": "supervisor1", "password": "super123"}'

# Create reading with 2 deliveries
curl -X POST "http://localhost:8000/api/v1/tank-readings/readings" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d @test_2_deliveries.json

# Get timeline
curl "http://localhost:8000/api/v1/tank-readings/readings/{reading_id}/timeline"
```

## Benefits

1. **Accuracy:** Precise tracking of sales in each period between deliveries
2. **Validation:** Automatic verification that volumes add up correctly
3. **Transparency:** Complete audit trail of all tank level changes
4. **Reconciliation:** Easy identification of discrepancies or anomalies
5. **Reporting:** Detailed breakdown for management analysis
6. **Compliance:** Complete documentation for regulatory requirements

## Integration with Existing Features

### Tank Movement Formula
The existing formula `(Opening - Closing) + Total Deliveries = Total Sales` remains valid and is used to verify the timeline calculations.

### Real-Time Tank Levels
Deliveries update the real-time tank level in `/tanks/levels`, separate from shift-based calculations.

### Sales Calculations
Sales between deliveries integrate with existing nozzle-based sales calculations for variance analysis.

## Future Enhancements

1. **Frontend Timeline Visualization:** Graphical display of delivery timeline
2. **Export to Excel:** Timeline export with formatting
3. **Anomaly Detection:** Flag unusual patterns in sales between deliveries
4. **Performance Metrics:** Analyze sales velocity by time of day
5. **Supplier Analysis:** Track delivery frequency and volumes by supplier

## Files Modified

- **NEW:** `backend/app/services/delivery_timeline.py` - Timeline calculation logic
- **MODIFIED:** `backend/app/api/v1/tank_readings.py` - Integrated timeline calculation
- **MODIFIED:** `backend/app/models/models.py` - Added delivery_timeline field
- **MODIFIED:** `backend/app/services/tank_movement.py` - Fixed validation for multi-delivery
- **NEW:** `SALES_BETWEEN_DELIVERIES.md` - This documentation

## Technical Notes

### Time Parsing
Delivery times are parsed in HH:MM format (24-hour) with fallback support for:
- HH:MM:SS (with seconds)
- 12-hour format (e.g., "02:30 PM")

### Delivery Sorting
Deliveries are automatically sorted chronologically by delivery_time to ensure correct timeline sequence.

### Memory Storage
Timeline data is stored in the reading object's `delivery_timeline` field and calculated once during reading creation.

### Performance
Timeline calculation is O(n) where n = number of deliveries. Typical shifts have 1-3 deliveries, so performance impact is negligible.

## Support

For questions or issues with the Sales Between Deliveries feature:
1. Check validation errors in API response
2. Verify delivery times are in chronological order
3. Ensure before_volume and after_volume are accurate
4. Confirm opening and closing volumes are correct
5. Review the `validation.errors` field in timeline response

## Changelog

### Version 1.0 (2026-01-16)
- Initial implementation
- Support for unlimited deliveries per shift
- Comprehensive timeline with chronological events
- Inter-delivery sales breakdown
- Formula verification
- Validation rules and error handling
- GET endpoint for retrieving timeline
- Fixed validation to support multi-delivery format
