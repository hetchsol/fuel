# Owner Manual — A to Z

**Who this is for:** the station **Owner** — the top role with full control.
You do everything a manager does (review handovers, close off the day, manage
stock, settings, users, audit) and you also have owner-only powers: the
**first-time setup wizard**, **Stations** (run more than one station),
**Infrastructure** (tanks, islands and nozzles), **Tank Calibration** (upload
dip-to-volume charts per tank), and **approving stock takes**.

**Your menu (top bar):** four groups — **Day**, **Stock & Sales**, **Reports**,
**Admin** — plus a **station selector** (if you manage more than one station),
a **bell** (alerts), a **light/dark** toggle, and **Logout**.

> Money is shown in ZMW (K). The **date** you pick on the dashboard is carried
> through to all other pages automatically.

---

## 1. First-time setup (first login only)

The very first time you log in, the system runs a short **setup wizard**. You
cannot use the rest of the app until it is finished. It has eight steps — click
**Next** to move forward and **Back** to revise any step.

1. **Welcome** — a short overview of what the wizard will do. Click **Next**.

2. **Your Profile** — enter your **Full Name** (required). Optionally set a
   **new password** (leave blank to keep the current one). Click **Next**.
   *What to expect:* your account name and password are saved.

3. **Business Info** — enter the **Business / Station Name** (required), and
   optionally **Location**, **Contact Email**, and **Contact Phone**. Click
   **Next**. *What to expect:* the station record and system settings are saved.

4. **Tanks** — set up your fuel storage. Two tanks are pre-filled (one Diesel,
   one Petrol, 20,000 L each). For each tank set the **Tank ID**, **Fuel Type**
   (Diesel or Petrol), and **Capacity (L)**. Use **Add tank** or **Remove** to
   change the list. At least one tank is required; IDs must be unique. Click
   **Next**.

5. **Pricing and Tax** — enter the **Diesel price per litre**, **Petrol price
   per litre**, **VAT rate (%)**, and **Fuel levy (ZMW per litre)**. Click
   **Next**.

6. **Operational Settings** — thresholds and tolerances:
   - **Allowable losses**: diesel %, petrol %, nozzle loss (L).
   - **Validation thresholds**: pass % and warning %.
   - **Stock alerts**: low-stock % and critical %.
   - **Reconciliation tolerances**: choose a mode (percentage, fixed litres,
     hybrid, or tiered) and set the cash minor and investigation amounts.

   *What to expect:* values are validated (for example the pass threshold must
   be above the warning level) and saved. Click **Next**.

7. **Staff** — optionally create your first user accounts. For each user enter
   **Full Name**, **Username**, and **Password** (minimum 6 characters), and
   set their **Role** (attendant, supervisor, or manager). You can add more
   staff later under Admin > Users. Click **Next**.

8. **All Set** — a success screen showing what was configured. Click **Go to
   Dashboard**.
   *What to expect:* setup is marked complete; from now on you log straight in
   to the dashboard without the wizard.

---

## 2. Logging in (after setup)

1. Open the station web address.
2. Enter your **username** and **password**.
3. Click **Sign in**.

**What to expect:** you land on the **Dashboard** with the **Today's Flow**
card. If you manage more than one station, a **station selector** appears in
the top bar.

---

## 3. Switching stations (if you run more than one)

1. In the top bar, open the **station selector** dropdown.
2. Choose a station from the list.

**What to expect:** the app reloads showing that station's data. Everything you
do — shifts, stock, reports, settings — applies to the **currently selected
station**. You can also add and manage stations under **Admin > Stations**
(see Section 11).

---

## 4. Your home: "Today's Flow"

The dashboard's **Today's Flow** card is your daily hub. It shows the day's
chain as four steps, each with a status dot and an action button:

- **Shift set up** — is there an active shift with attendants assigned.
- **Tank dips recorded** — opening and closing dips entered for the day.
- **Handovers reviewed** — how many attendant handovers are pending vs approved.
- **Day closed** — whether the day has been closed off.

The **button on each row** opens the page for that step; the **date picker**
sets the working day. Click the **NextStop logo** at any time to return here.

---

## 5. Reviewing handovers (Day > Handover Review)

**Purpose:** check and approve each attendant's end-of-shift handover. The day
cannot be closed until all handovers are approved.

