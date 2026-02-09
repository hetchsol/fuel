# Fuel Management System - User Manual

**Role:** User (Attendant)
**Version:** 1.0
**Last Updated:** December 2025

---

## Table of Contents

1. Introduction
2. Getting Started
3. Login Process
4. Navigation Overview
5. Dashboard
6. Nozzles Management
7. Submitting Readings
8. Shift Management
9. Logout Process
10. Troubleshooting

---

## 1. Introduction

Welcome to the Fuel Management System! As a **User (Attendant)**, you are responsible for recording fuel meter readings and monitoring pump operations.

### Your Responsibilities
- Record opening and closing nozzle readings at shift changes
- Submit dual meter readings (Electronic + Mechanical)
- Monitor nozzle status and operations
- View real-time fuel tank levels
- Report any discrepancies to supervisors

### System Access
As a User, you have access to:
- **Dashboard** (View Only)
- **Nozzles** (View Only)
- **Readings** (Submit)
- **Shifts** (View)

You **DO NOT** have access to:
- Reconciliation, Accounts, Inventory, Sales, Reports, Stock Movement, Settings

---

## 2. Getting Started

### System Requirements
- Modern web browser (Chrome, Firefox, Safari, or Edge)
- Stable internet connection
- Minimum screen resolution: 1024x768

### Understanding the Interface
- **Top Navigation Bar**: Access all available pages
- **User Info**: Your name and role displayed in top-right corner
- **Logout Button**: Red button in top-right corner

---

## 3. Login Process

### Accessing the Login Page
1. Open your web browser
2. Navigate to the Fuel Management System URL
3. You will see:
   - System logo: "⛽ Fuel Management"
   - Username field
   - Password field
   - Sign In button
   - Demo account buttons (for testing)

### Entering Your Credentials

**Username Field:**
- Click on the "Username" input box
- Type your assigned username (e.g., "user1")
- Username is case-sensitive

**Password Field:**
- Click on the "Password" input box
- Type your assigned password
- Password is hidden for security

### Demo Login (For Testing)
- Click the green button: "👤 User: user1 / password123"
- This automatically fills in the fields
- Click "Sign In" to proceed

### Completing Login
1. Click the blue "Sign In" button
2. If correct, you'll be redirected to the Dashboard
3. If login fails, you'll see an error message in red

**Common Login Errors:**
- "Login failed" - Wrong username or password
- Check CAPS LOCK is off
- Ensure no extra spaces
- Contact supervisor if you've forgotten credentials

---

## 4. Navigation Overview

### Top Navigation Bar
After logging in, you'll see menu items:

1. **⛽ Fuel Management** (Logo) - Return to Dashboard
2. **Dashboard** - Overview and tank levels
3. **Nozzles** - View pump islands and nozzles
4. **Readings** - Submit dual meter readings
5. **Shifts** - View shift information

### User Information Display
Top-right corner shows:
- Your full name
- Role badge: "👤 User"
- Red "Logout" button

### Active Page Indicator
- Current page highlighted with blue underline
- Inactive pages appear in gray text

### Mobile Navigation
On mobile devices:
- Navigation appears as hamburger menu
- Tap to expand all options
- User info at bottom

---

## 5. Dashboard

The Dashboard is your home screen showing real-time fuel operations.

### Page Header
- **Title**: "Dashboard"
- **Description**: "Overview of daily operations and alerts"

### Date Selector
**Purpose**: View data for specific dates

**How to Use**:
1. Click on the date input field
2. Calendar picker appears
3. Select desired date
4. Dashboard updates automatically

**Field Details**:
- **Label**: "Select Date"
- **Default**: Today's date
- **Format**: YYYY-MM-DD

### Real-Time Fuel Tank Levels

#### Diesel Tank Card (Orange)

**Visual Design**:
- Orange gradient background
- Orange border
- 🛢️ Oil barrel icon
- "Real-time" badge (updates every 5 seconds)

**Information Displayed**:

1. **Current Level**: Large number showing liters (e.g., "25,000 L")
2. **Progress Bar**: Visual bar showing fill percentage
   - **Green**: Above 50% full
   - **Yellow**: 25-50% full
   - **Red**: Below 25% full (WARNING!)
