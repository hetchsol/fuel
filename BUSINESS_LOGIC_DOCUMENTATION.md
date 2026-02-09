# Fuel Management System
# Core Business Logic Documentation

---

## Table of Contents

1. Tank Management Logic
2. Sales & Reading Logic
3. Three-Way Reconciliation
4. Shift Management
5. Financial Logic
6. Inventory Logic
7. Customer Allocation
8. Data Flow Diagram
9. Key Files Reference

---

## 1. TANK MANAGEMENT LOGIC

### 1.1 Dip-to-Volume Conversion

**File:** `backend/app/services/dip_conversion.py`

The system converts tank dip readings (in centimeters) to volume (in liters) using calibration charts specific to each tank.

#### Linear Interpolation Formula

```
Volume = Interpolate(dip_cm) using calibration chart

For values between chart points:
volume = lower_volume + ratio × (upper_volume - lower_volume)
ratio = (dip_cm - lower_dip) / (upper_dip - lower_dip)
```

#### Cylindrical Horizontal Tank Formula

```
Volume = L × [R² × arccos((R-h)/R) - (R-h) × sqrt(2Rh - h²)] / 1000

Where:
- L = tank length (cm)
- R = tank radius (cm) = diameter / 2
- h = fuel height (cm) = dip reading
- Result converted from cm³ to liters by dividing by 1000
```

#### Calibration Charts

Two tanks with actual calibration data:
- **TANK-DIESEL**: Capacity 50,000L, 50 calibration points
- **TANK-PETROL**: Capacity 50,000L, 50 calibration points

Example Conversions:
- TANK-DIESEL: 164.5 cm dip = 26,887.21 L
- TANK-DIESEL: 75.0 cm dip = 10,054.98 L

---

### 1.2 Tank Movement Calculations

**File:** `backend/app/services/tank_movement.py` (Lines 61-110)

#### Core Formula

```
Tank Movement = (Opening Volume - Closing Volume) + Sum(All Deliveries)
```

This represents total volume dispensed from tank during shift.

#### Scenarios

| Scenario | Formula | Example |
|----------|---------|---------|
| No delivery | Opening - Closing | 10,000 - 8,000 = 2,000L |
| Single delivery | (Opening - Before) + (After - Closing) | (10,000 - 5,000) + (12,000 - 8,000) = 9,000L |
| Multiple deliveries | (Opening - Closing) + Sum(Deliveries) | (5,000 - 15,000) + 18,000 = 8,000L |

#### Excel Formula Replication (Line 132)

```
Excel: =IF(AL>0, IF(AK>0, (AK-AL)+(AI-AJ), AI-AL), 0)

Where:
- AL = closing_volume
- AK = after_offload_volume
- AI = opening_volume
- AJ = before_offload_volume
```

---

### 1.3 Variance Calculation

**File:** `backend/app/services/tank_movement.py` (Lines 431-488)

```
Variance = nozzle_sales - tank_movement
Variance_Percent = (|Variance| / tank_movement) × 100

Status Classification:
- PASS: variance_percent <= 0.5%
- WARNING: 0.5% < variance_percent <= 1.0%
- FAIL: variance_percent > 1.0%
```

---

### 1.4 Delivery Validation

**File:** `backend/app/services/tank_movement.py` (Lines 324-428)

Validation checks for deliveries:

1. after_volume > before_volume (must be positive delivery)
2. after_volume <= tank_capacity
3. calculated_volume approximately equals stated_volume (tolerance: +/-0.1L)
4. Chronological ordering validation
5. Sequence consistency with +/-100L tolerance between deliveries
6. First delivery alignment with opening volume
7. Last delivery alignment with closing volume

---

## 2. SALES & READING LOGIC

### 2.1 Discrepancy Calculation

**File:** `backend/app/services/reading_validation.py` (Lines 48-70)

```
Discrepancy_Percent = (|Value1 - Value2| / Average) × 100

Where:
- Average = (Value1 + Value2) / 2
- If both values are 0, discrepancy = 0%
- If average is 0, discrepancy = 0%
```

---

### 2.2 Three-Reading Validation

