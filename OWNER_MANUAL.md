# Fuel Management System - Owner Manual

**Role:** Owner (System Administrator)
**Version:** 1.0
**Last Updated:** December 2025

---

## Table of Contents

1. Introduction
2. Owner Role & System Overview
3. Login & Access
4. Dashboard & Operations Monitoring
5. Nozzles Management
6. Readings Oversight
7. Shift Operations
8. Reconciliation & Financial Management
9. Account Holders & Credit Management
10. Inventory Control
11. Sales Tracking
12. Reports & Analytics
13. Stock Movement & Deliveries
14. **Settings & System Configuration**
15. Business Intelligence & Decision Making
16. Security & User Management
17. Troubleshooting & System Administration

---

## 1. Introduction

Welcome to the Fuel Management System Owner Manual. As the **Owner**, you have complete system access and administrative control over all operations, configurations, and financial data.

### Your Authority & Responsibilities

**Strategic Oversight**:
- Monitor overall station performance
- Make pricing decisions
- Set operational policies
- Review financial trends
- Plan business growth

**Operational Management**:
- Supervise supervisors and staff
- Ensure data accuracy
- Investigate major discrepancies
- Handle escalated issues
- Coordinate with suppliers

**Financial Control**:
- Review daily reconciliations
- Manage credit accounts and limits
- Set allowable loss thresholds
- Configure fuel pricing
- Analyze profitability

**System Administration**:
- Configure system settings
- Manage user access
- Ensure data security
- Maintain system integrity
- Plan system updates

### Complete System Access

**You Have Access To EVERYTHING**:
- ✓ Dashboard (Full Access + Dip Readings)
- ✓ Nozzles (View)
- ✓ Readings (Submit)
- ✓ Shifts (Full Access)
- ✓ Reconciliation (Full Access)
- ✓ Accounts (Full Access)
- ✓ Inventory (Full Access)
- ✓ Sales (Full Access)
- ✓ Reports (Full Access)
- ✓ Stock Movement (Full Access)
- ✓ **Settings (Owner Only)**

**No Restrictions**: You can access and modify anything in the system.

---

## 2. Owner Role & System Overview

### System Architecture

**User Hierarchy**:
```
Owner (You)
  ├── Supervisors
  │     ├── Users (Attendants)
  │     └── Users (Attendants)
  └── Direct oversight of all operations
```

**Your Advantages Over Other Roles**:

**vs. User (Attendant)**:
- Users: Submit readings only
- You: All capabilities + financial + settings

**vs. Supervisor**:
- Supervisors: Operations + reconciliation + inventory
- You: All Supervisor capabilities + Settings + ultimate authority

### Key Differentiators

**Settings Access (Owner Only)**:
- Configure fuel prices
- Set allowable loss percentages
- System-wide parameters
- Financial configurations

**Ultimate Authority**:
- Override decisions
- Resolve disputes
- Access all historical data
- Delete/modify records (carefully!)
- Grant/revoke access

**Strategic View**:
- Cross-shift analysis
- Monthly/yearly trends
- Profitability metrics
- Performance benchmarking

---

## 3. Login & Access

### Owner Credentials

**Demo Account** (Testing):
- Username: `owner1`
- Password: `owner123`
- Click: "👑 Owner: owner1 / owner123"

**Production**:
- Use your secure, unique credentials
- Never share owner password
- Change password regularly
- Use strong password (12+ characters, mixed case, numbers, symbols)

### After Login

**Navigation Menu** (Complete):
```
Dashboard | Nozzles | Readings | Shifts |
Reconciliation | Accounts | Inventory | Sales |
Reports | Stock Movement | Settings
```

**User Display**:
- Your name in top-right
- **Role badge**: "👑 Owner"
- Red "Logout" button

**Visual Indicators**:
- Crown icon (👑) distinguishes you as Owner
- All menu items accessible (no grayed-out options)
- Settings menu item visible (not shown to others)

---

## 4. Dashboard & Operations Monitoring

### Overview

Dashboard is your command center for real-time monitoring.

### Date Selector

Select any historical date to review past operations:
- Default: Today
- Click calendar icon
- Select date
- Dashboard updates with historical data

### Real-Time Tank Levels

#### Diesel Tank (Orange Card)

**Information Displayed**:
- 🛢️ Diesel Tank header
- Real-time badge (updates every 5 seconds)
- **Current Level**: e.g., "25,000 L" (large, bold)
- **Progress Bar**: Visual fill indicator
  - Green: > 50% full (healthy)
  - Yellow: 25-50% full (monitor)
  - Red: < 25% full (CRITICAL - reorder now!)
- **Percentage**: e.g., "50.0% Full"
- **Capacity**: e.g., "50,000 L"
- **Available Space**: e.g., "25,000 L"
- **Last Updated**: Timestamp with auto-refresh

**Business Intelligence**:
- Monitor critically low levels (order fuel)
- Track daily consumption rates
- Plan deliveries proactively
- Avoid stockouts

#### Petrol Tank (Blue Card)

Same structure as Diesel with blue color scheme.

### Dip Readings Section (OWNER ACCESS)

**Full Control**: As Owner, you can VIEW and EDIT dip readings.

**Purpose of Dip Readings**:
- Physical verification of electronic tank sensors
- Reconciliation foundation
- Detect leaks, meter errors, theft
- Industry compliance
- Insurance documentation

#### Recording Dip Readings

**When to Record**:
- **Opening**: Start of each shift (6 AM Day, 6 PM Night)
- **Closing**: End of each shift

**Process**:

**Diesel Tank**:
1. Locate "📏 Shift Dip Readings (cm)" section in Diesel card
2. Badge shows "👑 Owner" (your access level)
3. **Opening Dip field**:
   - Click input box
   - Enter centimeters (e.g., `135.5`)
   - One decimal precision
4. **Closing Dip field** (at shift end):
   - Enter closing measurement (e.g., `120.8`)
5. Click "Save Dip Readings" button
6. Success alert: "✓ Diesel Tank Dip Readings Saved! Tank level updated to 25,000 L"

**Petrol Tank**: Same process with blue-themed interface.

**Current Readings Display**:
```
Current Readings:
Opening: 135.5 cm → 25,000 L
Closing: 120.8 cm → 22,500 L
Last updated: 6:05 AM by [Your Name]
```

**Volume Conversion**:
- System uses tank calibration charts
- Automatically converts cm → Liters
- Based on tank geometry and capacity

**Best Practices**:
- Ensure supervisors record dip readings consistently
- Spot-check occasionally yourself
- Compare dip-calculated levels vs electronic sensors
- Investigate significant discrepancies (> 1%)
- Maintain clean, calibrated dip sticks

### Daily Summary Card

**Displays**:
- Date
- Volume Records count
- Cash Variance Records count
- Flags/Discrepancies count

**Owner Perspective**:
- Quick health check
- Flag count should trend downward (improving processes)
- Spikes indicate investigation needed

### Recent Discrepancies Card