3. **Capacity Information**:
   - Total capacity in liters
   - Available space remaining
   - Last updated timestamp

**Example Display**:
```
🛢️ Diesel Tank                     [Real-time]

Current Level: 25,000 L
[============================50%====              ]
0 L                     50% Full                 50,000 L
Capacity: 50,000 L | Available: 25,000 L
Last updated: 2:30:45 PM
```

#### Petrol Tank Card (Blue)

**Visual Design**:
- Blue gradient background
- Blue border
- ⛽ Gas pump icon
- "Real-time" badge

**Information**: Same structure as Diesel Tank with blue color scheme

**Auto-Refresh Feature**:
- Both tank levels update every 5 seconds automatically
- No manual refresh needed

### Dip Readings Section (VIEW ONLY)

**Important**: As a User, you can **VIEW** dip readings but **CANNOT** edit them. Only Supervisors and Owners can save dip readings.

If dip readings exist, you'll see:
- **Opening Dip**: In centimeters
- **Closing Dip**: In centimeters
- **Converted Volume**: In liters
- **Last Updated**: Time and person who updated
- **Badge**: Shows "👔 Supervisor" or "👑 Owner"

### Daily Summary Card

**Information Displayed**:
- **Date**: Selected date
- **Volume Records**: Number of volume entries
- **Cash Variance Records**: Number of discrepancy records
- **Flags**: Number of alerts

### Recent Discrepancies Card

Shows recent alerts that need attention.

Each discrepancy shows:
- **Description**: What the issue is
- **Timestamp**: When it occurred
- **Red background**: Indicates attention needed

**Example**:
```
[RED BOX]
Reading discrepancy: Electronic vs Mechanical mismatch
2025-12-15 14:30:00
```

If no issues: "No discrepancies found" ✓

### Quick Stats Cards

Three stat cards at bottom:

1. **Total Nozzles** (Blue): Count of active nozzles
2. **Today's Sales** (Green): Total transactions
3. **Alerts** (Yellow): Number of flags/discrepancies

---

## 6. Nozzles Management

This page shows all pump islands, stations, and nozzles.

### Page Header
- **Title**: "Pump Islands & Nozzles"
- **Description**: "Overview of all islands, pump stations, and nozzles"

### Station Structure
```
ISLAND
  └── PUMP STATION
       ├── NOZZLE (Diesel)
       └── NOZZLE (Petrol)
```

Each island has ONE pump station with TWO nozzles (1 Diesel + 1 Petrol).

### Island Cards

#### Island Header (Blue)
**Information**:
- **Island Name**: e.g., "🏝️ Island 1"
- **Location**: Physical location if specified
- **Island ID**: Unique identifier in badge

**Example**:
```
[BLUE HEADER]
🏝️ Island 1                      [ISLAND-001]
📍 Front Entrance
```

#### Pump Station Section
Shows:
- Green status indicator dot
- ⚙️ Pump station icon
- **Pump Station Name**: e.g., "Pump Station 1A"
- **Pump Station ID**: Unique identifier

### Nozzle Information Cards

#### Diesel Nozzle (Orange Card)
**Information**:
1. **Nozzle ID**: e.g., "N001"
2. **Fuel Type**: "Diesel"
3. **Status Badge**:
   - **Green "Active"**: Nozzle operational
   - **Yellow "Maintenance"**: Under maintenance
   - **Red "Inactive"**: Not operational

**Example**:
```
[ORANGE CARD]
🛢️  N001
    Diesel              [Active]
```

#### Petrol Nozzle (Blue Card)
Same structure as Diesel with blue color scheme.

### Summary Statistics

Four stat cards show:
1. **Total Islands** (Blue)
2. **Pump Stations** (Green)
3. **Total Nozzles** (Purple)
4. **Active Nozzles** (Orange)

### Information Panel

**Key Points**:
- Each Island contains one Pump Station
- Each Pump Station has 2 Nozzles (1 Diesel + 1 Petrol)
- Nozzles can be Active, Inactive, or Maintenance
- Use Readings page to record meter readings

### Your Role with Nozzles

