# Tank Volume Movement Analysis - Column AM

## Excel Formula Analysis

### Location
- **Sheets**: Petrol and Diesel
- **Column**: AM (Column 39)
- **Header**: "Tank Volume Movement"

### The Formula
```excel
=IF(AL>0, IF(AK>0, (AK-AL)+(AI-AJ), AI-AL), 0)
```

### Column Definitions
- **AI**: Tank Level - Opening (Volume)
- **AJ**: Tank Level - Before Off-loading (Volume)
- **AK**: Tank Level - After Off-loading (Volume)
- **AL**: Tank Level - Closing (Volume)
- **AM**: Tank Volume Movement (Calculated)

### Formula Logic Breakdown

The formula calculates the total fuel volume dispensed from tanks during a day, accounting for deliveries (off-loading).

**Scenario 1: No deliveries during the day (AK is empty/0)**
```
Tank Volume Movement = Opening Volume - Closing Volume
Movement = AI - AL
```
This is straightforward: the volume dispensed equals what you started with minus what you ended with.

**Scenario 2: Delivery occurred during the day (AK has value)**
```
Tank Volume Movement = (Before Delivery - After Delivery) + (After Delivery - Closing)
Movement = (AI - AJ) + (AK - AL)
```
This accounts for:
1. **First period** (AI - AJ): Volume dispensed from opening until before delivery
2. **Second period** (AK - AL): Volume dispensed from after delivery until closing

**Scenario 3: No closing reading (AL = 0)**
```
Tank Volume Movement = 0
```
Invalid/incomplete data for the day.

### Example Calculation

From the Excel data (Petrol sheet, Row 4):
- AI (Opening): 26,887.21 L
- AJ (Before Off-loading): Empty (no delivery)
- AK (After Off-loading): Empty (no delivery)
- AL (Closing): 25,117.64 L

**Calculation**:
Since AK is empty (no delivery):
```
Movement = AI - AL
Movement = 26,887.21 - 25,117.64
Movement = 1,769.57 L
```

This means 1,769.57 liters were dispensed from the tank that day.

---

## Implementation Plan

### Database Schema Updates

#### 1. Enhanced Tank Reading Model
Add fields to track all four reading types:

```python
class TankReading(BaseModel):
    reading_id: str
    tank_id: str
    date: date
    shift_id: Optional[str]

    # Four key readings
    opening_volume: float          # AI - Start of day
    before_offload_volume: Optional[float]  # AJ - Before delivery
    after_offload_volume: Optional[float]   # AK - After delivery
    closing_volume: float          # AL - End of day

    # Calculated field
    tank_volume_movement: float    # AM - Calculated

    # Delivery information
    delivery_occurred: bool
    delivery_volume: Optional[float]  # Calculated: AK - AJ

    created_at: datetime
    updated_by: str
```

#### 2. Delivery/Offload Tracking Table
```python
class TankDelivery(BaseModel):
    delivery_id: str
    tank_id: str
    date: date
    time: datetime

    volume_before: float     # From AJ
    volume_after: float      # From AK
    delivered_amount: float  # Calculated: AK - AJ

    supplier: Optional[str]
    invoice_number: Optional[str]
    created_by: str
```

### Backend API Endpoints

#### 1. Tank Reading Endpoints
```python
POST /api/v1/tanks/{tank_id}/readings
- Submit tank readings with all four volume points
- Automatically calculate tank_volume_movement

GET /api/v1/tanks/{tank_id}/readings?date=YYYY-MM-DD
- Get readings for specific date

GET /api/v1/tanks/{tank_id}/movement?start_date=X&end_date=Y
- Get tank volume movement over date range
```

#### 2. Delivery Recording Endpoints
```python
POST /api/v1/tanks/{tank_id}/deliveries
- Record a fuel delivery
- Capture before/after volumes

GET /api/v1/tanks/{tank_id}/deliveries?month=12&year=2025
- List all deliveries for a tank
```

### Service Layer - Calculation Logic