**File:** `backend/app/services/reading_validation.py` (Lines 73-113)

Validates three independent sources:
1. Mechanical reading
2. Electronic reading
3. Dip reading (converted from cm to liters)

#### Status Determination

| Status | Condition |
|--------|-----------|
| PASS | max_discrepancy <= 0.03% |
| WARNING | 0.03% < max_discrepancy <= 0.06% |
| FAIL | max_discrepancy > 0.06% |

---

### 2.3 Sales Calculation

**File:** `backend/app/services/sales_calculator.py` (Lines 91-156)

```
mechanical_volume = mechanical_closing - mechanical_opening
electronic_volume = electronic_closing - electronic_opening
discrepancy_percent = calculate_discrepancy_percent(mech_vol, elec_vol)

VALIDATION:
- If discrepancy_percent <= 0.03%: PASS
- If discrepancy_percent > 0.03%: FAIL

average_volume = (mechanical_volume + electronic_volume) / 2
total_amount = average_volume × fuel_price
```

#### Fuel Prices

| Fuel Type | Price (ZMW/Liter) |
|-----------|-------------------|
| Diesel | 26.98 |
| Petrol | 29.92 |

---

### 2.4 Allowable Loss Thresholds

**File:** `backend/app/config.py`

| Fuel Type | Allowable Loss |
|-----------|----------------|
| Diesel | 0.3% |
| Petrol | 0.5% |

Logic:
- If loss_percent <= allowable_loss: Acceptable
- If loss_percent > allowable_loss: Flag for investigation

---

## 3. THREE-WAY RECONCILIATION

### 3.1 Overview

**File:** `backend/app/services/reconciliation_service.py` (Lines 56-173)

The system reconciles three independent sources of truth:

| Source | Type | Measurement |
|--------|------|-------------|
| PHYSICAL | Tank dip readings | tank_movement (liters) |
| OPERATIONAL | Nozzle readings | nozzle_sales (liters) |
| FINANCIAL | Cash collected | actual_cash (currency) |

---

### 3.2 Variance Calculations

```
Tank vs Nozzle: variance = tank_movement - nozzle_sales
Tank vs Cash: variance = (tank_movement × price) - actual_cash
Nozzle vs Cash: variance = (nozzle_sales × price) - actual_cash
```

---

### 3.3 Tolerance Levels

**File:** `backend/app/services/reconciliation_service.py` (Lines 34-53)

#### Volume Tolerances

| Level | Absolute | Percentage |
|-------|----------|------------|
| MINOR | <= 50L | <= 0.5% |
| INVESTIGATION | 50-200L | 0.5-2% |
| CRITICAL | > 200L | > 2% |

#### Cash Tolerances

| Level | Absolute | Percentage |
|-------|----------|------------|
| MINOR | <= 500 | <= 0.5% |
| INVESTIGATION | 500-2,000 | 0.5-2% |
| CRITICAL | > 2,000 | > 2% |

---

### 3.4 Status Determination

**File:** `backend/app/services/reconciliation_service.py` (Lines 196-218)

| Status | Description |
|--------|-------------|
| BALANCED | All three sources match within tolerance |
| VARIANCE_MINOR | Small discrepancies within acceptable range |
| VARIANCE_INVESTIGATION | Requires investigation (0.5-2% range) |
| DISCREPANCY_CRITICAL | Critical mismatch detected (> 2%) |
| INCOMPLETE_DATA | Missing essential data |

---

### 3.5 Root Cause Analysis

**File:** `backend/app/services/reconciliation_service.py` (Lines 221-341)

#### Pattern 1: Tank & Nozzle Match, Cash Differs

| Attribute | Value |
|-----------|-------|
| Outlier | FINANCIAL |
| Confidence | HIGH |
| Likely Causes (Cash Short) | Theft, credit sales not recorded, pricing error |
| Likely Causes (Cash Over) | Non-fuel revenue mixed in, previous shift cash |

#### Pattern 2: Tank & Cash Match, Nozzle Differs

| Attribute | Value |
|-----------|-------|
| Outlier | OPERATIONAL |
| Confidence | HIGH |
| Likely Causes (Under) | Calibration error, manual dispensing not recorded |
| Likely Causes (Over) | Air in lines, duplicate submission |