1. Click **Day > Handover Review**.

---

### What you see

**Summary cards** at the top:

- **Awaiting Closing** — shifts where readings are verified but closing cash
  figures have not yet been submitted.
- **Pending Review** — handovers awaiting your approval.
- **Flagged** — handovers with automatic alerts (cash short beyond tolerance,
  meter deviation beyond threshold).
- **Approved Today** — handovers already approved in today's session.

**Filter bar:**

- **Date** — pick the date to review.
- **Shift** dropdown — filter to **Day** or **Night**, or leave as **All**.
- **Attendant** dropdown — filter to one specific person, or leave as **All**.
  The list populates from the attendants who appear in the loaded handovers.
- **Status tabs** — **All / Awaiting Closing / Pending / Flagged / Approved**.

---

### Viewing nozzle readings

Click the **Readings** button on any handover row to open the **Readings
modal** — a focused view without cluttering the table.

**The modal shows:**

- Attendant name, date, and shift in the header.
- One row per nozzle: **Nozzle** label (e.g. 1A, 2B), **Fuel**, **Mech.
  Opening**, **Elect. Opening**, **Elect. Closing**, **Mech. Closing**,
  **Volume Sold (L)**, **Revenue (K)**.
- A **Totals row** summing Volume Sold and Revenue.

Click the **X** or outside the modal to close it.

---

### Reviewing a handover (full detail)

- **Click a row** to expand full detail: nozzle readings with deviations,
  fuel/LPG/lubricant/accessory sales, credit sales, and safe deposits.
- **Approve** a clean handover — approved immediately; stock is applied.
- **Approve a flagged handover** — a box opens **requiring a written note**
  (reason chips available); click **Confirm Approve**. The note is permanent in
  the audit trail.
- **Return a handover** — a box opens **requiring a reason**; the attendant is
  notified to fix and resubmit.
- **Batch approve:** tick multiple clean handovers and click **Approve
  Selected (N)**.

When all handovers are reviewed, a green banner appears with a **Next: Daily
Close-Off** button.

---

## 6. Closing off the day (Day > Daily Close-Off)

1. Click **Day > Daily Close-Off** (or the **Next: Daily Close-Off** button).

**What you see:** the date and status badge (Open / Pending Reviews / Closed),
the **Approved Shifts** table, and the **Daily P&L Snapshot**.

2. If any handover is unapproved, a warning links back to Handover Review; the
   close button stays disabled.

3. **Enter the bank deposit:**
   - **Deposit amount (K)** — required.
   - **Deposit reference** — optional (bank slip number).
   - **Notes** — optional.

   As you type, a live line shows deposit vs actual cash (over / short / exact).

4. Click **Close Day and Lock Handovers**, then confirm in the dialog.

**What to expect:** the day is locked — this is final and cannot be undone.
The record shows who closed it and the deposit variance. **Close-Off History**
(expandable at the bottom) lets you view any past day's close.

---

## 7. Tank dip readings (Day > Daily Tank Reading)

**Purpose:** enter and view the opening and closing dip stick readings for each
fuel tank. The system converts dip cm values to litres using each tank's
calibration chart.

1. Click **Day > Daily Tank Reading**.

---

### Enter Readings tab

Select the **date** and **shift** (Day or Night). For each tank:

- Enter **Opening Dip (cm)** — the physical stick reading at shift start.
- Enter **Closing Dip (cm)** — the physical stick reading at shift end.

The system shows the computed volume in litres next to each reading based on
the tank's calibration chart. Click **Save Readings** when done.

---

### History tab

Click the **History** tab to view past dip readings in read-only mode.

- Select a **date** and a **shift** using the dropdowns.
- The table shows each tank with its **Opening Dip (cm)**, **Opening Vol (L)**,
  **Closing Dip (cm)**, and **Closing Vol (L)**.
- This view is read-only — no changes can be made here.

Use this tab to verify historical stock levels, cross-reference with delivery
records, and support reconciliation work.

---

## 8. Managing stock (Stock & Sales)

Open the **Stock & Sales** menu.

---

### Stores / Stock

1. Click **Stock & Sales > Stores / Stock**.

**What you see:** summary cards, a re-order alert for low items, and a full
item table with Stores and Forecourt quantities and re-order thresholds.

