# Owner Manual - A to Z

**Who this is for:** the station **Owner** - the top role with full control. You
do everything a manager does (review handovers, close off the day, manage stock,
settings, users, audit) and you also have owner-only powers: the **first-time
setup**, **Stations** (run more than one station), **Infrastructure** (tanks,
islands and nozzles), and **approving stock takes**.

**Your menu (top bar):** seven groups - **Dashboard**, **My Shift**,
**Operations**, **Inventory & Sales**, **Reconciliation**, **Reports**,
**Administration** - plus a **station selector** (if you have more than one
station), a **bell** (alerts), a **light/dark** toggle, and **Logout**.

> Money is shown in ZMW (K). Tip: the **date** you pick on the dashboard is
> remembered as you move between pages.

---

## 1. First-time setup (first login only)

The very first time you log in, the system runs a short **setup wizard**. You
cannot use the rest of the app until it is finished. It has eight steps; click
**Next** to move forward and **Back** to revise.

1. **Welcome** - a short overview. Click **Next**.
2. **Your Profile** - enter your **Full Name**; optionally set a **new password**
   (leave blank to keep the current one). Click **Next**. *What to expect:* your
   account name/password is saved.
3. **Business Info** - enter the **Business/Station Name** (required), and
   optional **Location**, **Contact Email**, **Contact Phone**. *What to expect:*
   the station record and system settings are saved.
4. **Tanks** - set up your fuel storage. Two tanks are pre-filled (one Diesel,
   one Petrol, 20,000 L each). For each tank set **Tank ID**, **Fuel Type**
   (Diesel/Petrol), and **Capacity (L)**. Use **Add tank** / **Remove** to change
   the list (at least one tank; IDs must be unique).
5. **Pricing & Tax** - enter the **Diesel price/L**, **Petrol price/L**, **VAT
   rate (%)**, and **Fuel levy (ZMW/L)**.
6. **Operational Settings** - thresholds and tolerances:
   - **Allowable losses**: diesel %, petrol %, nozzle loss (L).
   - **Validation thresholds**: pass %, warning %.
   - **Stock alerts**: low-stock %, critical %.
   - **Reconciliation tolerances**: choose a mode (percentage, fixed litres,
     hybrid, or tiered) and set the cash minor / investigation amounts.
   *What to expect:* values are validated (e.g. pass must be below warning) and
   saved.
7. **Staff** - optionally create your first users (attendant, supervisor, or
   manager): **Full Name**, **Username**, **Password** (min 6 characters). You
   can add more later under Admin > Users.
8. **All Set** - a success screen. Click **Go to Dashboard**. *What to expect:*
   setup is marked complete; from now on you log straight in to the dashboard.

---

## 2. Logging in (after setup)

1. Open the station web address.
2. Enter your **email** and **password**.
3. Click **Sign in**.

**What to expect:** you land on the **Dashboard**, which includes the **Today's
Flow** card (your daily checklist). If you manage more than one station, a
**station selector** appears in the top bar.

---

## 3. Switching stations (if you run more than one)

1. In the top bar, open the **station selector** dropdown.
2. Choose a station.

**What to expect:** the app reloads showing that station's data. Everything you
do (shifts, stock, reports, settings) applies to the **currently selected**
station. You can also manage stations in detail under **Admin > Stations**
(Section 9).

---

## 4. Your home: "Today's Flow"

The dashboard's **Today's Flow** card is your daily hub. It shows the day's chain
as four steps, each with a status dot and a button:

- **Shift set up** - an active shift with attendants assigned.
- **Tank dips recorded** - opening/closing dips entered.
- **Handovers reviewed** - how many attendant handovers are pending vs approved.
- **Day closed** - whether the day has been closed off.

**What each part does:** the **button on each row** opens the page for that step;
the **date picker** sets the working day. Click the **NextStop logo** anytime to
return here.

---

## 5. Running the day - Operations

Open the **Operations** menu.