**Shows**: Last 10 discrepancies

**Each Entry**:
- Description of issue
- Timestamp
- Red highlighting

**Your Action**:
- Review daily
- Identify patterns (specific attendant, nozzle, shift?)
- Implement corrective measures
- Hold supervisors accountable for resolution

### Quick Stats Cards

1. **Total Nozzles** (Blue): Operational capacity
2. **Today's Sales** (Green): Transaction volume
3. **Alerts** (Yellow): Issues requiring attention

**Strategic Use**:
- Benchmark against previous days/weeks
- Identify trends
- Set performance targets

---

## 5. Nozzles Management

### Page Overview

View all pump islands, stations, and nozzles.

**Owner Access**: VIEW ONLY (configuration managed by admins/developers)

### Island Structure

```
Station
  ├── Island 1
  │     └── Pump Station 1A
  │           ├── Nozzle N001 (Diesel)
  │           └── Nozzle N002 (Petrol)
  ├── Island 2
  │     └── Pump Station 2A
  │           ├── Nozzle N003 (Diesel)
  │           └── Nozzle N004 (Petrol)
  ├── Island 3
  └── Island 4
```

### Nozzle Information

**Each Nozzle Card Shows**:
- Nozzle ID (e.g., N001)
- Fuel Type (Diesel/Petrol)
- Status Badge:
  - **Green "Active"**: Operational
  - **Yellow "Maintenance"**: Under repair
  - **Red "Inactive"**: Out of service
- Color coding: Orange (Diesel), Blue (Petrol)

### Owner Perspective

**Monitor**:
- Nozzle status accuracy
- Downtime patterns
- Maintenance frequency
- Replacement needs

**Plan**:
- Preventive maintenance schedule
- Equipment upgrades
- Expansion opportunities (add islands/nozzles)

**Note**: Changing nozzle status/configuration typically requires backend database changes. Coordinate with technical support.

---

## 6. Readings Oversight

### Overview

As Owner, you have full access to submit readings, but your primary role is oversight.

### Capabilities

**Same as Users/Supervisors**:
- Submit dual meter readings
- Upload photos for OCR
- Validate readings
- View results

**Refer to User Manual Section 7** for detailed submission process.

### Owner Focus Areas

**Quality Assurance**:
- Spot-check attendant submissions
- Verify validation is being used
- Monitor discrepancy rates per attendant
- Identify training needs

**System Performance**:
- OCR accuracy trends
- Validation rejection rates
- Photo quality issues
- System uptime

**Data Integrity**:
- Look for data tampering attempts
- Investigate suspicious patterns
- Ensure readings sequential and logical
- Audit trail review

**Process Improvement**:
- Identify bottlenecks
- Streamline workflows
- Invest in better equipment if needed
- Update procedures based on findings

---

## 7. Shift Operations

### Full Access

As Owner, you can view shift data and submit readings.

### Shift Monitoring

**Current Active Shift Card**:
- Shift type (☀️ Day / 🌙 Night)
- Date and Shift ID
- Status (Active/Completed/Reconciled)
- Attendants on duty
- Start time

**Owner Analysis**:
- Staffing adequacy
- Shift performance comparison (Day vs Night)
- Attendant productivity
- Coverage gaps

### Submit Dual Readings

**Form Available**:
- Nozzle selection
- Reading type (Opening/Closing)
- Electronic reading (3 decimals)
- Mechanical reading (whole number)
- Attendant assignment
- Tank dip (optional)

**When You Submit**:
- Emergency coverage
- Quality audits
- Training demonstrations
- System testing

### Nozzle Status Overview

**Real-Time Panel**:
- All 8 nozzles displayed
- Current readings (Electronic & Mechanical)
- Status indicators
- Color-coded by fuel type

**Strategic View**:
- Overall operational status
- Quick health check
- Identify issues at a glance

---

## 8. Reconciliation & Financial Management

### Critical Owner Function

Reconciliation is your PRIMARY financial control mechanism.

### Page Overview

**Location**: Reconciliation menu item

**Purpose**:
- Verify cash vs expected revenue
- Identify shortages/overages
- Track profitability
- Detect theft/fraud
- Monitor operational efficiency

### Date Selector & Loading

**Process**:
1. Select date
2. Click "Load Reconciliation"
3. View Day and Night shift cards

### Shift Reconciliation Cards

**Day Shift** (Yellow/Orange gradient):
```
☀️ Day Shift Reconciliation                [+ZMW 150.00]
2025-12-15 | Shift ID: SHIFT-20251215-DAY
```

**Night Shift** (Indigo/Purple gradient):
```
🌙 Night Shift Reconciliation               [-ZMW 75.50]
2025-12-15 | Shift ID: SHIFT-20251215-NIGHT
```

**Difference Badge** (top-right):
- **Green** (ZMW 0.00): Perfect - celebrate!
- **Blue** (+ZMW): Overage - investigate positively
- **Red** (-ZMW): Shortage - URGENT investigation

### Revenue Breakdown

**Five Product Categories**:

1. **Petrol Revenue** (Blue):
   - Volume sold (calculated from meter readings)
   - Price per liter (from Settings)
   - Total: Volume × Price
   - Example: "15,234.50 @ ZMW 29.92/L"

2. **Diesel Revenue** (Orange):
   - Same calculation as Petrol
   - Different price per liter
   - Example: "22,450.75 @ ZMW 26.98/L"

3. **LPG Revenue** (Purple):
   - LPG Gas sales
   - LPG Accessories sales
   - Combined total
   - Example: "3,500.00 Gas + Accessories"

4. **Lubricants** (Green):
   - Island 3 sales
   - Units sold × Unit prices
   - Example: "1,250.00"

5. **Accessories** (Cyan):
   - Non-fuel items
   - Example: "450.00"

### Financial Calculation Flow

**STEP 1: Total Expected Revenue**
```
Total Expected Revenue (All Products)
Petrol + Diesel + LPG + Lubricants + Accessories
ZMW 42,885.25
```

**STEP 2: Less Credit Sales**
```
Less: Credit Sales
Institutional & Corporate Accounts
- ZMW 5,200.00
```

**Critical**: Credit sales are invoiced, NOT cash collected.

**STEP 3: Expected Cash**
```
Expected Cash
Total Revenue - Credit Sales
ZMW 37,685.25
```

This is what SHOULD be in the cash register/safe.

**STEP 4: Actual Deposited**
```
Actual Cash Deposited
Bank deposit amount
ZMW 37,835.25
```

This is what WAS actually counted and deposited.

**STEP 5: Difference Analysis**

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

**STEP 6: Cumulative Difference** (Purple):
```
Cumulative Difference (Running Total)
+ZMW 74.50
```

**Strategic Importance**:
- Tracks net position over time
- Persistent negative: Systemic theft/errors
- Persistent positive: Underreporting or windfall

### Owner Actions by Scenario

#### Perfect Match (ZMW 0.00)

**Meaning**: Excellent operational accuracy!

