# Operator (Attendant) Manual — A to Z

**Who this is for:** the forecourt **operator/attendant** (system role: `user`).
**What you do in the system:** two things — **Start your shift** (take over and
verify what you are inheriting) and **End your shift** (record your closing
figures and hand everything to the Supervisor/Manager). You also record **safe
deposits** during the shift.

Your whole app is one menu: **Today's Shift**, with **Start Shift** and **End
Shift**. You do not need anything else.

> Throughout: "tap" and "click" mean the same thing. Numbers like meter readings
> use the pump's own units; money is in ZMW (K).

---

## 1. Logging in

1. Open the station web address in your browser.
2. You will see the **login screen**. Enter your **username** and **password**.
3. Tap **Sign in**.

**What to expect:** you go straight to your shift screen (**Today's Shift**).
Operators do not see a dashboard — your work screen opens directly.

If your username or password is wrong, you will see an error message and stay on
the login screen. Ask your supervisor to reset your password if needed.

---

## 2. The menu (top bar)

After login the top bar shows:

- **Today's Shift** (a menu) — tap it to see **Start Shift** and **End Shift**.
- **Bell icon** — alerts (for example a reminder if a safe deposit is overdue).
- **Dark/light toggle** — changes the screen theme. Optional.
- **Logout** — signs you out.

That is everything. There are no other pages for an operator.

---

## 3. Start Shift (do this at the START of your shift)

**Purpose:** verify the readings and stock you are taking over from the previous
operator, and formally open your shift.

> **This step is required.** You cannot end a shift or submit any readings until
> you have confirmed your opening. If you skip it and tap End Shift, you will
> see a "Start your shift first" message with a **Go to Start Shift** button.

1. Tap **Today's Shift → Start Shift**.

**What to expect — the "Start of shift — verify your opening" screen:**

- A blue banner explaining that these figures carry over from the previous
  shift's close (or from the supervisor's setup for the very first shift of
  the day).
- **Opening meter readings** — a table of your nozzles. Each nozzle shows its
  **Electronic opening** and **Mechanical opening** already filled in. These are
  the previous operator's closing readings; they are your starting point.
- **Opening stock** — the cylinders, accessories and lubricants you are taking
  over, with their quantities.
- A **Discrepancy note** box (optional but important if anything does not match).

2. **Physically walk the forecourt and check every figure:**
   - Go to each pump and compare the actual meter reading to the "Electronic
     opening" on screen.
   - Count the cylinders and stock items you are inheriting.

3. **If everything matches:** you do not need to write anything in the note box.

   **If something does NOT match** — for example a pump reads 12,350 but the
   screen shows 12,345, or a cylinder count is wrong — **type exactly what you
   found** in the **Discrepancy note** box. This is your protection: you will
   not be held responsible for a shortage that already existed when you started.

4. Tap **Confirm opening & begin shift**.

**What to expect after confirming:**

- A brief "Confirming..." then the screen changes to the closing/readings view.
- Your shift is now **Started** — your supervisor can see you have begun.
- The End Shift option is now unlocked.

> **Note:** Confirming is an acknowledgement, not an edit. You confirm the
> inherited figures or flag a mismatch; you do not change the opening numbers
> yourself. Any corrections to inherited readings are handled by your supervisor.

---

## 4. During the shift — recording Safe Deposits

Whenever you drop cash into the safe during your shift, record it immediately.
The deposit section is on your shift screen.

1. The **Time** field pre-fills with the current time — adjust it if you are
   recording a deposit made earlier.