### Shifts
1. Click **Operations > Shifts**.
**What you can do:** create a shift (pick date and Day/Night), assign attendants
to islands/nozzles, and set who the shift supervisor is. **What to expect:** the
shift validates (every attendant needs at least one nozzle; no nozzle assigned
twice) and becomes the active shift attendants work against.

### Handover Review
1. Click **Operations > Handover Review** (this is also "Handovers" on Today's Flow).
**What you can do:** review each attendant's end-of-shift handover.
- **Click a row** to expand full detail (nozzle readings, sales, credit, deposits).
- **Approve** a clean handover - it is approved and stock applied.
- **Approve** a flagged handover - a box opens that **requires a written note**
  (reason chips help); click **Confirm Approve**.
- **Return** a handover - a box opens **requiring a reason**; the attendant is
  notified to fix and resubmit.
- Tick several clean handovers and use **Approve Selected (N)**.
**What to expect:** when all are reviewed, a **Next: Daily Close-Off** button appears.

### Daily Tank Reading / Fuel Operations / LPG Daily / Lubricants Daily
- **Daily Tank Reading** - record per-tank dips, nozzle readings and deliveries.
- **Fuel Operations** - record fuel deliveries and tank movements.
- **LPG Daily Operations** - LPG cylinder sales, trades and damages.
- **Lubricants Daily** - lubricant and accessory sales.
These are normally done by supervisors/attendants; as owner you can view or enter
them. Each saves the day's figures used in reconciliation.

---

## 6. Closing off the day - Administration > Daily Close-Off

1. Click **Admin > Daily Close-Off** (or **Next: Daily Close-Off** after review).
**What you see:** the date and status (Open / Pending Reviews / Closed), the
**Approved Shifts** table, and the **Daily P&L Snapshot**.
2. If any handover is unapproved, a warning links you back to Handover Review;
   the close button stays disabled until all are approved.
3. Enter the **bank deposit**: amount (required), reference (optional), notes
   (optional). A live line shows deposit vs actual cash (over / short / exact).
4. Click **Close Day & Lock Handovers**, then confirm.
**What to expect:** the day is **locked** and cannot be undone; it shows who
closed it and the deposit variance. **Close-Off History** lets you review past days.

---

## 7. Managing stock - Inventory & Sales

Open the **Inventory & Sales** menu.

### Stores / Stock
1. Click **Inventory & Sales > Stores / Stock**.
**What you see:** summary cards, a re-order alert for low items, and a table of
items with Stores and Forecourt quantities.
2. Click **Manage stock** on an item. A window opens with an action selector:
   **Receive** (into Stores), **Issue** (to Forecourt), **Damage** (write off,
   needs a reason), **Adjust** (set the counted quantity, needs a reason). Enter
   the quantity, add a reason where required, then **Confirm**.
3. **+ Add / Edit Item** adds or edits a product. **Show recent movements** shows
   the stock ledger.

### Stock Takes (you approve these)
1. Click **Inventory & Sales > Stock Takes**.
**The flow:** a manager starts a count, enters quantities, and **Submits** it - it
then shows a **Submitted** badge.
2. Open a **Submitted** stock take. **What to expect:** the counts are read-only
   and a **Variance** column shows the net difference. As owner you see an
   **Approve** button.
3. Click **Approve**. **What to expect:** the status changes to **Approved**, the
   record is locked, and the approval is recorded in the Audit Log.

### Tank Levels / Sales / Credit Accounts
- **Tank Levels** - current fuel volumes (view).
- **Sales** - sales figures and trends (view).
- **Credit Accounts** - manage credit customers and their limits.

---

## 8. Reviewing the numbers - Reconciliation and Reports

**Reconciliation** menu (read-only):
- **Three-Way Reconciliation** - physical vs meter vs accounting.
- **Tank Analysis** - tank movement and possible loss/variance.
- **Shift Reconciliation** - per-shift detail.

**Reports** menu (read-only; most export):
- **Sales Reports**, **Tank Readings & Monitor**, **Advanced Reports** (staff /
  nozzle / island / product / custom), **Anomaly Alerts**, **Notifications**.

**What to expect:** choose a date range or filter where offered, then view or
export. These never change data.

---

## 9. Administration

Open the **Admin** menu. As owner you have the full set, including two owner-only
pages: **Stations** and **Infrastructure**.

### Settings
1. Click **Admin > Settings**.
**What you can do:** fuel prices (immediate or **scheduled** for a future time),
tax/levy rates, validation thresholds (e.g. cash-shortage tolerance,
meter-deviation percentage), and reconciliation tolerances. Changes are recorded
in the Audit Log.

### Users
1. Click **Admin > Users**.
**What you can do:** create, edit, or deactivate users and set their role
(attendant, supervisor, manager).

### Audit Log
1. Click **Admin > Audit Log**.
**What to expect:** a searchable record of every change (prices, approvals,
returns, settings, users, stock-take approvals), filterable by action, type, user
and date.

### Stations (owner only)
1. Click **Admin > Stations**.
**What you can do:**
- **+ New Station** - enter **Name** (required) and **Location**; leave **Quick
  Setup** ticked to auto-create default islands, tanks, nozzles and accounts.
- **Edit** - change a station's name/location, then **Save**.
- **Switch to Station** - make a station the active one (the app reloads).
- **Disable / Enable** - turn a station off/on (you cannot disable the last
  active station).
- **Delete** - only for a disabled, non-current station; you must **type the
  station name** to confirm. This permanently removes its shifts, readings, sales
  and settings. You cannot delete the last station.

### Infrastructure (owner only)
1. Click **Admin > Infrastructure**.
It has two tabs.

**Tanks tab:**
- **+ Create New Tank** - set **Tank ID**, **Fuel Type**, **Capacity (L)**, and an
  optional **Initial level**. Click create.
- **Edit Capacity** - change a tank's capacity (must be at least the current
  level), then **Save**.
