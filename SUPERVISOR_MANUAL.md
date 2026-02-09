# Fuel Management System - Supervisor Manual

**Role:** Supervisor
**Version:** 1.0
**Last Updated:** December 2025

---

## Table of Contents

1. Introduction
2. Supervisor Role Overview
3. Login Process
4. Dashboard with Dip Reading Access
5. Nozzles Management
6. Submitting Readings
7. Shift Management
8. Reconciliation Dashboard
9. Account Holders & Credit Sales
10. Inventory Management
11. Sales Recording
12. Reports & Analytics
13. Stock Movement
14. Team Management
15. Troubleshooting

---

## 1. Introduction

Welcome to the Fuel Management System Supervisor Manual. As a **Supervisor**, you have expanded access to manage station operations, financial reconciliation, inventory, and credit accounts.

### Your Responsibilities
- Supervise daily shift operations and attendant activities
- Record and verify shift dip readings for fuel tanks
- Reconcile daily cash and inventory
- Manage credit sales and account holders
- Monitor inventory levels (LPG, Lubricants)
- Receive and verify fuel deliveries
- Generate and review operational reports
- Ensure data accuracy and flag resolution

### System Access Overview

**You Have Access To:**
- ✓ Dashboard (View + Dip Readings)
- ✓ Nozzles (View)
- ✓ Readings (Submit)
- ✓ Shifts (View + Submit Readings)
- ✓ **Reconciliation** (Full Access)
- ✓ **Accounts** (Full Access)
- ✓ **Inventory** (Full Access)
- ✓ **Sales** (View)
- ✓ **Reports** (View)
- ✓ **Stock Movement** (View)

**You Do NOT Have Access To:**
- ✗ Settings (Owner Only)

---

## 2. Supervisor Role Overview

### Key Differences from User Role

**User (Attendant)**:
- Submit readings only
- View-only for most features
- Cannot access financial/inventory data

**Supervisor (You)**:
- All User capabilities PLUS:
- Enter tank dip readings
- Full reconciliation access
- Manage credit accounts
- Monitor inventory
- Receive deliveries
- View detailed reports

### Daily Workflow

**Shift Start (6 AM Day / 6 PM Night)**:
1. Log into system
2. Verify active shift created
3. Record opening tank dip readings (Dashboard)
4. Supervise attendants submitting nozzle readings
5. Check tank levels and alerts

**During Shift**:
1. Monitor operations via Dashboard
2. Process credit sales (Accounts page)
3. Handle inventory sales (LPG, Lubricants)
4. Respond to discrepancy alerts
5. Assist attendants with issues

**Shift End**:
1. Record closing tank dip readings (Dashboard)
2. Verify all attendant readings submitted
3. Perform shift reconciliation
4. Review cash vs expected revenue
5. Document any variances
6. Prepare handover notes

---

## 3. Login Process

### Accessing the System

1. Open web browser
2. Navigate to Fuel Management System URL
3. Login screen displays

### Supervisor Credentials

**Demo Account** (Testing):
- Username: `supervisor1`
- Password: `super123`
- Click: "👔 Supervisor: supervisor1 / super123"

**Production**:
- Use your assigned credentials
- Contact owner/admin for password reset

### After Login

You'll see:
- Full navigation menu (Dashboard → Stock Movement)
- **Your name** in top-right
- **Role badge**: "👔 Supervisor"
- Red "Logout" button

**Navigation Menu**:
```
Dashboard | Nozzles | Readings | Shifts |
Reconciliation | Accounts | Inventory | Sales |
Reports | Stock Movement
```

---

## 4. Dashboard with Dip Reading Access

### Page Overview

Dashboard shows real-time operations with **enhanced access** for Supervisors.

### Date Selector
- Select any date to view historical data
- Default: Today's date
- Format: YYYY-MM-DD

### Real-Time Tank Levels

#### Diesel Tank (Orange Card)
**Displays**:
- 🛢️ Diesel Tank header
- Current Level: e.g., "25,000 L"
- Progress bar (Green/Yellow/Red)
- Percentage full
- Capacity and available space
- Last updated timestamp (auto-refresh every 5 seconds)

#### Petrol Tank (Blue Card)
**Displays**:
- ⛽ Petrol Tank header
- Same information structure as Diesel
- Blue color scheme
- Real-time updates

### Dip Reading Section (SUPERVISOR ACCESS)

**IMPORTANT**: As a Supervisor, you can **EDIT and SAVE** dip readings. Users can only view them.

#### What Are Dip Readings?

Dip readings are physical measurements of fuel levels in tanks using a dip stick:
- **Measured in**: Centimeters (cm)
- **Types**: Opening Dip (shift start) and Closing Dip (shift end)
- **Purpose**: Verify electronic tank levels with physical measurement
- **Reconciliation**: Used to calculate fuel delivered vs sold

#### Diesel Tank Dip Readings

**Visual Design**:
- Located within Diesel tank card
- Orange theme border
- Badge shows: "👔 Supervisor" (indicating your access)

**Current Readings Display** (if saved):
```
📏 Shift Dip Readings (cm)          [👔 Supervisor]

Current Readings:
Opening: 135.5 cm → 25,000 L
Closing: 120.8 cm → 22,500 L
Last updated: 6:05 AM by John Smith
```

**Input Fields**:

1. **Opening Dip**:
   - Label: "Opening Dip"
   - Input type: Number
   - Step: 0.1 (allows decimals)
   - Placeholder: "cm"
   - Example: 135.5

2. **Closing Dip**:
   - Label: "Closing Dip"
   - Input type: Number
   - Step: 0.1
   - Placeholder: "cm"
   - Example: 120.8

**Save Button**:
- Blue button: "Save Dip Readings"
- Saves both readings to database
- Updates tank level calculation
- Shows success message

#### How to Record Dip Readings

**STEP 1: Take Physical Measurement**

At shift start (Opening):
1. Get dip stick from storage
2. Clean dip stick thoroughly
3. Lower into Diesel tank through dip port
4. Wait until it touches bottom
5. Remove and read wet mark
6. Measure in centimeters (e.g., 135.5 cm)
7. Record number

At shift end (Closing):
1. Repeat same process
2. Measure current level
3. Should be lower than opening (fuel was sold)

**STEP 2: Enter into System**

1. Go to Dashboard
2. Scroll to Diesel Tank card
3. Find "📏 Shift Dip Readings (cm)" section
4. Click in "Opening Dip" input box
5. Type measurement: e.g., `135.5`
6. Click in "Closing Dip" input box (if shift ending)
7. Type measurement: e.g., `120.8`

**STEP 3: Save**

1. Click "Save Dip Readings" button
2. Wait for processing
3. Success alert appears:
   ```
   ✓ Diesel Tank Dip Readings Saved!
   Tank level updated to 25,000 L
   ```
4. Current readings box updates with your entry
5. Shows your name and timestamp

#### Petrol Tank Dip Readings

**Same process as Diesel**:
- Located in Petrol tank (blue) card
- Opening and Closing dip fields
- Save button
- Blue color scheme

**Recording Process**: Identical to Diesel tank

#### Understanding Volume Conversion

The system automatically converts dip readings to liters using tank charts:

**Example (Diesel Tank)**:
- Dip Reading: 135.5 cm
- Tank Chart Lookup: 135.5 cm = 25,000 L
- Display: "135.5 cm → 25,000 L"

**Why This Matters**:
- Verifies electronic tank sensors
- Detects meter errors or leaks
- Required for accurate reconciliation
- Industry standard practice

#### Best Practices for Dip Readings

**DO**:
- Record at exact shift change times
- Clean dip stick before each measurement
- Wait for stick to settle before reading
- Measure to nearest 0.1 cm (one decimal)
- Record immediately in system
- Double-check entered numbers