2. Click **Manage stock** on an item to open the stock action window:
   - **Receive** — add stock into Stores (enter quantity).
   - **Issue** — move from Stores to Forecourt (enter quantity).
   - **Damage** — write off damaged stock (pick bin, enter quantity, required
     reason).
   - **Adjust** — set a counted quantity after a physical count (pick bin,
     enter quantity, required reason).

   Click **Confirm** to save. The change appears in the stock ledger.

3. **+ Add / Edit Item** — add a new product or edit an existing one.
4. **Show recent movements** — the full stock ledger for that item.

---

### Stock Takes (you approve these)

1. Click **Stock & Sales > Stock Takes**.

**The flow:** a manager or supervisor starts a count, enters quantities for
each item, and **Submits** it. The stock take shows a **Submitted** badge.

2. Open a submitted stock take. The quantities are read-only; a **Variance**
   column shows the net difference against the system's expected count.

3. Click **Approve** (only visible to you as owner).
   **What to expect:** status changes to **Approved**, the record is locked,
   and the approval is recorded in the Audit Log with your name and the time.

---

### Tank Levels / Sales / Credit Accounts

- **Tank Levels** — current fuel volumes per tank (view only).
- **Sales** — sales figures and trends by fuel type, nozzle, island, or period.
- **Credit Accounts** — manage credit customers and their limits.

---

## 9. Reports (Reports menu)

Open the **Reports** menu. All pages are **read-only** and most can be exported.

- **Three-Way Reconciliation** — physical dip change vs meter readings vs
  accounting, side by side.
- **Tank Analysis** — tank-level movement: openings, closings, deliveries,
  sales, losses, and variances.
- **Shift Reconciliation** — per-shift revenue, cash, and stock breakdown.
- **Sales Reports** — summaries and trends by fuel, nozzle, island, attendant,
  or date range.
- **Tank Readings and Monitor** — historical dip and nozzle reading entries
  with validation flags.
- **Advanced Reports** — cross-cut views by staff, nozzle, island, product,
  and custom periods.
- **Anomaly Alerts** — flagged discrepancies: meter deviations, unexplained
  stock differences, cash shortfalls.
- **Notifications** — system alerts: low stock, overdue deposits, stale
  readings.

Pick a date range or apply filters, then view or export. None of these change
any data.

---

## 10. Administration (Admin)

Open the **Admin** menu. As owner you have the full set, including two
owner-only sections: **Stations** and **Infrastructure**, and the
**Tank Calibration** tool under Settings.

---

### Settings

1. Click **Admin > Settings**.

**What you can do:**

- **Fuel prices** — change a price immediately, or **schedule** a change for a
  specific future date and time. Scheduled changes show in a pending list and
  can be cancelled before they take effect.
- **Tax and levy rates** — update VAT and fuel levy.
- **Validation thresholds** — cash-shortage tolerance, meter-deviation
  percentage, and other operational limits.
- **Reconciliation tolerances** — amounts used to flag variances.

**Tank Calibration (owner only):**

Each tank needs a calibration chart — a table that converts a dip stick reading
in centimetres to a fuel volume in litres. This is the strapping table from the
tank manufacturer or a certified measurement.

1. In the **Tank Calibration** section, select the **tank** from the dropdown.
2. Click **Download Template** to get a blank Excel file with two columns:
   **Dip (cm)** and **Volume (L)**.
3. Fill in the template with the dip/volume pairs from the manufacturer's
   strapping table (at least 5 data points required).
4. Click **Upload** and select your completed file.

**What to expect:** the system reads the file, validates it (minimum 5 points,
numeric values only, two adjacent columns), and stores the chart. Future dip
readings for that tank will use the uploaded chart to compute volumes
automatically. The upload is immediate — no restart required.

If a tank's calibration is not yet set, dip entries for that tank will show a
warning and volumes cannot be computed until a chart is uploaded.

---

### Users

1. Click **Admin > Users**.

**What you can do:** create new accounts, edit names or passwords, change roles
(attendant, supervisor, manager), or deactivate an account. Deactivated accounts
cannot log in; their history is preserved. You cannot deactivate your own
account.

---

### Audit Log

1. Click **Admin > Audit Log**.

**What to expect:** a full, searchable, filterable record of every change —
price updates, handover approvals and returns, settings changes, user account
changes, stock adjustments, tank calibration uploads, and close-off events.
Filter by action type, entity type, user, and date range. This log cannot be
edited or deleted.

