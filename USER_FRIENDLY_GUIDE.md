# Fuel Station Management System - User Guide
## Easy-to-Understand Guide for Everyone

**Version:** 1.0
**Date:** December 24, 2025

---

## What This System Does

This system helps you manage your fuel station operations. Think of it as a digital notebook that:
- Tracks how much fuel you sell each day
- Records meter readings from your fuel pumps
- Calculates your daily revenue
- Helps you keep track of your staff and their work
- Shows you if there are any problems with your fuel pumps
- Manages your inventory (how much fuel is in your tanks)

---

## Getting Started

### Logging In

**What You See:**
- A login screen with two boxes and a button

**What To Do:**
1. Type your **username** in the first box (e.g., "john_supervisor")
2. Type your **password** in the second box
3. Click the **"Login"** button

**What Happens:**
- If correct: You'll see the main dashboard
- If wrong: An error message appears - try again

---

## Understanding Your Role

The system has three types of users:

### 1. **Owner** (Full Access)
- Can do everything in the system
- Sets fuel prices
- Creates user accounts
- Views all reports
- Manages all settings

### 2. **Supervisor** (Management Access)
- Assigns staff to shifts
- Views reports
- Manages daily operations
- Cannot change system settings

### 3. **User/Attendant** (Limited Access)
- Records meter readings
- Views their assigned shifts
- Cannot access reports or settings

---

## Main Menu - What Each Item Does

When you log in, you'll see a menu on the left side. Here's what each option does:

### 📊 **Dashboard** (Home Page)

**What It Shows:**
- Quick overview of today's activity
- Current fuel tank levels
- Recent sales
- Any alerts or problems

**What You Can Do:**
- See a summary of your station's status at a glance
- Click on any section to see more details

**Buttons You'll See:**
- None - this is just an information page

---

### ⛽ **Tanks** (Fuel Storage)

**What This Is:**
Shows how much fuel is in your underground storage tanks

**What You See:**
- **Two tank cards**: One for Petrol, one for Diesel
- **Colored bars**: Show how full each tank is
  - Green: Tank is healthy (enough fuel)
  - Yellow: Getting low (need to order soon)
  - Red: Very low (order immediately!)
- **Numbers**: Show exact amounts in liters

**Information Displayed:**
- **Current Level**: How much fuel is in the tank now
- **Capacity**: How much the tank can hold when full
- **Percentage**: What percent full the tank is
- **Last Updated**: When this information was last checked

**What You Can Do:**
- **"Record Dip Reading" button**: Click to enter a new tank measurement
  - A form appears
  - Enter the measurement from your dipstick (in centimeters)
  - Click "Submit"
  - System converts it to liters automatically

