# Manager Manual — A to Z

**Who this is for:** the station **Manager**. This guide walks you through your
whole day in order — from logging in, through reviewing the attendants' shifts
and closing off the day, to managing stock, reading reports, and administration.
Each step says **what to click** and **what to expect**.

**Your menu (top bar):** four groups — **Day**, **Stock & Sales**, **Reports**,
**Admin** — plus the **NextStop logo** (your home), a **bell** (alerts), a
**light/dark** toggle, and **Logout**.

> Money is shown in ZMW (K). Tip: the **date** you pick on your home screen is
> remembered as you move between pages, so you do not need to re-select it each
> time you navigate.

---

## 1. Logging in

1. Open the station web address.
2. Enter your **username** and **password**.
3. Click **Sign in**.

**What to expect:** you land on your **home dashboard**, which includes the
**Today's Flow** card — your daily checklist and starting point.

---

## 2. Your home: "Today's Flow"

This card is the hub of your day. It shows the day's chain as four steps, each
with a status indicator and an action button:

- **Shift set up** — is there an active shift with attendants assigned.
- **Tank dips recorded** — opening and closing dips entered for the day.
- **Handovers reviewed** — how many attendant handovers are still pending vs
  approved.
- **Day closed** — whether the day has been closed off.

**What each part does:**

- A coloured dot shows each step's state (done / needs attention / not yet done).
- The **button on each row** takes you straight to the page for that step —
  for example "Review" opens Handover Review; "Close-off" opens Daily Close-Off.
- The **date picker** sets the day you are working on; it carries through to
  other pages automatically.

**What to expect:** at a glance you know what is done and what is next. Your
normal day starts here: review handovers, then close off the day.

> To return to Today's Flow at any time, click the **NextStop logo** (top-left).

---

## 3. Step 1 of your day — Review handovers (Day > Handover Review)

**Purpose:** check and approve each attendant's end-of-shift handover. The day
**cannot be closed** until all handovers are approved.

