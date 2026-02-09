# Fuel Management System - Functionality Overview

**Document Version:** 1.0
**Last Updated:** December 24, 2025
**System Version:** 1.0.0

---

## Table of Contents

1. [System Overview](#system-overview)
2. [User Roles and Access Control](#user-roles-and-access-control)
3. [Core Functionalities](#core-functionalities)
4. [Reading and Computation Workflows](#reading-and-computation-workflows)
5. [Data Relationships](#data-relationships)
6. [Key Features by Module](#key-features-by-module)
7. [Validation and Data Integrity](#validation-and-data-integrity)

---

## System Overview

The Fuel Management System is a comprehensive full-stack application designed to manage fuel station operations, including:

- **Dual meter reading tracking** (Electronic and Mechanical)
- **Shift management** with attendant assignments
- **Sales calculation and validation**
- **Inventory reconciliation**
- **Multi-product support** (Fuel, LPG, Lubricants)
- **Credit account management**
- **Role-based access control**

### Technology Stack

**Backend:**
- FastAPI (Python)
- Pydantic for data validation
- In-memory storage (STORAGE dictionary)

**Frontend:**
- Next.js (React with TypeScript)
- TailwindCSS for styling
- RESTful API integration

---

## User Roles and Access Control

### 1. **Owner**
- **Full system access**
- Can perform all operations
- Manages system settings (fuel pricing, allowable losses, business information)
- Creates and manages user accounts
- Assigns shifts and manages staff
- Views all reports and analytics

### 2. **Supervisor**
- **Operational management access**
- Assigns shifts to attendants
- Manages island and nozzle assignments
- Views reports and reconciliations
- Cannot modify system settings or create users

### 3. **User (Attendant)**
- **Limited operational access**
- Submits meter readings for assigned nozzles
- Views assigned shifts
- Cannot access reports or management functions

---

## Core Functionalities

### 1. **Station Infrastructure Management**

#### Islands and Pump Stations
- **Islands**: Physical fuel dispensing locations (e.g., Island 1, Island 2)
- **Pump Stations**: Connected to islands, draw fuel from specific tanks
- **Nozzles**: Individual dispensing points with dual meters

**Current Setup:**
- 2 Islands (ISL-001, ISL-002)
- 2 Pump Stations (PS-001, PS-002)
- 8 Nozzles total:
  - 4 Petrol nozzles: UNL-1A, UNL-1B, UNL-2A, UNL-2B
  - 4 Diesel nozzles: LSD-1A, LSD-1B, LSD-2A, LSD-2B

#### Tank Management
- **2 Main Tanks**: TANK-PETROL, TANK-DIESEL
- **Capacity Tracking**: Monitor fuel levels and percentages
- **Dip Reading Support**: Physical measurement in centimeters converted to liters

---

### 2. **Shift Management System**

#### Shift Types
- **Day Shift**: 6:00 AM - 6:00 PM
- **Night Shift**: 6:00 PM - 6:00 AM

#### Shift Creation and Assignment (Owner/Supervisor Only)

**Assignment Hierarchy:**
1. Select attendants for the shift
2. Assign islands to each attendant
3. Assign specific nozzles to each attendant

**Example Assignment:**
```
Shift: 2025-12-24-Day
├── Violet
│   ├── Islands: ISL-001
│   └── Nozzles: UNL-1A, UNL-1B, LSD-1A
├── Shaka
│   ├── Islands: ISL-002
│   └── Nozzles: UNL-2A, UNL-2B, LSD-2A, LSD-2B
```

#### Validation Rules
- Each nozzle can only be assigned to ONE attendant per shift
- Nozzles must belong to the assigned islands
- All attendants must exist in the system with 'user' role
- Islands must exist in the system

---

### 3. **Meter Reading System**

#### Dual Reading Concept

Each nozzle has **two independent meters**:

1. **Electronic Meter** (Primary)
   - High precision (3 decimal places)
   - Digital display
   - Example: 12,345.678 liters

2. **Mechanical Meter** (Backup)
   - Whole numbers only
   - Analog/mechanical counter
   - Example: 12,345 liters

#### Reading Types

**Per Shift:**
- **Opening Reading**: Taken at shift start (6 AM or 6 PM)
- **Closing Reading**: Taken at shift end (6 PM or 6 AM)

**Per Transaction (Optional):**
- **Pre-Sale Reading**: Before filling customer tank
- **Post-Sale Reading**: After filling customer tank

#### Reading Submission Process

**Step 1: Attendant Submits Reading**
```
Input:
- Nozzle ID: UNL-1A
- Shift ID: 2025-12-24-Day
- Reading Type: Opening
- Electronic Reading: 609,176.526
- Mechanical Reading: 611,984
- Attendant: Violet
- Timestamp: 2025-12-24 06:00:00
```

**Step 2: System Stores Reading**
- Reading stored with unique timestamp
- Associated with specific shift and nozzle
- Linked to attendant for accountability

---

## Reading and Computation Workflows

### Workflow 1: Shift Sales Calculation

#### Input Data (Per Nozzle)
```
Opening Reading (6 AM):
- Electronic: 609,176.526 L
- Mechanical: 611,984 L

Closing Reading (6 PM):
- Electronic: 609,856.234 L
- Mechanical: 612,680 L
```

#### Computation Steps

**Step 1: Calculate Movement**
```
Electronic Movement = Closing - Opening
                    = 609,856.234 - 609,176.526
                    = 679.708 liters

Mechanical Movement = Closing - Opening
                    = 612,680 - 611,984
                    = 696 liters
```

**Step 2: Calculate Discrepancy**
```
Discrepancy = Electronic Movement - Mechanical Movement
            = 679.708 - 696
            = -16.292 liters

Discrepancy % = (Discrepancy / Electronic Movement) × 100
              = (-16.292 / 679.708) × 100
              = -2.40%
```

**Step 3: Validation**
```
Allowable Threshold: ±0.5% for Petrol, ±0.3% for Diesel

If |Discrepancy %| > Threshold:
    Status = FAIL ⚠️
    Flag for investigation
Else:
    Status = PASS ✓
```

**Step 4: Calculate Revenue**
```
Average Volume = (Electronic Movement + Mechanical Movement) / 2
               = (679.708 + 696) / 2
               = 687.854 liters

Unit Price = 160.00 ZMW (Petrol price from settings)

Total Revenue = Average Volume × Unit Price
              = 687.854 × 160.00
              = ZMW 110,056.64
```

---

### Workflow 2: Tank Reconciliation

#### Purpose
Compare tank dip readings with total sales to detect losses/gains

#### Input Data
```
Shift: 2025-12-24-Day
Tank: TANK-PETROL

Opening Dip (6 AM):
- Physical measurement: 180.5 cm
- Converted to liters: 15,420 L (using tank calibration)

Closing Dip (6 PM):
- Physical measurement: 165.2 cm
- Converted to liters: 13,850 L

Deliveries during shift: 0 L

Total Electronic Sales (all nozzles):
- UNL-1A: 679.708 L
- UNL-1B: 523.445 L
- UNL-2A: 612.890 L
- UNL-2B: 701.234 L
Total: 2,517.277 L

Total Mechanical Sales: 2,530 L
```

#### Computation Steps

**Step 1: Calculate Tank Movement**
```
Tank Movement = Opening Volume - Closing Volume + Deliveries
              = 15,420 - 13,850 + 0
              = 1,570 liters
```

**Step 2: Compare with Sales**
```
Electronic Discrepancy = Total Electronic Sales - Tank Movement
                       = 2,517.277 - 1,570
                       = +947.277 liters (GAIN - Suspicious!)

Mechanical Discrepancy = Total Mechanical Sales - Tank Movement
                       = 2,530 - 1,570
                       = +960 liters (GAIN - Suspicious!)
```

**Step 3: Calculate Loss/Gain Percentage**
```
Electronic % = (Electronic Discrepancy / Tank Movement) × 100
             = (947.277 / 1,570) × 100
             = +60.3% GAIN ⚠️

Allowable Loss Range: -0.3% to +0.3% for Petrol
Status: CRITICAL - Investigate immediately
```

**Possible Causes of Gain:**
- Incorrect dip reading (most likely)
- Tank calibration error
- Delivery not recorded
- Meter malfunction

**Possible Causes of Loss (if negative):**
- Evaporation
- Spillage during offloading
- Leakage
- Theft

---

### Workflow 3: Validated Triple Reading System

#### Purpose
Cross-validate three independent measurements for accuracy

#### Input (Owner/Supervisor Only)
```
Shift: 2025-12-24-Day
Tank: TANK-DIESEL
Reading Type: Closing

1. Mechanical Total: 15,234 L
2. Electronic Total: 15,245.678 L
3. Dip Reading: 145.8 cm → 15,240 L (converted)
```

#### Computation

**Step 1: Calculate Pairwise Discrepancies**
```
Mech-Elec = |15,234 - 15,245.678| / 15,245.678 × 100
          = 0.077%

Mech-Dip = |15,234 - 15,240| / 15,240 × 100
         = 0.039%

Elec-Dip = |15,245.678 - 15,240| / 15,240 × 100
         = 0.037%
```

**Step 2: Determine Maximum Discrepancy**
```
Max Discrepancy = max(0.077%, 0.039%, 0.037%)
                = 0.077%
```

**Step 3: Validation**
```
Threshold: 0.5% for Diesel

If Max Discrepancy ≤ Threshold:
    Status = PASS ✓
    Confidence: HIGH
Else if Max Discrepancy ≤ 1.0%:
    Status = WARNING ⚠️
    Action: Review readings
Else:
    Status = FAIL ❌
    Action: Re-measure immediately
```

---

## Data Relationships

### Entity Relationship Overview

```
Users (Attendants)
    └── Assigned to → Shifts
                        ├── Contains → Shift Assignments
                        │              ├── Islands
                        │              └── Nozzles
                        └── Has → Dual Readings
                                    └── Per Nozzle
```

### Reading → Sales Flow

```
1. Dual Reading (Raw Data)
   ├── Nozzle ID
   ├── Shift ID
   ├── Electronic Value
   ├── Mechanical Value
   └── Timestamp

2. Processed into Sales Record
   ├── Calculate Movement
   ├── Calculate Discrepancy
   ├── Validate against threshold
   ├── Calculate Revenue
   └── Store with Validation Status

3. Aggregated for Reports
   ├── Daily Sales Report
   ├── Shift Reconciliation
   └── Tank Reconciliation
```

---

## Key Features by Module

### 1. **Readings Module**

**Endpoint:** `/api/v1/nozzles`

**Features:**
- Submit opening/closing readings
- OCR integration for automatic reading capture
- Validation of reading sequences (closing > opening)
- Discrepancy flagging
- Historical reading tracking

**Validation Rules:**
- Closing reading must be greater than opening reading
- Reading must be within reasonable range
- Timestamp must be within shift period

---

### 2. **Sales Module**

**Endpoint:** `/api/v1/sales`

**Features:**
- Automatic sales calculation from readings
- Dual meter validation
- Revenue computation
- Credit sales tracking
- Sales report generation

**Computation Formula:**
```python
def calculate_sale(opening_electronic, opening_mechanical,
                  closing_electronic, closing_mechanical, unit_price):

    # Calculate volumes
    electronic_volume = closing_electronic - opening_electronic
    mechanical_volume = closing_mechanical - opening_mechanical

    # Calculate discrepancy
    discrepancy = electronic_volume - mechanical_volume
    discrepancy_percent = (discrepancy / electronic_volume) * 100

    # Validate
    if abs(discrepancy_percent) > allowable_threshold:
        status = "FAIL"
    else:
        status = "PASS"

    # Calculate revenue using average
    average_volume = (electronic_volume + mechanical_volume) / 2
    total_amount = average_volume * unit_price

    return {
        "electronic_volume": electronic_volume,
        "mechanical_volume": mechanical_volume,
        "discrepancy_percent": discrepancy_percent,
        "average_volume": average_volume,
        "total_amount": total_amount,
        "validation_status": status
    }
```

---

### 3. **Reconciliation Module**

**Endpoint:** `/api/v1/reconciliation`

**Features:**
- Daily shift reconciliation
- Tank dip vs. sales comparison
- Multi-product revenue aggregation
- Cash vs. credit breakdown
- Cumulative difference tracking

**Revenue Sources:**
1. **Petrol Sales**: Electronic + Mechanical average × Price
2. **Diesel Sales**: Electronic + Mechanical average × Price
3. **LPG Sales**: Quantity × Price per KG
4. **Lubricants**: Quantity × Unit Price
5. **LPG Accessories**: Quantity × Unit Price

**Reconciliation Formula:**
```
Total Expected Cash =
    Petrol Revenue
    + Diesel Revenue
    + LPG Revenue
    + Lubricants Revenue
    + Accessories Revenue
    - Credit Sales Total

Difference = Actual Deposited - Total Expected Cash

Cumulative Difference = Sum of all daily differences
```

---

### 4. **Reports Module**

**Endpoint:** `/api/v1/reports`

**Available Reports:**

#### Daily Sales Report
- Breakdown by fuel type
- Shift-by-shift analysis
- Opening/closing readings
- Revenue totals
- Discrepancy summary

#### Stock Movement Report
- Tank opening/closing levels
- Deliveries received
- Total sales volume
- Calculated losses/gains
- Variance analysis

#### Attendant Performance Report
- Sales by attendant
- Assigned nozzles performance
- Discrepancy rates
- Shift coverage

---

### 5. **Settings Module**

**Endpoint:** `/api/v1/settings`

**Configurable Parameters:**

#### Fuel Pricing
- Diesel price per liter (default: 150 ZMW)
- Petrol price per liter (default: 160 ZMW)

#### Allowable Losses
- Diesel allowable loss: 0.3% (during offloading)
- Petrol allowable loss: 0.5% (during offloading)

#### System Information
- Business name
- License key
- Contact details
- Station location
- Software version (read-only)

---

## Validation and Data Integrity

### 1. **Foreign Key Validation**

The system enforces referential integrity:

```
Shift Assignment Validation:
├── Attendant must exist (role = 'user')
├── Islands must exist in system
├── Nozzles must exist in system
└── Nozzles must belong to assigned islands

Reading Validation:
├── Nozzle must exist
├── Shift must exist
└── Attendant must be assigned to that nozzle

Sales Validation:
├── Shift must exist
└── Fuel type must match nozzle configuration
```

### 2. **Business Rule Validation**

**Shift Rules:**
- One Day shift per date
- One Night shift per date
- No overlapping nozzle assignments
- Attendants must have 'user' role

**Reading Rules:**
- Closing > Opening
- Timestamps within shift period
- Discrepancy within allowable range

**Sales Rules:**
- Valid fuel type (Diesel/Petrol)
- Positive volumes only
- Price must be > 0

### 3. **Data Consistency Checks**

```python
# Example: Prevent duplicate shift IDs
if shift_id already exists:
    if updating:
        use PUT endpoint
    else:
        return error "Shift already exists"

# Example: Validate nozzle assignment uniqueness
all_assigned_nozzles = []
for assignment in shift.assignments:
    all_assigned_nozzles.extend(assignment.nozzle_ids)

if has_duplicates(all_assigned_nozzles):
    raise ValidationError("Nozzle assigned to multiple attendants")
```

---

## System Architecture

### Request Flow

```
Frontend (Next.js)
    ↓ HTTP Request
API Layer (FastAPI)
    ↓ Validation (Pydantic)
Business Logic Layer
    ↓ Validation Services
    ↓ Calculation Services
Data Layer (STORAGE)
    ↓ Read/Write
In-Memory Dictionary
```

### Key Design Patterns

1. **Separation of Concerns**
   - Models: Data structure definitions
   - Services: Business logic and validation
   - API: Request handling and routing

2. **Dependency Injection**
   - Authentication dependencies
   - Role-based access control

3. **Centralized Storage**
   - Single STORAGE dictionary
   - Shared across all modules

4. **Dual Reading Strategy**
   - Primary: Electronic (high precision)
   - Backup: Mechanical (reliability)
   - Validation: Compare both readings

---

## Future Enhancements

### Planned Features

1. **Database Integration**
   - Replace in-memory storage with PostgreSQL
   - Enable data persistence across restarts
   - Support for historical data archival

2. **Advanced Analytics**
   - Trend analysis for losses
   - Predictive maintenance alerts
   - Attendant performance metrics

3. **Mobile Application**
   - Native app for attendants
   - Barcode/QR code scanning for quick reading entry
   - Offline support with sync

4. **Automated Reporting**
   - Scheduled email reports
   - PDF generation
   - Excel export

---

## Glossary

**Dip Reading**: Physical measurement of fuel level in tank using a calibrated dipstick

**Dual Reading**: Two independent meter readings (electronic + mechanical) for the same transaction

**Movement**: The difference between closing and opening readings (fuel dispensed)

**Discrepancy**: The difference between electronic and mechanical meter readings

**Allowable Loss**: Acceptable percentage of fuel loss during delivery/offloading due to evaporation and spillage

**Shift Reconciliation**: Process of matching expected cash (from sales) with actual cash deposited

**Tank Reconciliation**: Comparison of physical tank inventory (dip reading) with calculated inventory (opening + deliveries - sales)

---

## Support and Maintenance

**System Owner**: Fuel Station Management
**Technical Support**: Development Team
**Documentation**: This document + User manuals (Owner, Supervisor, User)

For technical issues, refer to:
- `IMPLEMENTATION_SUMMARY.md`: Technical implementation details
- `DATABASE_RELATIONSHIPS.md`: Data model documentation
- Individual user manuals for role-specific guidance

---

**Document End**

*Last Updated: December 24, 2025*
