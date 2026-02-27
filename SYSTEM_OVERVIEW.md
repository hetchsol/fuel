# Fuel Station Management System — Technical & Operational Overview

## What This System Does

This application digitizes the paper-based "Daily Station Stock Movement Reconciliation" spreadsheet used at fuel stations. It tracks fuel inventory, sales, deliveries, cash handling, and ancillary products (LPG, lubricants, accessories) across shift cycles, providing real-time reconciliation and variance detection.

---

## Architecture

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Frontend** | Next.js / React | Role-based UI, Tailwind CSS, dark mode support |
| **Backend** | Python / FastAPI | REST API, JSON file storage per station |
| **Storage** | File-based | `storage/stations/{station_id}/*.json` |
| **Auth** | Bearer token | Stored in localStorage, no expiry currently |
| **Multi-station** | `X-Station-Id` header | Each station has isolated data |

---

## User Roles

| Role | Access | Typical User |
|------|--------|-------------|
| **User** | Dashboard, My Shift, Enter Readings, Shifts | Pump attendant |
| **Supervisor** | All user pages + Inventory, Sales, Reconciliation, Reports | Station supervisor |
| **Owner** | Full access including Administration (Settings, Infrastructure, Users, Stations) | Station owner |

---

## The Daily Operational Cycle

### Phase 1: Station Setup (One-Time, Owner)

These are configured once and rarely changed:

| Menu Item | What It Does | Must Be Done Before |
|-----------|-------------|-------------------|
| **Settings** | Sets fuel prices (diesel/petrol), validation thresholds, business info | Any operations |
| **Infrastructure** | Configures islands (pumping bays), pump stations, nozzles (2 per pump), tanks | Creating shifts |
| **Users** | Creates attendant/supervisor accounts with roles | Assigning shifts |
| **Stations** | Multi-station management, quick setup wizard | Everything (default ST001 auto-created) |

### Phase 2: Shift Start (Supervisor/Owner)

| Menu Item | What It Does | Depends On |
|-----------|-------------|-----------|
| **Shifts** | Creates Day or Night shift, assigns attendants to islands. System auto-pulls previous shift's closing nozzle readings as new opening values. | Infrastructure, Users |

### Phase 3: During the Shift (Attendant)

| Menu Item | What It Does | Depends On |
|-----------|-------------|-----------|
| **Enter Readings** | Attendant records opening nozzle readings (electronic + mechanical meters). System validates the two meters agree within threshold. Supervisor can review/approve/return. | Active shift |
| **My Shift** | At shift end: attendant enters closing nozzle readings, LPG/accessory/lubricant stock counts, and actual cash collected. System computes expected revenue vs actual cash, shows surplus or shortage. | Enter Readings (opening values) |
| **OCR Reading Entry** | Alternative to Enter Readings — photograph the mechanical meter, OCR extracts the number. | Active shift |

### Phase 4: End of Shift (Supervisor/Owner)

| Menu Item | What It Does | Depends On |
|-----------|-------------|-----------|
| **Daily Tank Reading** | The core spreadsheet equivalent. Owner enters physical dip measurements (cm) for each tank. System converts to liters, pulls nozzle data, calculates tank movement, variance, financial reconciliation, delivery VAT, running totals, and customer allocations. | Shift nozzle readings, fuel prices from Settings, deliveries |

### Phase 5: Deliveries (When fuel trucks arrive)

| Menu Item | What It Does | Depends On |
|-----------|-------------|-----------|
| **Stock Movement** | Records fuel deliveries — tank level before and after offloading. Calculates actual vs invoice volume. Shows delivery queue and running stock. | Tank exists in Infrastructure |
| **Tank Readings & Deliveries** | Another view of tank readings with delivery management and batch delivery queuing. | Tank readings |

Deliveries can be entered inline with Daily Tank Reading, standalone via Stock Movement (auto-linked to next tank reading), or as multiple deliveries per shift.

### Phase 6: Reconciliation (Supervisor/Owner)

Three views that cross-check the same data from different angles:

| Menu Item | What It Does | Depends On |
|-----------|-------------|-----------|
| **Shift Reconciliation** | Per-shift revenue breakdown: fuel + LPG + lubricants + accessories = total expected. Shows credit sales, expected cash, actual deposited, difference, VAT on fuel sales. | Handover submissions, sales data |
| **Three-Way Reconciliation** | Compares Physical (tank dip) vs Operational (nozzle meters) vs Financial (cash banked). If they diverge, root cause analysis suggests tank leak, meter calibration, or cash handling issue. | Daily Tank Reading + nozzle readings + cash from handovers |
| **Tank Analysis** | Deep dive into individual tank movements per shift — dip readings through to variance, delivery impact, loss detection. | Tank readings |

### Phase 7: Reports (Supervisor/Owner)

| Menu Item | What It Does | Depends On |
|-----------|-------------|-----------|
| **Sales Reports** | Sales aggregated by date, fuel type, shift. Volume and revenue totals. | Sales data |
| **Tank Readings & Monitor** | Historical tank readings with detail modals: nozzle breakdowns, financial summary, customer allocations, delivery timeline, delivery VAT (owner only). | Tank readings |
| **Advanced Reports** | Custom date range analytics. | All operational data |

### Ancillary Products & Services

| Menu Item | What It Does | Depends On |
|-----------|-------------|-----------|
| **LPG Daily Operations** | Tracks 6 cylinder sizes (3/6/9/19/45/48 kg), refill vs with-cylinder pricing, accessory management. Can also be submitted through My Shift handover. | LPG pricing config |
| **Lubricants Daily** | Tracks lubricant stock between "Island 3" (retail) and "Buffer" (storage). Records transfers and sales. | Lubricant product catalog |
| **Credit Accounts** | Manages institutional customers (police, water utility, etc.) who buy on credit. Credit sales offset expected cash in reconciliation. | Account setup |
| **Tank Levels (Inventory)** | Read-only dashboard showing current fuel levels, LPG stock, lubricant stock. | Tank readings, handover data |

---

## Critical Dependency Chain

```
Infrastructure + Users + Settings
        |
      Shifts (assigns attendants to islands/nozzles)
        |
  Enter Readings (opening nozzle values)
        |
    My Shift / Handover (closing readings + cash + stock)
        |                          |
  Daily Tank Reading          Deliveries (Stock Movement)
   (dip + nozzles +              |
    deliveries + VAT +     auto-links to tank reading
    running totals)
        |
  Reconciliation (3-way cross-check)
        |
     Reports
```

**The critical path is: Shifts -> Readings -> Handover -> Tank Reading -> Reconciliation.** Everything else feeds into or reads from this chain.

---

## Key Calculations

### Tank Movement (Column AM)
```
If no delivery:  Opening Volume - Closing Volume
With deliveries:  (Opening - Closing) + Sum(All Delivery Volumes)
```

### Variance (Columns AP, AQ)
```
Electronic Variance = Total Electronic Dispensed - Tank Movement
Mechanical Variance = Total Mechanical Dispensed - Tank Movement
Variance % = Variance / Tank Movement * 100
```
- <= 0.5% = PASS
- <= 1.0% = WARNING
- > 1.0% = FAIL

### Delivery VAT
```
Net Price = (Selling Price - 1.44 levy) / 1.16
VAT Amount = Delivery Volume * Net Price * 0.16
```

### Cumulative Running Totals (across all shifts)
```
Running Volume Sold = Previous + (Electronic + Mechanical) / 2
Running Variance = Previous + Electronic Variance
Running Tank Movement = Previous + Tank Movement
Running Loss % = Running Variance / Running Tank Movement * 100
```

### Cash Reconciliation
```
Expected Revenue = Volume Dispensed * Price Per Liter
Expected Cash = Total Expected - Credit Sales
Cash Difference = Actual Cash Banked - Expected Cash
```

---

## Data Storage

All data is stored in JSON files under `backend/storage/stations/{station_id}/`:

| File | Contents |
|------|---------|
| `tank_readings.json` | All daily tank readings with calculations |
| `tank_deliveries.json` | Delivery records linked to readings |
| `sales.json` | Individual sale transactions |
| `attendant_handovers.json` | Shift handover submissions |
| `attendant_readings.json` | Enter Readings submissions |
| `lpg_daily_entries.json` | LPG cylinder daily entries |
| `lpg_accessories_daily.json` | LPG accessories daily entries |
| `lubricant_daily_entries.json` | Lubricant daily entries |
| `customers.json` | Customer master data |

