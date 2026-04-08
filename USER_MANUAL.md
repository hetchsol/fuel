# NextStop Fuel Management System — User Manual

**Version:** 1.0
**Date:** April 2026

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Getting Started](#2-getting-started)
3. [Role Guide: Attendant](#3-role-guide-attendant)
4. [Role Guide: Supervisor](#4-role-guide-supervisor)
5. [Role Guide: Manager](#5-role-guide-manager)
6. [Role Guide: Owner](#6-role-guide-owner)
7. [Daily Operations Workflow](#7-daily-operations-workflow)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. System Overview

NextStop is a fuel station management system that tracks fuel sales, LPG operations, lubricant inventory, cash handling, and shift reconciliation.

### Role Hierarchy

```
Attendant → Supervisor → Manager → Owner
```

| Role | Scope | Primary Responsibility |
|------|-------|----------------------|
| Attendant | Assigned nozzles | Enter readings, record sales, make safe deposits |
| Supervisor | Station operations | Review handovers, manage shifts, record deliveries |
| Manager | Station management | Close-off days, manage users, update settings |
| Owner | All stations | Infrastructure, stations, system configuration |

### Key Concepts

- **Shift** — A work period (Day: 06:00-18:00 or Night: 18:00-06:00) with assigned attendants
- **Nozzle Reading** — Electronic and mechanical meter values from each fuel pump
- **Handover** — End-of-shift submission with readings, stock counts, and cash declaration
- **Safe Deposit** — Periodic cash drop into the safe during a shift (every hour or at K1,500)
- **Reconciliation** — Comparison of tank levels, nozzle sales, and cash to detect variances

---

## 2. Getting Started

### 2.1 First Login

1. Open the application URL in your browser
2. Enter your username and password
3. Click **Sign In**

[Screenshot: Login page]

### 2.2 First-Time Setup (Owner Only)

On first login, the owner sees an initialization screen (15 seconds) followed by an 8-step setup wizard:

| Step | What You Configure |
|------|-------------------|
| 1 | Welcome |
| 2 | Your name and password |
| 3 | Business name, location, contact details |
| 4 | Fuel tanks (ID, type, capacity) |
| 5 | Fuel prices and tax rates (VAT, levy) |
| 6 | Operational thresholds and tolerances |
| 7 | Staff accounts (at least 1 attendant + 1 supervisor) |
| 8 | Completion — go to dashboard |

[Screenshot: Setup wizard - Welcome step]

The wizard is mandatory. You cannot skip it or access any other page until complete.

### 2.3 Navigation

The top navigation bar shows menu items based on your role:

- **Attendant:** Dashboard, My Shift, Shifts
- **Supervisor:** + Operations, Inventory & Sales, Reconciliation, Reports
- **Manager:** + Administration (Daily Close-Off, Settings, Users, Audit Log)
- **Owner:** + Stations, Infrastructure, full Settings

[Screenshot: Navigation bar with expanded Operations menu]

**Top-right corner shows:**
- Your name and role
- Live date/time clock
- Safe deposit overdue warning (if applicable)
- Notification bell (supervisor+)

---

## 3. Role Guide: Attendant

### What You Can Access

- **Dashboard** — Tank levels and daily summary
- **My Shift** — Your shift readings, deposits, and handover
- **Shifts** — View your shift assignment

### 3.1 Starting Your Shift

1. Log in with your credentials
2. Go to **My Shift**
3. The system automatically finds your assigned shift
4. You see: Shift Information, Safe Deposits, and the 3-step handover wizard

[Screenshot: My Shift page - Shift Information collapsed]

### 3.2 Making Safe Deposits

You must deposit cash into the safe **every hour** or when cash exceeds **K1,500**.

1. Find the **Safe Deposits** section (always visible on My Shift)
2. Enter the **Time** of deposit (defaults to current time)
3. Enter the **Amount** in ZMW
4. Add an optional **Note** (e.g. "Fleet fill-up")
5. Click **Deposit**

Your deposit appears in the history list with a running total.

[Screenshot: Safe Deposits section with 3 deposits listed]

**Overdue warning:**
If you haven't deposited in over 1 hour:
- A pulsing **"Safe deposit overdue"** text appears below the clock
- The Safe Deposits header shows an orange **OVERDUE** badge
- Your supervisor is automatically notified

### 3.3 Step 1: Enter Nozzle Readings

The step indicator shows: **1 Enter Data** → 2 Review → 3 Cash Handover

1. Expand the **Nozzle Readings** section
2. For each of your assigned nozzles, enter:
   - **Electronic Closing** — read from the pump's digital display
   - **Mechanical Closing** — read from the analog meter
3. Opening readings are pre-filled from the previous shift

[Screenshot: Nozzle readings table with values entered]

**The system auto-calculates:**
- Volume sold = Closing − Opening
- Deviation = |Electronic volume − Mechanical volume|
- Deviation % = Deviation / Average volume × 100

**If deviation exceeds the threshold (0.8L or 0.5%):**
- A red warning row appears immediately below that nozzle
- You must type an explanation (e.g. "Meter slightly behind, confirmed reading")
- You cannot proceed until all deviations are explained

[Screenshot: Deviation warning with explanation field]

### 3.4 Step 1: Enter LPG Sales

Expand the **LPG Cylinders** section (collapsed by default):

For each cylinder size you sold:
- **Sold Refill** — existing cylinders you refilled
- **Sold New Cylinder** — new cylinders sold with gas

**Read-only fields (set by supervisor):**
- Opening balance (carried from previous shift)
- Receipts (deliveries received)

The system auto-calculates the closing balance.

[Screenshot: LPG cylinders section]

### 3.5 Step 1: Enter Accessory and Lubricant Sales

Expand **LPG Accessories** or **Lubricants** sections:

- Enter only the quantity **Sold** for each item
- Opening stock and prices are read-only
- The system calculates balance and sales value

### 3.6 Step 2: Review

1. Click **Review My Entries** (disabled until all readings are complete and deviations explained)
2. A read-only summary shows everything you entered:
   - Nozzle volumes and deviations
   - LPG cylinder sales
   - Accessory and lubricant sales
3. Check all values are correct
4. Click **Confirm & Proceed to Cash Handover**
5. Or click **Back to Edit** to make corrections

[Screenshot: Step 2 review screen]

### 3.7 Step 3: Cash Handover

1. Enter the **Actual Cash Handed In** (total ZMW)
2. If there are credit sales, click **+ Add** and enter:
   - Account holder
   - Fuel type
   - Volume sold on credit
3. Add **Notes** if needed (required if deviations were flagged)
4. Click **Submit Shift Handover**
5. Confirm in the dialog

[Screenshot: Cash handover with actual cash entered]

**After submission:**
- You see a confirmation with your shift summary
- Attendants see volumes only (no financial details)
- The handover goes to supervisor for review

---

## 4. Role Guide: Supervisor

### What You Can Access

Everything an Attendant sees, plus:
- **Operations:** Handover Review, Daily Tank Reading, Fuel Operations, LPG Daily, Lubricants Daily
- **Inventory & Sales:** Tank Levels, Sales, Credit Accounts
- **Reconciliation:** Three-Way, Tank Analysis, Shift Reconciliation
- **Reports:** Sales Reports, Tank Readings, Advanced Reports, Alerts, Notifications

### 4.1 Creating a Shift

1. Go to **Shifts** page
2. Click **Create New Shift**
3. Select **Date** and **Shift Type** (Day/Night)
4. Check each **Attendant** to assign
5. For each attendant, check their **Islands** — all nozzles on that island are auto-selected
6. Click **Create Shift**

[Screenshot: Shift creation with attendants and island checkboxes]

**Notes:**
- Only one Day shift and one Night shift per date
- To recreate a shift: deactivate the old one first, then create a new one
- Attendants must exist in the system (created in Users page)

### 4.2 Recording Tank Dip Readings

1. On the **Shifts** page, click **Record Dip Reading**
2. Select the tank from the dropdown
3. **Opening Dip** auto-fills from the previous shift's closing
4. Enter **Closing Dip** (cm) at shift end
5. Click **Save**

[Screenshot: Tank dip reading modal]

### 4.3 Recording Fuel Deliveries

When a fuel tanker arrives:

1. Go to **Fuel Operations** > Deliveries
2. Click **+ Record Delivery**
3. Fill in all fields:

| Field | Description |
|-------|-------------|
| Tank | Which tank received fuel |
| Date / Time | When delivery occurred |
| Volume Before | Tank level before offload (from dip) |
| Volume After | Tank level after offload (from dip) |
| Supplier | Delivery company name |
| Invoice Number | Supplier's invoice reference |
| Expected Volume | Volume stated on the invoice |
| Flowmeter Reading | Volume shown on the delivery hose gauge |
| Temperature | Fuel temperature at delivery |

4. Click **Record Delivery**

[Screenshot: Delivery form filled in]

**Three-Way Delivery Reconciliation** is auto-calculated:
- Invoice volume vs Flowmeter volume vs Tank Dip change
- Status: PASS, VARIANCE_MINOR, or CRITICAL
- Outlier identified (Invoice, Flowmeter, or Tank Dip)

### 4.4 Reviewing Handovers

1. Go to **Handover Review**
2. See all submitted handovers with status badges:
   - **Pending** — awaiting review
   - **Flagged** — auto-flagged for cash shortage or meter deviation
   - **Approved** — already reviewed
3. Click a handover to expand:
   - Nozzle readings with volumes and deviations
   - Financial summary (expected vs actual cash)
   - Credit sale details
   - Safe deposit summary (click to expand individual entries)
   - Attendant notes

[Screenshot: Handover review with expanded details]

**Actions:**
- **Approve** — accept the handover
- **Return** — send back with a note (attendant must fix and resubmit)
- **Batch Approve** — check multiple pending handovers and approve all at once

### 4.5 Setting Prices

Prices must be set before attendants can record LPG or lubricant sales.

**LPG Cylinder Prices:**
1. Go to **LPG Daily Operations**
2. Click **LPG Pricing Settings** to expand
3. Set Refill and Full Cylinder prices for each size (3kg through 48kg)
4. Click **Save Pricing**

**LPG Accessory Prices:**
1. Same page, click **Edit Accessory Prices**
2. Set price per item
3. Click **Save Accessory Prices**

**Lubricant Prices:**
1. Go to **Lubricants Daily**
2. Click **Edit Product Prices**
3. Set prices by category (Engine Oil, Brake Fluid, etc.)
4. Click **Save All Prices**

[Screenshot: LPG pricing editor]

**Price guard:** If prices are K0 (not configured), a red banner appears and the submit button is disabled.

### 4.6 Viewing On This Shift

When you open **My Shift** as a supervisor, instead of the attendant wizard you see:

- **Shift Overview** with all active shifts
- **Attendant cards** showing:
  - Name, assigned islands, nozzles
  - Safe deposit count and total
  - OVERDUE badge if deposits are late
  - Click to expand individual deposit entries

[Screenshot: Supervisor's Shift Overview with attendant cards]

---

## 5. Role Guide: Manager

### What You Can Access

Everything a Supervisor sees, plus:
- **Daily Close-Off** — finalize the day
- **Settings** — operational configuration (fuel, tax, thresholds, tolerances, stock alerts)
- **Users** — manage attendant and supervisor accounts
- **Audit Log** — view system change history

### 5.1 Daily Close-Off

After all shifts for a day are approved:

1. Go to **Daily Close-Off**
2. Select the **Date**
3. Review the summary:
   - Each approved handover with expected vs actual cash
   - Daily totals across all shifts
   - Net variance
4. Enter **Bank Deposit Amount** (ZMW)
5. Enter **Deposit Reference** (bank receipt number)
6. Add **Notes** (optional)
7. Click **Close Day** → Confirm

[Screenshot: Daily Close-Off with bank deposit entry]

**You cannot close a day if:**
- Any handover is still pending review
- No handovers exist for that date

### 5.2 Managing Users

1. Go to **Users**
2. Click **+ Add User**
3. Fill in: Username, Full Name, Password, Role, Station
4. Click **Create User**

[Screenshot: User management page]

**Restrictions for Managers:**
- Can create **Attendants** and **Supervisors** only
- Cannot create Managers or Owners
- Cannot edit/delete Manager or Owner accounts
- Can reset passwords, disable/enable accounts for staff below them

### 5.3 Updating Settings

Go to **Settings**. Available tabs:

| Tab | What You Configure |
|-----|-------------------|
| Fuel Settings | Diesel/Petrol prices, allowable loss percentages |
| Tax & Levy | VAT rate (%), Fuel levy per liter (ZMW) |
| Validation Thresholds | Pass/Warning percentages for variance detection |
| Stock Alerts | Low stock (%) and Critical stock (%) thresholds |
| Reconciliation | Volume, percent, and cash tolerances (minor/investigation) |

[Screenshot: Settings - Fuel Settings tab]

**Tabs hidden from Managers:** System Information, Email Notifications, Tank Calibration (Owner only)

### 5.4 Audit Log

Go to **Audit Log** to see all system actions:
- User creation/modification
- Price changes
- Shift creation/closure
- Settings updates
- Handover approvals

Filter by action type, entity, or date range.

[Screenshot: Audit log entries]

---

## 6. Role Guide: Owner

### What You Can Access

Everything a Manager sees, plus:
- **Stations** — create, disable, delete stations
- **Infrastructure** — manage tanks and islands
- **Settings** — full access (System Info, Email, Tank Calibration)
- **Station Switcher** — dropdown in nav bar to switch between stations

### 6.1 Station Management

Go to **Stations**:

| Action | How |
|--------|-----|
| Create | Click + New Station, enter name/location, optional quick setup |
| Disable | Click Disable (must switch to another station first). Staff deactivated. |
| Enable | Click Enable on a disabled station. Staff reactivated. |
| Delete | Only on disabled stations. Type station name to confirm. Permanent. |

[Screenshot: Station management page]

**Show disabled stations:** Check the "Show disabled stations" checkbox to see inactive stations.

### 6.2 Infrastructure

Go to **Infrastructure**:

**Tanks Tab:**
- View all tanks with fuel type, capacity, current level
- Create new tanks
- Update capacity
- Delete tanks

**Islands & Pumps Tab:**
- View 6 pre-configured islands
- Change product type (Diesel/Petrol) per island
- Assign tanks to islands
- View nozzle details (A and B per island)

[Screenshot: Infrastructure - Tanks tab]

### 6.3 Tank Calibration

Go to **Settings** > **Tank Calibration** tab:

1. Select a tank from the dropdown
2. Click **Download Template** — get a blank Excel file
3. Fill in the manufacturer's calibration data:
   - Column A: Dip (cm)
   - Column B: Volume (L)
   - At least 5 data points, values must be ascending
4. Click **Upload Excel** and select the file
5. The calibration table appears below
6. To revert: click **Clear Calibration**

[Screenshot: Tank Calibration with uploaded data]

### 6.4 System Settings

**Settings > System Information:**
- Business Name, Location, Contact details
- License Key and Expiry Date

**Settings > Email Notifications:**
- Enable/disable email alerts
- Configure sender address and recipients
- Send test email

### 6.5 Setup Wizard and Reset

**First-time setup:** Automatic 8-step wizard on first login.

**Reset station data:** Run `reset_station.py` from the backend:
```
cd backend
python reset_station.py
```
This wipes all operational data but preserves the owner1 account. On next login, the setup wizard runs again.

---

## 7. Daily Operations Workflow

### Complete Day — Chronological Order

```
05:30  SUPERVISOR/MANAGER
       ├── Create Day shift
       ├── Assign attendants to islands
       └── Record opening tank dip readings

06:00  ATTENDANTS START
       ├── Log in → My Shift page loads
       └── Begin serving customers

07:00  ATTENDANT (hourly)
       └── Make safe deposit (Time + Amount)

08:00  ATTENDANT (hourly)
       └── Make safe deposit

       ... (repeat every hour or at K1,500)

17:30  ATTENDANTS
       ├── Enter electronic closing readings
       ├── Enter mechanical closing readings
       ├── Explain any deviations
       ├── Enter LPG cylinder sales
       ├── Enter accessory/lubricant sales
       ├── Review entries
       ├── Enter actual cash
       └── Submit handover

17:45  SUPERVISOR
       ├── Review each handover
       ├── Check nozzle deviations
       ├── Check cash variance
       ├── View safe deposit compliance
       ├── Approve or return handovers
       └── Record closing tank dip readings

18:00  SUPERVISOR/MANAGER
       ├── Create Night shift
       └── Record opening dip readings (auto-filled from Day closing)

       ... (Night shift follows same pattern)

06:00+ MANAGER/OWNER (next morning)
       ├── Verify all handovers approved
       ├── Enter bank deposit amount
       ├── Close the day
       └── Review reconciliation reports
```

### Reconciliation Review

After closing the day:

1. **Shift Reconciliation** — cash expected vs actual per attendant per shift
2. **Three-Way Reconciliation** — tank movement vs nozzle sales vs cash per fuel type
3. **Delivery Reconciliation** — invoice vs flowmeter vs tank dip per delivery
4. **Tank Analysis** — detailed per-tank variance analysis

[Screenshot: Three-Way Reconciliation page]

---

## 8. Troubleshooting

### Common Issues and Solutions

| Issue | Solution |
|-------|----------|
| Can't log in | Check username/password. Contact owner to reset password. |
| "No Active Shift Assigned" | Supervisor hasn't created a shift or assigned you yet. |
| Can't create shift (already exists) | Deactivate the existing shift first, then create a new one. |
| Staff dropdown is empty | No attendants created. Go to Users and create accounts. |
| LPG/Lubricant form disabled with red banner | Prices not configured. Supervisor must set prices first. |
| Can't click "Review My Entries" | Complete all nozzle readings and explain any deviations. |
| "Take photos of all meters to continue" | (Future feature — mechanical meter photo evidence) |
| Safe deposit overdue warning | Make a deposit immediately. Enter time and amount. |
| Report dropdowns empty | Dropdowns populate from configured data. Verify staff/nozzles exist. |
| Tank calibration upload fails | Use .xlsx format with at least 5 rows. Dip must be ascending. |
| "Session expired" | Log in again. Sessions last 24 hours with auto-refresh. |
| Page shows "Something went wrong" | Refresh the page (Ctrl+Shift+R). If persistent, contact admin. |
| Can't close the day | All handovers must be approved first. Check Handover Review. |

### System Requirements

- **Browser:** Chrome, Firefox, Edge, Safari (latest versions)
- **Mobile:** Works on phones and tablets (responsive design)
- **Internet:** Required for all operations (cloud-hosted)

### Support Files

| File | Location | Purpose |
|------|----------|---------|
| `SIMULATION_GUIDE.txt` | Root folder | Full walkthrough with sample data |
| `DAILY_OPERATIONS_GUIDE.txt` | Root folder | Complete daily workflow |
| `3_SHIFT_SIMULATION.txt` | Root folder | Quick 3-shift test |
| `reset_station.py` | backend/ | Reset all data for fresh start |
| `reset_station.bat` | backend/ | Windows shortcut for reset |

---

*NextStop Fuel Management System v1.0 — User Manual — April 2026*
*Generated with screenshot placeholders — insert actual screenshots at [Screenshot: ...] markers*