**DON'T**:
- Estimate or round to whole numbers
- Skip measurements (required for reconciliation)
- Use dirty or bent dip stick
- Measure during fuel delivery
- Record if tank is actively dispensing

**Timing Guidelines**:
- **Opening**: Within 15 minutes of shift start
- **Closing**: Within 15 minutes of shift end
- Coordinate with nozzle readings

### Daily Summary Card

Shows for selected date:
- Volume Records count
- Cash Variance Records count
- Flags/Discrepancies count

### Recent Discrepancies Card

Displays recent alerts:
- Reading mismatches
- Cash variances
- System flags
- Red highlighting for attention

**Your Action**:
- Review each discrepancy
- Investigate causes
- Document findings
- Resolve or escalate

### Quick Stats Cards

Three cards at bottom:
1. **Total Nozzles**: Active nozzle count
2. **Today's Sales**: Transaction total
3. **Alerts**: Flag count

---

## 5. Nozzles Management

### Page Access

As Supervisor, you have **VIEW access** to nozzles.

### Page Content

**Same as User role**:
- View all islands
- See pump stations
- Check nozzle status (Active/Inactive/Maintenance)
- View nozzle IDs and fuel types

**What You Cannot Do**:
- Change nozzle status
- Add/remove nozzles
- Edit nozzle configuration

**What You Should Do**:
- Monitor nozzle status
- Report malfunctions to owner
- Coordinate maintenance
- Ensure attendants using correct IDs

### Summary Statistics

View at page bottom:
- Total Islands
- Total Pump Stations
- Total Nozzles
- Active Nozzles

---

## 6. Submitting Readings

### Access Level

As Supervisor, you have **FULL ACCESS** to submit readings.

### Capabilities

**Same as User role**:
- Submit dual meter readings
- Upload nozzle photos for OCR
- Enter electronic readings
- Validate readings
- View submission results

**Refer to User Manual Section 7** for detailed reading submission process.

### Supervisor Considerations

**When to Submit**:
- Backup for attendants
- Verify suspicious readings
- Emergency coverage
- Training demonstrations

**Quality Control**:
- Review attendant submissions
- Check validation results
- Monitor discrepancy patterns
- Address recurring issues

---

## 7. Shift Management

### Enhanced Access

As Supervisor, you can **VIEW and SUBMIT** shift readings.

### Active Shift Monitoring

**View**:
- Current shift type (Day/Night)
- Shift ID and date
- Status (Active/Completed/Reconciled)
- Attendants on duty
- Start time

**Submit Dual Readings**:

Unlike Users, you can submit readings directly from Shifts page.

**Form Fields**:

1. **Nozzle**: Dropdown of all nozzles
2. **Reading Type**: Opening or Closing
3. **Electronic Reading**: 3 decimal places (e.g., 12345.678)
4. **Mechanical Reading**: Whole number (e.g., 12345)
5. **Attendant**: Select from dropdown:
   - Violet, Shaka, Trevor, Chileshe
   - Matthew, Mubanga, Isabel, Prosper
6. **Tank Dip (cm)**: Optional physical tank measurement

**Submit Button**:
- Disabled if no active shift
- Blue "Submit Dual Reading" button
- Success alert on completion

### Nozzle Status Overview

Right panel shows:
- All nozzles with current status
- Latest readings (Electronic & Mechanical)
- Color-coded by fuel type
- Real-time updates

### Shift Information Panel

**Key Data**:
- Day Shift: 6:00 AM - 6:00 PM
- Night Shift: 6:00 PM - 6:00 AM
- Required: Opening & Closing for all 8 nozzles
- Dual readings for verification
- Tank dips for inventory reconciliation

### Supervisor Shift Duties

**Opening Shift**:
1. Ensure shift auto-created in system
2. Record tank dip readings (Dashboard)
3. Verify attendants submit nozzle openings
4. Check all 8 nozzles covered
5. Document any issues

**During Shift**:
1. Monitor Nozzle Status panel
2. Respond to attendant questions
3. Handle exceptions
4. Track discrepancies

**Closing Shift**:
1. Ensure all closing readings submitted
2. Record closing tank dips (Dashboard)
3. Verify reading completeness
4. Prepare for reconciliation

---

## 8. Reconciliation Dashboard

### Overview

**CRITICAL FEATURE**: As Supervisor, reconciliation is a core daily responsibility.

### Page Header
- **Title**: "Shift Reconciliation Dashboard"
- **Description**: "Daily cash and inventory reconciliation - Matching Excel Summary Sheet"

### Purpose

Reconciliation verifies:
- Expected revenue vs actual cash deposited
- All product categories accounted for
- Credit sales properly deducted
- Variance identification (shortage/overage)
- Loss prevention tracking

### Date Selector

**Location**: Top of page

**Fields**:
- **Input**: Date picker
- **Button**: "Load Reconciliation"

**How to Use**:
1. Click date input
2. Select date from calendar
3. Click "Load Reconciliation" button
4. Wait for data to load (2-5 seconds)
5. Reconciliation cards appear below

### Reconciliation Cards

Each shift (Day/Night) displays as a detailed card.

#### Day Shift Card (Yellow/Orange Gradient)

**Header**:
```
☀️ Day Shift Reconciliation                [+ZMW 150.00]
2025-12-15 | Shift ID: SHIFT-20251215-DAY
```

**Difference Badge** (top-right):
- **Green**: ZMW 0.00 (Perfect match)
- **Blue**: +ZMW amount (Overage - excess cash)
- **Red**: -ZMW amount (Shortage - cash missing)

#### Night Shift Card (Indigo/Purple Gradient)

**Header**:
```
🌙 Night Shift Reconciliation               [-ZMW 75.50]
2025-12-15 | Shift ID: SHIFT-20251215-NIGHT
```

### Revenue Breakdown Section

**Five product categories displayed**:

1. **Petrol Revenue** (Blue Card)
   ```
   Petrol Revenue
   ZMW 15,234.50
   @ ZMW 29.92/L
   ```

2. **Diesel Revenue** (Orange Card)
   ```
   Diesel Revenue
   ZMW 22,450.75
   @ ZMW 26.98/L
   ```

3. **LPG Revenue** (Purple Card)
   ```
   LPG Revenue
   ZMW 3,500.00
   Gas + Accessories
   ```

4. **Lubricants** (Green Card)
   ```
   Lubricants
   ZMW 1,250.00
   ```

5. **Accessories** (Cyan Card)
   ```
   Accessories
   ZMW 450.00
   ```

### Financial Calculation Flow

**STEP 1: Total Expected Revenue** (Blue Gradient Card)
```
Total Expected Revenue (All Products)
Petrol + Diesel + LPG + Lubricants + Accessories
ZMW 42,885.25
```

**STEP 2: Less Credit Sales** (Yellow Card)
```
Less: Credit Sales
Institutional & Corporate Accounts
- ZMW 5,200.00
```

**STEP 3: Expected Cash** (Green Gradient Card)
```
Expected Cash
Total Revenue - Credit Sales
ZMW 37,685.25
```

**STEP 4: Actual Deposited** (Gray Card)
```
Actual Cash Deposited
Bank deposit amount
ZMW 37,835.25
```

**STEP 5: Difference Analysis** (Color-coded Card)

**Perfect Match** (Green):
```
✅ Perfect Match
Actual - Expected
ZMW 0.00
```

**Overage** (Blue):
```
📈 Overage (Excess Cash)
Actual - Expected
+ZMW 150.00
```

**Shortage** (Red):
```
📉 Shortage (Cash Short)
Actual - Expected
-ZMW 75.50
```

**STEP 6: Cumulative Difference** (Purple Card)
```
Cumulative Difference (Running Total)
+ZMW 74.50
```

This tracks total variance across all shifts for loss/gain analysis.

### How to Perform Reconciliation

**STEP 1: Select Date**

1. Click date picker at top
2. Select shift date
3. Click "Load Reconciliation"
4. Wait for data to populate