**Monitor**: Check nozzle status regularly
**Report**: Inform supervisor if status seems incorrect
**Record**: Use Readings page to submit meter readings

**You Cannot**:
- Change nozzle status
- Edit nozzle information
- Add or remove nozzles

---

## 7. Submitting Readings

This is your **PRIMARY RESPONSIBILITY**. Use this page to submit dual meter readings.

### Page Header
- **Title**: "Submit Dual Meter Reading"
- **Description**: "Record Electronic and Mechanical nozzle readings with dual verification"

### Understanding Dual Reading System

**Each nozzle has TWO meters:**

1. **⚡ Electronic Meter** (Primary - GREEN)
   - Digital display with 3 decimal places
   - More precise (e.g., 12345.678 L)
   - You MANUALLY ENTER this

2. **🔧 Mechanical Meter** (Backup - INDIGO)
   - Physical meter with whole numbers
   - Less precise (e.g., 12345 L)
   - System EXTRACTS this via OCR from photo

**Why Two Meters?**
- Electronic is primary for accuracy
- Mechanical provides backup verification
- Comparing both detects meter failures or tampering
- Discrepancies flagged for investigation

### Reading Form - Step by Step

#### STEP 1: Nozzle ID Field

**How to Use**:
1. Click the input box
2. Type nozzle ID (e.g., "N001")
3. ID must match real nozzle

**Example IDs**:
- N001, N002, N003, N004 (Diesel)
- N005, N006, N007, N008 (Petrol)

#### STEP 2: Reading Type Dropdown

**Options**:
1. **Opening** - Start of shift (USE THIS AT SHIFT START)
2. **Closing** - End of shift (USE THIS AT SHIFT END)
3. **PreSale** - Before specific sale
4. **PostSale** - After specific sale

**Most Common**: Opening and Closing

#### STEP 3: Upload Nozzle Image

**Purpose**: Photo of mechanical meter for OCR extraction

**Taking a Good Photo**:
1. Use your phone camera
2. Photo should clearly show mechanical meter numbers
3. Good lighting (avoid shadows)
4. Numbers in focus
5. No glare or reflections
6. Hold steady, photo directly in front

**Uploading**:
1. Click "Choose File" button
2. Select photo from device
3. System uploads automatically
4. Wait for: "🔍 Uploading and extracting numbers..."
5. Success: "✓ Image uploaded and OCR completed"
6. Uploaded image appears below

**Tips**:
- Hold phone steady
- Photo directly in front
- No glare
- All digits clearly visible

#### STEP 4: Mechanical Reading (Auto-Filled by OCR)

**Visual**: Indigo/purple box with 🔧 icon

**This field is READ-ONLY** (you cannot type here)

After image upload:
- Field auto-populates with extracted number
- Shows whole number only (e.g., "12345")
- Displays confidence: "✓ Confidence: 95% | Method: Real OCR"

**Understanding Confidence**:
- **90-100%**: Excellent - Very reliable
- **85-89%**: Good - Generally reliable
- **70-84%**: Fair - Double-check
- **Below 70%**: Poor - Retake photo

**If OCR Fails**:
- Message: "⚠️ OCR extraction failed"
- **Solution**: Retake photo with better lighting/focus

#### STEP 5: Electronic Reading (YOU ENTER THIS)

**Visual**: Green box with ⚡ icon

**THIS IS YOUR MAIN INPUT:**

1. Look at nozzle's electronic digital display
2. Read number carefully (3 decimal places)
3. Click in green input box
4. Type EXACT number you see

**Format Requirements**:
- Must include 3 decimal places
- Example: 12345.678
- Use period (.) for decimal
- NO commas or spaces

**Examples**:
- ✓ Correct: 12345.678
- ✓ Correct: 9876.543
- ✗ Wrong: 12345 (missing decimals)
- ✗ Wrong: 12,345.678 (no commas)

**Tips**:
- Take your time
- Check twice before entering
- Clean display if hard to read
- Report malfunctioning displays

#### STEP 6: Validate (BEFORE Submitting)

**Button**: Purple "🔍 Validate Electronic vs Mechanical Reading"

**Purpose**: Compare both readings BEFORE final submission