```python
# backend/app/services/tank_movement.py

def calculate_tank_volume_movement(
    opening_volume: float,
    closing_volume: float,
    before_offload: Optional[float] = None,
    after_offload: Optional[float] = None
) -> float:
    """
    Calculate tank volume movement (fuel dispensed).

    Replicates Excel formula:
    =IF(AL>0, IF(AK>0, (AK-AL)+(AI-AJ), AI-AL), 0)

    Args:
        opening_volume: AI - Opening tank level
        closing_volume: AL - Closing tank level
        before_offload: AJ - Level before delivery (optional)
        after_offload: AK - Level after delivery (optional)

    Returns:
        Total volume dispensed from tank
    """
    # Scenario 3: No valid closing reading
    if closing_volume <= 0:
        return 0.0

    # Scenario 2: Delivery occurred
    if after_offload and after_offload > 0:
        # Check if before_offload is recorded
        if before_offload and before_offload > 0:
            # Two-period calculation
            period1 = opening_volume - before_offload  # Before delivery
            period2 = after_offload - closing_volume    # After delivery
            return period1 + period2
        else:
            # No before reading, use after as new starting point
            return after_offload - closing_volume

    # Scenario 1: No delivery
    return opening_volume - closing_volume


def validate_tank_readings(
    opening: float,
    closing: float,
    before_offload: Optional[float],
    after_offload: Optional[float]
) -> dict:
    """
    Validate tank readings for logical consistency.

    Returns:
        dict with 'valid' boolean and 'errors' list
    """
    errors = []

    # Basic validations
    if opening < 0 or closing < 0:
        errors.append("Opening and closing volumes must be positive")

    # If delivery recorded, both before/after should exist
    if (before_offload or after_offload) and not (before_offload and after_offload):
        errors.append("Both before and after offload readings required for delivery")

    # After offload should be greater than before (fuel added)
    if before_offload and after_offload:
        if after_offload <= before_offload:
            errors.append("After offload volume must be greater than before offload")

    # Before offload should be less than opening (fuel was dispensed)
    if before_offload and before_offload > opening:
        errors.append("Before offload cannot exceed opening volume")

    # Closing should be less than after offload (if delivery occurred)
    if after_offload and closing > after_offload:
        errors.append("Closing volume cannot exceed after offload volume")

    return {
        'valid': len(errors) == 0,
        'errors': errors
    }
```

### Frontend UI Components

#### 1. Tank Reading Entry Form
```typescript
// Enhanced form with four reading fields

interface TankReadingForm {
  tankId: string;
  date: string;

  // Morning readings
  openingVolume: number;

  // Delivery readings (optional)
  deliveryOccurred: boolean;
  beforeOffloadVolume?: number;
  afterOffloadVolume?: number;

  // Evening readings
  closingVolume: number;
}

// Auto-calculate preview
const calculateMovement = () => {
  if (!closingVolume) return 0;

  if (deliveryOccurred && afterOffloadVolume) {
    const period1 = openingVolume - (beforeOffloadVolume || 0);
    const period2 = afterOffloadVolume - closingVolume;
    return period1 + period2;
  }

  return openingVolume - closingVolume;
};
```

#### 2. Tank Movement Dashboard
```typescript
// Show daily/monthly tank movement trends
- Chart: Tank volume movement over time
- Compare with electronic/mechanical totals
- Highlight discrepancies (Electronic vs Tank)
```

### Integration with Existing Reconciliation

The Tank Volume Movement (AM) feeds into:
- **Column AN**: Total Volume Dispensed - Electronic
- **Column AO**: Total Volume Dispensed - Mechanical
- **Column AP**: Electronic vs Tank variance = AN - AM

This variance helps identify:
- Meter inaccuracies
- Potential leaks
- Theft/losses
- Data entry errors

### Implementation Priority

1. **Phase 1**: Database schema for all four reading types
2. **Phase 2**: Backend calculation service with validation
3. **Phase 3**: API endpoints for reading submission
4. **Phase 4**: Frontend forms for data entry
5. **Phase 5**: Reporting and reconciliation dashboards

---

## Key Benefits

1. **Accurate Volume Tracking**: Account for deliveries correctly
2. **Delivery Management**: Track when and how much fuel was delivered
3. **Variance Analysis**: Compare tank movement vs meter readings
4. **Loss Prevention**: Identify discrepancies quickly
5. **Compliance**: Maintain complete audit trail of tank levels
