# Fuel Management System - Complete System Documentation
## Prototype Version 1.0

**Document Purpose:** This document provides a comprehensive overview of the Fuel Management System prototype for review with system users. It details all functionality, user interfaces, and backend operations to facilitate feedback and enhancement planning.

**Date:** December 17, 2025
**Status:** Prototype
**Currency:** ZMW (Zambian Kwacha)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [User Roles & Access Control](#2-user-roles--access-control)
3. [Authentication System](#3-authentication-system)
4. [Dashboard](#4-dashboard)
5. [Pump Islands & Nozzles](#5-pump-islands--nozzles)
6. [Readings Module](#6-readings-module)
7. [Sales Module](#7-sales-module)
8. [Reports Module](#8-reports-module)
9. [Stock Movement](#9-stock-movement)
10. [Settings](#10-settings)
11. [Backend Architecture](#11-backend-architecture)
12. [Data Models](#12-data-models)
13. [Future Enhancements](#13-future-enhancements)

---

## 1. System Overview

### 1.1 Purpose
The Fuel Management System is designed to manage fuel station operations including:
- Inventory tracking (Diesel and Petrol tanks)
- Pump island and nozzle management
- Meter reading validation with OCR technology
- Sales recording and reporting
- Stock delivery management
- Discrepancy detection and alerting

### 1.2 Technology Stack
**Frontend:**
- Next.js 14 (React framework)
- TypeScript
- Tailwind CSS for styling
- SWR for data fetching

**Backend:**
- Python FastAPI
- PostgreSQL (Docker container)
- Tesseract OCR for image processing
- PIL/Pillow for image manipulation

### 1.3 System Architecture
- Full-stack web application
- RESTful API architecture
- Real-time data updates (5-10 second refresh intervals)
- Role-based access control (RBAC)
- OCR-powered meter reading validation

---

## 2. User Roles & Access Control

### 2.1 Role Hierarchy

#### **User (Basic Level)** 👤
**Demo Account:**
- Username: `user1`
- Password: `password123`
- Name: Fashon Sakala

**Access Rights:**
- Dashboard (view)
- Nozzles (view)
- Readings (submit, view)

**Restrictions:**
- Cannot access Sales
- Cannot access Reports
- Cannot access Stock Movement
- Cannot access Settings

#### **Station Supervisor (Mid Level)** 👔
**Demo Account:**
- Username: `supervisor1`
- Password: `super123`
- Name: Barbara Banda

**Access Rights:**
- All User permissions
- Sales (record, view)
- Reports (generate, view)
- Stock Movement (receive deliveries)

**Restrictions:**
- Cannot access Settings (pricing, losses configuration)

#### **Owner (Admin Level)** 👑
**Demo Account:**
- Username: `owner1`
- Password: `owner123`
- Name: Kanyembo Ndhlovu

**Access Rights:**
- Full system access
- All Supervisor permissions
- Settings (configure pricing, allowable losses)
- System configuration

### 2.2 Access Control Implementation
- Navigation menu dynamically filters based on user role
- Backend API endpoints validate user permissions
- Session-based authentication with tokens
- Automatic redirect to login if not authenticated

---

## 3. Authentication System

### 3.1 Login Page (`/login`)

**URL:** `http://localhost:3002/login`

**Page Elements:**

1. **Header Section**
   - System logo: ⛽ Fuel Management
   - Subtitle: "Sign in to your account"

2. **Login Form Fields**
   - **Username Field:**
     - Type: Text input
     - Placeholder: "Enter your username"
     - Required: Yes
     - Validation: Must not be empty

   - **Password Field:**
     - Type: Password input
     - Placeholder: "Enter your password"
     - Required: Yes
     - Validation: Must not be empty

3. **Buttons**
   - **Sign In Button:**
     - Color: Blue
     - Action: Authenticates user and redirects to dashboard
     - Loading state: Shows "Signing in..." when processing
     - Disabled state: When loading

4. **Demo Account Buttons** (For Testing)
   - **User Demo Button:**
     - Color: Green
     - Label: "👤 User: user1 / password123"
     - Action: Auto-fills credentials for User role

   - **Supervisor Demo Button:**
     - Color: Yellow
     - Label: "👔 Supervisor: supervisor1 / super123"
     - Action: Auto-fills credentials for Supervisor role

   - **Owner Demo Button:**
     - Color: Purple
     - Label: "👑 Owner: owner1 / owner123"
     - Action: Auto-fills credentials for Owner role

5. **Error Display**
   - Shows authentication errors in red alert box
   - Example: "Invalid username or password"

### 3.2 Backend Authentication (`/api/v1/auth`)

**Endpoints:**

1. **POST `/auth/login`**
   - Input: `{"username": "string", "password": "string"}`
   - Output:
     ```json
     {
       "access_token": "token-user1-U001",
       "token_type": "bearer",
       "user": {
         "user_id": "U001",
         "username": "user1",
         "full_name": "Fashon Sakala",
         "role": "user",
         "station_id": "ST001"
       }
     }
     ```
   - Security: Password hashed with SHA-256
   - Session: Stores token in localStorage

2. **POST `/auth/logout`**
   - Input: `token`
   - Action: Invalidates session token

3. **GET `/auth/me`**
   - Input: `token` (query parameter)
   - Output: Current user information

4. **GET `/auth/users`**
   - Output: List of all users
   - Access: Owner only (future implementation)

---

## 4. Dashboard

### 4.1 Dashboard Page (`/`)

**URL:** `http://localhost:3002/`

**Page Elements:**

1. **Header Section**
   - Title: "Dashboard"
   - Subtitle: "Overview of daily operations and alerts"

2. **Date Selector**
   - **Element:** Date input field
   - **Label:** "Select Date"
   - **Default:** Today's date
   - **Action:** Refreshes dashboard data for selected date

3. **Real-Time Fuel Tank Cards** (NEW FEATURE)

   **Diesel Tank Card:**
   - **Header:** 🛢️ Diesel Tank
   - **Badge:** "Real-time" (updates every 5 seconds)
   - **Display Elements:**
     - Current Level: Large number display (e.g., "15,000 L")
     - Progress Bar: Visual fill indicator
       - Green: >50% full
       - Yellow: 25-50% full
       - Red: <25% full
     - Percentage: Shows % full (e.g., "75.0% Full")
     - Capacity: Total tank capacity (e.g., "20,000 L")
     - Available Space: Calculated remaining capacity
     - Last Updated: Timestamp of last update
   - **Color Scheme:** Orange gradient background

   **Petrol Tank Card:**
   - **Header:** ⛽ Petrol Tank
   - **Badge:** "Real-time" (updates every 5 seconds)
   - **Display Elements:**
     - Current Level: Large number display (e.g., "18,000 L")
     - Progress Bar: Visual fill indicator (same color coding as diesel)
     - Percentage: Shows % full (e.g., "72.0% Full")
     - Capacity: Total tank capacity (e.g., "25,000 L")
     - Available Space: Calculated remaining capacity
     - Last Updated: Timestamp of last update
   - **Color Scheme:** Blue gradient background

4. **Daily Summary Card**
   - **Title:** "Daily Summary"
   - **Fields:**
     - Date: Selected date
     - Volume Records: Count of volume records
     - Cash Variance Records: Count of cash variance entries
     - Flags: Count of discrepancy flags
   - **Loading State:** Shows "Loading..." when fetching data

5. **Recent Discrepancies Card**
   - **Title:** "Recent Discrepancies"
   - **Display:**
     - List of recent discrepancies (limit: 10)
     - Each item shows:
       - Description of discrepancy
       - Timestamp
     - Background: Red highlight for visibility
   - **Empty State:** "No discrepancies found"

6. **Summary Statistics (Bottom Row)**

   **Total Nozzles Card:**
   - Background: Blue
   - Icon: Dashboard icon
   - Value: Count of active nozzles
   - Subtitle: "Active monitoring"

   **Today's Sales Card:**
   - Background: Green
   - Icon: Sales icon
   - Value: Total transaction count
   - Subtitle: "Total transactions"

   **Alerts Card:**
   - Background: Yellow
   - Icon: Alert icon
   - Value: Count of active alerts
   - Subtitle: "Requires attention"

### 4.2 Backend APIs Used

1. **GET `/api/v1/reports/daily?date={date}`**
   - Returns daily summary data

2. **GET `/api/v1/discrepancies?limit=10`**
   - Returns recent discrepancies

3. **GET `/api/v1/tanks/levels`**
   - Returns current tank levels
   - Refreshes every 5 seconds

---

## 5. Pump Islands & Nozzles

### 5.1 Nozzles Page (`/nozzles`)

**URL:** `http://localhost:3002/nozzles`
**Access:** All users (User, Supervisor, Owner)

**Page Elements:**

1. **Header Section**
   - Title: "Pump Islands & Nozzles"
   - Subtitle: "Overview of all islands, pump stations, and nozzles"

2. **Island Cards** (Grid Layout - 2 columns on desktop)

   **Each Island Card Contains:**

   **Island Header (Blue Gradient):**
   - Icon: 🏝️
   - Island Name: (e.g., "Island 1")
   - Location Badge: 📍 Location (e.g., "North Section")
   - Island ID Badge: (e.g., "ISL-001")

   **Pump Station Section:**
   - Green indicator dot
   - Icon: ⚙️
   - Pump Station Name: (e.g., "Pump Station 1")
   - Pump Station ID: (e.g., "PS-001")

   **Nozzles Section:**
   - Label: "Nozzles:"
   - Each nozzle displayed in colored card:

     **Diesel Nozzle:**
     - Background: Orange
     - Icon: 🛢️
     - Nozzle ID: (e.g., "N001")
     - Fuel Type: "Diesel"
     - Status Badge: Active/Maintenance/Inactive
       - Active: Green background
       - Maintenance: Yellow background
       - Inactive: Red background

     **Petrol Nozzle:**
     - Background: Blue
     - Icon: ⛽
     - Nozzle ID: (e.g., "N002")
     - Fuel Type: "Petrol"
     - Status Badge: Active/Maintenance/Inactive

3. **Summary Statistics (Bottom Section)**

   **Four Summary Cards:**
   - **Total Islands:**
     - Background: Blue
     - Value: 4

   - **Pump Stations:**
     - Background: Green
     - Value: 4

   - **Total Nozzles:**
     - Background: Purple
     - Value: 8 (calculated from all islands)

   - **Active Nozzles:**
     - Background: Orange
     - Value: Count of nozzles with "Active" status

4. **Information Box**
   - Icon: ℹ️
   - Title: "Island Structure"
   - Bullet Points:
     - Each Island contains one Pump Station
     - Each Pump Station has 2 Nozzles (1 Diesel + 1 Petrol)
     - Nozzles can be in Active, Inactive, or Maintenance status
     - Use the readings page to record nozzle meter readings

### 5.2 Island Structure

**Default Configuration:**

**Island 1 (North Section):**
- Island ID: ISL-001
- Pump Station: PS-001
  - Nozzle N001 (Diesel) - Active
  - Nozzle N002 (Petrol) - Active

**Island 2 (South Section):**
- Island ID: ISL-002
- Pump Station: PS-002
  - Nozzle N003 (Diesel) - Active
  - Nozzle N004 (Petrol) - Active

**Island 3 (East Section):**
- Island ID: ISL-003
- Pump Station: PS-003
  - Nozzle N005 (Diesel) - Active
  - Nozzle N006 (Petrol) - Active

**Island 4 (West Section):**
- Island ID: ISL-004
- Pump Station: PS-004
  - Nozzle N007 (Diesel) - Active
  - Nozzle N008 (Petrol) - Active

### 5.3 Backend APIs

1. **GET `/api/v1/islands/`**
   - Returns all islands with pump stations and nozzles
   - Refreshes every 10 seconds

2. **GET `/api/v1/islands/{island_id}`**
   - Returns specific island details

3. **GET `/api/v1/islands/{island_id}/nozzles`**
   - Returns nozzles for specific island

4. **PUT `/api/v1/islands/{island_id}/nozzle/{nozzle_id}/status`**
   - Updates nozzle status
   - Input: `status` (Active/Maintenance/Inactive)

---

## 6. Readings Module

### 6.1 Readings Page (`/readings`)

**URL:** `http://localhost:3002/readings`
**Access:** All users (User, Supervisor, Owner)

**Purpose:** Record nozzle meter readings with OCR validation

**Page Layout:** Two-column layout (Form | Results)

### 6.2 Left Column: Reading Form

**Form Fields:**

1. **Nozzle ID**
   - **Type:** Text input
   - **Label:** "Nozzle ID"
   - **Placeholder:** "e.g., N001"
   - **Default:** "N001"
   - **Required:** Yes
   - **Description:** Unique identifier for the nozzle

2. **Reading Type**
   - **Type:** Dropdown select
   - **Label:** "Reading Type"
   - **Options:**
     - Opening
     - Closing
     - PreSale
     - PostSale
   - **Default:** "Opening"
   - **Required:** Yes
   - **Description:** Type of meter reading being recorded

3. **Upload Nozzle Image Section**
   - **Label:** "📷 Upload Nozzle Image (Auto-extracts number)"
   - **Border:** Dashed border, gray background

   **File Input:**
   - **Type:** File upload
   - **Accept:** image/* (all image formats)
   - **Action:** On file selection, automatically:
     1. Uploads image to backend
     2. Calls OCR preview endpoint
     3. Extracts number from image
     4. Displays extracted value in OCR Preview field

   **Loading State:**
   - Message: "🔍 Uploading and extracting numbers..."
   - Background: Blue

   **Success State:**
   - Message: "✓ Image uploaded and OCR completed"
   - Displays uploaded image thumbnail
   - Shows extracted number in OCR Preview field

4. **OCR Preview Value Field** (NEW - Always Visible)
   - **Type:** Read-only text input
   - **Label:** "OCR Preview Value (Extracted from Image)"
   - **Background:** Gray (disabled state)
   - **Placeholder:** "Upload image to extract value"
   - **Display:** Shows extracted number (e.g., "12345.67")
   - **Additional Info:**
     - Confidence: XX% (e.g., "Confidence: 89%")
     - Method: Real OCR or OCR Not Available

   **When OCR Fails:**
   - Warning icon: ⚠️
   - Message: "OCR Not Available"
   - Explanation: Tesseract OCR not installed or extraction failed
   - Instruction: "Please enter the reading manually from the image above"

5. **Manual Reading Value**
   - **Type:** Number input
   - **Label:** "Manual Reading Value (Enter what you see)"
   - **Step:** 0.01
   - **Placeholder:** "e.g., 12345.67"
   - **Required:** Yes
   - **Action:** On change, resets validation status
   - **Description:** User manually enters the meter reading

6. **Validate Button** (NEW - Always Visible)
   - **Label:** "🔍 Validate OCR vs Manual Reading"
   - **Color:** Purple
   - **Enabled When:** Both OCR preview value and manual value are present
   - **Disabled When:** Either value is missing
   - **Action:** Compares OCR value with manual value

   **Validation Results:**

   **Match (Values Within Tolerance):**
   - Background: Green
   - Icon: ✅
   - Message: "Values Match!"
   - Details:
     - OCR: [value]
     - Manual: [value]
     - Difference: [value]L
   - Status: "You can now proceed to submit the reading"

   **Mismatch (Values Exceed Tolerance):**
   - Background: Orange
   - Icon: ⚠️
   - Message: "Values Don't Match!"
   - Details:
     - OCR: [value]
     - Manual: [value]
     - Difference: [value]L
   - Warning: "Please verify the reading. You can still submit, but discrepancy will be recorded."

7. **OCR Confidence Minimum**
   - **Type:** Number input
   - **Label:** "OCR Confidence Minimum (0-1)"
   - **Step:** 0.01
   - **Min:** 0
   - **Max:** 1
   - **Default:** 0.85
   - **Required:** Yes
   - **Description:** "Minimum confidence level for OCR validation (default: 0.85)"

8. **Submit Reading Button**
   - **Type:** Submit button
   - **Label:** "Submit Reading"
   - **Color:** Blue
   - **Loading State:** "Submitting..."
   - **Disabled:** When loading
   - **Action:** Submits reading to backend for final validation

### 6.3 Right Column: Validation Result

**Display Sections:**

1. **Reading ID Card**
   - Background: Blue
   - Shows: Unique reading identifier
   - Example: "read-N001-12345"

2. **Status Card**
   - **Color-Coded:**
     - Green: Status = "VALID" (ok)
     - Yellow: Status = "warn"
     - Red: Status = "error"
   - **Display:** Status text (capitalized)

3. **Values Comparison Grid**

   **Manual Value Card:**
   - Background: Purple
   - Label: "Manual Value"
   - Value: Entered manual reading

   **OCR Value Card:**
   - Background: Indigo
   - Label: "OCR Value"
   - Value: OCR extracted value or "N/A"

4. **Discrepancy Card**
   - Background: Gray
   - Label: "Discrepancy"
   - Value: Difference in liters (e.g., "0.030 liters")

5. **OCR Method Card**
   - Background: Cyan
   - Label: "OCR Method"
   - **Values:**
     - 🎯 Real OCR - Tesseract
     - 🔄 Simulated OCR
     - 📝 No Image - Simulated
   - Shows: OCR confidence percentage

6. **Reasons Card** (If applicable)
   - Background: Orange
   - Shows: List of validation issues/reasons
   - Example: "Discrepancy exceeds tolerance"

**Empty State:**
- Message: "Submit a reading to see validation results"
- Centered, gray text

### 6.4 Workflow Information Box

**Title:** "How it works - OCR Validation Workflow"

**Steps:**
1. Take a photo of the nozzle meter reading
2. Upload the image - System extracts numbers using Tesseract OCR
3. OCR Preview Value is displayed in a read-only field
4. Manually enter the reading value you see on the meter
5. Click "Validate" to compare OCR vs Manual values
6. System shows match/mismatch status
7. Submit Reading - Final validation against tolerance thresholds (±0.2L or 5%)
8. Result: Returns status (VALID/warn/error) with full discrepancy details

**Note:** "Validation helps catch errors before submission. You can still submit if values don't match, but the discrepancy will be recorded."

### 6.5 Backend APIs

1. **POST `/api/v1/attachments`**
   - Uploads image file
   - Returns: `attachment_id` and `url`

2. **POST `/api/v1/ocr/preview/{attachment_id}`**
   - Performs OCR extraction on uploaded image
   - Returns:
     ```json
     {
       "ocr_value": 12345.67,
       "confidence": 0.89,
       "method": "real_ocr",
       "success": true,
       "tesseract_available": true,
       "message": "Real OCR extraction successful"
     }
     ```

3. **POST `/api/v1/nozzles/{nozzle_id}/readings`**
   - Input:
     ```json
     {
       "kind": "Opening",
       "manual_value": 12345.67,
       "attachment_id": "uuid",
       "ocr_conf_min": 0.85
     }
     ```
   - Returns: Full validation result with status, discrepancy, reasons

### 6.6 OCR Technology

**Tesseract OCR:**
- Version: 5.4.0
- Purpose: Extract numbers from nozzle meter images
- Configuration:
  - PSM Mode: 6 (uniform block of text)
  - Whitelist: 0123456789. (digits and decimal point only)
- Image Processing:
  - Converts to grayscale
  - Optimized for number recognition

**Validation Tolerances:**
- Absolute: ±0.2 liters
- Percentage: ±5% of reading value
- Whichever is greater is used

---

## 7. Sales Module

### 7.1 Sales Page (`/sales`)

**URL:** `http://localhost:3002/sales`
**Access:** Supervisor, Owner only

**Purpose:** Record fuel sales transactions

**Page Elements:**

1. **Header**
   - Title: "Sales"
   - Subtitle: "Record fuel sales transactions"

2. **Sales Form**
   - Fields would include:
     - Shift ID
     - Nozzle ID
     - Pre-reading
     - Post-reading
     - Volume dispensed
     - Cash received
   - Submit button

**Current Status:** Basic placeholder UI (to be enhanced based on user feedback)

### 7.2 Backend API

**POST `/api/v1/sales`**
- Records sale transaction
- Calculates volume dispensed
- Tracks cash received

---

## 8. Reports Module

### 8.1 Reports Page (`/reports`)

**URL:** `http://localhost:3002/reports`
**Access:** Supervisor, Owner only

**Purpose:** Generate and view operational reports

**Page Elements:**

1. **Header**
   - Title: "Reports"
   - Subtitle: "Generate and view operational reports"

2. **Report Options**
   - Daily Summary Report
   - Volume Variance Report
   - Cash Variance Report
   - Discrepancy Report

3. **Date Range Selector**
   - Start Date
   - End Date

**Current Status:** Basic placeholder UI (to be enhanced based on user feedback)

### 8.2 Backend API

**GET `/api/v1/reports/daily?date={date}`**
- Returns daily summary
- Includes volume records, cash variance, flags

---

## 9. Stock Movement

### 9.1 Stock Movement Page (`/stock-movement`)

**URL:** `http://localhost:3002/stock-movement`
**Access:** Supervisor, Owner only

**Purpose:** Receive fuel deliveries and track inventory

**Page Layout:** Two-column (Form | Result)

### 9.2 Left Column: Receive Delivery Form

**Form Fields:**

1. **Select Tank**
   - **Type:** Dropdown
   - **Label:** "Select Tank"
   - **Options:**
     - 🛢️ Diesel Tank (TANK-DIESEL)
     - ⛽ Petrol Tank (TANK-PETROL)
   - **Action:** Auto-updates fuel type

2. **Expected Volume (Liters)**
   - **Type:** Number input
   - **Label:** "Expected Volume (Liters)"
   - **Step:** 0.01
   - **Placeholder:** "e.g., 10000"
   - **Required:** Yes
   - **Description:** "Volume stated on delivery note"

3. **Actual Volume Delivered (Liters)**
   - **Type:** Number input
   - **Label:** "Actual Volume Delivered (Liters)"
   - **Step:** 0.01
   - **Placeholder:** "e.g., 9970"
   - **Required:** Yes
   - **Description:** "Volume measured at receiving"

4. **Supplier (Optional)**
   - **Type:** Text input
   - **Label:** "Supplier (Optional)"
   - **Placeholder:** "e.g., Total Kenya"

5. **Delivery Note (Optional)**
   - **Type:** Textarea
   - **Label:** "Delivery Note (Optional)"
   - **Rows:** 3
   - **Placeholder:** "Additional notes about this delivery..."

6. **Receive Delivery Button**
   - **Type:** Submit
   - **Label:** "Receive Delivery"
   - **Color:** Blue
   - **Loading State:** "Processing..."

### 9.3 Right Column: Delivery Result

**Result Display:**

1. **Success Message Card**
   - Background: Green
   - Icon: ✓
   - Message: "Delivery received for [Fuel Type] tank"
   - Delivery ID: e.g., "DEL-0001"

2. **Tank Level Comparison**

   **Previous Level Card:**
   - Background: Blue
   - Shows: Tank level before delivery

   **New Level Card:**
   - Background: Green
   - Shows: Tank level after delivery

3. **Volume Added Card**
   - Background: Purple
   - Large display: Volume added in liters
   - Shows: New tank percentage (e.g., "Tank now 75.0% full")

4. **Loss Analysis Card**

   **Acceptable Loss (Green):**
   - Icon: ✓
   - Title: "Loss Analysis"
   - Details Grid:
     - Actual Loss: [value]L ([percent]%)
     - Allowable Loss: [value]L ([percent]%)
   - Message: "Loss is acceptable. Actual: X.XXL (X.XX%), Allowable: X.XXL (X.X%)"

   **Excessive Loss (Orange):**
   - Icon: ⚠️
   - Same layout but orange background
   - Indicates loss exceeds allowable threshold

### 9.4 Delivery History Table

**Title:** "📋 Recent Deliveries"

**Columns:**
1. Delivery ID
2. Timestamp
3. Fuel Type
4. Delivered (liters)
5. Loss (liters and percentage)
6. Status (acceptable/excessive badge)

**Features:**
- Shows up to 50 recent deliveries
- Auto-refreshes every 10 seconds
- Color-coded status badges

### 9.5 Backend APIs

1. **POST `/api/v1/tanks/delivery`**
   - Input:
     ```json
     {
       "tank_id": "TANK-DIESEL",
       "fuel_type": "Diesel",
       "expected_volume": 10000,
       "volume_delivered": 9970,
       "supplier": "Total Kenya",
       "delivery_note": "Morning delivery"
     }
     ```
   - Returns: Complete delivery result with loss analysis

2. **GET `/api/v1/tanks/deliveries?limit=50`**
   - Returns delivery history
   - Sorted by timestamp (newest first)

3. **GET `/api/v1/tanks/levels`**
   - Returns current tank levels
   - Used by dashboard tank cards

---

## 10. Settings

### 10.1 Settings Page (`/settings`)

**URL:** `http://localhost:3002/settings`
**Access:** Owner only

**Purpose:** Configure system parameters and pricing

**Page Layout:** Single column form

### 10.2 Settings Form

**Section 1: Fuel Pricing** 💰

**Fields:**

1. **Diesel Price per Liter**
   - **Type:** Number input
   - **Label:** "Diesel Price per Liter"
   - **Step:** 0.01
   - **Currency Display:** ZMW (Zambian Kwacha)
   - **Default:** 150.00 ZMW
   - **Required:** Yes

2. **Petrol Price per Liter**
   - **Type:** Number input
   - **Label:** "Petrol Price per Liter"
   - **Step:** 0.01
   - **Currency Display:** ZMW
   - **Default:** 160.00 ZMW
   - **Required:** Yes

**Section 2: Allowable Losses During Offloading** 📊

**Purpose:** Configure acceptable fuel loss percentages during delivery

**Fields:**

1. **Diesel Allowable Loss (%)**
   - **Type:** Number input
   - **Label:** "Diesel Allowable Loss (%)"
   - **Step:** 0.01
   - **Min:** 0
   - **Max:** 5
   - **Default:** 0.3%
   - **Required:** Yes
   - **Description:** "Default: 0.3% loss during delivery"

2. **Petrol Allowable Loss (%)**
   - **Type:** Number input
   - **Label:** "Petrol Allowable Loss (%)"
   - **Step:** 0.01
   - **Min:** 0
   - **Max:** 5
   - **Default:** 0.5%
   - **Required:** Yes
   - **Description:** "Default: 0.5% loss during delivery"

**Save Settings Button:**
- **Label:** "Save Settings"
- **Color:** Blue
- **Full Width:** Yes
- **Loading State:** "Saving..."
- **Success Message:** "✓ Settings updated successfully!" (auto-dismisses after 3 seconds)

### 10.3 Information Box

**Title:** "ℹ️ About Allowable Losses"

**Information:**
- Allowable losses account for evaporation and spillage during fuel delivery
- Typical industry standards: Diesel 0.2-0.4%, Petrol 0.3-0.6%
- Losses exceeding these thresholds will be flagged in delivery reports
- These settings are used to validate stock movements and calculate expected inventory

### 10.4 Backend API

**GET `/api/v1/settings/fuel`**
- Returns current settings

**PUT `/api/v1/settings/fuel`**
- Input: All four settings values
- Returns: Success confirmation

---

## 11. Backend Architecture

### 11.1 API Structure

**Base URL:** `http://localhost:8000/api/v1`

**API Modules:**

1. **Authentication** (`/auth`)
   - Login, logout, user management
   - Session-based authentication
   - Password hashing with SHA-256

2. **Attachments** (`/attachments`)
   - Image upload and storage
   - File management

3. **OCR** (`/ocr`)
   - OCR preview extraction
   - Tesseract integration

4. **Islands** (`/islands`)
   - Island, pump station, nozzle management
   - Hierarchical data structure

5. **Readings** (`/nozzles`)
   - Meter reading submission
   - OCR validation
   - Discrepancy detection

6. **Sales** (`/sales`)
   - Sales transaction recording
   - Volume calculations

7. **Reports** (`/reports`)
   - Daily summaries
   - Variance reports

8. **Discrepancies** (`/discrepancies`)
   - Discrepancy flagging
   - Alert management

9. **Tanks** (`/tanks`)
   - Tank level monitoring
   - Stock delivery management
   - Delivery history

10. **Settings** (`/settings`)
    - System configuration
    - Pricing and loss parameters

### 11.2 Data Storage

**Current Implementation:**
- In-memory dictionaries (Python)
- Session storage for authentication

**Production Recommendation:**
- PostgreSQL database
- Redis for session management
- File storage for images

### 11.3 Real-Time Updates

**Polling Intervals:**
- Tank levels: 5 seconds
- Islands/Nozzles: 10 seconds
- Deliveries: 10 seconds
- Discrepancies: Real-time on page load

---

## 12. Data Models

### 12.1 User Model

```json
{
  "user_id": "U001",
  "username": "user1",
  "full_name": "Fashon Sakala",
  "role": "user|supervisor|owner",
  "station_id": "ST001"
}
```

### 12.2 Island Model

```json
{
  "island_id": "ISL-001",
  "name": "Island 1",
  "location": "North Section",
  "pump_station": {
    "pump_station_id": "PS-001",
    "island_id": "ISL-001",
    "name": "Pump Station 1",
    "nozzles": [
      {
        "nozzle_id": "N001",
        "pump_station_id": "PS-001",
        "fuel_type": "Diesel",
        "status": "Active"
      },
      {
        "nozzle_id": "N002",
        "pump_station_id": "PS-001",
        "fuel_type": "Petrol",
        "status": "Active"
      }
    ]
  }
}
```

### 12.3 Tank Level Model

```json
{
  "tank_id": "TANK-DIESEL",
  "fuel_type": "Diesel",
  "current_level": 15000.0,
  "capacity": 20000.0,
  "last_updated": "2025-12-17T08:51:10",
  "percentage": 75.0
}
```

### 12.4 Reading Model

```json
{
  "reading_id": "read-N001-12345",
  "nozzle_id": "N001",
  "kind": "Opening",
  "manual_value": 12345.67,
  "ocr_value": 12345.67,
  "ocr_confidence": 0.89,
  "ocr_method": "real_ocr",
  "attachment_id": "uuid",
  "discrepancy": 0.0,
  "status": "VALID",
  "reasons": [],
  "timestamp": "2025-12-17T10:30:00"
}
```

### 12.5 Delivery Model

```json
{
  "delivery_id": "DEL-0001",
  "timestamp": "2025-12-17T09:00:00",
  "tank_id": "TANK-DIESEL",
  "fuel_type": "Diesel",
  "expected_volume": 10000,
  "volume_delivered": 9970,
  "actual_loss": 30.0,
  "actual_loss_percent": 0.3,
  "allowable_loss": 30.0,
  "allowable_loss_percent": 0.3,
  "loss_status": "acceptable",
  "previous_level": 15000,
  "new_level": 24970,
  "supplier": "Total Kenya",
  "delivery_note": "Morning delivery"
}
```

---

## 13. Future Enhancements

### 13.1 Recommended Additions

**High Priority:**

1. **User Management Interface**
   - Add/Edit/Delete users
   - Assign roles and permissions
   - Password reset functionality

2. **Enhanced Reporting**
   - PDF export
   - Excel export
   - Custom date ranges
   - Graphical dashboards
   - Trend analysis

3. **Sales Module Enhancement**
   - Complete sales workflow
   - Shift management
   - Cash reconciliation
   - Receipt printing

4. **Nozzle Management**
   - Add/Edit/Delete nozzles
   - Status change tracking
   - Maintenance scheduling
   - Calibration records

5. **Audit Trail**
   - All user actions logged
   - Timestamp and user tracking
   - Change history

**Medium Priority:**

6. **Mobile App**
   - Native mobile application
   - Camera integration for OCR
   - Offline mode

7. **Alerts & Notifications**
   - Email notifications
   - SMS alerts
   - Low inventory warnings
   - Excessive discrepancy alerts

8. **Advanced OCR**
   - Multiple image formats support
   - Batch processing
   - Manual correction interface
   - OCR training for better accuracy

9. **Tank Management**
   - Tank calibration
   - Temperature compensation
   - Historical level tracking
   - Leak detection

10. **Integration Capabilities**
    - Accounting software integration
    - Payment gateway integration
    - Government reporting APIs

**Low Priority:**

11. **Dashboard Customization**
    - User-configurable widgets
    - Custom KPIs
    - Role-based dashboards

12. **Backup & Recovery**
    - Automated backups
    - Data export/import
    - Disaster recovery procedures

### 13.2 Known Limitations

1. **Data Persistence:** Currently uses in-memory storage; data is lost on server restart
2. **Authentication:** Basic password hashing; recommend bcrypt or Argon2 for production
3. **File Storage:** Images stored locally; recommend cloud storage (AWS S3, etc.)
4. **Concurrency:** No handling of simultaneous edits by multiple users
5. **Validation:** Limited business rule enforcement
6. **Testing:** No automated test coverage

### 13.3 Performance Considerations

**Current:**
- Frontend: Client-side rendering
- Backend: Synchronous API calls
- Database: In-memory (fast but not persistent)

**Production Recommendations:**
- Implement caching (Redis)
- Add database indexing
- Use connection pooling
- Implement request rate limiting
- Add CDN for static assets
- Consider microservices architecture for scale

---

## 14. User Feedback Questions

### 14.1 General Workflow

1. Does the overall system flow match your daily operations?
2. Are there additional user roles needed?
3. What reports are most critical for your business?

### 14.2 Islands & Nozzles

4. Is the island structure (1 pump station per island, 2 nozzles per station) correct?
5. Do you need ability to have different configurations (e.g., 4 nozzles per station)?
6. What nozzle information is missing?

### 14.3 Readings & OCR

7. Is the OCR validation workflow helpful?
8. Should OCR be mandatory or optional?
9. What tolerance levels work best for your operation?
10. Do you need photo storage for audit purposes?

### 14.4 Stock Movement

11. Are the allowable loss percentages (0.3% diesel, 0.5% petrol) appropriate?
12. What supplier information should be tracked?
13. Should deliveries require approval workflow?

### 14.5 Settings & Configuration

14. What other parameters need to be configurable?
15. Should pricing vary by time of day or customer type?
16. Do you need tax configuration?

### 14.6 Sales Module

17. What sales data points are essential?
18. How do you handle shift changes?
19. Do you need customer receipts?
20. What payment methods do you accept?

### 14.7 Reports

21. What time periods for reports (daily, weekly, monthly)?
22. What metrics are most important?
23. Who needs access to which reports?

---

## 15. Technical Requirements

### 15.1 Server Requirements

**Development/Testing:**
- CPU: 2+ cores
- RAM: 4GB minimum
- Storage: 10GB
- OS: Windows/Linux/macOS

**Production:**
- CPU: 4+ cores
- RAM: 8GB minimum
- Storage: 100GB+ (depending on image storage)
- OS: Linux (Ubuntu 20.04+)

### 15.2 Client Requirements

**Browser Support:**
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

**Mobile:**
- iOS 14+
- Android 10+

**Screen Resolution:**
- Minimum: 1024x768
- Recommended: 1920x1080

### 15.3 Network Requirements

- Bandwidth: 10 Mbps minimum
- Latency: <100ms recommended
- Stable internet connection for real-time updates

---

## 16. Support & Maintenance

### 16.1 System Access

**Demo URLs:**
- Frontend: http://localhost:3002
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

### 16.2 Default Credentials

See Section 2.1 for all user accounts

### 16.3 Backup Procedures

**Current:** No automated backups (in-memory data)

**Recommended for Production:**
- Daily database backups
- Weekly full system backups
- Offsite backup storage
- 30-day retention policy

---

## Appendix A: API Endpoints Reference

### Authentication
- POST `/api/v1/auth/login` - User login
- POST `/api/v1/auth/logout` - User logout
- GET `/api/v1/auth/me` - Get current user
- GET `/api/v1/auth/users` - List all users

### Islands
- GET `/api/v1/islands/` - Get all islands
- GET `/api/v1/islands/{island_id}` - Get island details
- GET `/api/v1/islands/{island_id}/nozzles` - Get island nozzles
- POST `/api/v1/islands/` - Create island
- PUT `/api/v1/islands/{island_id}/nozzle/{nozzle_id}/status` - Update nozzle status

### Readings
- POST `/api/v1/nozzles/{nozzle_id}/readings` - Submit reading

### Attachments
- POST `/api/v1/attachments` - Upload image

### OCR
- POST `/api/v1/ocr/preview/{attachment_id}` - OCR preview

### Tanks
- GET `/api/v1/tanks/levels` - Get tank levels
- POST `/api/v1/tanks/delivery` - Receive delivery
- GET `/api/v1/tanks/deliveries` - Get delivery history

### Settings
- GET `/api/v1/settings/fuel` - Get fuel settings
- PUT `/api/v1/settings/fuel` - Update fuel settings

### Reports
- GET `/api/v1/reports/daily` - Get daily report

### Discrepancies
- GET `/api/v1/discrepancies` - Get discrepancies

---

## Document Control

**Version:** 1.0
**Date:** December 17, 2025
**Status:** Draft for Review
**Next Review:** After user feedback session

**Change Log:**
- v1.0 (2025-12-17): Initial prototype documentation

---

*End of Document*