#### Pattern 3: Nozzle & Cash Match, Tank Differs

| Attribute | Value |
|-----------|-------|
| Outlier | PHYSICAL |
| Confidence | HIGH |
| Likely Causes (Tank Low) | Dip reading error, tank leak, unrecorded theft |
| Likely Causes (Tank High) | Unrecorded delivery, temperature expansion |

#### Pattern 4: All Three Differ

| Attribute | Value |
|-----------|-------|
| Outlier | MULTIPLE |
| Confidence | LOW |
| Action | Requires full audit due to systematic errors |

---

## 4. SHIFT MANAGEMENT

### 4.1 Shift Data Structure

**File:** `backend/app/models/models.py` (Lines 139-150)

```
Shift:
  shift_id: string (unique identifier)
  date: YYYY-MM-DD
  shift_type: "Day" or "Night"
  attendants: List of names
  assignments: List of AttendantAssignment
  start_time: HH:MM:SS (optional)
  end_time: HH:MM:SS (optional)
  status: "active" | "completed" | "reconciled"
  created_by: user_id
  created_at: timestamp
  tank_dip_readings: List of TankDipReading
```

---

### 4.2 Shift Lifecycle

```
CREATED --> ACTIVE --> COMPLETED --> RECONCILED
```

---

### 4.3 Attendant Assignment Validation

**File:** `backend/app/services/shift_validation.py` (Lines 65-102)

Validation Rules:
1. Attendant must exist in users_db with role='user'
2. Island must exist in STORAGE
3. Nozzle must exist across all islands
4. Nozzle must belong to assigned island
5. No nozzle can be assigned to multiple attendants

---

### 4.4 Opening/Closing Procedures

#### Opening Readings

Components:
1. Tank dip readings (cm) - converted to volume (liters)
2. Mechanical meter readings (all nozzles)
3. Electronic meter readings (all nozzles)

Validation: All three sources must reconcile within 0.03% tolerance

#### Closing Readings

Same components as opening with:
- Additional validation for delivery occurrence
- Sales calculation between opening and closing
- Final reconciliation check

---

## 5. FINANCIAL LOGIC

### 5.1 Revenue Calculations

**File:** `backend/app/services/tank_movement.py` (Lines 638-688)

```
Electronic_Revenue = total_electronic_dispensed × price_per_liter
Mechanical_Revenue = total_mechanical_dispensed × price_per_liter
Average_Revenue = (Electronic_Revenue + Mechanical_Revenue) / 2
```

---

### 5.2 Cash Reconciliation

```
Expected_Cash = total_electronic_dispensed × price_per_liter
Actual_Cash = actual_cash_banked
Cash_Difference = Actual_Cash - Expected_Cash
```

---

### 5.3 Loss Percentage Calculation

**File:** `backend/app/services/tank_movement.py` (Lines 691-706)

```
Loss_Percent = (electronic_variance / tank_movement) × 100

Where:
electronic_variance = total_electronic - tank_movement

Excel Reference (Column BF):
=IF(AM4=0, 0, AP4/AM4)
```

---

### 5.4 Credit Sales Processing

**File:** `backend/app/services/inventory.py` (Lines 88-156)

Process:
1. Check if account exists in accounts database
2. Verify credit limit: new_balance = current_balance + amount
3. If new_balance > credit_limit: REJECT
4. If valid: Update account.current_balance
5. Record sale in sales_log with timestamp

---

### 5.5 Shift Reconciliation Summary

**File:** `backend/app/models/models.py` (Lines 318-333)

```
ShiftReconciliation:
  petrol_revenue: float
  diesel_revenue: float
  lpg_revenue: float
  lubricants_revenue: float
  accessories_revenue: float
  total_expected: float
  credit_sales_total: float
  expected_cash: float
  actual_deposited: float
  difference: float
  cumulative_difference: float
```

---

## 6. INVENTORY LOGIC

### 6.1 Stock Level Tracking

**File:** `backend/app/services/inventory.py` (Lines 269-298)