**STEP 2: Review Revenue Breakdown**

1. Check each product category revenue
2. Verify amounts seem reasonable
3. Compare to previous days
4. Note any unusual spikes or drops

**STEP 3: Verify Credit Sales**

1. Check credit sales total
2. Confirm matches credit transactions recorded
3. Review Accounts page if needed
4. Ensure all credit sales captured

**STEP 4: Calculate Expected Cash**

System auto-calculates:
```
Expected Cash = Total Revenue - Credit Sales
```

Verify calculation manually as double-check.

**STEP 5: Enter Actual Deposited**

*Note: Current system shows this field. Owner may update it, or you may have access in your configuration.*

If you enter it:
1. Get bank deposit receipt
2. Note exact amount deposited
3. Enter in system
4. Save

**STEP 6: Analyze Difference**

**If Perfect Match (ZMW 0.00)**:
- ✓ Excellent! No action needed
- Document for records
- Commend team accuracy

**If Overage (Positive)**:
- Extra cash found
- Investigate source:
  - Counting error?
  - Forgotten sale recorded later?
  - Customer overpayment?
- Document explanation
- Secure excess funds
- Report to owner

**If Shortage (Negative)**:
- Cash missing
- **IMMEDIATE ACTIONS**:
  - Recount physical cash
  - Review all sales receipts
  - Check credit sales recorded correctly
  - Interview shift attendants
  - Review security footage if available
  - Document investigation
  - Report to owner
  - Follow company shortage policy

**STEP 7: Review Cumulative Difference**

- Track running total of all variances
- Positive cumulative: Net overage
- Negative cumulative: Net shortage
- Identify patterns or trends
- Escalate significant cumulative losses

**STEP 8: Document Notes**

If "Notes" field available:
- Record any unusual circumstances
- Explain variances
- Document corrective actions
- Note follow-up required

### Reconciliation Best Practices

**Daily Habits**:
- Reconcile EVERY shift (Day & Night)
- Don't skip or postpone
- Document same day as shift
- Investigate variances immediately
- Maintain detailed notes

**Accuracy Tips**:
- Verify all attendant readings submitted
- Confirm credit sales recorded
- Double-check cash counts
- Use standardized counting procedures
- Have second person verify large amounts

**Variance Investigation**:
- Check for data entry errors first
- Review original receipts/records
- Interview relevant staff
- Check for system glitches
- Document findings thoroughly

**Reporting**:
- Report all shortages to owner
- Highlight significant overages
- Track variance trends
- Provide weekly/monthly summaries
- Recommend process improvements

### Understanding the Reconciliation Formula

```
1. Petrol Revenue = (Petrol Sold in L) × (Price per L)
2. Diesel Revenue = (Diesel Sold in L) × (Price per L)
3. LPG Revenue = LPG Gas + LPG Accessories
4. Lubricants Revenue = (Units Sold) × (Unit Prices)
5. Accessories Revenue = (Units Sold) × (Unit Prices)

TOTAL EXPECTED REVENUE = Sum of all above

6. Credit Sales Total = Sum of all credit account sales
   (These sales are NOT paid in cash)

EXPECTED CASH = Total Revenue - Credit Sales

7. Actual Deposited = Physical cash counted and deposited

DIFFERENCE = Actual Deposited - Expected Cash

CUMULATIVE DIFFERENCE = Sum of all daily differences
```

### Information Panel

Bottom of page explains:
- Calculation methodology
- What each term means
- Positive vs negative differences
- Cumulative tracking purpose

---

## 9. Account Holders & Credit Sales

### Overview

Manage institutional and corporate credit accounts.

### Page Header
- **Title**: "Account Holders & Credit Sales"
- **Description**: "Manage institutional and corporate credit accounts"

### Credit Account System

**What Are Credit Accounts?**

Certain customers (government, companies, institutions) buy fuel on credit:
- **Not paid immediately** in cash
- **Invoiced** at end of month
- **Deducted** from expected cash in reconciliation
- **Tracked** by account balance

**14 Pre-configured Accounts** from Luanshya Station:
- POS (Point of Sale machines)
- Police Department
- ZACODE
- Corporate fleets
- Government vehicles
- Institutions

### Record Credit Sale Form

**Location**: Top of page in white card

**Form Title**: "📝 Record Credit Sale"

#### Form Fields

**1. Account Holder** (Dropdown)
- Select from list of 14 accounts
- Format: "Account Name (Account Type)"
- Example: "Zambia Police (Institution)"

**2. Fuel Type** (Dropdown)
- **Petrol**: ZMW 29.92/L
- **Diesel**: ZMW 26.98/L
- Price shown in dropdown

**3. Volume (Liters)** (Number Input)
- Amount of fuel dispensed
- Step: 0.01 (allows decimals)
- Example: 500.00
- Required field

**4. Total Amount** (Auto-calculated, Read-only)
- Automatically calculates: Volume × Price per Liter
- Large, bold text
- Gray background (cannot edit)
- Example: ZMW 13,490.00

**5. Notes** (Text Input, Optional)
- Vehicle registration
- Driver name
- Invoice/reference number
- Any special instructions
- Placeholder: "e.g., Vehicle registration, driver name, etc."

#### How to Record Credit Sale

**STEP 1: Customer Requests Credit Purchase**

1. Customer arrives (e.g., police vehicle)
2. Identifies as credit account holder
3. Shows authorization (ID, requisition form, etc.)
4. Requests fuel

**STEP 2: Verify Authorization**

1. Check customer has valid credit account
2. Verify account not over limit
3. Confirm proper authorization documentation
4. Check photo ID if required by policy

**STEP 3: Dispense Fuel**

1. Attendant dispenses fuel at nozzle
2. Note exact volume from nozzle meter
3. Get vehicle/driver information
4. Collect any required signatures

**STEP 4: Enter in System**

1. Go to Accounts page
2. Find "Record Credit Sale" form
3. **Account Holder**: Click dropdown
   - Scroll to find account
   - Select: e.g., "Zambia Police (Institution)"
4. **Fuel Type**: Click dropdown
   - Select Petrol or Diesel
   - Price auto-fills
5. **Volume**: Click input
   - Type exact liters from nozzle
   - Example: `500.00`
   - Amount auto-calculates as you type
6. **Notes**: Click input (optional but recommended)
   - Type: Vehicle registration
   - Example: `ABD 1234, Officer John Mwamba`

**STEP 5: Submit**

1. Verify all information correct
2. Check auto-calculated amount
3. Click blue "Record Credit Sale" button
4. Wait for processing
5. Success alert: "✓ Credit sale recorded successfully!"
6. Form clears automatically

**STEP 6: Provide Receipt**

1. Give customer receipt/invoice
2. Note sale recorded under their account
3. Remind payment due date
4. Get any required signatures

### Account Holders Display

**Location**: Below form

**Title**: "💳 Account Holders"

**Layout**: Grid of cards (3 columns on desktop)

#### Account Card Details

**Card Header**:
- **Account Name**: Large, bold (e.g., "Zambia Police")
- **Account ID**: Small text (e.g., "ACC-POLICE")
- **Account Type Badge**: Color-coded
  - Blue: Corporate
  - Purple: Institution
  - Green: Individual
  - Orange: POS

**Current Balance** (Large Display):
```
Current Balance
ZMW 12,450.00
```
Amount owed by customer.

**Credit Limit**:
```
Credit Limit
ZMW 50,000.00
```
Maximum they can owe.

**Credit Utilization Bar**:
- Visual progress bar
- Shows percentage: Balance / Limit
- Colors:
  - **Green**: 0-50% (safe)
  - **Yellow**: 50-75% (caution)
  - **Orange**: 75-90% (warning)
  - **Red**: 90-100% (critical - near limit)
- Percentage displayed

**Available Credit**:
```
Available Credit
ZMW 37,550.00
```
How much more they can purchase.