**When to Use**:
1. After uploading photo
2. After entering electronic reading
3. BEFORE clicking Submit

**How to Use**:
1. Ensure both readings present
2. Click purple "Validate" button
3. Wait for result (appears below)

**Two Possible Results:**

**RESULT 1: ✅ Match (SUCCESS)**

Green box appears:
```
✅ Dual Readings Match!
Mechanical: 12345 | Electronic: 12345.678 | Discrepancy: 0.678L
✓ Dual readings verified. You can now proceed to submit.
```

**Meaning**: Readings within tolerance (±0.2L or 5%). Safe to submit!

**RESULT 2: ⚠️ Mismatch (WARNING)**

Orange box appears:
```
⚠️ Dual Reading Discrepancy Detected!
Mechanical: 12345 | Electronic: 12567.890 | Discrepancy: 222.890L
⚠️ Please verify both meter readings. Discrepancy will be logged.
```

**Meaning**: Significant difference detected

**What to Do**:
1. Check electronic reading again
2. Look at mechanical meter physically
3. If OCR wrong, retake photo
4. If meters truly disagree, report to supervisor
5. You CAN still submit (system allows it)
6. Discrepancy will be flagged for review

#### STEP 7: OCR Confidence Minimum

**Default**: 0.85 (85%)

**Usually**: Leave at default

**When to Adjust**:
- Raise to 0.90+: If OCR frequently wrong
- Lower to 0.70-0.80: If OCR too strict
- Keep at 0.85: Recommended

#### STEP 8: Submit Reading

**Button**: Blue "Submit Reading" button at bottom

**Before Clicking**:
- ✓ Nozzle ID entered
- ✓ Reading type selected
- ✓ Image uploaded (recommended)
- ✓ Electronic reading entered
- ✓ Validation done (recommended)

**Click to Submit**:
1. Click blue button
2. Button shows "Submitting..."
3. Wait for result (right panel)

### Validation Result Panel (Right Side)

#### After Successful Submission

**Reading ID**: Unique identifier (e.g., "READ-20251215-143045")

**Status Card** (color-coded):
- **Green**: "ok" - Perfect submission
- **Yellow**: "warn" - Submitted with warnings
- **Red**: "error" - Failed validation

**Dual Reading Display**:
```
⚡ Electronic Reading        🔧 Mechanical Reading
   12345.678                     12345
```

**Discrepancy**: Shows difference in liters

**OCR Method**: Shows which method used:
- "🎯 Real OCR - Tesseract" (image uploaded)
- "🔄 Simulated OCR" (no image)

**Confidence**: e.g., "Confidence: 95%"

**Reasons** (if warnings): Lists any issues

#### If Submission Fails

Red error box:
```
[RED BOX]
Error
Failed to submit reading: [error message]
```

**Common Errors**:
- "Invalid nozzle ID" - Check spelling
- "Reading too low" - Less than previous reading
- "Server error" - Contact supervisor

### Information Panel (Bottom)

**How the Dual Reading System Works:**

Step-by-step guide:
1. Take photo of MECHANICAL meter
2. Upload - System extracts via Tesseract OCR
3. MECHANICAL reading displays (indigo field)
4. Manually enter ELECTRONIC reading (green field)
5. Click "Validate" to compare
6. System shows match/discrepancy status
7. Submit - Both values recorded
8. Result: Status with full details

**Important Warning**:
```
⚠️ Important - Dual Reading System:
Electronic (Primary) = Precise digital with 3 decimals
Mechanical (Backup) = Physical meter with whole numbers
Discrepancies are normal and tracked for reconciliation.
```

### Common Scenarios

#### Perfect Submission
1. Enter "N001"
2. Select "Opening"
3. Upload clear photo → OCR: "12345"
4. Enter electronic: "12345.678"
5. Validate → ✅ Match
6. Submit → Status "ok"

#### Discrepancy But Valid
1. Enter "N001"
2. Upload photo → OCR: "12300"
3. Enter electronic: "12345.678"
4. Validate → ⚠️ Warning (45.678L discrepancy)
5. Double-check meters
6. Submit → Status "warn" (logged for review)

