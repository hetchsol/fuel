# Operator (Attendant) Manual — A to Z

**Who this is for:** the forecourt **operator/attendant** (system role: `user`).
**What you do in the system:** two things — **Start your shift** (take over and
verify what you're inheriting) and **End your shift** (record your closing
figures and hand everything to the Supervisor/Manager). You also record **safe
deposits** during the shift.

Your whole app is one menu: **Today's Shift**, with **Start Shift** and **End
Shift**. You don't need anything else.

> Throughout: "tap" and "click" mean the same thing. Numbers like meter readings
> use the pump's units; money is in ZMW (K).

---

## 1. Logging in

1. Open the station web address in your browser.
2. You'll see the **login screen**. Enter your **email** and **password**.
3. Tap **Sign in**.

**What to expect:** you go straight to your shift screen (**Today's Shift**).
Operators do not see a dashboard — your work screen opens directly.

If your email/password is wrong, you'll see an error message and stay on the
login screen.

---

## 2. The menu (top bar)

After login the top bar shows:
- **Today's Shift** (a menu) — tap it to see **Start Shift** and **End Shift**.
- **Bell icon** — alerts (e.g. a reminder if a safe deposit is overdue).
- **Dark/light toggle** — changes the screen theme. Optional.
- **Logout** — signs you out.

That's everything. There are no other pages for an operator.

---

## 3. Start Shift (do this at the START of your shift)

**Purpose:** check the readings and stock you are taking over from the previous
operator, and formally start your shift. **You cannot end a shift until you have
started it.**

1. Tap **Today's Shift → Start Shift** (or, on a fresh shift, you land here
   automatically after login).

**What to expect — the "Start of shift — verify your opening" screen:**
- A blue banner explaining that these figures carry over from the previous
  shift's close.