**Contact Information** (if available):
```
Contact: John Smith
Phone: +260 123 456 789
```

#### Account Card Example

```
[PURPLE CARD - Institution Badge]

Zambia Police                    [Institution]
ID: ACC-POLICE

Current Balance
ZMW 12,450.00

Credit Limit
ZMW 50,000.00

Credit Utilization
[========25%=====                ] 25%

Available Credit
ZMW 37,550.00

Contact: Superintendent Banda
Phone: +260 123 456 789
```

### Credit Limit Enforcement

**System Prevents**:
- Sales exceeding available credit
- Automatic rejection if over limit
- Error message: "Credit limit exceeded"

**Your Action**:
- Inform customer of limit issue
- Contact account manager
- Arrange payment to reduce balance
- Or escalate to owner for limit increase

### Managing Account Balances

**When Customer Pays**:
1. Receive payment (cash, bank transfer)
2. Verify payment cleared
3. Owner or system admin reduces balance
4. Balance updates in system
5. Customer can purchase again

**Regular Reviews**:
- Check high-balance accounts weekly
- Follow up on overdue payments
- Report to owner for collection
- Recommend credit limit adjustments

### Best Practices

**Credit Sale Recording**:
- Record immediately after dispensing
- Always include notes (vehicle, driver)
- Double-check account selection
- Verify volume accuracy
- Keep paper backup if policy requires

**Account Monitoring**:
- Review utilization daily
- Flag accounts near limits
- Track payment patterns
- Report delinquent accounts
- Maintain good customer relations

**Security**:
- Verify customer authorization
- Check ID when required
- Don't extend credit without approval
- Document suspicious requests
- Follow company credit policy strictly

### Information Panel

Bottom of page explains:
- 14 pre-configured accounts from Luanshya
- Credit limit enforcement
- Real-time balance tracking
- Account types
- Integration with reconciliation
- Payment recording process

---

## 10. Inventory Management

### Overview

Manage LPG accessories and lubricants inventory.

### Page Header
- **Title**: "Inventory Management"
- **Description**: "LPG Gas, Accessories, and Lubricants"

### Tab Navigation

Two main tabs:
1. **🔥 LPG & Accessories**
2. **🛢️ Lubricants**

Click tabs to switch between views.

---

### LPG & Accessories Tab

#### Section Header
- **Title**: "LPG Accessories Inventory"
- **Description**: "Gas stoves, cookers, hoses, and regulators"

#### Product Categories

**4 LPG Accessory Products**:
1. 2 Plate Stove (Swivel)
2. 2 Plate Stove (Bullnose)
3. Cadac Cooker Top
4. LPG Hose & Regulator Set

#### Product Card Layout

Each accessory shows as a card:

**Card Header**:
- Product Code (e.g., "LPG-STOVE-SWIVEL")
- Product Description (e.g., "2 Plate Stove - Swivel Design")

**Unit Price** (Blue box):
```
Unit Price
ZMW 450.00
```

**Current Stock**:
```
Current Stock
15 units
```

**Stock Level Progress Bar**:
- Visual bar showing: Current / Opening Stock
- Percentage displayed
- Colors:
  - **Green**: 50-100% (healthy)
  - **Yellow**: 20-50% (monitor)
  - **Red**: 0-20% (low stock alert)

**Opening Stock**:
```
Opening Stock: 25
```

**Low Stock Alert** (if applicable):
```
[RED BOX]
⚠️ Low Stock - Reorder Soon!
```

#### Example Product Card

```
[WHITE CARD - Orange Border]

Product Code: LPG-STOVE-SWIVEL

2 Plate Stove - Swivel Design

[BLUE BOX]
Unit Price
ZMW 450.00

Current Stock: 15

Stock Level
[=======60%=======              ] 60%

Opening Stock: 25
```

#### Managing LPG Inventory

**Daily Monitoring**:
1. Check stock levels daily
2. Note products below 50%
3. Flag products below 20%
4. Prepare reorder list

**When Stock Sells**:
- System auto-decrements count
- Updates in real-time
- Recalculates stock percentage
- Triggers alerts if low

**Reordering**:
1. Identify low stock items
2. Check reorder points (company policy)
3. Prepare purchase requisition
4. Submit to owner for approval
5. Track incoming deliveries

**Receiving New Stock**:
1. Owner/Admin updates system
2. Stock count increases
3. Opening stock may reset
4. Verify physically vs system

#### LPG Information Panel

Bottom section explains:
- 4 accessory products available
- LPG Gas sales tracked separately (by kg)
- Automatic inventory updates on sales
- Revenue tracking (LPG Gas + Accessories combined)

---

### Lubricants Tab

#### Section Header
- **Title**: "Lubricants Inventory"
- **Description**: "Engine oils, transmission fluids, brake fluids, and coolants"

#### Two-Location System

Lubricants stored in **two locations**:

1. **Island 3** (Active Sales Location)
   - Products available for immediate sale
   - Customer-facing inventory
   - Depletes as sales occur

2. **Buffer** (Reserve Stock)
   - Backup storage
   - Replenishes Island 3 when low
   - Not directly accessible to customers

#### Island 3 Section

**Header**:
```
[BLUE BADGE: Island 3]  Active Sales Location
```

**8 Lubricant Products** in grid layout (3 columns):

1. **Engine Oils**:
   - 10W-30 Engine Oil
   - 15W-40 Engine Oil
   - 20W-50 Engine Oil

2. **Transmission Fluid**:
   - ATF (Automatic Transmission Fluid)

3. **Brake Fluid**:
   - DOT 3 Brake Fluid
   - DOT 4 Brake Fluid

4. **Coolant**:
   - Engine Coolant/Antifreeze

5. **Other**:
   - Gear Oil

#### Lubricant Product Card (Island 3)

**Card Design**: Blue border (active sales)

**Information Displayed**:

**Header**:
- Product Code (e.g., "LUB-10W30")
- Product Description (e.g., "10W-30 Engine Oil 4L")
- Location Badge: "Island 3"

**Category**:
```
Category
Engine Oil
```

**Pricing** (2 columns):
```
Unit Price              Stock Value
ZMW 85.00              ZMW 1,700.00
```

**Current Stock**:
```
Current Stock
20 units
```

**Stock Level Progress Bar**:
- Shows: Current / Opening
- Percentage
- Color-coded (Green/Yellow/Red)

**Opening Stock**:
```
Opening Stock: 50 units
```

**Transfer Alert** (if stock low):
```
[YELLOW BOX]
⚠️ Transfer from Buffer Needed
```

#### Example Lubricant Card (Island 3)

```
[BLUE BORDER CARD]

Code: LUB-10W30              [Island 3]

10W-30 Engine Oil 4L

Category: Engine Oil

Unit Price      Stock Value
ZMW 85.00      ZMW 1,700.00

Current Stock
20 units

Stock Level
[====40%====               ] 40%

Opening Stock: 50 units

[YELLOW BOX]
⚠️ Transfer from Buffer Needed
```

#### Buffer Section

**Header**:
```
[PURPLE BADGE: Buffer]  Reserve Stock
```

**Same 8 Products** as Island 3, but:
- Stored in reserve
- Not immediately available for sale
- Replenishes Island 3

#### Lubricant Card (Buffer)

**Card Design**: Purple border (reserve)

**Simplified Display**:
- Product Code & Description
- Location Badge: "Buffer"
- Current Stock
- Unit Price
- Total Value

**Example**:
```
[PURPLE BORDER CARD]

Code: LUB-10W30              [Buffer]

10W-30 Engine Oil 4L

Current Stock: 30
Unit Price: ZMW 85.00
Total Value: ZMW 2,550.00
```

#### Managing Lubricant Inventory

**Daily Tasks**:
1. Check Island 3 stock levels
2. Note items below 30%
3. Check Buffer availability
4. Plan transfers if needed