```
check_stock_availability(inventory, item_id, required_quantity):
  if item_id not in inventory:
    return (False, 0)

  current_stock = inventory[item_id]['current_stock']
  if current_stock >= required_quantity:
    return (True, current_stock)
  else:
    return (False, current_stock)
```

---

### 6.2 Stock Sale Processing

**File:** `backend/app/services/inventory.py` (Lines 15-85)

```
process_stock_sale(inventory, sales_log, item_id, quantity, sale_data):
  1. Verify item exists
  2. Check stock availability
  3. Deduct quantity: inventory[item_id]['current_stock'] -= quantity
  4. Record sale: sales_log.append(sale_data)
```

---

### 6.3 Reorder Alerts

**File:** `backend/app/config.py` (Lines 83-87)

| Alert Level | Threshold |
|-------------|-----------|
| LOW_STOCK | current < capacity × 25% |
| CRITICAL_STOCK | current < capacity × 10% |

---

### 6.4 LPG Sales Model

**File:** `backend/app/models/models.py` (Lines 274-282)

```
LPGSale:
  sale_id: string
  shift_id: string
  cylinder_size: string (6kg, 9kg, 13kg)
  quantity_kg: float
  price_per_kg: float
  total_amount: float (= quantity_kg × price_per_kg)
  customer_name: string
  sale_type: "Refill" or "New"
```

---

### 6.5 Lubricant Inventory

**File:** `backend/app/models/models.py` (Lines 300-315)

```
Lubricant:
  product_code: string
  description: string
  category: string (Engine Oil, Transmission Fluid, etc.)
  unit_price: float
  location: string (Island 3 or Buffer)
  opening_stock: int
  current_stock: int

LubricantSale:
  sale_id: string
  shift_id: string
  product_code: string
  quantity: int
  unit_price: float
  total_amount: float (= quantity × unit_price)
```

---

## 7. CUSTOMER ALLOCATION (DIESEL)

### 7.1 Customer Types

**File:** `backend/app/services/customer_service.py`

| Customer ID | Description |
|-------------|-------------|
| CUST-DRIVE-IN | Walk-in cash customers |
| CUST-VOLCANO | Corporate account - Volcano |
| CUST-HAMMINGTON | Corporate account - Hammington |
| CUST-SPECIAL-3 | Special customer account |
| CUST-SPECIAL-4 | Special customer account |

Default diesel price: 26.98 ZMW/L (customizable per customer)

---

### 7.2 Allocation Validation

**File:** `backend/app/services/customer_service.py` (Lines 174-209)

```
validate_allocations(allocations, total_electronic, tolerance=0.01L):
  sum_allocations = sum(alloc['volume'] for each allocation)
  difference = total_electronic - sum_allocations

  Validation:
  - valid = (|difference| <= tolerance)
  - percentage_diff = (difference / total_electronic) × 100
```

Excel Reference (Column AW):
Check = Total_Electronic - Sum(Allocations) should equal approximately 0

---

### 7.3 Customer Revenue Calculation

**File:** `backend/app/services/customer_service.py` (Lines 211-250)

```
calculate_customer_revenue(allocations):
  total_revenue = 0
  customer_breakdown = {}

  For each allocation:
    amount = volume × price_per_liter
    total_revenue += amount
    customer_breakdown[customer_id].total_volume += volume
    customer_breakdown[customer_id].total_amount += amount

  Return:
    total_revenue: float
    customer_breakdown: List of customer summaries
    num_customers: int
```

---

## 8. DATA FLOW DIAGRAM