**Actions**:
1. ✓ Commend supervisor and team
2. ✓ Document for performance reviews
3. ✓ Use as best-practice example
4. ✓ No further action needed

**Frequency Expectation**:
- Perfect matches rare (human error exists)
- Within ±ZMW 50: Acceptable
- Consistent perfection: Double-check data integrity

#### Overage (+ZMW Amount)

**Meaning**: More cash than expected.

**Possible Causes**:
1. Counting error (counted high)
2. Sale recorded late/next day
3. Customer overpayment not refunded
4. Found money (previous shift)
5. Attendant personal money mixed in
6. Data entry error (recorded sale twice)

**Investigation**:
1. Recount cash with supervisor present
2. Review all sales receipts
3. Check for late entries
4. Interview shift supervisor
5. Check previous shift records
6. Review security footage if available

**Resolution**:
- Small amounts (< ZMW 20): Count as windfall, document
- Medium amounts (ZMW 20-100): Thorough investigation, hold funds pending
- Large amounts (> ZMW 100): Hold funds, intensive investigation, possible audit

**Follow-Up**:
- Update accounting records
- Document explanation
- If unresolved, hold in suspense account
- Policy: After 30 days, may book as miscellaneous income

#### Shortage (-ZMW Amount)

**Meaning**: Less cash than expected. **SERIOUS ISSUE**.

**Possible Causes**:
1. **Theft** (attendant, supervisor, external)
2. Counting error (counted low)
3. Credit sale NOT recorded
4. Sale recorded without cash collected
5. Change given incorrectly (overpaid change)
6. Data entry error
7. Unrecorded fuel dispensing
8. Skimming

**Immediate Actions**:
1. **STOP**: Don't accuse anyone yet
2. Recount cash multiple times with witnesses
3. Review ALL original receipts and credit sales
4. Verify credit sales in Accounts page
5. Check dip readings (did fuel actually sell?)
6. Interview supervisor privately
7. Interview attendants separately
8. Review security footage (all cameras, full shift)
9. Check for system glitches/errors
10. Document EVERYTHING

**Investigation Levels**:

**Minor (< ZMW 50)**:
- Likely counting/entry error
- Thorough recount and review
- Document and monitor
- Verbal reminder to staff about accuracy

**Moderate (ZMW 50-200)**:
- Could be error or intentional
- Full investigation required
- Hold meeting with supervisor
- Written warning if negligence found
- Retraining if procedural issue

**Major (> ZMW 200)**:
- Likely intentional theft
- Formal investigation
- Interview all staff separately
- Police report consideration
- Disciplinary action (suspension pending investigation)
- Possible termination if theft proven
- Legal action if warranted

**Resolution**:
- If error: Correct and retrain
- If theft: Follow company policy
  - First offense: Written warning + repayment plan
  - Repeat offense: Termination
  - Major theft: Police report
- Document outcome in personnel files

**Prevention**:
- Implement dual-count policy
- Surprise cash counts
- Rotate shift assignments
- Regular audits
- Clear accountability
- Security cameras maintained

### Cumulative Difference Analysis

**Tracking Period**: Reset monthly or quarterly

**Interpretation**:

**Positive Cumulative (+ZMW)**:
- Overall net overage
- Good news but investigate why
- Could indicate:
  - Underreporting (sales not recorded)
  - Price increases not reflected
  - System errors

**Negative Cumulative (-ZMW)**:
- Overall net shortage
- **RED FLAG** - systemic problem
- Urgent investigation needed
- Could indicate:
  - Ongoing theft
  - Meter errors (under-reading)
  - Fuel leaks
  - Unrecorded credit sales

**Target**: ±ZMW 200 per month is acceptable industry variance

**Action Thresholds**:
- -ZMW 500: Investigate immediately
- -ZMW 1,000: Full audit, possible external auditor
- -ZMW 2,000+: Major investigation, consider police involvement

### Notes Field

**Use For**:
- Document unusual circumstances
- Explain variances
- Record corrective actions
- Note follow-up needed

**Example Notes**:
```
"Shortage due to attendant error in counting change.
Attendant retrained on cash handling procedures.
-ZMW 45 will be recovered from next paycheck per policy.
Follow-up: Spot checks for next 2 weeks."
```

### Best Practices for Owners

**Daily Discipline**:
- Review EVERY shift reconciliation
- Don't postpone or skip
- Flag issues same day
- Follow up personally on major variances

**Pattern Recognition**:
- Track by:
  - Day vs Night shift
  - Specific supervisor
  - Specific attendants
  - Day of week
  - Fuel type
- Identify systemic issues