- **Set Level** - enter the current level (0 to capacity) and click **Set Level**.
- **Delete Tank** - removes the tank (with confirmation).
Each tank card shows level, capacity, a colour-coded fill bar, and a low-fuel
warning under 30%.

**Islands & Pumps tab:**
- **Rename** - rename an island, then Save (or press Enter).
- **Configure nozzles** - use a preset: **All Diesel**, **All Petrol**, or
  **Mixed** (one of each). If you have more than one tank of a fuel, pick the
  tank. For full control click **Advanced** and choose **Custom** to assign each
  nozzle to a specific tank. Click **Apply configuration**.
- **Activate / Deactivate** - only active islands appear in operations.
- **Delete Island** - removes the island and its nozzles (with confirmation).

---

## 10. Logging out

Click **Logout** (top-right). You return to the login screen.

---

## Quick reference - the owner's tasks

- **First login:** complete the **setup wizard** (profile, business, tanks,
  pricing/tax, settings, staff), then **Go to Dashboard**.
- **Daily:** **Operations > Handover Review** (approve/return), then **Admin >
  Daily Close-Off** (enter bank deposit, **Close Day & Lock**).
- **Stock:** **Inventory & Sales > Stores / Stock**; **approve Stock Takes** that
  managers submit.
- **Setup/config:** **Admin > Stations** (add/switch/disable/delete stations) and
  **Admin > Infrastructure** (tanks, islands, nozzles).
- **Oversight:** **Reconciliation**, **Reports**, **Admin > Audit Log**.
- **People & rules:** **Admin > Users** and **Admin > Settings**.

**Rules to remember**
- You **cannot close the day** until **all handovers are approved**; closing is
  **final**.
- **Flagged approvals** and **returns** require a **written note** (kept in the
  audit trail).
- A **stock take** is submitted by a manager and **approved by you**.
- **Disabling/deleting a station** is guarded: you cannot remove the last station,
  and deletion requires typing the station name.
- Everything you do applies to the **currently selected station**.