2. Enter the **Amount (K)**.
3. Optionally add a short **Note** (for example "fleet fill-up" or "card
   top-up collection").
4. Tap **Deposit**.

**What to expect:**

- The deposit appears in the list below with its time and amount.
- The running **total** of all your deposits updates.
- If you have not made a deposit in over an hour, an **overdue** warning appears
  on screen (and the bell icon highlights it). This is a reminder to drop the
  accumulated cash into the safe and record it.

You can add as many deposits as you make throughout the shift.

---

## 5. End Shift — Step 1: Enter readings and stock

**Purpose:** record your closing meter readings and stock counts at the end of
the shift.

1. Tap **Today's Shift → End Shift**.

**What to expect:** the **"Step 1: Enter readings"** screen opens. At the top
is a checklist titled **"Still needed before you can submit"** — it lists
exactly what is outstanding and shrinks as you complete each item. The submit
button stays inactive until this list is empty.

---

### 5a. Nozzle (pump) readings

- The **opening reading** for each nozzle is already shown (from when you
  confirmed your shift start).
- For each nozzle, enter the **closing reading** using **double-entry** to
  prevent mistakes:

  1. Tap **Enter** on the nozzle's **Electronic closing** field.
  2. A box opens — **"Entry 1 of 2"**. Type the meter reading, tap **Next**.
  3. **"Entry 2 of 2"** — type the **same** reading again (the first entry is
     hidden so you cannot copy it). Tap **Confirm**.
  4. **If both entries match:** a tick appears and the reading is saved.
     **If they do not match:** you are told they differ and asked to start
     again. Re-read the pump and re-enter.

- Repeat the same double-entry process for the **Mechanical closing** reading.

**Meter deviation flag:** if the electronic and mechanical readings differ by
more than the allowed tolerance, or if the system detects a possible fuel
loss, a red alert appears on that nozzle. A **note box** appears — **you must
type an explanation** (for example "meter drift noted", "small spillage at
morning refill"). This note is required before you can proceed.

---

### 5b. LPG cylinders (tap the section header to expand)

For each cylinder size you handle:

- Enter **Sold (refill)** — refills done during the shift.
- Enter **Sold (new cylinder)** — new cylinders sold.
- Enter **Damaged** — any cylinders damaged or written off.
- Enter the **closing count on hand** (physical count right now).

If the closing count does not reconcile with opening + received - sold -
damaged, a **variance note** box appears. You must explain the difference
before submitting.

**Trades** (upgrade or downgrade): tap **Add trade**, choose the from-size and
to-size and the quantity.

If you sold no LPG at all during this shift: tap **Confirm No Sales This
Shift** to mark the entire section complete in one tap.

---

### 5c. Accessories and Lubricants (tap each section header to expand)

The same pattern as LPG:

- Enter **Sold**, **Damaged**, and the **closing count on hand**.
- If the count does not reconcile, a **variance note** box appears — explain
  the difference (required).
- If nothing was sold: tap **Confirm No Sales This Shift**.

Lubricants has a **search box** at the top — type a product name to find it
quickly when the list is long.

---

### 5d. Credit sales (only if your station uses credit accounts)

- Tap **Add credit sale**.
- Pick the **account**, the **fuel type**, and enter the **volume (L)** — the
  cash equivalent calculates automatically.
- Add as many lines as needed.

---

### 5e. Finishing Step 1

Watch the **"Still needed"** checklist at the top. When every item is ticked
and the list is empty, the button at the bottom activates.

If the button stays greyed out, it will tell you what is still missing — for
example "Explain all deviations to continue" or "Enter closing reading for
ISL2-A". Fix those items first.

When everything is done, tap **Review my entries**.

---

## 6. End Shift — Step 2: Review and submit

1. After tapping **Review my entries**, you see **"Step 2: Review and submit"**
   — a **read-only summary** of everything you entered: all meter readings,
   volumes, stock counts, and credits.
2. Read through it carefully. If anything looks wrong, tap **Back to edit**
   to return to Step 1 and correct it.
3. Tap **Submit Readings**.
4. A **confirmation box** appears. If any items are flagged (for example a meter
   deviation or a stock variance), the box will list them. Tap **Submit
   Readings** again to confirm.

**What to expect:**

- A green **"Readings Verified"** confirmation. Your readings and stock figures
  are now sent to the **Supervisor/Manager** for review.
- Two buttons appear: **Next: Close Shift** and **Redo Readings**.

> **Redo Readings:** if you realise you made an error after submitting, tap
> this to go back and correct before the supervisor has reviewed your handover.
> Once the supervisor approves, you cannot change anything.

---

## 7. Close Shift — cash reconciliation (the office step)

1. Tap **Next: Close Shift**.

**What to expect:** a summary of the **expected** cash amounts (calculated from
your meter readings and stock sales) alongside your **safe-deposit total**, plus
fields to enter:

- **Actual cash (safe + hand)** — count everything in the safe and in your
  hand right now; enter the total. **Required.**
- **POS receipts total** — if you had card/POS payments, enter the total here.
  Optional.
- **Notes** — optional, for anything the supervisor should know.

2. As you type the actual cash figure, the screen shows a live comparison:
   **Total accounted vs Expected** — it shows whether you are **over**, **short**,
   or **exact**, and by how much.

3. Tap **Submit Shift Closing**.

**What to expect:** a closing summary showing the amounts and any flags (for
example if you are short by more than the tolerance). Your shift is now fully
handed over — the supervisor/manager takes it from here.

---

## 8. If your handover is sent back ("Returned")

If the supervisor or manager finds an issue and returns your handover:

- On your shift screen a **"Handover returned by supervisor"** banner appears
  with **their note** explaining exactly what needs to be fixed.
- Tap **Redo Readings**, make the correction, and go through Steps 5–7 again.

You can only resubmit while the handover is in "Returned" status. Once
approved, the handover is locked.

---

## 9. Logging out

Tap **Logout** in the top bar. You return to the login screen.

Always log out at the end of your shift, especially on shared devices.

---

## Quick reference — the operator's shift

1. **Log in** → land on your shift screen.
2. **Today's Shift → Start Shift** → physically verify opening readings and
   stock → write a discrepancy note if needed → **Confirm opening and begin
   shift**.
3. **Sell** through the shift; **record each safe deposit** as you bank cash.
4. **Today's Shift → End Shift → Step 1**: enter closing readings (double-entry
   for each nozzle) + LPG/accessories/lubricants + credit sales. Clear the
   "Still needed" checklist → **Review my entries**.
5. **Step 2**: read the summary → **Submit Readings** (sent to supervisor).
6. **Next: Close Shift** → count your cash → enter actual cash → **Submit
   Shift Closing**.
7. If **returned** by the supervisor, fix the flagged item and resubmit.

---

## Rules to remember

- You **must confirm your opening** (Start Shift) before you can submit any
  closing readings.
- Closing readings are entered **twice** (double-entry) — the second entry
  must match the first exactly.
- Wherever a count or meter **does not match**, you **must add a note** before
  you can submit.
- If something is already wrong when you arrive, **write it in the discrepancy
  note at Start Shift** — this protects you.
- Everything you submit goes to your **Supervisor/Manager** to review and
  approve. Until they approve it, you can redo it if needed.