**Financial Controls**:
- Dual-count policy (two people count cash)
- Surprise counts (unannounced cash checks)
- Regular audits (weekly supervisor, monthly owner)
- Clear cash handling procedures
- Safe/register security
- Deposit daily (don't accumulate cash)

**Accountability**:
- Supervisors responsible for their shifts
- Clear consequences for shortages
- Recognition for perfect reconciliations
- Performance metrics in reviews

**Transparency**:
- Share reconciliation results with supervisors
- Post monthly summaries (without names)
- Celebrate successes
- Address issues promptly

### Pricing Verification

**Check**:
- Petrol price in reconciliation matches Settings
- Diesel price matches Settings
- If prices changed mid-shift, verify calculations account for this

**Red Flag**:
- Revenue too low for volume sold
- Suggests:
  - Wrong price applied
  - System configuration error
  - Manually recalculate to verify

---

## 9. Account Holders & Credit Management

### Overview

Manage all credit accounts and sales.

### Strategic Importance

**Credit accounts are high-value but high-risk**:
- **Advantages**:
  - Secure large customers
  - Predictable revenue
  - Relationship building
  - Higher volumes
- **Risks**:
  - Default/non-payment
  - Cash flow impact (waiting for payment)
  - Administrative overhead
  - Credit limit management

### Account Holders Display

**14 Pre-Configured Accounts**:
1. POS (Point of Sale)
2. Zambia Police
3. ZACODE (Zambia College of Distance Education)
4. ZAF (Zambia Air Force)
5. Kalewa Army Camp
6. NAPSA (National Pension Scheme Authority)
7. ZNS (Zambia National Service)
8. Taspa (Taxi Association)
9. Musonda (Individual)
10. Simbowe (Individual)
11. Siliya (Individual)
12. Water Board
13. ZESCO (Zambia Electricity Supply Corporation)
14. Hospital

#### Account Card Details

**Header**:
- Account Name (large, bold)
- Account ID
- Account Type Badge:
  - Blue: Corporate
  - Purple: Institution
  - Green: Individual
  - Orange: POS

**Current Balance**:
```
Current Balance
ZMW 12,450.00
```
Amount currently owed to you.

**Credit Limit**:
```
Credit Limit
ZMW 50,000.00
```
Maximum you've authorized them to owe.

**Credit Utilization Bar**:
- Visual progress bar
- Percentage: Balance / Limit × 100
- Color warnings:
  - Green (0-50%): Safe
  - Yellow (50-75%): Monitor
  - Orange (75-90%): Caution
  - Red (90-100%): Critical - at limit

**Available Credit**:
```
Available Credit
ZMW 37,550.00
```
How much more they can purchase.

**Contact Information**:
```
Contact: John Smith
Phone: +260 123 456 789
```

### Recording Credit Sales

**Form Fields**:
1. Account Holder (dropdown)
2. Fuel Type (Petrol/Diesel with prices)
3. Volume (Liters)
4. Total Amount (auto-calculated)
5. Notes (optional)

**Process**: (Same as Supervisor - see Supervisor Manual Section 9)

### Owner-Specific Management

#### Setting Credit Limits

**Current**: Pre-configured in system

**To Adjust** (typically requires database update):
1. Assess customer:
   - Payment history
   - Business size/stability
   - Relationship length
   - Financial capacity
2. Decide new limit
3. Update via backend or coordinate with developer
4. Document decision

**Recommended Limits by Type**:
- **Government/Institution**: ZMW 50,000 - 100,000
- **Large Corporate**: ZMW 30,000 - 75,000
- **Small Corporate**: ZMW 10,000 - 30,000
- **Individual**: ZMW 5,000 - 15,000
- **POS**: ZMW 20,000 - 50,000

#### Collections Management

**Payment Terms**: Typically 30 days from month-end

**Collections Process**:

**Days 1-30** (Within Terms):
- Monitor balance growth
- Ensure not approaching limit
- Maintain good relations

**Days 31-60** (Past Due):
1. Phone call reminder (friendly)
2. Email invoice reminder
3. Request payment schedule

**Days 61-90** (Seriously Delinquent):
1. Formal written notice
2. Suspend credit (no new sales)
3. Meeting with account manager
4. Payment plan negotiation
5. Consider legal letter

**Days 90+** (Default Risk):
1. Legal demand letter
2. Engage collection agency
3. Small claims court if needed
4. Write off if uncollectible
5. Ban future credit

**Best Practices**:
- Weekly review of aging
- Monthly statements to all accounts
- Personal relationships with key accounts
- Clear credit terms in writing
- Enforce limits strictly
- Don't extend credit to bad payers

#### Account Performance Analysis

**Monthly Review**:
1. Total credit sales volume
2. Average balance
3. Days sales outstanding (DSO)
4. Default rate
5. Most profitable accounts
6. Problem accounts

**Strategic Decisions**:
- Which accounts to grow
- Which to limit or drop
- Pricing for credit vs cash
- Credit terms adjustment

### Risk Management

**Credit Policy Guidelines**:
- Never exceed 20% of monthly revenue in outstanding credit
- Diversify - no single account > 30% of credit sales
- Regular credit checks on corporate accounts
- Personal guarantees for large individual accounts
- Right to suspend or revoke credit anytime

---

## 10. Inventory Control

### Overview

Manage LPG accessories and lubricants inventory.

### Strategic Inventory Management

**Owner Perspective**:
- Inventory is capital (cash tied up in stock)
- Balance: Don't overstock (cash tied up) vs Don't understock (lost sales)
- Track turnover rates
- Identify fast vs slow movers
- Optimize ordering

### LPG & Accessories

**4 Products**:
1. 2 Plate Stove (Swivel) - ZMW 450
2. 2 Plate Stove (Bullnose) - ZMW 420
3. Cadac Cooker Top - ZMW 850
4. LPG Hose & Regulator - ZMW 180

**Monitoring**:
- Current stock levels
- Stock value (Units × Price)
- Turnover rate (how fast selling)
- Reorder points

**Decisions**:
- When to reorder (don't let fall below 20%)
- Order quantities (balance bulk discounts vs capital tie-up)
- Pricing (competitive vs margin)
- Promotions (move slow stock)

### Lubricants

**8 Products**:
- Engine Oils (10W-30, 15W-40, 20W-50)
- ATF (Transmission Fluid)
- Brake Fluid (DOT 3, DOT 4)
- Coolant
- Gear Oil

**Two-Location System**:
- **Island 3**: Active sales location
- **Buffer**: Reserve storage

**Optimal Levels**:
- Island 3: Keep at 60-80% of capacity
- Buffer: Maintain as reserve to replenish Island 3
- Total: Aim for 2-3 weeks of average sales

**Stock Transfers**:
- When Island 3 drops to 30%, transfer from Buffer
- Transfer in batches (10-20 units)
- Document each transfer
- Update system promptly

**Owner Actions**:

**Regular Reviews** (Weekly):
1. Check stock levels both locations
2. Identify low-stock items
3. Calculate turnover rates
4. Plan reorders

**Inventory Value Tracking**:
- Total inventory value = Asset on balance sheet
- Monitor for shrinkage (theft, damage, expiration)
- Physical counts monthly
- Investigate variances > 2%

**Ordering Strategy**:
1. Identify reorder point (e.g., 10 units)
2. Calculate Economic Order Quantity (EOQ):
   - Balance order costs vs holding costs
   - Consider supplier minimums and discounts
3. Negotiate terms with suppliers
4. Schedule deliveries to match demand

**Profitability Analysis**:
- Calculate margin per product
- Identify most profitable items
- Consider dropping low-margin slow movers
- Promote high-margin fast movers

**Loss Prevention**:
- Secure storage (Island 3 + Buffer)
- Access control (keys, locks)
- CCTV coverage
- Regular physical counts
- Investigate missing stock immediately

---

## 11. Sales Tracking

### Overview

Record and monitor individual fuel sales.

### Page Access

**Full access** to record sales.

### When You Use This

**Typical Scenarios**:
- Quality audits (verify attendant accuracy)
- Training demonstrations
- Spot checks
- Investigating suspected fraud

**Most sales captured through**:
- Shift readings (Opening vs Closing nozzle meters)
- Sales page is supplementary verification tool

### Form Fields

1. Shift ID
2. Nozzle ID
3. Pre-Sale Reading
4. Post-Sale Reading
5. Volume Dispensed
6. Cash Received

**Validation**:
- Volume Dispensed must match (Post - Pre) within ±0.05 L
- Prevents fraud/errors

### Owner Analytics

**Use Sales Data For**:
1. **Average Transaction Size**:
   - Calculate: Total Volume / Number of Sales
   - Benchmark over time
   - Compare to industry standards

2. **Peak Hours**:
   - When are most sales occurring?
   - Staffing optimization

3. **Attendant Performance**:
   - Sales per attendant
   - Accuracy rates
   - Training needs

4. **Fuel Type Mix**:
   - Petrol vs Diesel ratio
   - Profitability analysis (margins differ)

---

## 12. Reports & Analytics

### Overview

Central hub for data analysis and decision-making.

### Quick Stats

**Top Cards**:
1. Total Readings (all time)
2. Total Sales (all time)
3. Discrepancies (requiring attention)

### Daily Report

**Select date to view**:
- Volume records
- Cash variances
- Flags

**Table Views**:
- Volume details by nozzle
- Cash variance details

### All Discrepancies

**Table of all flagged issues**:
- ID
- Description
- Timestamp
- Status

**Owner Actions**:
1. Review all discrepancies weekly minimum
2. Ensure supervisors investigating
3. Identify patterns:
   - Recurring nozzle issues? → Maintenance
   - Recurring attendant issues? → Training or discipline
   - Recurring shift issues? → Supervisor accountability
4. Track resolution times
5. Implement preventive measures

### Advanced Analytics (Owner Insights)

**Financial KPIs**:
1. **Daily Revenue**:
   - Track trend over time
   - Identify seasonality
   - Set growth targets

2. **Gross Margin**:
   - Revenue - Cost of Goods Sold (COGS)
   - Track by fuel type
   - Monitor for price vs cost changes

3. **Operating Expenses**:
   - Salaries
   - Utilities
   - Maintenance
   - Calculate Operating Margin

4. **Cash Flow**:
   - Daily cash generation
   - Credit sales impact (delayed cash)
   - Ensure sufficient liquidity

**Operational KPIs**:
1. **Fuel Turnover**:
   - Days of supply on hand
   - Optimize ordering frequency

2. **Inventory Turnover**:
   - How fast LPG/lubricants sell
   - Target: 30-60 days for accessories
   - Fast movers vs slow movers

3. **Variance Rate**:
   - % of shifts with cash discrepancies
   - Target: < 10%

4. **Reconciliation Accuracy**:
   - % of perfect matches
   - Benchmark supervisors

5. **Discrepancy Resolution Time**:
   - Average days to resolve issues
   - Target: < 3 days

**Customer Insights**:
1. **Credit Customer Health**:
   - Payment timeliness
   - Growth rates
   - Risk scores

2. **Peak Hours/Days**:
   - When busiest
   - Staffing implications

3. **Average Transaction Size**:
   - Trending up or down?
   - Marketing implications

### Exporting & Reporting

**Monthly Owner Report** (Create Manually):
1. Total revenue by category
2. Reconciliation summary:
   - Total overages
   - Total shortages
   - Net variance
3. Top credit customers by volume
4. Inventory turnover
5. Key operational metrics
6. Action items for next month

**Quarterly Business Review**:
1. 3-month trends
2. Year-over-year comparison
3. Profitability analysis
4. Strategic initiatives progress
5. Investment needs (equipment, etc.)

---

## 13. Stock Movement & Deliveries

### Overview

Manage fuel deliveries to storage tanks.

### Receive Delivery Process

**Full access** to receive deliveries.

**Form Fields**:
1. Select Tank (Diesel/Petrol)
2. Expected Volume (from delivery note)
3. Actual Volume Delivered (measured)
4. Supplier (name)
5. Delivery Note (details)

**Process**: (Same as Supervisor - see Supervisor Manual Section 13)

### Owner-Specific Management

#### Supplier Relationship Management

**Multiple Suppliers**:
- Maintain 2-3 approved suppliers
- Prevents dependency
- Competitive pricing
- Backup if one has supply issues

**Evaluation Criteria**:
1. **Pricing**: Competitive rates, prompt discount
2. **Quality**: Fuel quality consistency (test samples)
3. **Reliability**: On-time delivery, accurate volumes
4. **Loss Rates**: Consistently within allowable?
5. **Terms**: Payment terms, credit offered
6. **Service**: Responsive, professional

**Regular Reviews**:
- Monthly: Loss analysis by supplier
- Quarterly: Overall performance review
- Annually: Contract negotiations

#### Loss Analysis & Monitoring

**Track Each Delivery**:
- Expected volume
- Actual volume
- Loss amount
- Loss percentage
- Supplier

**Analyze**:
1. **By Supplier**:
   - Which supplier has lowest loss rates?
   - Consistent pattern or occasional?
2. **By Fuel Type**:
   - Diesel vs Petrol loss rates
   - Adjust allowable percentages if needed
3. **By Season**:
   - Higher losses in hot weather (evaporation)
   - Plan accordingly
4. **By Volume**:
   - Larger deliveries = higher total loss but similar %

**Red Flags**:
- Consistent losses exceeding allowable
- Sudden spike in loss rate
- Negative losses (overages) frequently
- Large variances in measurement

**Actions**:
1. Investigate measurement procedures
2. Calibrate dip sticks and tank sensors
3. Check for leaks during delivery
4. Review temperature compensation
5. Negotiate with supplier
6. Switch suppliers if persistent issues

#### Delivery Scheduling

**Optimal Ordering**:
1. **Reorder Point**: When tank reaches 30% (avoid stockout)
2. **Order Quantity**: Fill to 80-90% (leave room for expansion, delivery variance)
3. **Lead Time**: Factor supplier delivery time (1-3 days typically)
4. **Frequency**: Balance delivery costs vs holding costs

**Example**:
```
Tank: 50,000 L capacity
Current: 15,000 L (30%)
Reorder Point: ✓ Triggered
Order Size: 35,000 L
Result: 50,000 L (100%)
```

**Seasonal Adjustments**:
- **High Season** (holidays, harvest): Order more frequently, maintain higher levels
- **Low Season**: Reduce inventory to free up cash

#### Cost Management

**Fuel Pricing Components**:
1. **Base Cost**: Supplier price per liter
2. **Delivery Fee**: Flat or per liter
3. **Taxes**: Government taxes per liter
4. **Loss**: Factor allowable loss into cost

**Your Selling Price** (Set in Settings):
- Must cover all costs above
- Plus operating expenses allocation
- Plus desired profit margin

**Margin Calculation**:
```
Example (Diesel):
Supplier Cost: ZMW 25.00/L
Delivery & Taxes: ZMW 0.98/L
Allowable Loss (0.3%): ZMW 0.08/L
Total Cost: ZMW 26.06/L

Your Selling Price: ZMW 26.98/L (from Settings)
Gross Margin: ZMW 0.92/L (3.5%)
```

**Monitor**:
- Margin erosion if costs rise
- Adjust selling price in Settings when needed
- Balance competitiveness vs profitability

### Recent Deliveries History

**Table Shows**:
- All deliveries with loss analysis
- Status: acceptable or excessive

**Owner Review**:
- Weekly: Scan all deliveries
- Flag excessive losses
- Follow up with supervisor on investigations
- Track cumulative loss trends

---

## 14. Settings & System Configuration

### OWNER ONLY FEATURE

**This is your exclusive control panel.**

### Page Header
- **Title**: "Owner Settings"
- **Description**: "Configure fuel pricing and allowable losses"

### Why Settings Are Critical

**System-Wide Impact**:
- Settings affect ALL calculations
- Revenue directly impacted by pricing
- Loss thresholds affect delivery acceptance
- Changes take effect immediately
- Errors can cause significant financial impact

**Security**:
- Only Owner has access (good!)
- Make changes carefully
- Document all changes
- Communicate price changes to supervisors

---

### Fuel Pricing Section

**Heading**: "💰 Fuel Pricing"

#### Diesel Price per Liter

**Field**:
- Label: "Diesel Price per Liter"
- Input Type: Number
- Step: 0.01 (two decimals)
- Current Value: e.g., `26.98`
- Currency: ZMW (displayed on right)

**How It Works**:
- This price used in ALL diesel revenue calculations
- Reconciliation: Diesel Volume Sold × This Price
- Displayed to supervisors in reconciliation
- Customer-facing price (what you charge)

**When to Change**:
1. **Supplier Price Change**:
   - Your supplier increases/decreases cost
   - Adjust to maintain margin
2. **Government Price Controls**:
   - ERB (Energy Regulation Board) sets max prices
   - Comply with regulations
3. **Competitive Pressure**:
   - Local competitors change prices
   - Match or differentiate strategically
4. **Margin Management**:
   - Costs rise, margins shrink
   - Increase to maintain profitability

**How to Change**:
1. Click in input field
2. Clear current value
3. Type new price: e.g., `27.50`
4. Scroll down to Save button
5. Click "Save Settings"
6. Confirm change

**Communication**:
- Notify supervisors immediately
- Update price boards at pumps
- Inform credit account holders if applicable

#### Petrol Price per Liter

**Field**:
- Label: "Petrol Price per Liter"
- Input Type: Number
- Step: 0.01
- Current Value: e.g., `29.92`
- Currency: ZMW

**Same principles as Diesel pricing above.**

---

### Allowable Losses Section

**Heading**: "📊 Allowable Losses During Offloading"

**Purpose**: Set acceptable fuel loss during deliveries.

#### Why Losses Occur

**Unavoidable Factors**:
1. **Evaporation**: Fuel evaporates during transport (especially petrol)
2. **Temperature**: Hot fuel expands, cool fuel contracts
   - Tanker measured hot (large volume)
   - Received cool (smaller volume)
3. **Measurement Precision**: Meters not 100% accurate (±0.1%)
4. **Residual Fuel**: Some remains in hoses/pipes
5. **Minor Spillage**: Connection/disconnection

**Industry Standards**:
- Diesel: 0.2% - 0.4% acceptable
- Petrol: 0.3% - 0.6% acceptable (more volatile)

#### Diesel Allowable Loss (%)

**Field**:
- Label: "Diesel Allowable Loss (%)"
- Input Type: Number
- Step: 0.01
- Min: 0
- Max: 5 (hard limit)
- Current Value: e.g., `0.30` (0.30%)
- Help Text: "Default: 0.3% loss during delivery"

**How It Works**:
```
Example Delivery:
Expected: 10,000 L
Allowable Loss: 0.30%
Allowable Amount: 10,000 × 0.003 = 30 L

If Actual Delivered:
9,975 L → Loss 25 L (0.25%) → ✓ Acceptable (green)
9,970 L → Loss 30 L (0.30%) → ✓ Acceptable (exactly at limit)
9,960 L → Loss 40 L (0.40%) → ⚠️ Excessive (orange warning)
```

**When to Adjust**:

**Increase (e.g., 0.30% → 0.40%)**:
- Consistently legitimate losses exceeding current
- Hot climate causing higher evaporation
- Long transport distances
- Supplier using older equipment
- **Risk**: Accept more loss, reduce revenue

**Decrease (e.g., 0.30% → 0.25%)**:
- Supplier consistently within tighter tolerance
- Improved delivery procedures
- Climate-controlled transport
- **Benefit**: Maximize fuel received
- **Risk**: Flag acceptable deliveries as problematic

**Recommendation**:
- Start at 0.30% for diesel (industry standard)
- Review 6 months of delivery data
- Adjust based on actual patterns
- Don't set too low (false alarms) or too high (accept excessive loss)

#### Petrol Allowable Loss (%)

**Field**:
- Label: "Petrol Allowable Loss (%)"
- Input Type: Number
- Step: 0.01
- Min: 0
- Max: 5
- Current Value: e.g., `0.50` (0.50%)
- Help Text: "Default: 0.5% loss during delivery"

**Why Higher Than Diesel**:
- Petrol more volatile (evaporates faster)
- Lower boiling point
- More sensitive to temperature
- Industry standard: 0.5% typical

**Same adjustment considerations as Diesel above.**

---

### Saving Changes

**Submit Button**:
- Full width
- Blue background
- Label: "Save Settings"
- Bottom of form

**Process**:
1. Make your changes (pricing and/or losses)
2. Review all values carefully
3. Click "Save Settings"
4. Button shows "Saving..." briefly
5. Success message: "✓ Settings updated successfully!"
   - Green box
   - Appears for 3 seconds
6. Settings now active system-wide

**If Error**:
- Red box: "✗ Failed to update settings"
- Check internet connection
- Verify values within valid ranges
- Try again
- Contact IT if persists

---

### Information Panel

**Bottom of Settings page**:

**Heading**: "ℹ️ About Allowable Losses"

**Key Points**:
- Allowable losses account for evaporation and spillage
- Typical standards: Diesel 0.2-0.4%, Petrol 0.3-0.6%
- Losses exceeding thresholds flagged in delivery reports
- Settings used to validate stock movements
- Used to calculate expected inventory

---

### Best Practices for Settings

**Change Management**:
1. **Plan Changes**:
   - Don't change impulsively
   - Analyze data first
   - Consult with advisors if major change
2. **Document**:
   - Keep log of all setting changes
   - Note: Date, Old Value, New Value, Reason
3. **Communicate**:
   - Notify supervisors before price changes
   - Update price boards
   - Train staff on new prices
4. **Monitor**:
   - Watch first few reconciliations after price change
   - Ensure calculations correct
   - Verify no system issues

**Pricing Strategy**:
- **Cost-Plus**: Cost + Fixed Margin
  - Pros: Predictable margin
  - Cons: May price out of market
- **Competitive**: Match local competitors
  - Pros: Maintain market share
  - Cons: Margin volatility
- **Premium**: Price above market
  - Pros: Higher margins if justified (service, convenience, quality)
  - Cons: Volume loss to competitors
- **Hybrid**: Generally competitive, premium on secondary products (lubricants)

**Loss Tolerance Strategy**:
- **Tight** (Low %): Maximize fuel received
  - Pros: More revenue
  - Cons: Frequent supplier disputes
- **Standard** (Industry): Balance acceptance and vigilance
  - Pros: Smooth operations, fewer conflicts
  - Cons: Accept some unavoidable loss
- **Loose** (High %): Avoid supplier conflicts
  - Pros: Easy supplier relationships
  - Cons: Accept more loss, lower margins

---

## 15. Business Intelligence & Decision Making

### Strategic Dashboard

**Create Your Own Monthly Dashboard** (Manual or Spreadsheet):

**Financial Metrics**:
1. Total Revenue (Fuel + LPG + Lubricants + Accessories)
2. Revenue by Category (%)
3. Gross Profit (Revenue - COGS)
4. Gross Margin %
5. Operating Expenses
6. Net Profit
7. EBITDA (Earnings Before Interest, Taxes, Depreciation, Amortization)

**Operational Metrics**:
1. Total Fuel Volume (Petrol + Diesel in Liters)
2. Average Daily Volume
3. Inventory Turnover
4. Days of Supply on Hand
5. Reconciliation Variance Rate
6. Perfect Reconciliation %
7. Discrepancy Count & Resolution Rate

**Credit Metrics**:
1. Total Credit Sales
2. Outstanding Receivables
3. Days Sales Outstanding (DSO)
4. Overdue Accounts Count
5. Write-offs (bad debt)

**Efficiency Metrics**:
1. Revenue per Employee
2. Fuel Delivered vs Fuel Sold (loss rate)
3. Nozzle Uptime %
4. Average Transaction Value

### Benchmarking

**Compare Against**:
1. **Your History**: Month-over-month, year-over-year
2. **Industry Standards**: Research typical margins, losses
3. **Competitors**: If data available (difficult)
4. **Goals**: Set targets, measure against

### Decision-Making Framework

**Data-Driven Decisions**:
1. **Identify Issue**: What problem needs solving?
2. **Gather Data**: Pull relevant reports
3. **Analyze**: Look for patterns, root causes
4. **Options**: Brainstorm solutions
5. **Evaluate**: Pros/cons, cost/benefit
6. **Decide**: Choose best option
7. **Implement**: Execute with clear plan
8. **Monitor**: Track results, adjust if needed

**Example: Persistent Night Shift Shortages**

1. **Issue**: Night shift has shortages 3 out of 4 weeks
2. **Data**:
   - Pull all night shift reconciliations (last 3 months)
   - Amount: Averaging -ZMW 150/night
   - Supervisors: Two different supervisors rotate
   - Attendants: Same 4 attendants
3. **Analyze**:
   - Shortages correlate with Supervisor A (not Supervisor B)
   - Two specific attendants present during all shortage nights
   - Security footage review: Suspicious activity noted
4. **Options**:
   - Retrain Supervisor A and attendants
   - Implement dual-count policy for night shift
   - Install additional cameras
   - Surprise cash counts
   - Disciplinary action/termination if theft proven
5. **Evaluate**:
   - Cost of cameras vs loss amount
   - Legal risks of wrongful accusation
   - Impact on team morale
6. **Decide**: Implement dual-count policy + surprise counts + closer supervision. If continues, formal investigation.
7. **Implement**: Policy rollout, training, monitoring plan
8. **Monitor**: Next 4 weeks - shortages drop to 0 or 1. Success!

---

## 16. Security & User Management

### User Access Control

**Role Hierarchy**:
```
Owner (You) - Full Access
  ├── Supervisor - Operations + Financial
  └── User - Readings Only
```

**Current Users** (Demo System):
- owner1 (you)
- supervisor1
- user1

**Production**: Coordinate with IT/developer to add/remove users.

### Password Security

**Owner Account Protection**:
- **Strong Password**: 12+ characters, mixed case, numbers, symbols
  - Bad: `password123`, `owner1`, `luanshya2023`
  - Good: `F3u!St@t10N#2025`
- **Unique**: Don't reuse from other systems
- **Secure Storage**: Password manager recommended
- **Change Regularly**: Every 90 days
- **Never Share**: Not even with supervisor

**If Compromised**:
1. Change password immediately
2. Review system logs for unauthorized activity
3. Check for unauthorized changes (Settings, data)
4. Investigate how compromise occurred
5. Implement additional security measures

### System Security

**Best Practices**:
1. **Logout**: Always logout when leaving computer
2. **Screen Lock**: Lock screen if stepping away
3. **Private Browsing**: If using shared computer
4. **HTTPS**: Ensure connection secure (padlock in browser)
5. **Trusted Devices**: Only access from secure, known devices
6. **Network Security**: Secure WiFi, firewall, antivirus

### Data Security

**Backups**:
- Coordinate with IT for regular backups
- Daily database backups recommended
- Store backups securely off-site
- Test restoration periodically

**Access Logs**:
- System logs who accessed what and when
- Periodically review for suspicious activity
- Coordinate with IT to pull logs if needed

**Data Privacy**:
- Employee records: Confidential
- Customer credit accounts: Sensitive financial data
- Comply with data protection regulations
- Limit access to need-to-know

---

## 17. Troubleshooting & System Administration

### Common Issues & Resolutions

#### Login/Access Issues

**Problem**: Cannot login as owner

**Solutions**:
1. Verify username: `owner1` (case-sensitive)
2. Verify password: `owner123` (demo) or your secure password
3. Check CAPS LOCK off
4. Try demo button instead of typing
5. Clear browser cache and cookies
6. Try different browser (Chrome, Firefox)
7. Check internet connection
8. Verify system is online (contact IT)
9. Check if account locked (too many failed attempts)
10. Reset password (contact admin/developer)

**Problem**: Settings menu not showing

**Solutions**:
1. Verify logged in as Owner (check role badge: "👑 Owner")
2. Logout and login again
3. Clear browser cache
4. Check user role in database (contact IT)

#### Settings Issues

**Problem**: Price changes not saving

**Solutions**:
1. Check internet connection
2. Verify values within valid ranges (positive, reasonable)
3. Check browser console for errors (F12 → Console tab)
4. Try different browser
5. Contact IT to check backend

**Problem**: Price change saved but reconciliation showing old price

**Solutions**:
1. Refresh reconciliation page
2. Clear browser cache
3. Check Settings page - confirm new price showing
4. Verify date range (old price applies to past dates)
5. Contact IT to verify database updated

#### Reconciliation Issues

**Problem**: Revenue calculations seem incorrect

**Troubleshooting Steps**:
1. **Verify Prices**:
   - Go to Settings
   - Note current Diesel and Petrol prices
   - Go back to Reconciliation
   - Check if prices shown match Settings
2. **Verify Volumes**:
   - Go to Readings page
   - Pull nozzle readings for that shift
   - Calculate: Closing - Opening = Volume Sold
   - Manually calculate: Volume × Price
   - Compare to Reconciliation revenue
3. **Check for Price Changes Mid-Shift**:
   - If you changed prices during a shift, calculations may be split
   - System should handle this, but verify
4. **Check Credit Sales**:
   - Go to Accounts page
   - Verify credit sales total matches reconciliation
5. **Manual Recalculation**:
   - Use calculator to independently verify
   - If discrepancy, document and contact IT

**Problem**: Can't determine variance cause

**Systematic Investigation**:
1. **Recount Cash**: With supervisor, recount physical cash
2. **Review All Sales**:
   - Fuel sales (meter readings)
   - LPG sales
   - Lubricants sales
   - Accessories sales
   - Credit sales
3. **Check Dip Readings**:
   - Compare dip-calculated volumes vs meter readings
   - Significant difference? Possible meter issues
4. **Review Footage**: Security cameras for entire shift
5. **Interview Staff**: Separately, document responses
6. **Check Competitors**: Pricing error (staff confused if you recently changed prices)?
7. **System Check**: Any glitches, data entry errors, duplicates?

#### Data Issues

**Problem**: Historical data missing

**Solutions**:
1. Verify data was entered on that date
2. Check system logs (coordinate with IT)
3. Check for system outages on that date
4. Look for backup data
5. Reconstruct from paper records if available
6. Document data loss for records

**Problem**: Duplicate entries

**Solutions**:
1. Don't delete yourself (may cause more issues)
2. Document:
   - Which entries are duplicates
   - IDs, timestamps, values
3. Contact IT/developer to remove duplicates properly
4. Investigate why duplicates occurred (user error, system glitch)
5. Implement prevention (user training, system validation)

#### Performance Issues

**Problem**: System slow or unresponsive

**Solutions**:
1. Check internet speed (speedtest.net)
2. Check server status with IT
3. Close unnecessary browser tabs
4. Clear browser cache
5. Restart browser
6. Try different browser
7. Restart computer
8. Check for browser/OS updates
9. Increase server resources if needed (coordinate with IT)

### Emergency Procedures

#### Critical System Failure

**If system completely down**:

1. **Immediate Actions**:
   - Switch to paper backup forms
   - Use manual logbooks
   - Continue operations (safety first!)
   - Notify IT urgently

2. **Paper Records**:
   - Nozzle readings: Record manually with pen
   - Sales: Paper receipts
   - Dip readings: Write in logbook
   - Credit sales: Manual invoices
   - Deliveries: Paper delivery notes

3. **Communication**:
   - Inform all staff of manual procedures
   - Clear instructions
   - Collect all paper records centrally

4. **When System Restored**:
   - Enter all paper data carefully
   - Double-check entries
   - Reconcile carefully
   - Document downtime period

5. **Post-Incident**:
   - IT investigates cause
   - Implement preventions
   - Update disaster recovery plan
   - Consider backup system

#### Data Loss Event

**If data lost or corrupted**:

1. **STOP**:
   - Don't use system
   - Don't enter new data
   - Preserve current state

2. **Notify**:
   - IT urgently
   - Detail what was lost
   - When last known good data

3. **IT Recovery**:
   - Restore from backups
   - Verify restoration complete
   - Check data integrity

4. **Verification**:
   - Review restored data
   - Spot-check calculations
   - Compare to paper records if available

5. **Prevention**:
   - Implement better backups
   - Regular backup testing
   - Redundancy

#### Security Breach

**If you suspect unauthorized access**:

1. **Immediate**:
   - Change owner password
   - Contact IT to check logs
   - Review recent data changes
   - Check Settings for unauthorized changes

2. **Investigation**:
   - Who accessed (check logs)
   - When (timestamps)
   - What did they access/change
   - How did they gain access

3. **Damage Control**:
   - Revert unauthorized changes
   - Secure vulnerabilities
   - Change all user passwords

4. **Legal**:
   - If employee theft: Follow company policy
   - If external breach: Consider police report
   - Document everything

5. **Prevention**:
   - Stronger passwords
   - Two-factor authentication if available
   - Access audits
   - Security training

---

## Quick Reference Guide

### Complete Access Summary

**✓ Full Access To**:
- Dashboard (View + Dip Readings)
- Nozzles (View)
- Readings (Submit)
- Shifts (Full)
- Reconciliation (Full)
- Accounts (Full)
- Inventory (Full)
- Sales (Full)
- Reports (Full)
- Stock Movement (Full)
- **Settings (Owner Only)**

### Critical Daily Tasks

**Morning** (30 minutes):
1. Review yesterday's reconciliation (both shifts)
2. Check for any shortages - investigate immediately
3. Review tank levels - plan deliveries if needed
4. Check discrepancies - ensure supervisors addressing
5. Review credit account balances - flag overdue

**During Day** (Periodic Checks):
1. Monitor Dashboard tank levels
2. Spot-check operations randomly
3. Available for supervisor escalations

**Evening** (30 minutes):
1. Review today's sales and operations
2. Count cash or supervise count
3. Prepare bank deposit
4. Brief night supervisor if applicable
5. Plan next day priorities

**Weekly** (2-3 hours):
1. Full reconciliation review (all shifts)
2. Inventory review (stock levels, reorders)
3. Credit accounts review (aging, collections)
4. Staff performance review with supervisors
5. Delivery schedule planning
6. Compile weekly summary

**Monthly** (4-6 hours):
1. Financial statements (revenue, expenses, profit)
2. Physical inventory count (full)
3. Credit account statements send
4. Staff performance reviews
5. Supplier performance evaluation
6. Strategic planning
7. Monthly report preparation

### Key Settings

**Current Configuration** (Check Settings Page):
- Diesel Price: ZMW ______ /L
- Petrol Price: ZMW ______ /L
- Diesel Allowable Loss: ______ %
- Petrol Allowable Loss: ______ %

**Last Updated**: ___/___/_____

### Key Formulas

**Reconciliation**:
```
Total Expected Revenue = Petrol + Diesel + LPG + Lubricants + Accessories
Expected Cash = Total Revenue - Credit Sales
Difference = Actual Deposited - Expected Cash
```

**Delivery Loss**:
```
Loss = Expected - Actual
Loss % = (Loss / Expected) × 100
Status = Loss % ≤ Allowable % ? "Acceptable" : "Excessive"
```

**Gross Margin**:
```
Margin per Liter = Selling Price - Cost per Liter
Margin % = (Margin / Selling Price) × 100
```

**Inventory Turnover**:
```
Turnover = Cost of Goods Sold / Average Inventory
Days on Hand = 365 / Turnover
```

### Emergency Contacts

**Internal**:
- Supervisor (Day): __________ - Phone: __________
- Supervisor (Night): __________ - Phone: __________
- IT Support: __________ - Phone: __________

**External**:
- Police: __________
- Fire Dept: __________
- Fuel Supplier 1: __________
- Fuel Supplier 2: __________
- Bank: __________
- Accountant: __________
- Lawyer: __________

---

## Glossary

**Allowable Loss**: Maximum acceptable fuel loss during delivery (set in Settings)

**Credit Limit**: Maximum amount a credit account holder can owe

**Credit Utilization**: Percentage of credit limit currently used (Balance / Limit × 100)

**Cumulative Difference**: Running total of all reconciliation variances

**Dip Reading**: Physical measurement of tank fuel level using dip stick (in cm)

**DSO (Days Sales Outstanding)**: Average days to collect credit sales payment

**EBITDA**: Earnings Before Interest, Taxes, Depreciation, Amortization

**Gross Margin**: Revenue minus Cost of Goods Sold

**Overage**: More cash than expected (positive variance)

**Shortage**: Less cash than expected (negative variance)

**Stock Value**: Total inventory value (Units × Unit Price)

---

**END OF OWNER MANUAL**

*This manual contains confidential business and financial information. Restricted to owner only. Do not distribute.*