**When to Transfer from Buffer to Island 3**:

**Trigger**: Island 3 stock drops to 30% or lower

**Process**:
1. Check Buffer has stock available
2. Decide transfer quantity
3. Physically move units from Buffer to Island 3
4. **Update system** (Owner/Admin typically)
5. Verify counts match

**Example Transfer**:
```
Product: 10W-30 Engine Oil
Island 3: 20 units (40% of 50)
Buffer: 30 units

Action: Transfer 20 units Buffer → Island 3

Result:
Island 3: 40 units (80%)
Buffer: 10 units
```

**Reordering Lubricants**:

**When Buffer is Low**:
1. Monitor Buffer levels
2. Flag products below minimum
3. Prepare purchase order
4. Submit to owner
5. Coordinate delivery

**Receiving New Stock**:
1. Stock delivered to station
2. Count and verify quantities
3. Usually goes to Buffer first
4. Update system (Owner/Admin)
5. Check physical vs system match

#### Lubricant Categories

**Engine Oil**:
- Various viscosities (10W-30, 15W-40, 20W-50)
- Used for car/truck engines
- High turnover items

**Transmission Fluid**:
- ATF for automatic transmissions
- Moderate turnover

**Brake Fluid**:
- DOT 3 and DOT 4
- Safety-critical items
- Steady sales

**Coolant**:
- Engine cooling/antifreeze
- Seasonal demand variations

**Other**:
- Gear oil, specialty fluids
- Lower turnover

#### Inventory Value Tracking

Each product card shows:
- **Unit Price**: Cost per item
- **Stock Value**: Total value (Units × Price)

**Important for**:
- Asset tracking
- Financial reporting
- Insurance purposes
- Theft prevention

#### Best Practices

**Inventory Monitoring**:
- Check Island 3 daily
- Review Buffer weekly
- Track fast-moving items
- Identify slow movers
- Report discrepancies immediately