```
+------------------------------------------------------------------+
|                         SHIFT START                               |
+------------------------------------------------------------------+
|  OPENING READINGS                                                 |
|  +-- Tank Dip (cm) --> Volume Conversion --> Opening Volume       |
|  +-- Mechanical Meters --> Opening Readings                       |
|  +-- Electronic Meters --> Opening Readings                       |
|                              |                                    |
|                    [Validate: all within 0.03%]                   |
+------------------------------------------------------------------+
                               |
                               v
+------------------------------------------------------------------+
|                        DURING SHIFT                               |
|  +-- Fuel Sales (nozzle readings per transaction)                 |
|  +-- Deliveries (before/after volumes, timeline)                  |
|  +-- Cash Collection                                              |
|  +-- Credit Sales                                                 |
+------------------------------------------------------------------+
                               |
                               v
+------------------------------------------------------------------+
|                         SHIFT END                                 |
+------------------------------------------------------------------+
|  CLOSING READINGS                                                 |
|  +-- Tank Dip (cm) --> Volume Conversion --> Closing Volume       |
|  +-- Mechanical Meters --> Closing Readings                       |
|  +-- Electronic Meters --> Closing Readings                       |
+------------------------------------------------------------------+
                               |
                               v
+------------------------------------------------------------------+
|                        CALCULATIONS                               |
+------------------------------------------------------------------+
|  Tank Movement = (Opening - Closing) + Deliveries                 |
|  Nozzle Total = Sum(Closing - Opening) per nozzle                 |
|  Electronic Total = Sum(electronic movements)                     |
|  Mechanical Total = Sum(mechanical movements)                     |
+------------------------------------------------------------------+
                               |
                               v
+------------------------------------------------------------------+
|                     VARIANCE ANALYSIS                             |
+------------------------------------------------------------------+
|  Tank vs Electronic: |Elec - Tank| / Tank × 100                   |
|  Tank vs Mechanical: |Mech - Tank| / Tank × 100                   |
|  Status: PASS (<=0.5%) | WARNING (<=1%) | FAIL (>1%)              |
+------------------------------------------------------------------+
                               |
                               v
+------------------------------------------------------------------+
|                  THREE-WAY RECONCILIATION                         |
+------------------------------------------------------------------+
|  Physical (Tank) <-----------+-----------> Operational (Nozzles)  |
|                              |                                    |
|                       Financial (Cash)                            |
|                              |                                    |
|  Root Cause Analysis --> Outlier Identification                   |
|  Status: BALANCED | MINOR | INVESTIGATION | CRITICAL              |
+------------------------------------------------------------------+
                               |
                               v
+------------------------------------------------------------------+
|                    REVENUE & REPORTING                            |
+------------------------------------------------------------------+
|  Expected Revenue = Volume × Price                                |
|  Cash Difference = Actual - Expected                              |
|  Customer Allocations (Diesel)                                    |
|  Shift Reconciliation Report                                      |
+------------------------------------------------------------------+
```

---

## 9. KEY FILES REFERENCE

| File | Purpose | Key Functions |
|------|---------|---------------|
| dip_conversion.py | Calibration chart dip-to-volume conversion | dip_to_volume(), volume_to_dip() |
| tank_movement.py | Tank calculations, variance analysis | calculate_tank_volume_movement_v2() |
| sales_calculator.py | Sales from meter readings | calculate_sale(), validate_readings() |
| reading_validation.py | Three-reading validation | validate_reading() |
| reconciliation_service.py | Three-way reconciliation | calculate_three_way_reconciliation() |
| shift_validation.py | Shift & attendant validation | validate_shift_assignments() |
| inventory.py | Stock & credit transactions | process_stock_sale() |
| customer_service.py | Customer allocation | validate_allocations() |
| delivery_timeline.py | Multiple delivery analysis | calculate_inter_delivery_sales() |
| config.py | System constants & defaults | Fuel prices, thresholds |
| settings.py | Runtime configurable settings | API for updating settings |

---

## 10. CONFIGURATION SUMMARY

### Fuel Settings

| Setting | Value |
|---------|-------|
| diesel_price_per_liter | 26.98 ZMW |
| petrol_price_per_liter | 29.92 ZMW |
| diesel_allowable_loss_percent | 0.3% |
| petrol_allowable_loss_percent | 0.5% |

### Validation Thresholds

| Threshold | Value |
|-----------|-------|
| pass_threshold | 0.5% |
| warning_threshold | 1.0% |

### Tank Specifications

| Tank | Capacity | Calibration Points |
|------|----------|-------------------|
| TANK-DIESEL | 50,000 L | 50 |
| TANK-PETROL | 50,000 L | 50 |

---

**Document Version:** 1.0
**Generated:** January 2026
**System:** Fuel Management System v1.0