#### OCR Fails
1. Upload blurry photo → "❌ OCR failed"
2. Retake with better quality
3. Upload again → Success
4. Continue

### Best Practices

**DO**:
- Take clear, well-lit photos
- Enter electronic readings precisely
- Validate before submitting
- Report persistent discrepancies
- Submit promptly at shift changes

**DON'T**:
- Rush the entry
- Ignore validation warnings
- Skip photo upload
- Submit if display malfunctioning
- Guess numbers

---

## 8. Shift Management

View shift operations and information.

### Page Header
- **Title**: "Shift Management"
- **Description**: "Day/Night shift operations and dual meter readings"

### Current Active Shift Card

**Shift Types**:
- **☀️ Day Shift**: 6:00 AM - 6:00 PM
- **🌙 Night Shift**: 6:00 PM - 6:00 AM

**Status Badges**:
- **Green "ACTIVE"**: Currently running
- **Blue "COMPLETED"**: Finished
- **Purple "RECONCILED"**: Fully processed

**Information Shown**:
- Date and Shift ID
- Attendants on Duty (comma-separated names)
- Start Time

**Example**:
```
☀️ Day Shift (6AM - 6PM)                    [ACTIVE]
2025-12-15 | Shift ID: SHIFT-20251215-DAY

Attendants: Violet, Shaka, Trevor
Start Time: 06:00:00
```

**No Active Shift**:
```
[YELLOW BOX]
No active shift found. A shift will be automatically created.
```
This is normal - shifts auto-create when needed.

### Nozzle Status Overview

Shows all nozzles and their current status.

Each nozzle card displays:
- **Nozzle ID**: e.g., "N001"
- **Fuel Type**: "Petrol" or "Diesel"
- **Status Badge**: Active/Inactive
- **Current Readings**:
  - Electronic: e.g., "12345.678"
  - Mechanical: e.g., "12345"

**Color Scheme**:
- Petrol: Blue cards
- Diesel: Orange cards

### Information Panel

**Key Information**:
- Day Shift: 6:00 AM - 6:00 PM
- Night Shift: 6:00 PM - 6:00 AM
- Each shift requires Opening and Closing readings for all nozzles
- Dual readings provide verification
- Tank dip readings help reconcile inventory

### Your Shift Responsibilities

**At Shift Start** (Opening):
1. Go to "Readings" page
2. Submit opening readings for your assigned nozzles
3. Take photos of mechanical meters
4. Enter precise electronic readings

**During Shift**:
- Monitor nozzle operations
- Report issues to supervisor
- Keep work area clean

**At Shift End** (Closing):
1. Go to "Readings" page
2. Submit closing readings
3. Ensure all submitted before leaving

**Workflow**:
```
Shift Starts → Opening Readings → Work →
Closing Readings → Shift Ends → Supervisor Reconciles
```

**Important**:
- Shifts auto-create when first reading submitted
- Submit readings even if no sales
- Closing MUST be higher than opening
- Large discrepancies flagged automatically

---

## 9. Logout Process

### How to Logout

**Simple Steps**:
1. Look at top-right corner
2. Find red "Logout" button
3. Click it
4. Immediately logged out → Login screen

### Automatic Logout

System may auto-logout if:
- Inactive for extended period
- Session expires
- Administrator ends session

### Before Logging Out - Checklist

**Ensure**:
- ✓ All readings submitted
- ✓ No pending submissions
- ✓ Issues reported to supervisor
- ✓ Work area ready for next attendant

### After Logout

- All data is saved
- Need to login again for access
- Submitted readings remain in system
- Supervisors can still see your work

---

## 10. Troubleshooting

### Login Issues

**Problem**: Cannot login

**Solutions**:
1. Check username spelling (case-sensitive)
2. Verify CAPS LOCK off
3. No extra spaces in password
4. Try demo login to test
5. Contact supervisor for reset

**Problem**: Login page not loading

**Solutions**:
1. Check internet connection
2. Refresh browser (F5)
3. Clear browser cache
4. Try different browser
5. Contact IT support

### Dashboard Issues

**Problem**: Tank levels showing "-"