- **Opening meter readings** — a table of your nozzles with the **electronic**
  and **mechanical** opening readings already filled in. (These are the previous
  operator's closing readings.)
- **Opening stock** — the cylinders, accessories and lubricants you're taking
  over, with their quantities.
- A **Discrepancy note** box (optional).

2. **Physically check** the figures against the real pumps and the real stock:
   - Walk to each pump and confirm the meter matches the "electronic opening".
   - Count the cylinders/stock you're taking over.
3. **If everything matches:** leave the note empty.
   **If something does NOT match** (e.g. a pump reads 12,350 but the screen says
   12,345, or a cylinder is missing): type what's wrong in the **Discrepancy
   note** box. This protects you — you won't be blamed later for a shortage that
   was already there.
4. Tap **Confirm opening & begin shift**.

**What to expect after confirming:**
- A brief "Confirming..." and then the screen changes to the **End Shift /
  closing** view.
- Your shift is now **Started** — your supervisor can see you've begun.
- You can now record and submit your closing later. (Before this, ending is
  blocked — see the box below.)

> **Note:** "Confirm" is an acknowledgement, not an edit. You confirm the
> inherited figures or flag a mismatch; you don't change the opening numbers
> yourself. Corrections are handled by your supervisor.

> **Gate:** if you try **End Shift** before doing this, you'll see **"Start your
> shift first"** with a **Go to Start Shift** button. Tap it, complete the steps
> above, and then you can end the shift.

---

## 4. During the shift — recording Safe Deposits

Whenever you drop cash into the safe, record it. The deposit section is on your
shift screen.

1. Enter the **Time** (it pre-fills with the current time — adjust if needed).
2. Enter the **Amount** (K).
3. Optionally add a short **Note** (e.g. "fleet fill-up").
4. Tap **Deposit**.

**What to expect:**
- The deposit appears in the list below, and the running **total** updates.
- If you haven't deposited in over an hour, an **overdue** warning appears
  (and the bell flags it) — deposit the accumulated cash into the safe.

You can add as many deposits as you make through the shift.

---

## 5. End Shift — Step 1: Enter readings & stock

**Purpose:** record your closing readings and stock at the end of the shift.

1. Tap **Today's Shift → End Shift**.

**What to expect:** the **"Step 1: Enter readings"** screen, with a checklist at
the top titled **"Still needed before you can submit"** that lists exactly what's
left (it shrinks as you complete each item).

### 5a. Nozzle (pump) readings
- The **opening** reading for each nozzle is already filled in.
- For each nozzle, record the **closing** reading using **double-entry** (you
  type it twice to prevent mistakes):
  1. Tap **Enter** on the nozzle's **Electronic closing**.
  2. A box opens — **"Entry 1 of 2"**. Type the closing reading, tap **Next**.
  3. **"Entry 2 of 2"** — type the **same** reading again (the first is hidden),
     tap **Confirm**.
  4. **If they match:** a tick/checkmark appears and the reading is saved.
     **If they don't match:** you'll be told and asked to enter it again.
- Repeat for the **Mechanical closing** the same way.
- **If a meter deviation is flagged** (electronic vs mechanical differs too much,
  or there's a fuel loss): a note box appears in red. **Type an explanation** —
  it's required before you can submit (e.g. "meter drift", "spillage").

### 5b. LPG cylinders (tap the section to expand)
For each cylinder size:
- Enter **Sold (refill)** and **Sold (new cylinder)**, **Damaged**, and the
  **closing count** on hand.
- If your closing count doesn't match what's expected, a **variance note** box
  appears — explain it (required).
- **Trades** (upgrade/downgrade): tap **Add trade**, pick from-size, to-size and
  quantity.
- If you sold none all shift: tap **Confirm No Sales This Shift** to fill the
  section in one tap.

### 5c. Accessories and Lubricants (tap each section to expand)
- Same pattern: enter **Sold**, **Damaged**, **closing count**; add a
  **variance note** if it doesn't reconcile; or tap **Confirm No Sales**.
- Lubricants has a **search box** — type a product name to find it quickly.

### 5d. Credit sales (only if your station uses them)
- Add a line per credit customer: account, fuel, volume — the amount calculates.

### 5e. Finishing Step 1
- Watch the **"Still needed"** checklist empty out. When nothing is outstanding,
  the button at the bottom becomes active: tap **Review my entries**.
- If the button is greyed out, it tells you what's still missing (e.g. "Explain
  all deviations to continue").

---

## 6. End Shift — Step 2: Review & submit

1. After **Review my entries**, you see **"Step 2: Review & submit"** — a
   **read-only** summary of everything you entered (readings, volumes, stock).
2. Check it. If something's wrong, tap **Back to edit** to return to Step 1.
3. Tap **Submit Readings**.
4. A **confirmation box** appears (it warns you if anything is flagged). Tap
   **Submit Readings** again to confirm.

**What to expect:**
- A green **"Readings Verified"** message. Your readings and stock are now sent
  to the **Supervisor/Manager** for review.
- Two buttons appear: **Next: Close Shift** and **Redo Readings**.

---

## 7. Close Shift — cash reconciliation (the office step)

1. Tap **Next: Close Shift**.

**What to expect:** a summary of the **expected** amounts (from your readings)
and your **safe-deposit total**, plus fields to enter:
- **Actual cash (safe + hand)** — required.
- **POS receipts total** — optional.
- **Credit sales** — optional line items.
- **Notes** — optional.

2. As you type the actual cash, the screen shows **Total accounted vs Expected**
   and whether you're **over** or **short**.
3. Tap **Submit Shift Closing**.

**What to expect:** a closing summary with the amounts and any flags. Your shift
is now fully handed over for the supervisor to process.

---

## 8. If your handover is sent back ("Returned")

If a supervisor returns your handover for a correction:
- On your shift screen you'll see a **"Handover returned by supervisor"** banner
  with **their note** explaining what to fix.
- Tap **Redo Readings**, correct the issue, and submit again (Steps 5–7).

---

## 9. Logging out

Tap **Logout** in the top bar. You'll return to the login screen.

---

## Quick reference — the operator's day

1. **Log in** → land on your shift.
2. **Start Shift** → check opening readings + stock → **Confirm opening & begin
   shift**.
3. **Sell** through the shift; **record safe deposits** as you bank cash.
4. **End Shift → Step 1**: enter closing readings (double-entry) + stock; clear
   the checklist → **Review my entries**.
5. **Step 2**: review → **Submit Readings** (goes to the supervisor).
6. **Next: Close Shift** → enter cash → **Submit Shift Closing**.
7. If **returned**, fix and resubmit.

**Rules to remember**
- You must **Start** a shift before you can **End** it.
- Closing readings are typed **twice** (double-entry).
- Wherever a count or meter **doesn't match**, you must **add a note**.
- Everything you submit goes to your **Supervisor/Manager** to process.