1. Click **Day > Handover Review** (or the **Review** button on Today's Flow).

---

### What you see

**Summary cards** at the top:

- **Awaiting Closing** — shifts where readings are verified but the attendant
  has not yet submitted closing cash figures.
- **Pending Review** — handovers submitted and waiting for your approval.
- **Flagged** — handovers with automatic alerts (cash short beyond tolerance,
  meter deviation beyond threshold).
- **Approved Today** — handovers already approved in today's session.

**Filter bar** (below the summary cards):

- **Date** — pick the date you want to review. Defaults to today.
- **Shift** dropdown — filter by **Day** or **Night**, or leave as **All** to
  see both shifts.
- **Attendant** dropdown — filter to one specific attendant's handovers, or
  leave as **All** to see everyone. The list is populated from the attendants
  who appear in the loaded handovers for the selected date/shift.
- **Status tabs** — **All / Awaiting Closing / Pending / Flagged / Approved**.
  Click a tab to narrow the list to that status.

**Handover table:** each row shows the attendant's name, date, shift,
**Expected Cash**, **Actual Cash**, **Difference**, any flags, and the review
status.

---

### Viewing nozzle readings for a handover

Each row has a **Readings** button (right side of the row). Click it to open
the **Readings modal** without expanding the full handover detail.

**What the Readings modal shows:**

- Header: attendant name, date, and shift.
- A table with one row per nozzle:
  - **Nozzle** — short label (e.g. 1A, 2B, 3A).
  - **Fuel** — Petrol or Diesel.
  - **Mech. Opening** — mechanical meter opening reading.
  - **Elect. Opening** — electronic meter opening reading.
  - **Elect. Closing** — electronic meter closing reading.
  - **Mech. Closing** — mechanical meter closing reading.
  - **Volume Sold (L)** — volume sold on that nozzle this shift.
  - **Revenue (K)** — cash generated on that nozzle.
- A **Totals row** at the bottom summing Volume Sold and Revenue across all
  nozzles.

Click the **X** or click outside the modal to close it.

---

### Reviewing a handover (full detail)

2. **Click anywhere on a row** to expand full detail. **What to expect:** the
   row expands to show nozzle readings with electronic/mechanical figures and
   any deviation alerts, fuel sales, LPG/lubricant/accessory sales, credit
   sales, and the attendant's safe deposits.

3. **Approve a clean handover:** click **Approve**. **What to expect:** it is
   approved immediately, stock is applied, and the row moves to the "Approved"
   status.

4. **Approve a flagged handover** (cash short or meter deviation beyond
   threshold): click **Approve**. **What to expect:** a box opens that
   **requires a written justification**. Use a **quick-reason chip** to fill it
   (for example "Counted twice — confirmed") or type your own note, then click
   **Confirm Approve**. The note is saved to the audit trail permanently.

5. **Return a handover** (something is wrong — the attendant must correct it):
   click **Return**. **What to expect:** a box opens **requiring a reason**
   (reason chips are available for common situations). Click **Confirm Return**.
   The attendant is notified and can resubmit after making the correction.

6. **Approve several at once:** tick the checkboxes on multiple clean handovers,
   then click **Approve Selected (N)**. Flagged handovers cannot be batch-
   approved — they require individual justification notes.

---

### Shifts awaiting closing

The **Awaiting Closing** tab lists attendants whose opening readings were
verified but who have not yet submitted their closing figures (the cash
reconciliation step). Use the **Complete closing** button to open and finalise
one of these if needed.

---

### When all handovers are reviewed

When nothing is outstanding, a green banner appears: **"All handovers reviewed
— nothing outstanding."** It includes a **Next: Daily Close-Off** button —
click it to move to Step 2.

---

## 4. Step 2 of your day — Close off the day (Day > Daily Close-Off)

**Purpose:** reconcile the day's takings against the bank deposit and **lock**
the day. This action is final and cannot be undone.

1. Click **Day > Daily Close-Off** (or the **Next: Daily Close-Off** button
   from Handover Review).

**What you see:**

- The **date** and a **status badge** (Open / Pending Reviews / Closed).
- **Approved Shifts** — a table of the day's approved handovers with their
  attendant names, expected and actual cash, and any variance.
- **Daily P&L Snapshot** — fuel/LPG/lubricant/accessory revenue, total expected
  cash, total actual cash, and the net variance.

2. **If any handover is still unapproved:** a warning message appears with a
   link back to Handover Review. The **Close Day** button stays disabled until
   every handover is approved.

3. **Enter the bank deposit:**
   - **Deposit amount (K)** — required. Enter the total amount being deposited.
   - **Deposit reference** — optional (for example the bank slip number or
     teller reference).
   - **Owner notes** — optional.

   **What to expect:** as you type the deposit amount, a live line shows
   **"Deposit vs Actual Cash"** — whether you are over, short, or exact, and
   by how much.

4. Click **Close Day and Lock Handovers**. **What to expect:** a confirmation
   box appears stating this **locks the day and cannot be undone**. Confirm to
   proceed.

**After closing:** the day shows a **Closed** badge with who closed it and the
deposit variance recorded. The **Close-Off History** section (expandable at the
bottom) lets you view or navigate to any past day's close record.

---

## 5. Tank dip readings (Day > Daily Tank Reading)

**Purpose:** enter and view the opening and closing dip stick readings for each
fuel tank for the day.

1. Click **Day > Daily Tank Reading**.

The page has two tabs:

---

### Enter Readings tab

Select the **date** and **shift** (Day or Night) at the top. For each tank,
enter:

- **Opening Dip (cm)** — physical dip stick reading at the start of the shift.
- **Closing Dip (cm)** — physical dip stick reading at the end of the shift.

The system converts each dip reading to a volume in litres using the tank's
uploaded calibration chart and shows the computed volume alongside the reading.
Click **Save Readings** when done.

---

### History tab

Click the **History** tab to view past dip readings without making any changes.

- Pick a **date** and a **shift** (Day or Night) using the dropdowns.
- The table shows each tank with its **Opening Dip (cm)**, **Opening Vol (L)**,
  **Closing Dip (cm)**, and **Closing Vol (L)** for the selected date and shift.
- All data is **read-only** in this view.

This tab is useful for checking historical stock levels, verifying entries made
by supervisors, and cross-referencing with the Three-Way Reconciliation report.

---

## 6. Managing stock (Stock & Sales)

Open the **Stock & Sales** menu. It contains:

---

### Stores / Stock

1. Click **Stock & Sales > Stores / Stock**.

**What you see:** summary cards (item count, items needing re-order, quantities
in Stores and Forecourt), a re-order alert if any item is below its re-order
level, and a table of all items with their Stores and Forecourt quantities and
re-order threshold.

2. To move or adjust stock, click **Manage stock** on an item. A window opens
   with an **action selector** at the top — choose one of:

   - **Receive** — add new stock into Stores (enter the quantity received).
   - **Issue** — move stock from Stores to the Forecourt (enter the quantity).
   - **Damage** — write off damaged or lost stock (pick the bin — Stores or
     Forecourt — enter the quantity, and select a **reason** from the chips or
     type your own; reason is required).
   - **Adjust** — set the quantity after a physical count (pick the bin, enter
     the counted quantity, and provide a **reason**; reason is required).

   Switching between actions resets the quantity and reason fields. Click
   **Confirm** to save. The change appears immediately in the stock ledger.

3. **Add or edit an item:** click **+ Add / Edit Item** (top right of the page).
4. **View movement history:** click **Show recent movements** on any item to see
   its full stock ledger — every receive, issue, damage, and adjustment with
   timestamps and who made the change.

---

### Stock Takes

1. Click **Stock & Sales > Stock Takes**.

**What to expect:** start a count, work through each item and enter the
physically counted quantities, then **Submit**. Submitting sends the stock take
to the **owner** for approval — a manager cannot approve their own stock take.

---

### Tank Levels

Click **Stock & Sales > Tank Levels** to see the current calculated fuel volumes
per tank based on the most recent dip readings and sales.

---

### Sales

Click **Stock & Sales > Sales** to view sales figures and trends for fuel, LPG,
lubricants, and accessories.

---

### Credit Accounts

Click **Stock & Sales > Credit Accounts** to manage credit customers, view their
balances, and set or adjust credit limits.

---

## 7. Reports (Reports menu)

Open the **Reports** menu. All report pages are **read-only** — they do not
change any data. Most can be exported.

- **Three-Way Reconciliation** — compares the physical dip change, meter
  readings, and accounting figures side by side to highlight any discrepancy.
- **Tank Analysis** — detailed tank-level movement showing openings, closings,
  deliveries, sales, and calculated losses or variances.
- **Shift Reconciliation** — a per-shift breakdown of revenue, cash, and stock
  movement.
- **Sales Reports** — sales summaries and trends by fuel type, nozzle, island,
  attendant, or period.
- **Tank Readings and Monitor** — historical dip and nozzle reading entries with
  validation flags.
- **Advanced Reports** — cross-cut views: by staff, nozzle, island, product,
  and custom date ranges.
- **Anomaly Alerts** — flagged discrepancies that need attention (meter
  deviations, unexplained stock differences, cash shortfalls above thresholds).
- **Notifications** — system alerts such as low stock warnings, overdue safe
  deposits, and stale readings.

**What to expect:** pick a date range or apply filters where offered, then view
or export. None of these pages change any figures.

---

## 8. Administration (Admin)

Open the **Admin** menu.

---

### Settings

1. Click **Admin > Settings**.

**What you can do:**

- **Fuel prices** — change a price immediately, or **schedule** a price change
  for a specific future date and time (the change applies automatically at the
  scheduled moment).
- **Tax and levy rates** — update VAT and fuel levy figures.
- **Validation thresholds** — adjust the cash-shortage tolerance, meter-
  deviation percentage, and other operational limits.
- **Reconciliation tolerances** — set the amounts used to flag variances.

**What to expect:** every change is recorded in the Audit Log with the time,
the old value, the new value, and who made the change. Scheduled price changes
show in a pending list and can be cancelled before they take effect.

---

### Users

1. Click **Admin > Users**.

**What you can do:** create new user accounts, edit names or passwords, change
roles (attendant, supervisor, manager), or deactivate an account. Deactivated
accounts cannot log in but their history is preserved.

---

### Audit Log

1. Click **Admin > Audit Log**.

**What to expect:** a searchable, filterable record of every change made in the
system — price updates, handover approvals and returns, settings changes, user
account changes, stock adjustments, and close-off events. Filter by action
type, entity type, user, and date range. This log cannot be edited or deleted.

---

## 9. Logging out

Click **Logout** (top-right). You return to the login screen.

---

## Quick reference — the manager's day

1. **Log in** → land on **Today's Flow**.
2. **Day > Handover Review** — use the Shift and Attendant dropdowns to filter
   as needed. Click **Readings** on any row to see nozzle meter detail. Approve
   the clean ones, justify any flagged approvals, return anything that needs
   correction. When all done, click **Next: Daily Close-Off**.
3. **Day > Daily Close-Off** — enter the **bank deposit amount**, then click
   **Close Day and Lock Handovers** and confirm.
4. As needed throughout the day:
   - **Day > Daily Tank Reading** — enter or check dip readings; use History
     tab to view past figures.
   - **Stock & Sales** — receive/issue/damage/adjust stock, run stock takes.
   - **Reports** — reconciliation, sales, anomaly alerts.
   - **Admin** — settings (prices, thresholds), users, audit log.

---

## Rules to remember

- You **cannot close the day** until **all handovers are approved**.
- **Flagged approvals** require a **written justification note** — this is
  saved permanently in the audit trail.
- **Returns** require a **reason note** — the attendant sees it and must
  correct their submission before resubmitting.
- **Closing the day is final** — it locks all handovers and the close record
  for that date.
- A **stock take** is submitted by you and **approved by the owner** — you
  cannot approve your own count.
- The **Shift and Attendant dropdowns** on Handover Review let you narrow the
  view — use them when you are reviewing a specific person's shifts or checking
  one particular session.