Runtime configuration (tanks, islands, nozzles, prices, users) lives in memory and is seeded from `seed_defaults.py` on startup.

---

## Suggested Improvements

### Critical (Data Integrity & Security)

1. **Token expiry and refresh** — No token expiration currently. A stolen token works forever. Add JWT expiry (e.g., 8 hours) with refresh token rotation.

2. **Server-side route protection** — Role-based access is UI-only (nav menu filtering). Any user who knows the URL can access restricted pages. Add Next.js middleware that checks role before serving pages.

3. **Migrate from JSON files to a database** — All data lives in flat JSON files. A crash mid-write can corrupt an entire file. SQLite at minimum, PostgreSQL for production. This also unlocks proper querying, transactions, and concurrent access.

4. **Audit trail** — No history of who changed what. Every edit to settings, prices, user roles, or deleted readings should be logged with timestamp and user ID.

5. **Input sanitization on financial fields** — Prices, volumes, and cash amounts are accepted as-is. Add server-side bounds checking (e.g., price cannot be negative, volume cannot exceed tank capacity).

### High (Operational Gaps)

6. **Offline / poor-connectivity support** — Fuel stations often have unreliable internet. Add a service worker that queues submissions locally and syncs when connectivity returns.

7. **Export to Excel / PDF / Print** — No export capability exists. The owner needs to produce printed reports for regulators, auditors, and head office. Add export buttons to Reconciliation, Tank Readings Report, and Sales Reports pages.

8. **Shift auto-close** — If an attendant forgets to submit handover, the shift stays "active" indefinitely. Add configurable auto-close (e.g., after 14 hours) with a warning notification.

9. **Notifications / alerts** — No alerting system. Critical losses, cash shortages above 5%, and tank levels below threshold should trigger in-app notifications and optionally SMS/email to the owner.

10. **Previous shift auto-populate for nozzles** — The Daily Tank Reading page requires manually entering all nozzle opening readings. These should auto-populate from the previous shift's closing readings (the API endpoint exists but the UI does not always use it).

### Medium (Reporting & Analytics)

11. **Period-over-period comparison** — No way to compare this week vs last week, or this month vs last month. Add trend charts showing volume, revenue, and variance over time.

12. **Attendant performance dashboard** — Track per-attendant metrics: cash accuracy, reading discrepancy rate, average variance. Helps identify training needs or problem patterns.

13. **Delivery supplier analytics** — Track delivery variance by supplier over time. If one supplier consistently delivers less than invoiced, the data should make that visible.

14. **Loss trending and threshold alerts** — The running loss percent accumulates but nothing acts on it. Add a dashboard widget that highlights when cumulative loss exceeds the allowable percentage (0.3% diesel / 0.5% petrol).

15. **Daily summary email/report** — Auto-generate end-of-day summary and send to owner: total revenue, variance, deliveries, cash position, any flags.

### Low (UX & Polish)

16. **Mobile-responsive layout** — The app works on mobile but the tables and forms are not optimized for small screens. The attendant's primary device is likely a phone.

17. **Dark mode persistence** — Dark mode toggle exists but verify it persists across sessions and applies consistently to all pages.

18. **Bulk data entry** — Entering 12 nozzle readings one by one is tedious. Add a spreadsheet-style grid input where tab moves between cells.

19. **Reading photo attachments** — Allow attendants to photograph the dip stick or meter and attach it to the reading as evidence. The OCR infrastructure partially exists.

20. **Customer allocation templates** — Diesel customer allocations are entered manually each shift. Allow saving common allocation patterns as reusable templates.

### Future / Strategic

21. **Multi-station consolidated reporting** — The backend supports multiple stations but there is no cross-station dashboard for an owner managing several sites.

22. **API for external accounting systems** — Provide a documented REST API that accounting software (Sage, QuickBooks) can pull daily revenue, VAT, and credit sales from.

23. **Regulatory compliance reports** — ZRA (Zambia Revenue Authority) and ERB (Energy Regulation Board) have specific reporting formats. Build templates that auto-fill from system data.

24. **Predictive reorder alerts** — Based on average daily consumption, predict when each tank will hit critical level and suggest reorder timing.

25. **Role: "Accountant"** — A read-only role that can see financial reports, VAT data, and credit accounts but cannot modify operations. Useful for finance teams.
