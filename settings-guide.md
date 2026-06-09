# Settings Guide

## System Information
*(Owner only)*

| Field | What it does |
|---|---|
| Business Name | The station's trading name, shown on reports and documents |
| License Key | The software activation key for this installation |
| Contact Email / Phone | The station's contact details, used in system-generated communications |
| Station Location | Free-text address or description of the site |
| License Expiry Date | The date when the software licence runs out |
| Software Version | Read-only — shows the installed version number |

---

## Fuel Settings

### Fuel Pricing
| Field | What it does |
|---|---|
| Diesel Price per Liter | Current selling price in ZMW — used to calculate expected cash from nozzle readings |
| Petrol Price per Liter | Current selling price in ZMW — used to calculate expected cash from nozzle readings |

### Scheduled Price Changes
Pre-schedule a price change for a future date and time. The new price activates automatically at the specified time. Useful for month-end ZERA price adjustments. Pending changes can be cancelled; applied ones are shown in history.

### Allowable Losses During Offloading
How much fuel (as a %) can be lost to evaporation or spillage during a tanker delivery before the system flags it. Defaults: 0.3% for diesel, 0.5% for petrol.

### Nozzle Loss Threshold
How many litres per nozzle can be unaccounted for during a shift before the system flags it in the handover. Default: 0.8 L.

### Cash Shortage Threshold
If a shift's cash is over or short by more than this amount (default K500), the handover is flagged for manager review.

---

## Tax & Levy

| Field | What it does |
|---|---|
| VAT Rate (%) | VAT percentage applied to fuel deliveries (currently 16%) |
| Fuel Levy per Liter | Statutory fuel levy in ZMW deducted per litre before VAT is calculated |

Used in the Daily Tank Readings delivery VAT calculation:

```
VAT = Volume x ((Price - Levy) / (1 + VAT Rate)) x VAT Rate
```

---

## Validation Thresholds

Controls the PASS / WARNING / FAIL status when comparing tank dip readings against nozzle meter readings.

| Field | What it does |
|---|---|
| PASS Threshold (%) | Variance within this percentage = green PASS |
| WARNING Threshold (%) | Variance above PASS but within this = yellow WARNING; above this = red FAIL |
| Meter Discrepancy Threshold (%) | If the electronic meter reading differs from the mechanical reading by more than this %, the attendant must write a note explaining the difference when submitting their shift |

---

## Stock Alerts

| Field | What it does |
|---|---|
| Low Stock Threshold (%) | Tank below this % of capacity = yellow warning |
| Critical Stock Threshold (%) | Tank below this % of capacity = red critical alert (must be lower than low stock) |

---

## Reconciliation

Sets how the system classifies a fuel variance at end-of-shift.

### Volume Tolerance Mode

| Mode | How it works |
|---|---|
| Percentage | Tolerance scales with volume — 0.5% of a 20,000 L shift allows 100 L variance |
| Fixed Litres | Same absolute litre limit regardless of volume handled |
| Hybrid | Percentage-based but capped at a maximum number of litres — prevents large volumes hiding big losses behind a small percentage |
| Tiered | Different litre tolerances for different volume brackets |

### Reconciliation Levels

| Level | Meaning |
|---|---|
| BALANCED (green) | Variance within acceptable tolerance |
| INVESTIGATION (yellow) | Above acceptable but within investigation threshold — requires review |
| CRITICAL (red) | Above investigation threshold — significant mismatch, immediate action needed |

### Cash Tolerances
Separate acceptable/investigation thresholds applied to the cash difference, always in flat ZMW regardless of which volume tolerance mode is active.

---

## Email Notifications
*(Owner only)*

| Field | What it does |
|---|---|
| Enable Email Notifications | Toggle to turn email alerts on or off |
| From Address | Sender name and email address (must be verified in the Resend account on the server) |
| Recipients | List of email addresses that receive all system notifications |
| Send Test | Sends a test email to all listed recipients to confirm the setup is working |

Email delivery failures never block normal system operations.

---

## Tank Calibration
*(Owner only)*

| Action | What it does |
|---|---|
| Select Tank | Choose which tank to view or update |
| Download Template | Downloads a blank Excel template (two columns: dip in mm, volume in litres) |
| Upload Excel | Upload a manufacturer's strapping table for the selected tank — the system uses this to convert a raw dip measurement (mm) to a volume (litres) in all tank readings and daily stock calculations |
| Clear Calibration | Removes the uploaded table and reverts to the system default linear estimate |

Once a tank is selected, the current calibration table is shown as a scrollable list of dip/volume pairs.
