# Fuel Management System - Detailed Operation Guide

**Document Version:** 1.0
**Date:** December 25, 2025
**Purpose:** Comprehensive explanation of system operations based on core functionalities

---

## Table of Contents

1. [Station Infrastructure Management](#1-station-infrastructure-management)
2. [Shift Management System](#2-shift-management-system)
3. [Meter Reading System](#3-meter-reading-system)
4. [Reading and Computation Workflows](#4-reading-and-computation-workflows)
5. [Data Relationships](#5-data-relationships)

---

## 1. STATION INFRASTRUCTURE MANAGEMENT

### Physical Setup

The system manages a fuel station with this exact structure:

#### Islands & Pump Stations

- **2 Islands** (ISL-001, ISL-002)
- **2 Pump Stations** (PS-001, PS-002)
- Each island has ONE pump station connected to it

#### Nozzle Configuration (8 Total)

**Island 1 (ISL-001):**
- UNL-1A (Petrol/Unleaded)
- UNL-1B (Petrol/Unleaded)
- LSD-1A (Low Sulfur Diesel)
- LSD-1B (Low Sulfur Diesel)

**Island 2 (ISL-002):**
- UNL-2A (Petrol/Unleaded)
- UNL-2B (Petrol/Unleaded)
- LSD-2A (Low Sulfur Diesel)
- LSD-2B (Low Sulfur Diesel)

#### Tank System

- **TANK-PETROL**: Stores petrol for UNL nozzles (Capacity: 25,000L)
- **TANK-DIESEL**: Stores diesel for LSD nozzles (Capacity: 20,000L)

#### How Tanks Connect

- Pump stations draw fuel from tanks through underground pipes
- Each pump station can draw from both tanks to supply its nozzles
- System tracks tank levels in real-time (updates every 5 seconds)
- Dip readings convert physical measurements (cm) to volume (liters) using tank calibration charts

---

## 2. SHIFT MANAGEMENT SYSTEM

### Shift Structure

**Two Shifts Per Day:**

#### Day Shift
- Start: 6:00 AM
- End: 6:00 PM
- Duration: 12 hours
- ID Format: `2025-12-24-Day`

#### Night Shift
- Start: 6:00 PM
- End: 6:00 AM (next day)
- Duration: 12 hours
- ID Format: `2025-12-24-Night`

### Attendant Assignment Workflow

**Step 1: Create Shift (Owner/Supervisor Only)**

```
Shift: 2025-12-24-Day
Attendants: Violet, Shaka
```

**Step 2: Assign Islands to Each Attendant**

```
Violet → ISL-001 (Island 1)
Shaka → ISL-002 (Island 2)
```

**Step 3: Assign Specific Nozzles**

```
Violet's Assignment:
├── Island: ISL-001
└── Nozzles: UNL-1A, UNL-1B, LSD-1A
    (Violet is NOT responsible for LSD-1B)

Shaka's Assignment:
├── Island: ISL-002
└── Nozzles: UNL-2A, UNL-2B, LSD-2A, LSD-2B
    (Shaka handles all 4 nozzles on Island 2)
```

### Critical Business Rules

#### Assignment Validation

1. **Each nozzle can ONLY be assigned to ONE attendant per shift**
   - If UNL-1A is assigned to Violet, it CANNOT be assigned to Shaka

2. **Nozzles must belong to assigned islands**
   - Violet cannot be assigned UNL-2A because she's only assigned Island 1

3. **All attendants must exist with 'user' role**
   - System validates attendant exists before allowing assignment

4. **Islands must exist in system**
   - Cannot assign non-existent island ISL-999

#### Pre-loaded Attendants (8 Total)

- Violet
- Shaka
- Trevor
- Chileshe
- Matthew
- Mubanga
- Isabel
- Prosper

---

## 3. METER READING SYSTEM (Dual Reading Concept)

### Why Dual Readings?

Each nozzle has **TWO completely independent meters** for fraud prevention:

#### Meter 1: Electronic (Digital)

- **Precision**: 3 decimal places
- **Display**: Digital LCD/LED screen
- **Example**: 609,176.526 liters
- **Technology**: Electronic pulse counter
- **Purpose**: Primary accurate reading
- **Can be tampered**: Yes (software manipulation possible)

#### Meter 2: Mechanical (Analog)

- **Precision**: Whole numbers only (0 decimals)
- **Display**: Physical rolling counter (like old car odometer)
- **Example**: 611,984 liters
- **Technology**: Mechanical gears and wheels
- **Purpose**: Backup verification reading
- **Can be tampered**: Very difficult (physical mechanism)

#### Why Both?

- If electronic meter is tampered (showing lower reading to steal fuel), mechanical meter will reveal the discrepancy
- Cross-validation prevents fraud
- Industry standard for fuel stations

### Reading Types

#### Per-Shift Readings (Mandatory)

**Opening Reading:**
- **When**: Exactly at shift start (6:00 AM or 6:00 PM)
- **Purpose**: Record starting point for shift
- **Who**: Incoming attendant
- **Process**:
  1. Attendant arrives at nozzle
  2. Takes photo of both meters
  3. Records both electronic and mechanical readings
  4. Submits to system

**Closing Reading:**
- **When**: Exactly at shift end (6:00 PM or 6:00 AM)
- **Purpose**: Record ending point for shift
- **Who**: Outgoing attendant
- **Process**: Same as opening

**Example for Nozzle UNL-1A:**

```
Day Shift 2025-12-24:

Opening (6:00 AM):
├── Electronic: 609,176.526 L
├── Mechanical: 611,984 L
├── Attendant: Violet
├── Timestamp: 2025-12-24 06:00:00
└── Photo: Uploaded

Closing (6:00 PM):
├── Electronic: 609,856.234 L
├── Mechanical: 612,680 L
├── Attendant: Violet
├── Timestamp: 2025-12-24 18:00:00
└── Photo: Uploaded
```

#### Per-Transaction Readings (Optional)

**PreSale Reading:**
- Before filling customer tank
- Used for large transactions
- Provides transaction-level tracking

**PostSale Reading:**
- After filling customer tank
- Volume sold = PostSale - PreSale

---

## 4. READING AND COMPUTATION WORKFLOWS

### Workflow A: Sales Calculation (Per Nozzle, Per Shift)

**Input Data: Nozzle UNL-1A, Day Shift 2025-12-24**

```
Opening Reading (6 AM):
├── Electronic: 609,176.526 L
└── Mechanical: 611,984 L

Closing Reading (6 PM):
├── Electronic: 609,856.234 L
└── Mechanical: 612,680 L
```

#### Step 1: Calculate Movement (Fuel Dispensed)

```
Electronic Movement = Closing - Opening
                    = 609,856.234 - 609,176.526
                    = 679.708 liters

Mechanical Movement = Closing - Opening
                     = 612,680 - 611,984
                     = 696 liters
```

#### Step 2: Calculate Discrepancy

```
Discrepancy = Electronic Movement - Mechanical Movement
            = 679.708 - 696
            = -16.292 liters
            (Negative means mechanical is higher)

Discrepancy % = (Discrepancy / Electronic Movement) × 100
              = (-16.292 / 679.708) × 100
              = -2.40%
```

#### Step 3: Validate Against Threshold

```
Allowable Threshold (from Settings):
├── Petrol: ±0.5%
└── Diesel: ±0.3%

For UNL-1A (Petrol):
Threshold = ±0.5%

Check: |Discrepancy %| > Threshold?
       |-2.40%| > 0.5%?
       2.40% > 0.5% = TRUE

Result: FAIL ⚠️
Status: FLAGGED FOR INVESTIGATION
Reason: "Mechanical reading 2.40% higher than electronic"
```

#### Step 4: Calculate Revenue

```
Average Volume = (Electronic Movement + Mechanical Movement) / 2
               = (679.708 + 696) / 2
               = 687.854 liters

Unit Price (from Settings):
Petrol = ZMW 160.00 per liter

Total Revenue = Average Volume × Unit Price
              = 687.854 × 160.00
              = ZMW 110,056.64
```

#### Step 5: Store Sales Record

```json
{
  "nozzle_id": "UNL-1A",
  "shift_id": "2025-12-24-Day",
  "attendant": "Violet",
  "fuel_type": "Petrol",
  "electronic_movement": 679.708,
  "mechanical_movement": 696.0,
  "average_volume": 687.854,
  "discrepancy": -16.292,
  "discrepancy_percent": -2.40,
  "validation_status": "FAIL",
  "total_revenue": 110056.64,
  "timestamp": "2025-12-24T18:00:00"
}
```

---

### Workflow B: Tank Reconciliation (Detects Theft/Losses)

**Purpose**: Compare physical tank inventory with total sales to detect unexplained losses or gains.

**Input Data: TANK-PETROL, Day Shift 2025-12-24**

```
Opening Dip Reading (6 AM):
├── Physical Measurement: 180.5 cm (dipstick reading)
├── Converted to Liters: 15,420 L (using tank calibration chart)
└── Tank Percentage: 61.68% full

Closing Dip Reading (6 PM):
├── Physical Measurement: 165.2 cm
├── Converted to Liters: 13,850 L
└── Tank Percentage: 55.40% full

Deliveries During Shift:
└── 0 L (no delivery received)

Total Sales (All 4 Petrol Nozzles):
├── UNL-1A: 679.708 L
├── UNL-1B: 523.445 L
├── UNL-2A: 612.890 L
├── UNL-2B: 701.234 L
└── Total Electronic: 2,517.277 L

Total Mechanical:
└── 2,530 L
```

#### Step 1: Calculate Expected Tank Movement

```
Tank Movement = Opening Volume - Closing Volume + Deliveries
              = 15,420 - 13,850 + 0
              = 1,570 liters

Interpretation: Tank lost 1,570 liters
```

#### Step 2: Compare with Sales

```
Electronic Sales Total: 2,517.277 L
Tank Movement: 1,570 L

Electronic Discrepancy = Sales - Tank Movement
                       = 2,517.277 - 1,570
                       = +947.277 liters

Status: GAIN (Sales higher than tank movement)
```

#### Step 3: Calculate Percentage

```
Electronic % = (Discrepancy / Tank Movement) × 100
             = (947.277 / 1,570) × 100
             = +60.3% GAIN
```

#### Step 4: Validate Against Allowable Range

```
Allowable Range (from Settings):
└── Petrol: -0.3% to +0.3%

Check: +60.3% within range?
       NO - WAY OUTSIDE!

Status: ⚠️ CRITICAL ALERT
```

#### Step 5: Investigate Root Cause

**Possible Causes of GAIN (+60.3%):**

1. **Incorrect Dip Reading** (Most Likely)
   - Dipstick not inserted straight
   - Wrong tank calibration chart used
   - Misread the cm measurement

2. **Delivery Not Recorded**
   - Forgot to record a fuel delivery
   - Delivery during shift marked as "0"

3. **Tank Calibration Error**
   - Tank chart outdated
   - Tank deformation changed capacity

4. **Meter Malfunction**
   - All 4 electronic meters over-reporting
   - Unlikely but possible

**Possible Causes of LOSS (if negative):**

1. **Evaporation**
   - Hot weather increases evaporation
   - Typically 0.1-0.3% loss

2. **Spillage During Offloading**
   - Fuel spilled when receiving delivery
   - Hose disconnection spillage

3. **Tank Leakage**
   - Underground tank leak
   - Pipe leak

4. **Theft**
   - Unauthorized fuel removal
   - Meter tampering to under-report sales

---

### Workflow C: Validated Triple Reading System (Owner/Supervisor Only)

**Purpose**: Cross-validate THREE independent measurements for maximum accuracy.

**Input: TANK-DIESEL, Closing Reading**

```
Reading 1 - Mechanical Total (Sum of all diesel nozzles):
└── 15,234 L

Reading 2 - Electronic Total (Sum of all diesel nozzles):
└── 15,245.678 L

Reading 3 - Dip Reading (Physical tank measurement):
├── Dip: 145.8 cm
└── Converted: 15,240 L
```

#### Step 1: Calculate Pairwise Discrepancies

```
Comparison 1: Mechanical vs Electronic
Difference = |15,234 - 15,245.678|
           = 11.678 L
Percentage = (11.678 / 15,245.678) × 100
           = 0.077%

Comparison 2: Mechanical vs Dip
Difference = |15,234 - 15,240|
           = 6 L
Percentage = (6 / 15,240) × 100
           = 0.039%

Comparison 3: Electronic vs Dip
Difference = |15,245.678 - 15,240|
           = 5.678 L
Percentage = (5.678 / 15,240) × 100
           = 0.037%
```

#### Step 2: Find Maximum Discrepancy

```
Max Discrepancy = max(0.077%, 0.039%, 0.037%)
                = 0.077%
```

#### Step 3: Validation Against Thresholds

```
Diesel Thresholds:
├── Pass: ≤ 0.5%
├── Warning: 0.5% - 1.0%
└── Fail: > 1.0%

Check: 0.077% ≤ 0.5%?
       YES

Result: ✅ PASS
Confidence: HIGH
Message: "All three readings agree within acceptable tolerance"
```

**If Max Discrepancy was 0.8%:**
```
Status: ⚠️ WARNING
Action: Review all three readings manually
        Retake questionable reading
```

**If Max Discrepancy was 1.5%:**
```
Status: ❌ FAIL
Action: STOP - Re-measure all three immediately
        Do not proceed with reconciliation
        Investigate meter/dip stick issues
```

---

## 5. DATA RELATIONSHIPS (How Everything Connects)

### Entity Hierarchy

```
STATION
│
├── USERS (Attendants)
│   ├── U001: Violet (role: user)
│   ├── U002: Shaka (role: user)
│   ├── SUP01: Barbara (role: supervisor)
│   └── OWN01: Kanyembo (role: owner)
│
├── INFRASTRUCTURE
│   │
│   ├── ISLANDS
│   │   ├── ISL-001 (Island 1)
│   │   │   └── PUMP STATION: PS-001
│   │   │       └── NOZZLES
│   │   │           ├── UNL-1A (Petrol, Electronic: 609176.526, Mechanical: 611984)
│   │   │           ├── UNL-1B (Petrol, Electronic: 580234.891, Mechanical: 582190)
│   │   │           ├── LSD-1A (Diesel, Electronic: 445678.234, Mechanical: 447123)
│   │   │           └── LSD-1B (Diesel, Electronic: 523456.789, Mechanical: 524890)
│   │   │
│   │   └── ISL-002 (Island 2)
│   │       └── PUMP STATION: PS-002
│   │           └── NOZZLES
│   │               ├── UNL-2A (Petrol)
│   │               ├── UNL-2B (Petrol)
│   │               ├── LSD-2A (Diesel)
│   │               └── LSD-2B (Diesel)
│   │
│   └── TANKS
│       ├── TANK-PETROL (Capacity: 25,000L, Current: 18,000L, 72% full)
│       └── TANK-DIESEL (Capacity: 20,000L, Current: 15,000L, 75% full)
│
├── SHIFTS
│   │
│   ├── 2025-12-24-Day (6 AM - 6 PM)
│   │   ├── Status: Active
│   │   └── ASSIGNMENTS
│   │       ├── Attendant: Violet
│   │       │   ├── Islands: [ISL-001]
│   │       │   └── Nozzles: [UNL-1A, UNL-1B, LSD-1A]
│   │       │
│   │       └── Attendant: Shaka
│   │           ├── Islands: [ISL-002]
│   │           └── Nozzles: [UNL-2A, UNL-2B, LSD-2A, LSD-2B]
│   │
│   └── 2025-12-24-Night (6 PM - 6 AM)
│       ├── Status: Pending
│       └── ASSIGNMENTS: (to be assigned)
│
├── READINGS
│   │
│   ├── read-UNL1A-609176-opening
│   │   ├── Nozzle: UNL-1A
│   │   ├── Shift: 2025-12-24-Day
│   │   ├── Type: Opening
│   │   ├── Electronic: 609,176.526 L
│   │   ├── Mechanical: 611,984 L
│   │   ├── Attendant: Violet
│   │   ├── Timestamp: 2025-12-24 06:00:00
│   │   └── Photo: Attached
│   │
│   └── read-UNL1A-609856-closing
│       ├── Nozzle: UNL-1A
│       ├── Shift: 2025-12-24-Day
│       ├── Type: Closing
│       ├── Electronic: 609,856.234 L
│       ├── Mechanical: 612,680 L
│       ├── Attendant: Violet
│       ├── Timestamp: 2025-12-24 18:00:00
│       └── Photo: Attached
│
├── SALES (Auto-calculated from readings)
│   │
│   └── sale-UNL1A-2025-12-24-Day
│       ├── Nozzle: UNL-1A
│       ├── Shift: 2025-12-24-Day
│       ├── Opening Electronic: 609,176.526 L
│       ├── Opening Mechanical: 611,984 L
│       ├── Closing Electronic: 609,856.234 L
│       ├── Closing Mechanical: 612,680 L
│       ├── Electronic Movement: 679.708 L
│       ├── Mechanical Movement: 696 L
│       ├── Average Volume: 687.854 L
│       ├── Discrepancy: -16.292 L (-2.40%)
│       ├── Validation Status: FAIL
│       ├── Unit Price: ZMW 160.00
│       └── Total Revenue: ZMW 110,056.64
│
├── CREDIT SALES
│   │
│   ├── credit-POLICE-001
│   │   ├── Account: Zambia Police (ACC-POLICE)
│   │   ├── Shift: 2025-12-24-Day
│   │   ├── Fuel Type: Diesel
│   │   ├── Volume: 500 L
│   │   ├── Amount: ZMW 13,490.00
│   │   └── Balance After: ZMW 50,000.00
│   │
│   └── credit-ZACODE-002
│       ├── Account: Ministry of Education (ACC-ZACODE)
│       ├── Shift: 2025-12-24-Day
│       ├── Fuel Type: Petrol
│       ├── Volume: 1,200 L
│       └── Amount: ZMW 48,780.20
│
├── RECONCILIATION
│   │
│   └── recon-2025-12-24-Day
│       ├── Shift: 2025-12-24-Day
│       │
│       ├── REVENUE BREAKDOWN
│       │   ├── Petrol Sales: ZMW 430,250.00
│       │   ├── Diesel Sales: ZMW 285,690.00
│       │   ├── LPG Sales: ZMW 5,432.00
│       │   ├── Lubricants: ZMW 1,250.00
│       │   ├── Accessories: ZMW 305.00
│       │   └── TOTAL REVENUE: ZMW 722,927.00
│       │
│       ├── CREDIT SALES
│       │   ├── Police: ZMW 13,490.00
│       │   ├── ZACODE: ZMW 48,780.20
│       │   └── TOTAL CREDIT: ZMW 62,270.20
│       │
│       ├── EXPECTED CASH
│       │   └── Total Revenue - Credit Sales
│       │       = ZMW 722,927.00 - ZMW 62,270.20
│       │       = ZMW 660,656.80
│       │
│       ├── ACTUAL DEPOSITED
│       │   └── ZMW 658,450.00
│       │
│       ├── DIFFERENCE
│       │   └── Actual - Expected
│       │       = 658,450.00 - 660,656.80
│       │       = -ZMW 2,206.80 (SHORTAGE)
│       │
│       └── CUMULATIVE DIFFERENCE
│           └── Previous: -ZMW 1,500.00
│               Today: -ZMW 2,206.80
│               New Cumulative: -ZMW 3,706.80
│
└── SETTINGS (Owner Only)
    ├── Fuel Pricing
    │   ├── Diesel: ZMW 150.00/L
    │   └── Petrol: ZMW 160.00/L
    │
    └── Allowable Losses
        ├── Diesel: 0.3%
        └── Petrol: 0.5%
```

### Data Flow: Complete Transaction Lifecycle

```
1. SHIFT CREATION
   Owner creates: "2025-12-24-Day"
   ↓
   Assigns: Violet → UNL-1A, UNL-1B, LSD-1A

2. OPENING READING (6 AM)
   Violet arrives at UNL-1A
   ↓
   Takes photo of meter
   ↓
   OCR extracts: Electronic: 609,176.526, Mechanical: 611,984
   ↓
   Submits reading to system
   ↓
   System validates: Closing > Opening (will check at end of shift)

3. CUSTOMER TRANSACTIONS (Throughout Day)
   Customer 1: 50L petrol
   Customer 2: 30L petrol
   Customer 3: 100L petrol (Credit - Zambia Police)
   ... hundreds more customers ...
   ↓
   Meters increment automatically

4. CLOSING READING (6 PM)
   Violet returns to UNL-1A
   ↓
   Takes photo of meter
   ↓
   Submits: Electronic: 609,856.234, Mechanical: 612,680
   ↓
   System immediately calculates:

5. SALES CALCULATION
   Movement = Closing - Opening
   ↓
   Electronic: 679.708 L
   Mechanical: 696 L
   ↓
   Discrepancy: -16.292 L (-2.40%)
   ↓
   Status: FAIL (exceeds ±0.5% threshold)
   ↓
   Revenue: 687.854 × ZMW 160 = ZMW 110,056.64

6. TANK RECONCILIATION
   Tank Dip: Lost 1,570 L
   Sales Total: 2,517.277 L
   ↓
   Discrepancy: +947.277 L (+60.3% GAIN)
   ↓
   Status: CRITICAL - Investigate dip reading

7. SHIFT RECONCILIATION
   All product revenues: ZMW 722,927.00
   Credit sales: -ZMW 62,270.20
   ↓
   Expected cash: ZMW 660,656.80
   Actual deposited: ZMW 658,450.00
   ↓
   Shortage: -ZMW 2,206.80
   ↓
   Cumulative: -ZMW 3,706.80

8. REPORTS GENERATED
   Dashboard shows:
   - Sales summary
   - Discrepancy alerts
   - Tank levels
   - Cash variance
   ↓
   Owner reviews and investigates variances
```

---

## Summary

This document provides a comprehensive overview of how the Fuel Management System operates across five critical areas:

1. **Infrastructure** - Physical setup of islands, pumps, nozzles, and tanks
2. **Shift Management** - How shifts are created and attendants are assigned
3. **Meter Reading** - Dual reading system for fraud prevention
4. **Computations** - Sales calculations, tank reconciliation, and validation
5. **Data Flow** - How all entities connect and interact

The system is designed to prevent fuel theft through multiple validation layers, ensure accurate financial reconciliation, and provide comprehensive operational oversight through role-based access control.

---

**Document End**

*Last Updated: December 25, 2025*