---

### Stations (owner only)

1. Click **Admin > Stations**.

**What you can do:**

- **+ New Station** — enter a **Name** (required) and optional **Location**.
  Leave **Quick Setup** ticked to auto-create default islands, tanks, nozzles
  and accounts. Click **Create**.
- **Edit** — change a station's name or location; click **Save**.
- **Switch to Station** — make a station the active one (the app reloads with
  that station's data).
- **Disable / Enable** — turn a station off or back on. You cannot disable the
  last active station.
- **Delete** — only available for a disabled, non-current station. You must
  **type the station name exactly** to confirm. This permanently removes all
  its shifts, readings, sales, and settings. You cannot delete the last station.

---

### Infrastructure (owner only)

1. Click **Admin > Infrastructure**.

The page has two tabs.

---

**Tanks tab:**

- **+ Create New Tank** — enter a **Tank ID** (unique), **Fuel Type**
  (Diesel or Petrol), **Capacity (L)**, and an optional **Initial level (L)**.
  Click **Create**.
- **Edit Capacity** — change a tank's capacity (must be at least the current
  level). Click **Save**.
- **Set Level** — enter the current fuel level (0 to capacity) and click
  **Set Level**. Use this to correct the level after a physical measurement.
- **Delete Tank** — removes the tank with confirmation. Cannot be undone.

Each tank card shows its current level, capacity, a colour-coded fill bar, and
a low-fuel warning when below 30%.

> After creating a tank or if a tank's calibration table is not yet set, go to
> **Admin > Settings > Tank Calibration** to upload the strapping table before
> dip readings can be converted to volumes.

---

**Islands and Pumps tab:**

- **Rename** — rename an island; click **Save** or press Enter.
- **Configure nozzles** — use a preset: **All Diesel**, **All Petrol**, or
  **Mixed** (one nozzle of each fuel). If you have more than one tank of a fuel,
  pick which tank each nozzle draws from. For full control click **Advanced**
  and choose **Custom** to assign each nozzle to a specific tank individually.
  Click **Apply configuration**.
- **Activate / Deactivate** — only active islands appear in shift assignments
  and operations.
- **Delete Island** — removes the island and all its nozzles with confirmation.

---

## 11. Logging out

Click **Logout** (top-right). You return to the login screen.

---

## Quick reference — the owner's tasks

**Daily:**
1. **Day > Handover Review** — filter by Shift or Attendant as needed; click
   Readings on any row to check nozzle detail; approve clean handovers, justify
   flagged ones, return anything incorrect.
2. **Day > Daily Close-Off** — enter bank deposit → **Close Day and Lock**.
3. **Day > Daily Tank Reading** — enter or check dip readings; view History tab
   for past figures.

**Stock:**
- **Stock & Sales > Stores / Stock** — receive, issue, damage, adjust.
- **Stock Takes** — approve counts submitted by managers/supervisors.

**Setup and configuration:**
- **Admin > Stations** — add, switch, disable, or delete stations.
- **Admin > Infrastructure** — create/edit tanks; configure islands and nozzles.
- **Admin > Settings > Tank Calibration** — upload dip-to-volume strapping
  tables for each tank.
- **Admin > Settings** — set fuel prices (immediate or scheduled), tax/levy
  rates, thresholds, tolerances.
- **Admin > Users** — create and manage staff accounts.

**Oversight:**
- **Reports** — reconciliation, tank analysis, sales, anomaly alerts.
- **Admin > Audit Log** — every change made in the system.

---

## Rules to remember

- You **cannot close the day** until **all handovers are approved**. Closing is
  **final and cannot be undone**.
- **Flagged approvals** require a **written justification note** — saved
  permanently in the audit trail.
- **Returns** require a **reason note** — the attendant sees it and must
  correct their submission.
- A **stock take** is submitted by a manager or supervisor and **approved by
  you** — you cannot approve your own count.
- **Tank calibration** must be uploaded before dip readings can be converted to
  volumes. Upload via **Admin > Settings > Tank Calibration**.
- **Disabling or deleting a station** is protected: you cannot remove the last
  active station, and deletion requires typing the station name exactly.
- Everything you do applies to the **currently selected station** shown in the
  top bar.