**Stock Transfers**:
- Plan transfers proactively (don't wait until depleted)
- Transfer in batches (e.g., 10-20 units)
- Document each transfer
- Update system same day
- Physical count verification

**Ordering**:
- Maintain minimum stock levels
- Consider lead times
- Order before critical low
- Coordinate with owner
- Track seasonal patterns

**Loss Prevention**:
- Secure storage areas
- Limit access to authorized staff
- Regular physical counts
- Investigate variances
- CCTV coverage if available

#### Information Panel

Bottom section explains:
- Two-location system (Island 3 + Buffer)
- 8 lubricant products
- Stock transfer process
- Categories overview
- Value tracking methodology
- Revenue integration with reconciliation

---

## 11. Sales Recording

### Overview

Record and validate fuel sales transactions.

### Page Header
- **Title**: "Record Sale"
- **Description**: "Track fuel sales and validate volumes"

### Page Layout

Two-column layout:
- **Left**: Sale Details Form (2/3 width)
- **Right**: Result Display (1/3 width)

### Sale Details Form

#### Form Fields

**1. Shift ID** (Text Input)
- Identifies which shift this sale belongs to
- Format: SHIFT-001, SHIFT-20251215-DAY
- Example: `SHIFT-20251215-DAY`
- Required

**2. Nozzle ID** (Text Input)
- Which nozzle dispensed fuel
- Format: N001, N002, etc.
- Example: `N001`
- Required

**3. Pre-Sale Reading** (Number Input)
- Nozzle meter reading BEFORE dispensing
- Decimal allowed (step: 0.01)
- Example: `12345.00`
- Required

**4. Post-Sale Reading** (Number Input)
- Nozzle meter reading AFTER dispensing
- Must be higher than pre-sale
- Example: `12375.50`
- Required

**Expected Volume Display** (Blue Box):
```
Expected Volume: 30.50 liters
```
Auto-calculates: Post - Pre

**5. Volume Dispensed (liters)** (Number Input)
- Actual fuel dispensed
- Should match Expected Volume
- Example: `30.50`
- Required

**6. Cash Received** (Number Input)
- Amount customer paid
- Currency: ZMW
- Example: `1525.00`
- Required

#### How to Record a Sale

**STEP 1: Customer Requests Fuel**

1. Customer arrives at pump
2. Requests specific amount or fills tank
3. Attendant notes nozzle ID being used

**STEP 2: Record Pre-Sale Reading**

1. BEFORE dispensing, check nozzle meter
2. Note current reading (e.g., 12345.00 L)
3. Write it down temporarily

**STEP 3: Dispense Fuel**

1. Attendant dispenses fuel
2. Customer pays cash
3. Note exact amount paid

**STEP 4: Record Post-Sale Reading**

1. AFTER dispensing, check nozzle meter
2. Note new reading (e.g., 12375.50 L)
3. Note volume dispensed (should match nozzle display)

**STEP 5: Enter in System**

Go to Sales page:

1. **Shift ID**: Enter current shift
   - Check Shifts page for ID if unsure
   - Example: `SHIFT-20251215-DAY`

2. **Nozzle ID**: Enter which nozzle used
   - Example: `N001`

3. **Pre-Sale Reading**: Enter reading before sale
   - Example: `12345.00`

4. **Post-Sale Reading**: Enter reading after sale
   - Example: `12375.50`

5. **Check Expected Volume**:
   - System shows: "Expected Volume: 30.50 liters"
   - Verify matches nozzle display

6. **Volume Dispensed**: Enter actual volume
   - Should match Expected Volume
   - Example: `30.50`

7. **Cash Received**: Enter payment amount
   - Example: `1525.00`

**STEP 6: Submit**

1. Review all fields for accuracy
2. Click blue "Record Sale" button
3. Button shows "Recording..." while processing
4. Wait for result (right panel)

### Result Display Panel

#### Success Result

**Green Card**:
```
Success!
Sale ID: SALE-20251215-143045
✓ Sale recorded successfully
```

#### Error Result

**Red Card**:
```
Error
[Error message details]
```

**Common Errors**:
- "Volume mismatch": Dispensed ≠ Expected
  - Tolerance: ±0.05 L
  - Solution: Double-check readings
- "Invalid nozzle ID": Nozzle doesn't exist
  - Solution: Check spelling
- "Invalid shift ID": Shift not found
  - Solution: Verify shift ID from Shifts page
- "Reading too low": Post < Pre
  - Solution: Swap readings if entered backwards

### Validation Information

**Bottom Panel (Yellow Box)**:
```
Note
The system will reject the sale if the volume dispensed doesn't
match the difference between pre and post readings (within a
tolerance of 0.05 liters).
```

**Validation Details**:
- **Expected Volume** = Post Reading - Pre Reading
- **Volume Dispensed** must equal Expected (±0.05 L)
- **Purpose**: Prevent fraud, ensure accuracy
- **Tolerance**: 0.05 L accounts for meter precision

**Additional Validation Section**:
```
Validation
• System validates volume dispensed matches reading difference
• Tolerance: ±0.05 liters
• Discrepancies are flagged for review
```

### When to Record Sales

**Typical Usage**:
- Cash sales requiring detailed tracking
- High-value transactions
- Management spot checks
- Audit trail purposes

**Note**: Not every single sale may be recorded here. This is for:
- Verification purposes
- Random sampling
- Investigation of issues
- Training and quality control

Most sales are captured through shift readings (Opening vs Closing).

### Best Practices

**Recording Accuracy**:
- Write down readings before entering
- Double-check all numbers
- Verify volume matches
- Count cash carefully
- Submit immediately after transaction

**Quality Control**:
- Random sampling of attendant sales
- Verify their reading accuracy
- Check for consistent patterns
- Coach on proper procedures

**When Validation Fails**:
- Recheck nozzle meter readings
- Verify nozzle calibration
- Check for meter malfunction
- Document issues
- Report to owner if recurring

---

## 12. Reports & Analytics

### Overview

View daily summaries, analytics, and discrepancies.

### Page Header
- **Title**: "Reports"
- **Description**: "View daily summaries and analytics"

### Quick Stats Cards (Top)

Three cards showing aggregate data:

**1. Total Readings** (Blue)
```
Total Readings
-
All time
```

**2. Total Sales** (Green)
```
Total Sales
-
All time
```

**3. Discrepancies** (Red)
```
Discrepancies
[Number]
Requires attention
```

### Daily Report Section

#### Date Selector

**Label**: "Select Date"

**How to Use**:
1. Click date input
2. Pick date from calendar
3. Report loads automatically
4. No submit button needed

#### Report Display

**If Data Exists**:

**Summary Cards** (3 columns):

1. **Date**:
   ```
   Date
   2025-12-15
   ```

2. **Volume Records**:
   ```
   Volume Records
   5
   ```

3. **Flags**:
   ```
   Flags
   2
   ```

**Volume Details Table** (if volumes exist):

Table with columns:
- **Nozzle**: Nozzle ID
- **Volume**: Liters dispensed
- **Time**: Timestamp

**Example**:
```
Nozzle    Volume      Time
N001      125.50      14:30:00
N002      87.25       14:35:00
N003      200.00      14:40:00
```

**Cash Variance Table** (if variances exist):

Columns:
- **Description**: What the variance is
- **Amount**: Value in ZMW

**Example**:
```
Description              Amount
Overage - Day Shift      ZMW 50.00
Shortage - Night Shift   -ZMW 25.00
```

**If No Data**:
```
No data available for this date
```

### All Discrepancies Section

**Purpose**: Review all flagged issues requiring attention

#### Discrepancies Table

**Columns**:
- **ID**: Discrepancy identifier
- **Description**: What the issue is
- **Timestamp**: When it occurred
- **Status**: Current status (typically "Pending")

**Status Badge**:
- Red badge: "Pending" (needs investigation)

**Example Row**:
```
ID    Description                             Timestamp            Status
#1    Reading discrepancy: N001 vs N002      2025-12-15 14:30    [Pending]
#2    Cash shortage: Day Shift               2025-12-15 18:05    [Pending]
#3    Mechanical meter mismatch              2025-12-15 16:20    [Pending]
```

**Row Interaction**:
- Hover: Gray highlight
- Click: (Future: May open details)

**If No Discrepancies**:
```
No discrepancies found
```

### Information Panel

**Report Information**:
```
Reports are generated based on readings, sales, and system validations.
All timestamps are in local time.
Export functionality can be added to download reports in CSV or PDF format.
```

### How to Use Reports

**Daily Review**:
1. Each morning, select yesterday's date
2. Review Daily Report section
3. Check volume records make sense
4. Note any cash variances
5. Review flags

**Discrepancy Management**:
1. Go to All Discrepancies table
2. Review each pending item
3. Investigate causes:
   - Check original records
   - Interview staff
   - Review footage if available
4. Document findings
5. Take corrective action
6. Mark resolved (if system allows, or note in records)

**Pattern Analysis**:
1. Review reports across multiple days
2. Identify recurring issues:
   - Specific nozzle problems?
   - Specific shift issues?
   - Specific attendant patterns?
3. Implement preventive measures
4. Provide targeted training

**Monthly Review**:
1. Export/compile data for month
2. Calculate:
   - Total volumes by fuel type
   - Total revenue by category
   - Variance trends
   - Discrepancy frequency
3. Present to owner
4. Recommend improvements

### Exporting Data

**Current**: Manual export not yet implemented

**Workaround**:
1. Take screenshots of key reports
2. Copy data to Excel manually
3. Compile in monthly report document

**Future**: Export buttons for CSV/PDF/Excel

---

## 13. Stock Movement

### Overview

Receive and track fuel deliveries to storage tanks.

### Page Header
- **Title**: "Stock Movement"
- **Description**: "Receive fuel deliveries and track stock levels"

### Page Layout

Two main sections:
- **Left**: Receive Delivery Form
- **Right**: Delivery Result Display
- **Bottom**: Recent Deliveries History

### Receive Delivery Form

**Form Title**: "📦 Receive Delivery"

#### Form Fields

**1. Select Tank** (Dropdown)
- **Options**:
  - 🛢️ Diesel Tank
  - ⛽ Petrol Tank
- Default: Diesel
- Changes fuel type automatically

**2. Expected Volume (Liters)** (Number Input)
- Volume stated on delivery note
- What supplier says they're delivering
- Step: 0.01
- Example: `10000`
- Required
- **Help text**: "Volume stated on delivery note"

**3. Actual Volume Delivered (Liters)** (Number Input)
- Volume measured at receiving
- What you physically measured
- Usually slightly less than expected (loss during transport)
- Step: 0.01
- Example: `9970`
- Required
- **Help text**: "Volume measured at receiving"

**4. Supplier** (Text Input, Optional)
- Name of fuel supplier
- Example: `Total Kenya`, `Puma Energy`, `Indeni`
- Optional but recommended

**5. Delivery Note** (Textarea, Optional)
- Additional notes about delivery
- Rows: 3
- Placeholder: "Additional notes about this delivery..."
- Examples:
  - "Delivery truck #TK-1234"
  - "Driver: John Banda"
  - "Delivery note #DN-20251215-001"

#### How to Receive a Delivery

**STEP 1: Delivery Notification**

1. Fuel tanker arrives at station
2. Driver presents delivery note/invoice
3. Note expected volume on paperwork
4. Check delivery details

**STEP 2: Safety Checks**

1. Ensure area clear of people/vehicles
2. Fire extinguishers ready
3. No smoking signs enforced
4. Ground tanker properly
5. Safety equipment on standby

**STEP 3: Physical Measurement**

**Before Offloading**:
1. Take opening dip reading of your tank
2. Note current level
3. Calculate capacity available
4. Verify tanker can fit

**During Offloading**:
1. Monitor pumping operation
2. Check for spills/leaks
3. Verify correct tank being filled
4. Supervise entire process

**After Offloading**:
1. Wait 15-30 minutes for fuel to settle
2. Take closing dip reading
3. Calculate volume received:
   ```
   Volume Received = Closing Dip Volume - Opening Dip Volume
   ```
4. Compare to delivery note

**STEP 4: Loss Calculation**

```
Loss = Expected Volume - Actual Volume Delivered

Example:
Expected: 10,000 L
Actual: 9,970 L
Loss: 30 L (0.3%)
```

**Acceptable Loss**:
- **Diesel**: 0.3% allowable
- **Petrol**: 0.5% allowable
- Due to evaporation, temperature, measurement precision

**STEP 5: Enter in System**

Go to Stock Movement page:

1. **Select Tank**: Choose Diesel or Petrol
2. **Expected Volume**: Enter from delivery note
   - Example: `10000`
3. **Actual Volume Delivered**: Enter measured volume
   - Example: `9970`
4. **Supplier**: Enter supplier name (optional)
   - Example: `Total Kenya`
5. **Delivery Note**: Add notes (optional)
   - Example: `Delivery note #DN-20251215-001, Driver: John Banda, Truck #TK-1234`

**STEP 6: Submit**

1. Review all entries
2. Verify volumes correct
3. Click blue "Receive Delivery" button
4. Button shows "Processing..." while working
5. Wait for result (right panel)

### Delivery Result Panel

#### Success Result

**Green Card** (top):
```
✓ Delivery received successfully
Delivery ID: DEL-20251215-143045
```

**Previous Level** (Blue Card):
```
Previous Level
25,000 L
```

**New Level** (Green Card):
```
New Level
34,970 L
```

**Volume Added** (Purple Card):
```
Volume Added
9,970 L
Tank now 69.9% full
```

#### Loss Analysis Card

**If Loss Acceptable** (Green):
```
✓ Loss Analysis

Actual Loss        Allowable Loss
30.00 L (0.30%)   30.00 L (0.30%)

Within acceptable limits for diesel delivery
```

**If Loss Exceeds Allowable** (Orange):
```
⚠️ Loss Analysis

Actual Loss        Allowable Loss
80.00 L (0.80%)   30.00 L (0.30%)

Loss exceeds allowable limit! Investigation recommended.
```

**Your Action if Excessive Loss**:
1. Recheck dip readings
2. Verify calculations
3. Inspect for leaks during delivery
4. Check tanker meter calibration
5. Interview driver
6. Document everything
7. Report to owner
8. File claim with supplier if warranted

### Recent Deliveries History

**Location**: Bottom of page

**Title**: "📋 Recent Deliveries"

**Table Columns**:
- **Delivery ID**: Unique identifier
- **Timestamp**: When delivery occurred
- **Fuel Type**: Diesel or Petrol
- **Delivered**: Volume received
- **Loss**: Volume lost
- **Status**: acceptable or excessive

**Example Rows**:
```
Delivery ID            Timestamp              Fuel    Delivered    Loss           Status
DEL-20251215-143045   12/15/2025 2:30 PM    Diesel  9,970 L     30 L (0.30%)   [acceptable]
DEL-20251214-080015   12/14/2025 8:00 AM    Petrol  8,950 L     50 L (0.56%)   [acceptable]
DEL-20251212-101530   12/12/2025 10:15 AM   Diesel  10,015 L    -15 L (-0.15%) [acceptable]
```

**Status Badges**:
- **Green**: "acceptable"
- **Orange**: "excessive"

**Negative Loss** (Overage):
- Rare but possible
- More volume than expected
- Could indicate:
  - Measurement error
  - Temperature expansion
  - Supplier generosity
  - Double-check readings

**Table Features**:
- Hover: Gray highlight
- Sortable (future)
- Auto-refreshes every 10 seconds

### Best Practices

**Delivery Reception**:
- **Always be present** during entire offloading
- Never leave tanker unattended
- Supervise driver operations
- Monitor for safety issues
- Check for contamination (water, wrong product)

**Measurement Accuracy**:
- Use calibrated dip sticks
- Wait for fuel to settle before dipping
- Take multiple readings if unsure
- Account for temperature (hot fuel expands)
- Document weather conditions

**Loss Management**:
- Expect small losses (evaporation, temperature)
- Flag excessive losses immediately
- Document all losses
- Pattern analysis: Track by supplier
- Negotiate with suppliers showing consistent excess loss

**Documentation**:
- Keep paper copies of delivery notes
- Photograph truck meter readings
- Get driver signatures
- Note truck ID, driver name
- File systematically

**Safety Protocol**:
- Follow all safety procedures
- Never rush delivery
- Have emergency plan ready
- Know location of emergency shutoffs
- Keep phone/radio handy

**System Recording**:
- Enter in system same day as delivery
- Don't delay or postpone
- Accurate data entry critical
- Double-check volumes before submitting

### Understanding Allowable Losses

**Why Losses Occur**:
1. **Evaporation**: Fuel evaporates during transport
2. **Temperature**: Hot fuel measures more, cool fuel less
3. **Measurement precision**: Meters not 100% accurate
4. **Residual fuel**: Some remains in tanker hoses
5. **Spillage**: Minor spills during connection/disconnection

**Industry Standards**:
- **Diesel**: 0.2-0.4% allowable (less volatile)
- **Petrol**: 0.3-0.6% allowable (more volatile)
- Your system uses: Diesel 0.3%, Petrol 0.5%

**Owner Can Adjust** these settings in Settings page.

---

## 14. Team Management

### Supervising Attendants

#### Daily Oversight

**Morning Handover**:
1. Review overnight issues (if Night supervisor)
2. Brief day team on focus areas
3. Assign nozzles/areas to attendants
4. Ensure everyone knows their duties

**During Shift**:
1. Monitor work areas
2. Check attendant readings submissions
3. Answer questions promptly
4. Provide on-the-spot coaching
5. Handle customer issues
6. Mediate conflicts

**End of Shift**:
1. Verify all readings submitted
2. Review day's operations
3. Document incidents
4. Brief next shift supervisor
5. Secure station

#### Performance Monitoring

**Reading Accuracy**:
- Review attendant submissions daily
- Check validation results
- Note frequent errors by individual
- Provide targeted training
- Recognize consistent accuracy

**Timeliness**:
- Monitor submission timing
- Ensure opening readings at shift start
- Ensure closing readings at shift end
- Address chronic delays

**Customer Service**:
- Observe customer interactions
- Handle complaints professionally
- Coach on service standards
- Recognize excellent service

#### Training & Development

**New Attendant Onboarding**:
1. System login and navigation
2. How to submit readings
3. Photo taking for OCR
4. Understanding dual meters
5. When to escalate to supervisor
6. Safety procedures
7. Shadow experienced attendant

**Ongoing Training**:
1. Weekly mini-training sessions
2. Address common errors
3. Share system updates
4. Review new procedures
5. Safety refreshers

**Performance Reviews**:
1. Monthly one-on-ones
2. Review metrics: accuracy, timeliness
3. Discuss challenges
4. Set improvement goals
5. Document discussions

### Communication

**Daily Shift Briefings**:
- 15 minutes before shift start
- Review previous shift issues
- Today's priorities
- Safety reminders
- Questions/concerns

**Incident Reporting**:
- Document all incidents promptly
- Use standardized format
- Include: date, time, who, what, why, action taken
- File reports systematically
- Follow up on resolutions

**Owner Communication**:
- Daily summary report (verbal or written)
- Flag critical issues immediately
- Weekly performance summary
- Monthly operational review
- Recommend improvements

### Handling Issues

**Discrepancies**:
1. Investigate promptly
2. Interview involved attendants
3. Review system records
4. Check physical evidence (footage, receipts)
5. Document findings
6. Take corrective action
7. Follow up to ensure fixed

**Cash Shortages**:
1. Recount cash with witness
2. Review all sales records
3. Check credit sales recorded
4. Interview shift attendants
5. Review security footage
6. Document everything
7. Report to owner
8. Follow company policy (disciplinary, police, etc.)

**Customer Complaints**:
1. Listen actively
2. Apologize for inconvenience
3. Investigate issue
4. Resolve if possible
5. Escalate if needed
6. Follow up with customer
7. Document and learn

**Equipment Failures**:
1. Assess safety risk
2. Take out of service if unsafe
3. Post "Out of Order" signs
4. Notify owner immediately
5. Arrange repairs
6. Document downtime
7. Update system if needed (nozzle status)

---

## 15. Troubleshooting

### Login Issues

**Problem**: Cannot login with supervisor credentials

**Solutions**:
1. Verify username: `supervisor1` (lowercase)
2. Verify password: `super123`
3. Check CAPS LOCK
4. Try demo button instead of typing
5. Clear browser cache
6. Contact owner for password reset

### Dashboard Issues

**Problem**: Cannot save dip readings

**Solutions**:
1. Check you're logged in as Supervisor (not User)
2. Verify role badge shows "👔 Supervisor"
3. Ensure values entered in both fields
4. Check internet connection
5. Try refreshing page
6. Check browser console for errors
7. Contact IT if persists

**Problem**: Tank levels not updating

**Solutions**:
1. Wait for auto-refresh (5 seconds)
2. Check "Last updated" timestamp
3. Refresh page manually
4. Verify backend server running
5. Check API connectivity

### Reconciliation Issues

**Problem**: Reconciliation not loading

**Solutions**:
1. Verify date selected
2. Click "Load Reconciliation" button
3. Check internet connection
4. Verify shift data exists for that date
5. Check browser console for errors
6. Try different date to test
7. Contact IT support

**Problem**: Revenue numbers seem wrong

**Solutions**:
1. Verify all attendant readings submitted
2. Check credit sales recorded correctly
3. Review sales entries
4. Compare to previous days
5. Check for data entry errors
6. Recalculate manually
7. Report discrepancy to owner

**Problem**: Cannot determine cause of variance

**Solutions**:
1. Recount physical cash
2. Review all original receipts
3. Interview shift attendants separately
4. Check credit sales documentation
5. Review security footage
6. Check for system glitches
7. Document investigation thoroughly
8. Escalate to owner

### Accounts Issues

**Problem**: Credit sale not saving

**Solutions**:
1. Check all required fields filled
2. Verify account selected from dropdown
3. Check volume is positive number
4. Ensure account has available credit
5. Check error message details
6. Verify internet connection
7. Try again

**Problem**: Account over credit limit

**Solutions**:
1. Inform customer politely
2. Check current balance vs limit
3. Option 1: Customer reduces purchase
4. Option 2: Customer pays down balance first
5. Option 3: Contact owner for limit increase
6. Document situation

### Inventory Issues

**Problem**: Stock counts don't match physical

**Solutions**:
1. Conduct physical count
2. Check recent sales not yet recorded
3. Review transfer records (Buffer to Island 3)
4. Check for theft/damage
5. Verify data entry errors
6. Document discrepancy
7. Adjust system (with owner approval)
8. Investigate cause

**Problem**: Low stock but Buffer empty

**Solutions**:
1. Verify Buffer actually empty (physical count)
2. Check for unreported transfers
3. Prepare emergency purchase order
4. Contact owner immediately
5. Implement rationing if critical
6. Fast-track delivery

### Stock Movement Issues

**Problem**: Excessive loss on delivery

**Solutions**:
1. Recheck dip readings
2. Wait longer for fuel to settle
3. Verify calculations
4. Check for leaks
5. Inspect delivery hoses
6. Review tanker meter readings
7. Document everything
8. Contact supplier
9. Report to owner
10. File claim if warranted

**Problem**: Delivery result showing error

**Solutions**:
1. Check volumes are positive numbers
2. Verify actual ≤ expected
3. Check tank capacity not exceeded
4. Ensure correct tank selected
5. Check internet connection
6. Review error message details
7. Contact IT support

### System Performance Issues

**Problem**: Pages loading slowly

**Solutions**:
1. Check internet speed
2. Close unnecessary browser tabs
3. Clear browser cache
4. Restart browser
5. Try different browser
6. Check server status with IT

**Problem**: Cannot access certain pages

**Solutions**:
1. Verify logged in as Supervisor
2. Check role badge in top-right
3. Some pages may be Owner-only
4. Try logging out and back in
5. Clear browser cookies
6. Contact admin if access should exist

### Data Issues

**Problem**: Missing historical data

**Solutions**:
1. Verify date selected correctly
2. Check if data was entered that day
3. Review system logs (if access)
4. Check for system outages on that date
5. Contact IT to check database
6. File incident report

**Problem**: Duplicate entries

**Solutions**:
1. Don't panic
2. Document which entries are duplicates
3. Note timestamps and IDs
4. Contact owner
5. Owner/Admin can delete duplicates
6. Don't try to fix yourself (may worsen)

### Emergency Procedures

**If Critical System Failure**:
1. Switch to paper records immediately
2. Use backup forms/logbooks
3. Notify owner immediately
4. Continue operations manually
5. Document everything
6. Contact IT support urgently
7. Enter data when system restored
8. Document downtime for records

**If Data Loss Suspected**:
1. Stop using system immediately
2. Don't enter new data
3. Contact IT/owner urgently
4. Preserve any paper backups
5. Document what was lost
6. Wait for instructions
7. Don't attempt recovery yourself

**If Security Breach Suspected**:
1. Log out immediately
2. Change password
3. Notify owner urgently
4. Document suspicious activity
5. Preserve evidence (screenshots)
6. Follow company security protocol
7. Monitor for unauthorized access

---

## Quick Reference Guide

### Available Features

**Same as User Role**:
- ✓ Dashboard (View)
- ✓ Nozzles (View)
- ✓ Readings (Submit)
- ✓ Shifts (View)

**Supervisor-Exclusive**:
- ✓ Dashboard - **Dip Readings** (Edit & Save)
- ✓ **Reconciliation** (Full Access)
- ✓ **Accounts** (Full Access)
- ✓ **Inventory** (Full Access)
- ✓ **Sales** (View)
- ✓ **Reports** (View)
- ✓ **Stock Movement** (Full Access)

**Not Available**:
- ✗ Settings (Owner Only)

### Daily Checklist

**Shift Start**:
- [ ] Login to system
- [ ] Record opening dip readings (both tanks)
- [ ] Verify shift auto-created
- [ ] Check tank levels and alerts
- [ ] Brief attendants
- [ ] Review overnight issues

**During Shift**:
- [ ] Monitor Dashboard regularly
- [ ] Process credit sales as needed
- [ ] Handle inventory sales
- [ ] Respond to discrepancies
- [ ] Supervise attendants

**Shift End**:
- [ ] Record closing dip readings
- [ ] Verify all readings submitted
- [ ] Perform reconciliation
- [ ] Count and deposit cash
- [ ] Document variances
- [ ] Handover to next supervisor

### Common Tasks Quick Guide

**Record Dip Reading**:
1. Dashboard → Find tank card
2. Enter Opening Dip (cm)
3. Enter Closing Dip (cm) if shift end
4. Click "Save Dip Readings"

**Record Credit Sale**:
1. Accounts page
2. Select Account Holder
3. Select Fuel Type
4. Enter Volume
5. Add Notes
6. Click "Record Credit Sale"

**Perform Reconciliation**:
1. Reconciliation page
2. Select date
3. Click "Load Reconciliation"
4. Review all sections
5. Analyze difference
6. Document findings

**Receive Delivery**:
1. Stock Movement page
2. Select Tank
3. Enter Expected Volume
4. Enter Actual Volume
5. Add Supplier & Notes
6. Click "Receive Delivery"

### Key Formulas

**Reconciliation**:
```
Total Expected Revenue = Petrol + Diesel + LPG + Lubricants + Accessories
Expected Cash = Total Revenue - Credit Sales
Difference = Actual Deposited - Expected Cash
```

**Delivery Loss**:
```
Loss = Expected Volume - Actual Volume
Loss % = (Loss / Expected Volume) × 100
Allowable: Diesel 0.3%, Petrol 0.5%
```

**Stock Value**:
```
Stock Value = Current Stock × Unit Price
```

---

## Glossary

**Credit Sale**: Sale invoiced to account holder, not paid in cash immediately

**Dip Reading**: Physical measurement of fuel level in tank using dip stick (in cm)

**Reconciliation**: Process of verifying expected revenue matches actual cash

**Opening Dip**: Tank dip measurement at shift start

**Closing Dip**: Tank dip measurement at shift end

**Overage**: More cash than expected (positive variance)

**Shortage**: Less cash than expected (negative variance)

**Cumulative Difference**: Running total of all variances for tracking overall loss/gain

**Credit Limit**: Maximum amount an account holder can owe

**Credit Utilization**: Percentage of credit limit currently owed (Balance / Limit × 100)

**Stock Value**: Total value of inventory (Units × Price)

**Buffer**: Reserve storage location for lubricants

**Island 3**: Active sales location for lubricants

**Allowable Loss**: Acceptable fuel loss during delivery due to evaporation, temperature, etc.

**Actual Loss**: Measured fuel loss: Expected - Actual Delivered

---

## Support Contacts

**Owner**: [Name] - [Phone] - [Email]

**IT Support**: [Phone] - [Email]

**Emergency Contact**: [Phone]

**Fuel Suppliers**:
- [Supplier 1]: [Phone]
- [Supplier 2]: [Phone]

---

**END OF SUPERVISOR MANUAL**

*This manual is proprietary and confidential. Distribution restricted to authorized supervisors only.*