**Why This Matters:**
Knowing your tank levels helps you:
- Order fuel before you run out
- Plan deliveries
- Detect if fuel is being stolen (if levels don't match sales)

---

### 🏝️ **Islands** (Fuel Pumps)

**What This Is:**
Shows your fuel dispensing islands (the structures where cars pull up to get fuel)

**What You See:**
- Cards for each island (e.g., "Island 1", "Island 2")
- List of nozzles (fuel hoses) on each island
- Status of each nozzle (Active, Inactive, or Maintenance)

**Information for Each Nozzle:**
- **Nozzle ID**: Name/number (e.g., "UNL-1A" for Unleaded Petrol)
- **Fuel Type**: Petrol or Diesel
- **Status**:
  - Green "Active" = Working normally
  - Gray "Inactive" = Not in use
  - Orange "Maintenance" = Being repaired
- **Current Readings**:
  - Electronic Reading: Digital meter (shows decimals)
  - Mechanical Reading: Analog meter (whole numbers)

**Buttons:**
- **"Add Island"**: Create a new fuel island (Owner only)
- **"Edit"**: Change island details
- **"View Details"**: See more information about nozzles

**Why This Matters:**
- Helps you know which pumps are working
- Shows the total fuel dispensed from each pump
- Useful for maintenance planning

---

### 👥 **Users** (Staff Management)

**What This Is:**
Manage your fuel station staff accounts

**What You See:**
- List of all employees who can use the system
- Each person's name, role, and username

**Information Displayed:**
- **Full Name**: Person's actual name
- **Username**: What they type to log in
- **Role**: Owner, Supervisor, or User (Attendant)
- **Station**: Which station they work at

**Buttons:**
- **"Add New User"**: Create account for new employee
  - Form appears asking for:
    - Full name
    - Username (cannot be changed later)
    - Password
    - Role (what they can access)
  - Click "Create User" to save

- **"Edit" button** (on each user card):
  - Change person's role
  - Update their information
  - Reset their password

- **"Delete" button** (on each user card):
  - Remove user from system
  - ⚠️ Warning: This cannot be undone!

**Who Can See This:**
- Only Owners and Supervisors

---

### 🕐 **Shifts** (Work Schedules)

**What This Is:**
Manage work shifts and assign staff to fuel pumps

**Understanding Shifts:**
Your station operates in two shifts each day:
- **Day Shift**: 6:00 AM to 6:00 PM (morning to evening)
- **Night Shift**: 6:00 PM to 6:00 AM (evening to morning)

**What You See:**

#### **Current Active Shift Box** (Top of page)
- Shows which shift is happening now
- Lists attendants working this shift
- Shows who is assigned to which pumps
- Displays shift status (Active, Completed, or Reconciled)

**Buttons in Active Shift:**
- **"Manage Shift"** (Owner/Supervisor only):
  - Click to assign or change staff assignments
  - Opens a large form (see below)

#### **Submit Dual Reading Section** (Middle of page)
This is where attendants record pump meter readings

**Form Fields:**
1. **Nozzle**: Select which pump you're reading
   - Dropdown shows all available nozzles
   - Example: "UNL-1A - Petrol"

2. **Reading Type**: Choose one
   - **Opening**: Reading at start of shift (6 AM or 6 PM)
   - **Closing**: Reading at end of shift (6 PM or 6 AM)

3. **Electronic Reading**: The digital meter
   - Type the exact number you see (with decimals)
   - Example: 12345.678

4. **Mechanical Reading**: The analog meter
   - Type the whole number only
   - Example: 12345

5. **Attendant**: Select who took the reading
   - Your name or the person who physically read the meter

6. **Tank Dip (Optional)**: Physical tank measurement
   - Only if you measured the tank with dipstick
   - Enter measurement in centimeters

**Button:**
- **"Submit Dual Reading"**: Saves the reading
  - Must fill all required fields
  - System checks if numbers make sense
  - Shows success or error message

#### **Nozzle Status Panel** (Right side)
Shows real-time status of all fuel nozzles

**Color Coding:**
- **Blue background**: Petrol nozzles
- **Orange background**: Diesel nozzles
- **Green badge**: Nozzle is Active
- **Gray badge**: Nozzle is Inactive

---

### **"Manage Shift" Form** (When you click the button)

A large window appears with tabs and sections:

#### **Step 1: Basic Information**
- **Date**: Select shift date from calendar
- **Shift Type**: Choose "Day" or "Night"

#### **Step 2: Select Attendants**
- Checkboxes with staff names
- Click each person working this shift
- Example: ☑️ Violet, ☑️ Shaka, ☐ Trevor

#### **Step 3: Assign Islands & Nozzles** (For each selected attendant)

For each person you selected, you'll see a box with their name:

**Violet's Assignment:**
- **Assigned Islands**:
  - ☑️ Island 1
  - ☐ Island 2
  - (Check which islands they'll manage)

- **Assigned Nozzles**:
  - Shows only nozzles from selected islands
  - ☑️ UNL-1A (Petrol)
  - ☑️ UNL-1B (Petrol)
  - ☑️ LSD-1A (Diesel)
  - (Check which specific pumps they'll operate)

**Important Rules:**
- Each nozzle can only be assigned to ONE person
- If you try to assign the same nozzle to two people, you'll get an error
- Attendants can work multiple islands
- You must assign at least one attendant

**Buttons at Bottom:**
- **"Cancel"**: Close without saving (no changes made)
- **"Create Shift"** or **"Update Shift"**: Save assignments
  - If shift exists for this date: Updates it
  - If new date: Creates new shift

**What Happens After Clicking Create/Update:**
- Success message appears
- Modal closes
- Active shift display updates
- Attendants can now see their assignments

---

### 📈 **Sales** (Revenue Tracking)

**What This Is:**
Records and displays fuel sales transactions

**What You See:**
- List of all sales made
- Each sale shows:
  - Date and time
  - Shift (Day or Night)
  - Fuel type (Petrol or Diesel)
  - Volume sold (in liters)
  - Amount charged (in money)
  - Validation status (Pass or Fail)

**Color Coding:**
- **Green "PASS"**: Normal sale, meters match well
- **Red "FAIL"**: Problem detected, needs review
  - Large difference between electronic and mechanical meters
  - May indicate pump malfunction or error

**How Sales Are Created:**
- Automatically calculated from your meter readings
- When you submit Opening and Closing readings:
  - System calculates: Closing - Opening = Volume Sold
  - Multiplies by fuel price = Total Amount
  - Checks if electronic and mechanical meters agree

**Buttons:**
- **"Add Credit Sale"**: Record a sale on credit
  - For customers who pay later
  - Form asks for:
    - Customer/Account name
    - Fuel type and amount
    - Invoice number
  - Click "Submit" to save

- **"View Details"**: See full information about a sale
  - Opening readings
  - Closing readings
  - Calculation breakdown
  - Validation details

**Information Panel (Bottom):**
Shows important notes:
- Dual readings provide accuracy
- Electronic meter is more precise
- Mechanical meter is the backup
- Both should be close in value

---

### 📊 **Reports** (Business Intelligence)

**What This Is:**
View different types of reports to understand your business

**What You See:**
Several report cards, each showing different information

#### **1. Daily Sales Report**

**What It Shows:**
Complete breakdown of one day's sales

**How to Use:**
1. **Select Date**: Click calendar icon, choose date
2. **Click "Generate Report"** button
3. Report appears below showing:
   - Total Petrol sold (liters and revenue)
   - Total Diesel sold (liters and revenue)
   - Shift breakdown (Day vs Night)
   - Individual pump performance
   - Any discrepancies or problems

**What The Numbers Mean:**
- **Volume**: How many liters sold
- **Revenue**: Money earned
- **Discrepancy %**: Difference between meters
  - 0.0% to 0.5% = Normal ✓
  - Above 0.5% = Check pump ⚠️
  - Above 1.0% = Problem! ❌

#### **2. Stock Movement Report**

**What It Shows:**
How fuel moved in and out of your tanks

**Information Displayed:**
- **Opening Stock**: Fuel in tank at start of day
- **Deliveries**: Fuel added from supplier
- **Sales**: Fuel pumped to customers
- **Closing Stock**: Fuel left at end of day
- **Expected vs Actual**: Should match closely

**Formula Shown:**
```
Opening Stock + Deliveries - Sales = Expected Closing Stock
```

**Why This Matters:**
If Expected and Actual don't match:
- **Gain** (More than expected): Possible delivery error or measurement mistake
- **Loss** (Less than expected): Could be:
  - Evaporation (normal, small amount)
  - Spillage during delivery
  - Theft (if large amount)
  - Measurement error

#### **3. Shift Reconciliation Report**

**What It Shows:**
Money breakdown for each shift

**Sections:**
- **Expected Revenue**:
  - Petrol sales: ZMW XXX
  - Diesel sales: ZMW XXX
  - LPG sales: ZMW XXX
  - Lubricants: ZMW XXX
  - Total Expected: ZMW XXX

- **Credit Sales**: Money owed by customers (not cash)

- **Expected Cash**: Total Expected - Credit Sales

- **Actual Cash Deposited**: What was actually banked

- **Difference**: Expected - Actual
  - Should be zero or very small
  - Large difference = investigation needed

**Buttons:**
- **"Export to PDF"**: Download report as PDF file
- **"Print"**: Send to printer
- **"Email Report"**: Send to email address

---

### 📦 **Inventory** (Stock Management)

**What This Is:**
Track all products in your shop (not just fuel)

**Categories:**

#### **Fuel Inventory**
- Petrol and Diesel in tanks
- Already covered in "Tanks" section

#### **LPG (Cooking Gas)**
**What You Track:**
- Cylinder sizes (6kg, 9kg, 13kg)
- Number of full cylinders
- Number of empty cylinders
- Refills done today
- New cylinders sold

**Buttons:**
- **"Record LPG Sale"**:
  - Select cylinder size
  - Enter quantity
  - Choose: Refill or New Sale
  - Customer name (optional)
  - Click "Submit"

#### **Lubricants (Engine Oils)**
**What You See:**
- List of all oil products
- Current stock levels
- Prices
- Location (which shelf/island)

**Products Shown:**
- Engine oils (different grades)
- Brake fluid
- Transmission fluid
- Coolant
- Other automotive fluids

**Buttons:**
- **"Record Sale"**:
  - Select product
  - Enter quantity sold
  - Click "Submit"
  - Stock updates automatically

- **"Add Stock"**:
  - When new delivery arrives
  - Select product
  - Enter quantity received
  - Click "Save"

#### **LPG Accessories**
**What These Are:**
- Gas regulators
- Hoses
- Spare parts

**Same buttons as Lubricants**

---

### 💰 **Accounts** (Credit Customers)

**What This Is:**
Manage customers who buy fuel on credit (pay later)

**Types of Credit Accounts:**
1. **POS**: Point of Sale credit customers
2. **Institution**: Schools, hospitals, government offices
3. **Corporate**: Companies with fleet vehicles
4. **Individual**: Personal customers with credit

**What You See:**
Card for each customer showing:
- **Account Name**: Customer/company name
- **Account Type**: Which category above
- **Credit Limit**: Maximum they can owe
- **Current Balance**: How much they owe now
- **Available Credit**: How much they can still buy
  - Formula: Credit Limit - Current Balance

**Color Coding:**
- **Green**: Balance is safe
- **Yellow**: Getting close to limit
- **Red**: At or over credit limit (cannot sell more)

**Buttons:**
- **"Add New Account"**:
  - Create new credit customer
  - Form asks for:
    - Account name
    - Account type
    - Credit limit (maximum debt allowed)
    - Contact person
    - Phone number
  - Click "Create Account"

- **"Record Payment"** (on each account):
  - When customer pays
  - Enter amount received
  - Balance decreases
  - Available credit increases

- **"View Transactions"**:
  - See all sales to this customer
  - Payment history
  - Outstanding invoices

- **"Edit Account"**:
  - Change credit limit
  - Update contact information
  - Suspend account if needed

**Why This Matters:**
- Tracks who owes you money
- Prevents over-lending
- Keeps customer records organized

---

### 🔧 **Settings** (System Configuration)

**Who Can Access:** Owner only

**What This Is:**
Change important system settings

**Sections:**

#### **1. System Information**
**What You Can Change:**

- **Business Name**: Your fuel station's name
  - Appears on reports and invoices
  - Example: "City Center Fuel Station"

- **License Key**: Software activation code
  - Provided when you purchase the system
  - Don't change unless instructed

- **Contact Email**: Your email address
  - For system notifications
  - Customer inquiries

- **Contact Phone**: Your phone number
  - Displayed on invoices
  - Customer contact

- **Station Location**: Your address
  - Example: "123 Main Street, Lusaka"

- **License Expiry Date**: When software license expires
  - System warns you before expiry
  - Renew to keep using

- **Software Version**: Current version number
  - **Read-only** (cannot change)
  - Example: "1.0.0"

**Button:**
- **"Save System Information"**: Updates all above settings

#### **2. Fuel Pricing**
**What You Can Change:**

- **Diesel Price per Liter**:
  - How much you charge for 1 liter of diesel
  - Example: 150.00 ZMW
  - Updates immediately affect sales calculations

- **Petrol Price per Liter**:
  - How much you charge for 1 liter of petrol
  - Example: 160.00 ZMW

**When to Change:**
- When government announces new fuel prices
- When your supplier changes their price
- During promotions or special offers

**Button:**
- **"Save Settings"**: Updates fuel prices

#### **3. Allowable Losses During Offloading**
**What This Means:**
When fuel is delivered to your tanks, some is lost to:
- Evaporation (fuel turns to gas)
- Spillage (small drips and spills)
- Measurement differences

**What You Can Set:**

- **Diesel Allowable Loss %**:
  - Default: 0.3%
  - Means: If you order 10,000 liters, 30 liters loss is normal
  - System accepts losses within this range

- **Petrol Allowable Loss %**:
  - Default: 0.5%
  - Petrol evaporates more than diesel
  - Slightly higher acceptable loss

**What The System Does:**
- Compares expected vs actual fuel received
- If loss is within percentage: Shows green ✓
- If loss exceeds percentage: Shows red ⚠️ and alerts you

**Information Panel (Bottom):**
Shows industry standards:
- Diesel: 0.2% to 0.4% is normal
- Petrol: 0.3% to 0.6% is normal
- Use these as guidelines

**Button:**
- **"Save Settings"**: Updates loss percentages

---

### 🔐 **Logout**

**What It Does:**
- Logs you out of the system
- Returns to login screen
- Keeps your data safe

**When to Use:**
- End of your shift
- Before closing browser
- When leaving computer unattended

**Important:**
Always logout when done - never just close the browser!

---

## Understanding Colors and Symbols

### **Color Meanings:**

- **Green**: ✓ Good, Normal, Success
  - Green buttons do positive actions
  - Green badges mean "Active" or "Passed"

- **Red**: ⚠️ Warning, Error, Problem
  - Red text means error message
  - Red badges mean "Failed" validation

- **Blue**: Information, Petrol-related
  - Blue cards for petrol products
  - Blue highlights for information

- **Orange/Yellow**: Caution, Diesel-related
  - Orange cards for diesel products
  - Yellow warnings mean "pay attention"

- **Gray**: Inactive, Disabled
  - Gray buttons cannot be clicked
  - Gray text means "not in use"

### **Common Symbols:**

- **☰** (Three lines): Menu button - click to show/hide menu
- **✕** (X): Close button - closes window or dialog
- **✓** (Checkmark): Success, Approved, Selected
- **⚠️** (Warning): Pay attention, problem detected
- **📊** (Chart): Reports and analytics
- **⛽** (Gas pump): Fuel-related items
- **👤** (Person): User or staff related
- **⚙️** (Gear): Settings and configuration
- **🔍** (Magnifying glass): Search function
- **📅** (Calendar): Date selection

---

## Common Tasks - Step by Step

### **How to Record Morning Readings**

**Who Does This:** Attendants (at 6 AM or 6 PM)

1. **Go to "Shifts" page** (click in menu)
2. **Find "Submit Dual Reading" section**
3. **Select your nozzle** from dropdown (the one assigned to you)
4. **Choose "Opening"** as Reading Type
5. **Look at the pump's electronic meter** - write down EXACT number with decimals
6. **Type into "Electronic Reading"** box
7. **Look at the pump's mechanical meter** - write down whole number
8. **Type into "Mechanical Reading"** box
9. **Select your name** from Attendant dropdown
10. **Click "Submit Dual Reading"** button
11. **Wait for green success message**
12. **Repeat for each nozzle** you're assigned to

**Tips:**
- Write readings on paper first, then type carefully
- Double-check numbers before submitting
- If you make a mistake, tell your supervisor immediately

---

### **How to Assign Staff to Shifts**

**Who Does This:** Owner or Supervisor

1. **Go to "Shifts" page**
2. **Click "Manage Shift" button** (blue button top-right)
3. **Big form appears**
4. **Step 1:** Select date from calendar
5. **Step 2:** Choose "Day" or "Night" shift
6. **Step 3:** Check boxes next to staff working today
   - Example: ☑️ Violet, ☑️ Shaka
7. **Step 4:** For EACH person selected:
   - Check which islands they'll manage
   - Check which specific nozzles they'll operate
8. **Review assignments** - make sure no nozzle is assigned twice
9. **Click "Create Shift"** or **"Update Shift"** button
10. **Wait for "Shift created successfully!" message**
11. **Click X** to close form

**Tips:**
- Assign nozzles evenly among staff
- Keep petrol and diesel nozzles balanced per person
- Review the active shift display to confirm assignments

---

### **How to View Yesterday's Sales**

**Who Does This:** Owner or Supervisor

1. **Go to "Reports" page**
2. **Find "Daily Sales Report" section**
3. **Click the calendar icon** next to date
4. **Select yesterday's date**
5. **Click "Generate Report" button**
6. **Report appears below showing:**
   - How many liters of petrol sold
   - How many liters of diesel sold
   - Total money earned
   - Sales by shift (Day and Night)
   - Any problems or discrepancies
7. **Optional:** Click "Export to PDF" to save a copy

---

### **How to Change Fuel Price**

**Who Does This:** Owner only

1. **Go to "Settings" page** (gear icon in menu)
2. **Scroll to "Fuel Pricing" section**
3. **Click in the "Diesel Price" box**
4. **Type new price** (example: 155.00)
5. **Click in "Petrol Price" box**
6. **Type new price** (example: 165.00)
7. **Click "Save Settings" button** at bottom
8. **Wait for green "Settings updated successfully!" message**
9. **New prices apply immediately** to all new sales

**Important:**
- Only change when officially authorized
- Inform all staff before changing
- Keep record of price changes

---

### **How to Check Tank Levels**

**Who Does This:** Anyone can view, Owner records measurements

1. **Go to "Tanks" page** (menu)
2. **Look at the two cards** - one for Petrol, one for Diesel
3. **Check the colored bar** - shows how full tank is
   - Green = Good (more than 30% full)
   - Yellow = Low (between 15-30%)
   - Red = Very Low (less than 15%)
4. **Read the numbers:**
   - Current Level: Liters in tank now
   - Capacity: Maximum tank can hold
   - Percentage: How full (%)

**To Record New Measurement:**
1. **Click "Record Dip Reading" button**
2. **Select tank** (Petrol or Diesel)
3. **Enter measurement from dipstick** in centimeters
   - Example: 145.5 cm
4. **Click "Submit"**
5. **System automatically converts to liters**

---

## Troubleshooting - Common Issues

### **"Invalid username or password"**
**Problem:** Can't log in
**Solution:**
- Check if CAPS LOCK is on (turn it off)
- Type carefully - username and password are case-sensitive
- Ask supervisor to reset your password

---

### **"Shift already exists"**
**Problem:** Trying to create shift that's already made
**Solution:**
- System automatically updates existing shift instead
- Just continue - it will save your changes
- The shift will show "updated" instead of "created"

---

### **"Nozzle assigned to multiple attendants"**
**Problem:** Tried to assign same pump to two people
**Solution:**
- Review your assignments
- Find which nozzle is checked twice
- Uncheck one of them
- Each nozzle can only have ONE person

---

### **"Closing reading must be greater than opening"**
**Problem:** Numbers don't make sense
**Solution:**
- Check you selected correct Reading Type
- Closing reading should always be BIGGER than opening
- If you selected wrong type, cancel and start again
- If numbers are correct, pump may be reset - contact supervisor

---

### **Red "FAIL" on sales**
**Problem:** Meters don't match well
**Solution:**
- This is a warning, not your fault
- Note which nozzle has the problem
- Tell supervisor - pump may need checking
- Could be normal if tank was just filled

---

## Important Numbers to Remember

### **Shift Times:**
- Day Shift Starts: **6:00 AM**
- Day Shift Ends: **6:00 PM**
- Night Shift Starts: **6:00 PM**
- Night Shift Ends: **6:00 AM**

### **Default Fuel Prices:** (Check Settings for current prices)
- Petrol: **160 ZMW** per liter
- Diesel: **150 ZMW** per liter

### **Acceptable Meter Differences:**
- Petrol: Less than **0.5%** difference is OK
- Diesel: Less than **0.3%** difference is OK

### **Acceptable Fuel Loss (Delivery):**
- Petrol: Up to **0.5%** loss is normal
- Diesel: Up to **0.3%** loss is normal

---

## Getting Help

### **If You Have Technical Problems:**
1. Note exactly what you were doing
2. Write down any error message (exact words)
3. Take a photo of screen if possible
4. Contact your supervisor
5. Don't try to "fix" it yourself

### **If You're Not Sure What To Do:**
1. Ask your supervisor
2. Refer to this guide
3. Check the USER_MANUAL.pdf for your role
4. Don't guess - it's better to ask!

### **If You Made a Mistake:**
1. Tell your supervisor immediately
2. Don't try to hide it or fix it
3. Provide details of what happened
4. Mistakes can usually be corrected if reported quickly

---

## Security and Safety

### **Protecting the System:**

**DO:**
- ✓ Log out when finished
- ✓ Keep your password secret
- ✓ Lock screen if you leave computer
- ✓ Report suspicious activity
- ✓ Close browser when done

**DON'T:**
- ✗ Share your password with anyone
- ✗ Let others use your account
- ✗ Write password on paper
- ✗ Leave computer logged in and unattended
- ✗ Try to access areas you're not allowed

### **Protecting Your Data:**

**Remember:**
- This system contains sensitive business information
- Sales figures are confidential
- Customer accounts are private
- Staff information is protected
- Only discuss data with authorized persons

---

## Conclusion

This system is designed to make your work easier and your business more efficient. Take time to:

1. **Familiarize yourself** with each menu item
2. **Practice** common tasks
3. **Ask questions** when unsure
4. **Follow procedures** carefully
5. **Report problems** promptly

**Remember:** The system is a tool to help you. If something doesn't make sense or seems wrong, ask for help. It's better to take a few extra minutes to understand than to make a mistake that causes problems later.

---

**Need More Help?**

Refer to the role-specific manuals:
- **OWNER_MANUAL.pdf** - For owners
- **SUPERVISOR_MANUAL.pdf** - For supervisors
- **USER_MANUAL.pdf** - For attendants

**Questions?** Contact your system administrator or supervisor.

---

**Document End**

*This guide was created to help everyone understand and use the Fuel Station Management System effectively.*