**Solutions**:
1. Wait 5 seconds for auto-refresh
2. Check internet
3. Refresh page manually
4. Check if backend running

**Problem**: "Failed to load" errors

**Solutions**:
1. Refresh page
2. Check internet
3. Logout and login again
4. Contact supervisor if persists

### Nozzles Page Issues

**Problem**: No nozzles displaying

**Solutions**:
1. Wait for page to load
2. Check "Loading..." message
3. Refresh page
4. Verify role permissions

### Readings Issues

**Problem**: Image upload fails

**Solutions**:
1. Check file size (< 10MB)
2. Use JPG or PNG
3. Stable internet
4. Take new photo
5. Check phone storage

**Problem**: OCR fails or wrong number

**Solutions**:
1. Better lighting
2. Numbers clearly visible
3. No glare
4. Hold steady and close
5. Clean meter display

**Problem**: Cannot enter electronic reading

**Solutions**:
1. Click in green box
2. Check field not disabled
3. Correct format (12345.678)
4. No commas/spaces
5. Refresh if frozen

**Problem**: Validation always fails

**Solutions**:
1. Double-check electronic entry
2. Verify mechanical meter
3. Retake photo
4. Check if meters match
5. Report malfunction

**Problem**: Submit button disabled

**Solutions**:
1. Fill all required fields:
   - Nozzle ID ✓
   - Reading Type ✓
   - Electronic Reading ✓
   - OCR Confidence ✓
2. Check error messages
3. Validation NOT required to submit

**Problem**: Submission fails

**Solutions**:
1. Read error message
2. Common errors:
   - "Invalid nozzle ID" → Check spelling
   - "Reading too low" → Check value
   - "Server error" → Contact supervisor
3. Try again
4. If persists, report with details

### General Issues

**Problem**: Page looks broken

**Solutions**:
1. Refresh (F5)
2. Clear cache
3. Try different browser
4. Check zoom at 100%
5. Update browser

**Problem**: Slow performance

**Solutions**:
1. Check internet speed
2. Close other tabs
3. Clear cache
4. Restart browser
5. Check computer resources

**Problem**: Cannot click buttons

**Solutions**:
1. Page fully loaded?
2. Button disabled (grayed)?
3. Click center of button
4. Refresh page
5. Popup blocker active?

### Mobile Issues

**Problem**: Layout wrong on phone

**Solutions**:
1. Portrait mode
2. Latest browser version
3. Zoom out if too large
4. Desktop better for some features

**Problem**: Cannot upload photo

**Solutions**:
1. Grant camera permissions
2. Take new photo vs selecting
3. Check phone storage
4. Reduce photo size
5. Try different camera app

### When to Contact Supervisor

Contact if:
- Login not working after multiple attempts
- Persistent errors preventing work
- Impossible meter values
- System asking for wrong permissions
- Incorrect discrepancies
- Security concerns

### Emergency Procedures

**If System Down**:
1. Record readings on paper
2. Note: time, nozzle ID, readings
3. Inform supervisor immediately
4. Continue with manual records
5. Enter when system returns

**Paper Format**:
```
Date: _____________
Time: _____________
Nozzle: ___________
Type: Opening / Closing
Electronic: ____________.___
Mechanical: ____________
Photo: Yes / No
Notes: ___________________
```

---

## Quick Reference Card

### Available Pages
✓ Dashboard - View
✓ Nozzles - View
✓ Readings - Submit
✓ Shifts - View

### Not Available
✗ Reconciliation, Accounts, Inventory, Sales, Reports, Stock Movement, Settings

### Submit Reading Steps
1. Go to "Readings"
2. Enter nozzle ID
3. Select type (Opening/Closing)
4. Upload meter photo
5. Wait for OCR
6. Enter electronic reading (3 decimals)
7. Click "Validate"
8. Click "Submit"

### Reading Formats
- **Electronic**: 12345.678 (3 decimals)
- **Mechanical**: 12345 (whole, OCR)
- **Nozzle ID**: N001, N002, etc.

### Shift Times
- **Day**: 6:00 AM - 6:00 PM
- **Night**: 6:00 PM - 6:00 AM

---

**END OF USER MANUAL**
