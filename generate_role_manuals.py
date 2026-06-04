#!/usr/bin/env python3
"""Generate comprehensive PDF manuals for each role:
   ATTENDANT_MANUAL.pdf, SUPERVISOR_MANUAL.pdf, MANAGER_MANUAL.pdf, OWNER_MANUAL.pdf
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, cm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, ListFlowable, ListItem,
)

# -- Colours -----------------------------------------------------------------
BLUE = HexColor("#2c5aa0")
DARK = HexColor("#1a1a1a")
GREY = HexColor("#555555")
LIGHT_BLUE = HexColor("#e8f0fe")
LIGHT_GREY = HexColor("#f5f5f5")
GREEN = HexColor("#1a7a2e")
ORANGE = HexColor("#b45309")
RED = HexColor("#b91c1c")
WHITE = HexColor("#ffffff")

# -- Styles ------------------------------------------------------------------
styles = getSampleStyleSheet()
title_style = ParagraphStyle("Title", parent=styles["Heading1"], fontSize=24,
    textColor=DARK, spaceAfter=6, alignment=TA_CENTER)
subtitle_style = ParagraphStyle("Subtitle", parent=styles["Normal"], fontSize=12,
    textColor=GREY, spaceAfter=24, alignment=TA_CENTER)
h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=17,
    textColor=BLUE, spaceBefore=20, spaceAfter=10)
h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=14,
    textColor=BLUE, spaceBefore=14, spaceAfter=8)
h3 = ParagraphStyle("H3", parent=styles["Heading3"], fontSize=12,
    textColor=DARK, spaceBefore=10, spaceAfter=6)
body = ParagraphStyle("Body", parent=styles["Normal"], fontSize=10,
    textColor=DARK, spaceAfter=6, alignment=TA_JUSTIFY, leading=14)
body_indent = ParagraphStyle("BodyIndent", parent=body, leftIndent=20)
bullet_style = ParagraphStyle("Bullet", parent=body, leftIndent=28,
    bulletIndent=14, spaceBefore=2, spaceAfter=2)
note_style = ParagraphStyle("Note", parent=body, fontSize=9, textColor=GREY,
    leftIndent=12, rightIndent=12, spaceBefore=6, spaceAfter=6,
    borderColor=HexColor("#dddddd"), borderWidth=0.5, borderPadding=6,
    backColor=LIGHT_GREY)
step_style = ParagraphStyle("Step", parent=body, leftIndent=20,
    spaceBefore=3, spaceAfter=3, fontSize=10)
role_banner = ParagraphStyle("RoleBanner", parent=styles["Heading1"],
    fontSize=14, textColor=WHITE, alignment=TA_CENTER, spaceBefore=0,
    spaceAfter=0, backColor=BLUE, borderPadding=(8, 12, 8, 12))
table_header = ParagraphStyle("TH", parent=body, fontSize=9, textColor=WHITE, alignment=TA_CENTER)
table_cell = ParagraphStyle("TD", parent=body, fontSize=9, alignment=TA_CENTER)
table_cell_left = ParagraphStyle("TDL", parent=body, fontSize=9, alignment=TA_LEFT)

sp = Spacer(1, 6)
sp2 = Spacer(1, 12)
sp3 = Spacer(1, 20)

def B(t): return f"<b>{t}</b>"
def I(t): return f"<i>{t}</i>"
def BI(t): return f"<b><i>{t}</i></b>"

def make_table(headers, rows, col_widths=None):
    data = [[Paragraph(h, table_header) for h in headers]]
    for row in rows:
        data.append([Paragraph(str(c), table_cell_left if i == 0 else table_cell)
                      for i, c in enumerate(row)])
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BLUE),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT_GREY]),
        ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#cccccc")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t

def cover_page(story, role_name, role_desc):
    story.append(Spacer(1, 100))
    story.append(Paragraph("NextStop Fuel Management System", title_style))
    story.append(Spacer(1, 8))
    story.append(Paragraph(f"{role_name} Manual", title_style))
    story.append(Spacer(1, 16))
    story.append(Paragraph("April 2026", subtitle_style))
    story.append(Spacer(1, 30))
    story.append(Paragraph(role_desc, body))
    story.append(PageBreak())

def toc_section(story, items):
    story.append(Paragraph("Table of Contents", h1))
    for i, item in enumerate(items, 1):
        story.append(Paragraph(f"{i}. {item}", body))
    story.append(PageBreak())

def section(story, title):
    story.append(Paragraph(title, h1))

def sub(story, title):
    story.append(Paragraph(title, h2))

def sub2(story, title):
    story.append(Paragraph(title, h3))

def para(story, text):
    story.append(Paragraph(text, body))

def indent(story, text):
    story.append(Paragraph(text, body_indent))

def bull(story, text):
    story.append(Paragraph(text, bullet_style))

def note(story, text):
    story.append(Paragraph(text, note_style))

def step(story, num, text):
    story.append(Paragraph(f"{B(f'Step {num}:')} {text}", step_style))

def build_pdf(filename, build_fn):
    doc = SimpleDocTemplate(filename, pagesize=A4,
        rightMargin=60, leftMargin=60, topMargin=50, bottomMargin=40)
    story = []
    build_fn(story)
    doc.build(story)
    print(f"  Generated: {filename}")


# ============================================================================
# ATTENDANT MANUAL
# ============================================================================
def build_attendant(s):
    cover_page(s, "Attendant",
        "This manual covers everything an attendant needs to know to operate "
        "the NextStop Fuel Management System. It walks through your daily "
        "workflow from login to shift handover, including nozzle readings, "
        "fuel sales, LPG and lubricant operations, safe deposits, and cash "
        "reconciliation.")

    toc_section(s, [
        "Getting Started",
        "Your Dashboard",
        "Shift Workflow Overview",
        "Opening Readings",
        "During Your Shift",
        "Safe Deposits",
        "LPG Operations",
        "Lubricant Sales",
        "Credit Sales",
        "Closing Readings",
        "Cash Declaration & Handover",
        "After Submission",
        "Notifications",
        "Troubleshooting & FAQ",
    ])

    # 1. Getting Started
    section(s, "1. Getting Started")
    sub(s, "1.1 Logging In")
    para(s, "Open the system in your browser. Enter your username and password provided by your supervisor or manager, then click " + B("Login") + ".")
    para(s, "Your account is role-locked as " + B("Attendant") + ". You will see a simplified menu with only the pages relevant to your duties.")
    note(s, "If you cannot log in, ask your supervisor to check that your account is enabled and to reset your password if needed.")

    sub(s, "1.2 Navigation")
    para(s, "As an attendant, your menu contains:")
    s.append(make_table(["Menu", "Page", "Purpose"], [
        ["My Shift", "Readings Verification", "Review and submit your nozzle readings"],
        ["My Shift", "Shift Closing", "Declare cash and submit handover"],
        ["Operations", "Shifts", "View shift schedule and assignments"],
        ["Operations", "Enter Readings", "Enter opening and closing nozzle readings"],
    ], col_widths=[80, 130, 260]))
    s.append(sp2)
    para(s, "You also have access to LPG Daily, Lubricants Daily, and Credit Accounts through the Operations menu when sales need to be recorded.")

    # 2. Dashboard
    section(s, "2. Your Dashboard")
    para(s, "The dashboard shows a summary of the current day including tank levels and your active shift status. If you have an active shift, it will be displayed prominently.")
    para(s, "If a safe deposit is overdue, a " + B("red alert banner") + " will appear at the top of every page until you make the deposit.")

    # 3. Shift Workflow
    section(s, "3. Shift Workflow Overview")
    para(s, "Your shift follows this sequence:")
    step(s, 1, "Your supervisor creates the shift and assigns you to specific nozzles")
    step(s, 2, "You enter " + B("opening readings") + " (electronic and mechanical) for each assigned nozzle")
    step(s, 3, "You serve customers throughout your shift")
    step(s, 4, "You make " + B("safe deposits") + " periodically (every hour or at K1,500)")
    step(s, 5, "You record any " + B("LPG, lubricant, or credit sales"))
    step(s, 6, "At shift end, you enter " + B("closing readings") + " for each nozzle")
    step(s, 7, "You declare your " + B("cash amount") + " and submit the handover")
    step(s, 8, "Your supervisor reviews and approves or returns your handover")

    # 4. Opening Readings
    section(s, "4. Opening Readings")
    sub(s, "4.1 Navigating to Enter Readings")
    para(s, "Go to " + B("Operations -> Enter Readings") + ". The system automatically loads your active shift and shows the nozzles assigned to you.")
    sub(s, "4.2 Entering Values")
    para(s, "For each nozzle, enter:")
    bull(s, B("Electronic Opening Reading") + " -- the digital meter value on the pump display")
    bull(s, B("Mechanical Opening Reading") + " -- the mechanical totaliser value")
    para(s, "Both readings should match the values left by the previous shift's attendant. If they don't, add a note explaining the discrepancy.")
    sub(s, "4.3 Meter Discrepancy")
    para(s, "The system compares your electronic and mechanical readings. If the difference exceeds the configured threshold (e.g. 0.5%), you " + B("must") + " provide a note explaining why. The system will block submission without the note.")
    note(s, "Common reasons for discrepancy: meter was reset, mechanical counter stuck, display error. Always note the actual cause.")

    # 5. During Shift
    section(s, "5. During Your Shift")
    para(s, "Your primary job is serving customers at the pumps. The meters record volumes automatically. You do not need to enter individual sales into the system -- the opening and closing readings capture the total volume sold.")
    para(s, "However, you may need to record:")
    bull(s, B("LPG cylinder sales") + " (if your station sells LPG)")
    bull(s, B("Lubricant sales") + " (engine oil, brake fluid, etc.)")
    bull(s, B("Credit sales") + " (fuel sold on account to corporate customers)")

    # 6. Safe Deposits
    section(s, "6. Safe Deposits")
    para(s, "You are required to deposit cash into the safe " + B("periodically") + " during your shift. The system monitors this and will alert you if a deposit is overdue.")
    sub(s, "6.1 When to Deposit")
    bull(s, "Every hour, OR")
    bull(s, "When cash in hand exceeds K1,500")
    sub(s, "6.2 How to Deposit")
    step(s, 1, "Go to " + B("My Shift -> Readings Verification"))
    step(s, 2, "Find the Safe Deposits section")
    step(s, 3, "Enter the deposit amount and any notes")
    step(s, 4, "Click " + B("Submit Deposit"))
    para(s, "The deposit is recorded with a timestamp. You can make multiple deposits per shift.")
    note(s, "If the overdue alert appears in the header bar, make a deposit immediately. The alert will clear once the deposit is recorded.")

    # 7. LPG
    section(s, "7. LPG Operations")
    para(s, "If your station sells LPG, go to " + B("Operations -> LPG Daily") + ".")
    sub(s, "7.1 Recording LPG Sales")
    para(s, "The system shows your opening cylinder inventory (carried forward from the previous shift). For each cylinder size (3kg, 6kg, 9kg, 19kg, 45kg, 48kg), enter:")
    bull(s, B("Refills sold") + " -- number of customer cylinders refilled")
    bull(s, B("Full cylinders sold") + " -- number of new/full cylinders sold")
    para(s, "The system calculates revenue based on the configured pricing.")
    sub(s, "7.2 Accessory Sales")
    para(s, "If you sell LPG accessories (stoves, regulators, hoses, clips), record them in the Accessories section with quantities sold.")

    # 8. Lubricants
    section(s, "8. Lubricant Sales")
    para(s, "Go to " + B("Operations -> Lubricants Daily") + ".")
    para(s, "Select the location (Island 3 or Buffer) and record:")
    bull(s, B("Additions") + " -- stock received or transferred in")
    bull(s, B("Sold/Drawn") + " -- quantities sold to customers")
    para(s, "The system tracks opening balance, additions, sales, and closing balance per product.")

    # 9. Credit Sales
    section(s, "9. Credit Sales")
    para(s, "If a customer purchases fuel on a credit account (corporate, institutional), record it in " + B("Credit Accounts") + ".")
    step(s, 1, "Select the customer's account")
    step(s, 2, "Enter fuel type, volume, and price per litre")
    step(s, 3, "Submit the credit sale")
    para(s, "Credit sales are deducted from the cash you are expected to hand over, so your cash declaration should reflect only physical cash and POS receipts collected.")

    # 10. Closing Readings
    section(s, "10. Closing Readings")
    para(s, "At the end of your shift, go to " + B("Operations -> Enter Readings") + " and enter your closing values:")
    bull(s, B("Electronic Closing Reading") + " for each nozzle")
    bull(s, B("Mechanical Closing Reading") + " for each nozzle")
    para(s, "The system calculates:")
    bull(s, "Volume dispensed = Closing - Opening (for each meter type)")
    bull(s, "Discrepancy % between electronic and mechanical")
    bull(s, "Revenue = volume x price per litre")
    note(s, "If the discrepancy exceeds the threshold, you must add a note before submission. The system will not accept the readings without it.")

    # 11. Cash Declaration
    section(s, "11. Cash Declaration & Handover")
    sub(s, "11.1 Navigating to Shift Closing")
    para(s, "Go to " + B("My Shift -> Shift Closing") + ".")
    sub(s, "11.2 What You Enter")
    bull(s, B("Actual Cash") + " -- total physical cash you are handing over")
    bull(s, B("POS Receipts") + " -- total from card/mobile payments (if any)")
    bull(s, B("Credit Sales") + " -- system auto-populates from recorded credit sales")
    bull(s, B("Notes") + " -- any explanation for shortages or overages")
    sub(s, "11.3 System Calculation")
    para(s, "The system calculates:")
    bull(s, B("Expected Cash") + " = fuel revenue + LPG + accessories + lubricants")
    bull(s, B("Total Accounted") + " = actual cash + POS + credit sales")
    bull(s, B("Difference") + " = total accounted - expected (negative = shortage)")
    sub(s, "11.4 Submitting")
    para(s, "Click " + B("Submit Handover") + ". Your handover goes to your supervisor for review. You cannot edit it after submission unless the supervisor returns it to you.")

    # 12. After Submission
    section(s, "12. After Submission")
    para(s, "Once you submit your handover:")
    bull(s, "Your supervisor sees it in the " + B("Handover Review") + " queue")
    bull(s, "They will either " + B("Approve") + " it (your shift is done) or " + B("Return") + " it with a note explaining what needs correction")
    bull(s, "If returned, you must re-enter the corrected data and resubmit")
    note(s, "You will receive a notification when your handover is approved or returned. Check Notifications if unsure of the status.")

    # 13. Notifications
    section(s, "13. Notifications")
    para(s, "You receive notifications for:")
    bull(s, "Handover approved or returned")
    bull(s, "Shift auto-closed (if you forgot to submit)")
    bull(s, "Safe deposit overdue alerts")
    bull(s, "Price changes that occurred during your shift")
    para(s, "Check the " + B("Notifications") + " page for your full history.")

    # 14. Price Changes During Shift
    section(s, "14. Price Changes During Your Shift")
    para(s, "If the owner or manager scheduled a fuel price change that falls during your shift, the system handles it automatically.")
    bull(s, "Your handover summary may show " + B("two price lines") + " for the same fuel type (old price and new price)")
    bull(s, "Revenue is calculated correctly using the right price for each portion of the shift")
    bull(s, "No action is required from you")

    # 15. FAQ
    section(s, "15. Troubleshooting & FAQ")
    faqs = [
        ("I cannot log in", "Ask your supervisor to check your account is enabled and reset your password if needed."),
        ("I don't see my shift", "Your supervisor may not have created the shift yet or may not have assigned you. Ask them to check."),
        ("The system won't accept my readings", "Check if there is a meter discrepancy exceeding the threshold. Add a note explaining the difference."),
        ("I made a mistake in my readings", "If you haven't submitted the handover yet, you can go back and correct them. If already submitted, ask your supervisor to return the handover."),
        ("My cash is short", "Enter the actual amount honestly. Add a note explaining any known reasons (e.g., gave change, fuel spill). Your supervisor will review."),
        ("The safe deposit alert won't go away", "Make a deposit through the My Shift page. The alert clears once the deposit is recorded."),
        ("I see two prices on my handover", "A price change occurred during your shift. This is normal -- the system splits revenue at the changeover time."),
    ]
    for q, a in faqs:
        para(s, B("Q: " + q))
        indent(s, "A: " + a)
        s.append(sp)

    s.append(Spacer(1, 30))
    para(s, "-- End of Attendant Manual --")


# ============================================================================
# SUPERVISOR MANUAL
# ============================================================================
def build_supervisor(s):
    cover_page(s, "Supervisor",
        "This manual covers all supervisor responsibilities in the NextStop "
        "Fuel Management System. Supervisors manage shifts, review attendant "
        "handovers, record tank dip readings, oversee fuel deliveries, manage "
        "LPG and lubricant operations, and monitor station performance through "
        "reports and reconciliation tools.")

    toc_section(s, [
        "Getting Started",
        "Dashboard Overview",
        "Shift Management",
        "Enter Readings (Supervisor View)",
        "Handover Review",
        "Daily Tank Readings",
        "Fuel Operations & Deliveries",
        "LPG Operations",
        "Lubricant Operations",
        "Inventory & Tank Levels",
        "Sales & Credit Accounts",
        "Reconciliation",
        "Reports & Analytics",
        "Notifications & Alerts",
        "Price Changes & Scheduling",
        "FAQ",
    ])

    # 1
    section(s, "1. Getting Started")
    para(s, "Log in with your supervisor credentials. Your menu includes all attendant pages plus Operations management, Inventory, Reconciliation, and Reports.")
    para(s, "As a supervisor you " + B("cannot") + " access: User Management, Settings, Daily Close-Off, Infrastructure, or Stations. Those are reserved for managers and owners.")

    # 2
    section(s, "2. Dashboard Overview")
    para(s, "The dashboard shows:")
    bull(s, B("Tank Levels") + " -- current Diesel and Petrol levels with capacity percentages")
    bull(s, B("Daily Summary") + " -- volume records, cash variance count, flags")
    bull(s, B("Active Shift") + " -- current shift status and assigned attendants")
    bull(s, B("Recent Discrepancies") + " -- anomalies detected in the last 24 hours")
    para(s, "You can submit dip readings directly from the dashboard tank cards.")

    # 3
    section(s, "3. Shift Management")
    sub(s, "3.1 Creating a Shift")
    para(s, "Go to " + B("Operations -> Shifts") + " and click " + B("Create New Shift") + ".")
    step(s, 1, "Select the " + B("Date"))
    step(s, 2, "Select " + B("Shift Type") + " (Day: 06:00-18:00, Night: 18:00-06:00)")
    step(s, 3, "Assign attendants to nozzles using the assignment grid")
    step(s, 4, "Click " + B("Create Shift"))
    note(s, "Each attendant can only be assigned to one active shift at a time. Nozzles can only belong to one island.")

    sub(s, "3.2 Managing Active Shifts")
    bull(s, B("View") + " -- see shift details, assigned attendants, and reading status")
    bull(s, B("Deactivate") + " -- close a shift early (e.g., if created in error)")
    bull(s, B("Check Stale") + " -- identify shifts where readings haven't been submitted in time")

    # 4
    section(s, "4. Enter Readings (Supervisor View)")
    para(s, "As a supervisor, you can view readings for " + B("any shift") + " (not just your own). Use the shift dropdown to select which shift to review.")
    para(s, "You can also enter readings on behalf of an attendant if needed.")

    # 5
    section(s, "5. Handover Review")
    para(s, "This is your most critical function. Go to " + B("Operations -> Handover Review") + ".")
    sub(s, "5.1 Review Queue")
    para(s, "The queue shows all submitted handovers with:")
    bull(s, "Attendant name, date, shift type")
    bull(s, "Nozzle readings summary (electronic vs mechanical, discrepancy %)")
    bull(s, "Fuel revenue breakdown")
    bull(s, "LPG, lubricant, and accessory sales")
    bull(s, "Credit sales with account details")
    bull(s, "Expected cash vs actual cash and difference")
    bull(s, "Auto-flag indicators (meter deviation, cash shortage)")

    sub(s, "5.2 Status Badges")
    s.append(make_table(["Status", "Meaning"], [
        ["Pending Review", "Submitted by attendant, awaiting your action"],
        ["Flagged", "Auto-flagged for meter deviation or cash shortage"],
        ["Approved", "You approved this handover"],
        ["Returned", "You returned it to the attendant for correction"],
    ], col_widths=[120, 350]))
    s.append(sp)

    sub(s, "5.3 Approving a Handover")
    step(s, 1, "Review all readings, sales, and cash figures")
    step(s, 2, "Check any auto-flags and verify the attendant's notes")
    step(s, 3, "Click " + B("Approve"))
    para(s, "Approved handovers are locked and count toward the daily close-off.")

    sub(s, "5.4 Returning a Handover")
    step(s, 1, "Click " + B("Return"))
    step(s, 2, "Enter a note explaining what needs correction")
    para(s, "The attendant's shift closing form unlocks and they must re-enter and resubmit.")

    sub(s, "5.5 Batch Approve")
    para(s, "You can select multiple handovers and approve them in one action.")

    # 6
    section(s, "6. Daily Tank Readings")
    para(s, "Go to " + B("Operations -> Daily Tank Reading") + ".")
    sub(s, "6.1 Recording Dip Readings")
    step(s, 1, "Select the " + B("Tank") + " (Diesel or Petrol)")
    step(s, 2, "Enter " + B("Opening Dip") + " (cm) at start of shift")
    step(s, 3, "Enter " + B("Closing Dip") + " (cm) at end of shift")
    step(s, 4, "If a delivery occurred, enter " + B("After Delivery Dip") + " (cm)")
    para(s, "The system converts cm to litres using the tank's calibration table (if uploaded by the owner).")

    sub(s, "6.2 Delivery Recording")
    para(s, "If fuel was delivered during the shift:")
    bull(s, "Mark delivery as Yes")
    bull(s, "Enter before/after offload volumes")
    bull(s, "Record supplier, invoice number, delivery time")
    bull(s, "Multiple deliveries per shift are supported")

    # 7
    section(s, "7. Fuel Operations & Deliveries")
    para(s, "Go to " + B("Operations -> Fuel Operations") + ". This page has four tabs:")
    bull(s, B("Tank Levels") + " -- real-time inventory (refreshes every 10 seconds)")
    bull(s, B("Tank Readings") + " -- record opening/closing volumes and movement")
    bull(s, B("Deliveries") + " -- record fuel deliveries with supplier and invoice details")
    bull(s, B("Summary") + " -- daily overview with movements, sales, and delivery reconciliation")

    # 8
    section(s, "8. LPG Operations")
    para(s, "Go to " + B("Operations -> LPG Daily") + ".")
    para(s, "As a supervisor, you have all attendant capabilities plus:")
    bull(s, B("Edit Pricing") + " -- update refill and full cylinder prices per size")
    bull(s, B("Edit Accessory Pricing") + " -- update stove, regulator, hose prices")
    bull(s, "View all daily entries across attendants")
    bull(s, "Track cylinder inventory and empty cylinder counts")

    # 9
    section(s, "9. Lubricant Operations")
    para(s, "Go to " + B("Operations -> Lubricants Daily") + ".")
    para(s, "As a supervisor, you can:")
    bull(s, B("Edit Product Pricing") + " -- set selling prices for all lubricant products")
    bull(s, "Manage stock transfers between Island 3 and Buffer locations")
    bull(s, "View full stock movement audit trail")

    # 10
    section(s, "10. Inventory & Tank Levels")
    para(s, "Go to " + B("Inventory & Sales -> Tank Levels") + ".")
    para(s, "Three tabs show current inventory:")
    bull(s, B("Fuel Tanks") + " -- levels, capacity, percentage, status (Normal/Low/Critical)")
    bull(s, B("LPG & Accessories") + " -- cylinder counts and accessory stock")
    bull(s, B("Lubricants") + " -- product stock by category and location")

    # 11
    section(s, "11. Sales & Credit Accounts")
    sub(s, "11.1 Sales History")
    para(s, "View all sales transactions with date/shift filtering at " + B("Inventory & Sales -> Sales") + ".")
    sub(s, "11.2 Credit Accounts")
    para(s, "At " + B("Inventory & Sales -> Credit Accounts") + " you can:")
    bull(s, "View all credit accounts with balances and utilisation %")
    bull(s, "Create new accounts (Corporate, Institutional, Individual, POS)")
    bull(s, "Record credit sales and payments")
    bull(s, "View account-level sales history")

    # 12
    section(s, "12. Reconciliation")
    sub(s, "12.1 Shift Reconciliation")
    para(s, "At " + B("Reconciliation -> Shift Reconciliation") + ", view per-shift summaries showing fuel, LPG, lubricant, and cash totals with variance calculations.")
    sub(s, "12.2 Three-Way Reconciliation")
    para(s, "At " + B("Reconciliation -> Three-Way Reconciliation") + ", the system compares three independent sources:")
    bull(s, B("Physical") + " -- tank dip readings (what the tank says)")
    bull(s, B("Operational") + " -- nozzle readings (what the meters say)")
    bull(s, B("Financial") + " -- cash collected (what the money says)")
    para(s, "Status levels: " + B("BALANCED") + " (all match), " + B("INVESTIGATION") + " (moderate variance), " + B("CRITICAL") + " (significant mismatch).")
    para(s, "The system performs root cause analysis to identify which source is the outlier.")
    sub(s, "12.3 Tank Analysis")
    para(s, "At " + B("Reconciliation -> Tank Analysis") + ", view volume variance trends over time for each tank.")

    # 13
    section(s, "13. Reports & Analytics")
    para(s, "Go to " + B("Reports") + " in the main menu.")
    sub(s, "13.1 Sales Reports")
    para(s, "Generate reports by staff, nozzle, island, or product with date range filtering. Export to PDF or Excel with business header and timestamp.")
    sub(s, "13.2 Tank Readings & Monitor")
    para(s, "Track all tank readings over time with trend visualisation.")
    sub(s, "13.3 Advanced Reports")
    para(s, "Custom analytics with comprehensive filtering options.")
    sub(s, "13.4 Anomaly Alerts")
    para(s, "System-detected anomalies including high variance, excessive consumption, delivery losses, and consistent loss patterns.")
    sub(s, "13.5 Notifications")
    para(s, "Full notification history with filtering by type, severity, and date range. The notification bell in the header shows your unread count.")

    # 14
    section(s, "14. Notifications & Alerts")
    para(s, "You receive notifications for:")
    bull(s, "Handover submissions from attendants")
    bull(s, "Shift completions and auto-closures")
    bull(s, "Cash shortages and meter deviations")
    bull(s, "Tank level warnings (low/critical)")
    bull(s, "Fuel deliveries received")
    bull(s, "Price changes scheduled or applied")
    bull(s, "Threshold changes by owner/manager")
    para(s, "The " + B("notification bell") + " in the top bar shows your unread count. Critical alerts trigger toast notifications.")

    # 15
    section(s, "15. Price Changes & Scheduling")
    para(s, "You " + B("cannot") + " schedule price changes (owner/manager only). However:")
    bull(s, "When a price change occurs during a night shift, the handover review will show split pricing")
    bull(s, "Revenue is calculated using the correct price for each portion of the shift")
    bull(s, "You will see a notification when a price change is applied")

    # 16
    section(s, "16. FAQ")
    faqs = [
        ("An attendant's handover is flagged -- what do I do?", "Review the flag reason (meter deviation or cash shortage). Check the attendant's notes. If the explanation is satisfactory, approve. If not, return with a note requesting clarification."),
        ("A shift has stale readings", "The attendant did not submit readings in time. Contact them to submit immediately, or enter the readings on their behalf."),
        ("The tank level seems wrong", "Record a fresh dip reading. Compare with the system's calculated level. If there is a significant discrepancy, report to the manager/owner."),
        ("Can I delete a shift?", "Only the owner can delete shifts. You can deactivate an active shift if needed."),
        ("An attendant can't log in", "Ask a manager or owner to check the account status and reset the password."),
    ]
    for q, a in faqs:
        para(s, B("Q: " + q))
        indent(s, "A: " + a)
        s.append(sp)

    s.append(Spacer(1, 30))
    para(s, "-- End of Supervisor Manual --")


# ============================================================================
# MANAGER MANUAL
# ============================================================================
def build_manager(s):
    cover_page(s, "Manager",
        "This manual covers all manager responsibilities in the NextStop "
        "Fuel Management System. Managers have all supervisor capabilities "
        "plus access to administration features: daily close-off, user "
        "management, settings configuration, and the audit log.")

    toc_section(s, [
        "Getting Started",
        "Role Overview -- What Managers Can and Cannot Do",
        "All Supervisor Features",
        "Daily Close-Off",
        "User Management",
        "Settings Configuration",
        "Fuel Price Scheduling",
        "Validation Thresholds",
        "Reconciliation Tolerance Modes",
        "Stock Alert Configuration",
        "Tax & Levy Settings",
        "Audit Log",
        "Reports & Exports",
        "FAQ",
    ])

    # 1
    section(s, "1. Getting Started")
    para(s, "Log in with your manager credentials. Your menu includes all supervisor pages plus the " + B("Administration") + " section.")

    # 2
    section(s, "2. Role Overview")
    sub(s, "2.1 What Managers CAN Do")
    bull(s, "Everything a supervisor can do (shifts, handovers, readings, reports, reconciliation)")
    bull(s, "Perform daily close-off")
    bull(s, "Create, edit, and disable attendant and supervisor accounts")
    bull(s, "Configure fuel pricing, validation thresholds, reconciliation tolerances, stock alerts, tax rates")
    bull(s, "Schedule future price changes with date and time")
    bull(s, "View the audit log")
    sub(s, "2.2 What Managers CANNOT Do")
    bull(s, "Access System Settings (business name, licence, contact info)")
    bull(s, "Configure email notifications")
    bull(s, "Upload tank calibration data")
    bull(s, "Manage other manager or owner accounts")
    bull(s, "Delete shifts (owner only)")
    bull(s, "Create, delete, or configure tanks, islands, or nozzles (Infrastructure)")
    bull(s, "Manage stations")

    # 3
    section(s, "3. All Supervisor Features")
    para(s, "You have full access to all features described in the Supervisor Manual: shift management, handover review, tank readings, fuel operations, LPG, lubricants, inventory, sales, credit accounts, reconciliation, reports, and notifications.")
    para(s, "Refer to the " + B("Supervisor Manual") + " for detailed instructions on these features.")

    # 4
    section(s, "4. Daily Close-Off")
    para(s, "Go to " + B("Administration -> Daily Close-Off") + ".")
    sub(s, "4.1 Purpose")
    para(s, "Daily close-off finalises the trading day. It aggregates all approved handovers, locks them from further editing, and records the bank deposit amount.")
    sub(s, "4.2 Prerequisites")
    bull(s, "All attendant handovers for the day must be " + B("approved"))
    bull(s, "If any handovers are still pending or returned, the close-off is blocked")
    sub(s, "4.3 Process")
    step(s, 1, "Select the date to close")
    step(s, 2, "Review the summary: approved handovers, total revenue, total cash")
    step(s, 3, "Enter the " + B("bank deposit amount"))
    step(s, 4, "Click " + B("Close Day"))
    note(s, "Close-off is irreversible. Once closed, handovers for that date cannot be edited or re-approved.")
    sub(s, "4.4 History")
    para(s, "View past close-off records to track daily deposit amounts and any discrepancies.")

    # 5
    section(s, "5. User Management")
    para(s, "Go to " + B("Administration -> Users") + ".")
    sub(s, "5.1 Creating Users")
    step(s, 1, "Click " + B("Add User"))
    step(s, 2, "Enter full name, username, and password")
    step(s, 3, "Select role: " + B("Attendant") + " or " + B("Supervisor"))
    step(s, 4, "Click " + B("Create"))
    note(s, "You cannot create Manager or Owner accounts. Only the owner can do that.")
    sub(s, "5.2 Managing Users")
    bull(s, B("Edit") + " -- change name or role (attendant/supervisor only)")
    bull(s, B("Reset Password") + " -- set a new password for the user")
    bull(s, B("Disable/Enable") + " -- toggle account status (disabled users cannot log in)")
    bull(s, B("Delete") + " -- permanently remove the account")

    # 6
    section(s, "6. Settings Configuration")
    para(s, "Go to " + B("Administration -> Settings") + ". You see these tabs:")
    s.append(make_table(["Tab", "Purpose"], [
        ["Fuel Settings", "Diesel/Petrol prices, allowable loss %, nozzle loss threshold, scheduled price changes"],
        ["Tax & Levy", "VAT rate (%), fuel levy per litre (ZMW)"],
        ["Validation Thresholds", "PASS/WARNING/FAIL variance thresholds, meter discrepancy threshold"],
        ["Stock Alerts", "Low stock and critical stock percentage thresholds"],
        ["Reconciliation", "Volume tolerance mode selector and configuration"],
    ], col_widths=[120, 350]))
    s.append(sp)
    note(s, "The System Information, Email Notifications, and Tank Calibration tabs are hidden from managers -- only the owner can access those.")

    # 7
    section(s, "7. Fuel Price Scheduling")
    para(s, "Under " + B("Settings -> Fuel Settings") + ", scroll to " + B("Scheduled Price Changes") + ".")
    step(s, 1, "Select fuel type (Diesel or Petrol)")
    step(s, 2, "Enter the new price (ZMW per litre)")
    step(s, 3, "Pick the effective date")
    step(s, 4, "Pick the effective time (24-hour format, default 00:00)")
    step(s, 5, "Click " + B("Schedule"))
    para(s, "Pending changes can be cancelled. Applied changes cannot. The price activates automatically when the system next processes data after the effective date+time.")
    para(s, "You can schedule multiple changes for the same fuel on the same date at different times.")

    # 8
    section(s, "8. Validation Thresholds")
    para(s, "Under " + B("Settings -> Validation Thresholds") + ".")
    s.append(make_table(["Threshold", "What It Controls", "Default"], [
        ["PASS (%)", "Variance at or below this = green PASS status", "0.5%"],
        ["WARNING (%)", "Variance above PASS but at or below this = yellow WARNING", "1.0%"],
        ["Meter Discrepancy (%)", "Electronic vs mechanical difference requiring attendant note", "0.5%"],
    ], col_widths=[130, 250, 80]))
    s.append(sp)
    para(s, "Each field shows the " + B("litre equivalent") + " at different volumes (e.g., 0.5% = 100L on a 20,000L tank). This helps you set meaningful thresholds.")
    note(s, "PASS threshold must be less than WARNING threshold.")

    # 9
    section(s, "9. Reconciliation Tolerance Modes")
    para(s, "Under " + B("Settings -> Reconciliation") + ".")
    para(s, "The " + B("Volume Tolerance Mode") + " dropdown lets you choose how volume variances are judged:")
    s.append(make_table(["Mode", "How Tolerance Is Calculated", "Best For"], [
        ["Percentage", "volume x %", "Varying volumes, proportional sensitivity"],
        ["Fixed Litres", "flat litre value", "Tight, predictable control"],
        ["Hybrid", "min(volume x %, cap)", "Most stations (recommended)"],
        ["Tiered", "lookup from volume brackets", "Maximum control, custom per range"],
    ], col_widths=[80, 200, 190]))
    s.append(sp)
    para(s, "Only the fields relevant to the selected mode are shown. Cash tolerances (ZMW) are always flat amounts, independent of mode.")
    para(s, "Switching modes preserves all field values. Past reconciliation results are not recalculated.")
    para(s, "See the " + B("User Manual Update (April 2026)") + " for detailed examples and setup instructions for each mode.")

    # 10
    section(s, "10. Stock Alert Configuration")
    para(s, "Under " + B("Settings -> Stock Alerts") + ".")
    bull(s, B("Low Stock Threshold (%)") + " -- tanks below this percentage trigger a yellow warning")
    bull(s, B("Critical Stock Threshold (%)") + " -- tanks below this trigger a red critical alert")
    note(s, "Critical must be lower than low stock threshold.")

    # 11
    section(s, "11. Tax & Levy Settings")
    para(s, "Under " + B("Settings -> Tax & Levy") + ".")
    bull(s, B("VAT Rate (%)") + " -- applied to fuel sales revenue (default 16%)")
    bull(s, B("Fuel Levy (ZMW/L)") + " -- flat levy per litre (included in selling price)")

    # 12
    section(s, "12. Audit Log")
    para(s, "Go to " + B("Administration -> Audit Log") + ".")
    para(s, "View all system actions with:")
    bull(s, "Action type (user_create, shift_create, price_change_scheduled, threshold_update, etc.)")
    bull(s, "Who performed the action")
    bull(s, "Timestamp")
    bull(s, "Entity type and detailed change information (old vs new values)")
    para(s, "Filter by entity type to find specific changes (e.g., " + I("fuel_settings") + " for price changes, " + I("reconciliation_tolerance_settings") + " for tolerance updates).")

    # 13
    section(s, "13. Reports & Exports")
    para(s, "Full access to all report types. Reports can be exported to PDF or Excel with the station's business header and timestamp footer.")
    bull(s, B("Sales Reports") + " -- by staff, nozzle, island, product, date range")
    bull(s, B("Tank Readings") + " -- historical tank level tracking")
    bull(s, B("Advanced Reports") + " -- custom analytics")
    bull(s, B("Anomaly Alerts") + " -- system-detected irregularities")

    # 14
    section(s, "14. FAQ")
    faqs = [
        ("I can't see the System or Email settings tabs", "Those are owner-only. Ask the owner to make changes there."),
        ("Can I create another manager account?", "No. Only the owner can create manager accounts."),
        ("The daily close-off is blocked", "There are unapproved handovers for that date. Approve or return all pending handovers first."),
        ("An attendant says their account is locked", "Go to Users, find their account, and click Enable. If they forgot their password, use Reset Password."),
        ("I changed a tolerance and now everything is flagged", "You may have set the threshold too tight. Check the litre equivalents shown under each field to ensure the values make sense for your tank volumes."),
    ]
    for q, a in faqs:
        para(s, B("Q: " + q))
        indent(s, "A: " + a)
        s.append(sp)

    s.append(Spacer(1, 30))
    para(s, "-- End of Manager Manual --")


# ============================================================================
# OWNER MANUAL
# ============================================================================
def build_owner(s):
    cover_page(s, "Owner",
        "This manual covers every feature available to the station owner "
        "in the NextStop Fuel Management System. Owners have full system "
        "access including initial setup, infrastructure configuration, "
        "multi-station management, all user management, complete settings "
        "control, and all operational and reporting features.")

    toc_section(s, [
        "Getting Started & First-Time Setup",
        "Setup Wizard (8 Steps)",
        "Role Overview -- Full Access",
        "All Manager Features",
        "System Settings",
        "Infrastructure Management",
        "Tank Calibration",
        "Email Notification Configuration",
        "Full User Management",
        "Station Management",
        "Fuel Price Scheduling",
        "Reconciliation Tolerance Modes",
        "Validation Thresholds",
        "Daily Close-Off",
        "Reports & Exports",
        "Audit Log",
        "Shift Management (Full Control)",
        "FAQ",
    ])

    # 1
    section(s, "1. Getting Started & First-Time Setup")
    para(s, "When you log in for the first time, the system redirects you to the " + B("Setup Wizard") + ". You must complete all 8 steps before accessing any other part of the system.")

    # 2
    section(s, "2. Setup Wizard (8 Steps)")
    sub(s, "Step 1: Welcome")
    para(s, "Introduction screen. Click " + B("Next") + " to begin.")

    sub(s, "Step 2: Profile")
    para(s, "Set your owner display name and password. Confirm the password.")

    sub(s, "Step 3: Business Information")
    bull(s, B("Station Name") + " -- your business name (appears on reports)")
    bull(s, B("Location") + " -- physical address")
    bull(s, B("Contact Email") + " and " + B("Phone"))

    sub(s, "Step 4: Tank Configuration")
    para(s, "Create at least 2 tanks (typically Diesel and Petrol):")
    bull(s, "Tank ID (e.g., TANK-DIESEL)")
    bull(s, "Fuel Type (Diesel or Petrol)")
    bull(s, "Capacity (litres)")
    bull(s, "Initial level (current fuel in the tank)")

    sub(s, "Step 5: Fuel Pricing & Tax")
    bull(s, "Diesel price per litre (ZMW)")
    bull(s, "Petrol price per litre (ZMW)")
    bull(s, "VAT Rate (%)")
    bull(s, "Fuel Levy per litre (ZMW)")

    sub(s, "Step 6: Operational Settings")
    para(s, "Configure thresholds and tolerances:")
    bull(s, "Diesel/Petrol allowable loss percentage")
    bull(s, "Per-nozzle loss threshold (litres)")
    bull(s, "PASS and WARNING variance thresholds")
    bull(s, "Stock alert levels (low/critical)")
    bull(s, "Reconciliation tolerance mode (Percentage, Fixed, Hybrid, or Tiered)")
    bull(s, "Cash tolerance amounts (ZMW)")

    sub(s, "Step 7: Staff")
    para(s, "Create at least one attendant and one supervisor account. For each:")
    bull(s, "Full name, username, password, role")

    sub(s, "Step 8: Complete")
    para(s, "Review and finish. The system marks setup as complete and takes you to the dashboard.")

    # 3
    section(s, "3. Role Overview -- Full Access")
    para(s, "As the owner, you have access to " + B("every feature") + " in the system. This includes everything available to managers, supervisors, and attendants, plus:")
    bull(s, "System Settings (business info, licence)")
    bull(s, "Infrastructure (tanks, islands, nozzles)")
    bull(s, "Tank calibration upload")
    bull(s, "Email notification configuration")
    bull(s, "Full user management (all roles including managers)")
    bull(s, "Station management (multi-station)")
    bull(s, "Shift deletion")

    # 4
    section(s, "4. All Manager Features")
    para(s, "You have full access to all features described in the Manager Manual: daily close-off, user management (attendants and supervisors), settings (fuel pricing, thresholds, reconciliation tolerances, stock alerts, tax), audit log, and all supervisor/attendant features.")
    para(s, "Refer to the " + B("Manager Manual") + " for detailed instructions on those features.")

    # 5
    section(s, "5. System Settings")
    para(s, "Go to " + B("Administration -> Settings -> System Information") + " tab.")
    bull(s, B("Business Name") + " -- appears on all reports and exports")
    bull(s, B("Location") + " -- station address")
    bull(s, B("Contact Email & Phone"))
    bull(s, B("Licence Key") + " -- system licence (if applicable)")
    bull(s, "Software version (read-only)")

    # 6
    section(s, "6. Infrastructure Management")
    para(s, "Go to " + B("Administration -> Infrastructure") + ".")
    sub(s, "6.1 Tanks")
    bull(s, B("Create") + " new tanks with ID, fuel type, capacity, and initial level")
    bull(s, B("Delete") + " tanks (permanent, removes all associated data)")
    bull(s, B("Update Capacity") + " -- modify tank capacity")
    sub(s, "6.2 Islands")
    bull(s, B("Create") + " pump islands")
    bull(s, B("Delete") + " islands")
    bull(s, B("Set Product") + " -- assign fuel type to island")
    bull(s, B("Toggle Status") + " -- enable/disable islands")
    sub(s, "6.3 Nozzles")
    bull(s, B("Create") + " nozzles within islands")
    bull(s, B("Delete") + " nozzles")
    bull(s, B("Update Label") + " -- set display name (e.g., LSD 1A)")
    bull(s, B("Toggle Status") + " -- enable/disable individual nozzles")
    bull(s, B("Pump Station") + " -- configure tank-to-island connections")

    # 7
    section(s, "7. Tank Calibration")
    para(s, "Go to " + B("Administration -> Settings -> Tank Calibration") + " tab.")
    para(s, "Calibration maps dip measurements (cm) to actual volumes (litres). This is essential for accurate tank readings.")
    step(s, 1, "Select the tank to calibrate")
    step(s, 2, "Download the calibration template (Excel)")
    step(s, 3, "Fill in the cm-to-litres mapping in the spreadsheet")
    step(s, 4, "Upload the completed file")
    para(s, "You can also clear/reset calibration data for a tank.")
    note(s, "Without calibration data, the system uses raw dip values. With calibration, dip readings are automatically converted to accurate volumes.")

    # 8
    section(s, "8. Email Notification Configuration")
    para(s, "Go to " + B("Administration -> Settings -> Email Notifications") + " tab.")
    bull(s, B("Enable/Disable") + " email notifications globally")
    bull(s, B("Sender Address") + " -- the 'from' address on outgoing emails")
    bull(s, B("Recipient Addresses") + " -- add/remove email addresses that receive alerts")
    bull(s, B("Test Email") + " -- send a test to verify configuration")
    note(s, "Requires a valid Resend API key configured on the server.")

    # 9
    section(s, "9. Full User Management")
    para(s, "Go to " + B("Administration -> Users") + ".")
    para(s, "Unlike managers, owners can manage " + B("all roles") + ":")
    bull(s, "Create accounts with any role: Attendant, Supervisor, or Manager")
    bull(s, "Edit any user account (including other managers)")
    bull(s, "Reset passwords for any user")
    bull(s, "Enable/disable any account")
    bull(s, "Delete any account (except owner accounts)")
    note(s, "Disabling an account immediately invalidates their active sessions. They are logged out everywhere.")

    # 10
    section(s, "10. Station Management")
    para(s, "Go to " + B("Administration -> Stations") + ".")
    para(s, "If you operate multiple stations:")
    bull(s, B("Create") + " new stations with name and details")
    bull(s, B("Toggle Status") + " -- activate/deactivate stations")
    bull(s, B("Switch") + " -- change which station you are currently operating in")
    bull(s, B("Delete") + " -- permanently remove a station and all its data")
    bull(s, B("Seed Test Data") + " -- populate a station with sample data for testing")

    # 11
    section(s, "11. Fuel Price Scheduling")
    para(s, "Under " + B("Settings -> Fuel Settings -> Scheduled Price Changes") + ".")
    para(s, "Schedule future price changes with a specific date and time:")
    bull(s, "Select fuel type, enter new price, pick date and time (HH:MM)")
    bull(s, "Multiple changes per day at different times are supported")
    bull(s, "Price activates automatically when the system next processes data after the effective datetime")
    bull(s, "Night shifts spanning a price change get split pricing automatically")
    bull(s, "All scheduling and cancellations are logged in the audit trail")

    # 12
    section(s, "12. Reconciliation Tolerance Modes")
    para(s, "Under " + B("Settings -> Reconciliation") + ".")
    para(s, "Choose from four volume tolerance modes:")

    sub(s, "12.1 Percentage Mode")
    para(s, "Tolerance = volume x %. Scales with volume. Simple but can be too generous on large tanks (1% of 20,000L = 200L).")

    sub(s, "12.2 Fixed Litres Mode")
    para(s, "Tolerance = flat litre value. Same standard regardless of volume. Tight and predictable.")

    sub(s, "12.3 Hybrid Mode (Recommended)")
    para(s, "Tolerance = min(volume x %, cap). Uses whichever is smaller. Proportional on small volumes, capped on large volumes.")
    para(s, "Example: 0.5% with 5L cap -- a 20,000L shift allows only 5L (not 100L).")

    sub(s, "12.4 Tiered Mode")
    para(s, "Define volume brackets with specific tolerances:")
    s.append(make_table(["Volume Range", "Acceptable", "Investigation"], [
        ["0 - 1,000 L", "2 L", "5 L"],
        ["1,001 - 5,000 L", "5 L", "15 L"],
        ["5,001 - 20,000 L", "8 L", "20 L"],
        ["20,001+ L", "10 L", "30 L"],
    ], col_widths=[160, 140, 140]))
    s.append(sp)
    para(s, "Add/remove tiers with the + Add Tier button. Tiers must be in ascending order. Last tier covers everything above.")

    sub(s, "12.5 Cash Tolerances")
    para(s, "Always flat ZMW amounts, independent of volume mode. Set acceptable and investigation thresholds.")

    # 13
    section(s, "13. Validation Thresholds")
    para(s, "Under " + B("Settings -> Validation Thresholds") + ".")
    para(s, "Three thresholds with live litre equivalents:")
    bull(s, B("PASS (%)") + " -- variance at or below = green. Shows e.g. '100L on 20,000L tank'")
    bull(s, B("WARNING (%)") + " -- above PASS, at or below = yellow")
    bull(s, B("Meter Discrepancy (%)") + " -- electronic vs mechanical difference requiring attendant note")

    # 14
    section(s, "14. Daily Close-Off")
    para(s, "Go to " + B("Administration -> Daily Close-Off") + ".")
    para(s, "Same as described in the Manager Manual. Close the trading day, enter bank deposit amount, lock all handovers.")

    # 15
    section(s, "15. Reports & Exports")
    para(s, "Full access to all reports: Sales (by staff/nozzle/island/product), Tank Readings, Advanced Reports, Anomaly Alerts, Notifications.")
    para(s, "All reports can be exported to " + B("PDF") + " or " + B("Excel") + " with the station's business header and timestamp footer.")

    # 16
    section(s, "16. Audit Log")
    para(s, "Go to " + B("Administration -> Audit Log") + ".")
    para(s, "Complete record of every action in the system:")
    s.append(make_table(["Action", "What It Logs"], [
        ["user_create / user_delete", "Staff account changes"],
        ["shift_create / shift_complete", "Shift lifecycle"],
        ["price_change_scheduled / cancelled", "Fuel price scheduling"],
        ["threshold_update", "Validation threshold changes"],
        ["reconciliation_tolerance_update", "Tolerance mode and value changes"],
        ["handover_approved / returned", "Supervisor review decisions"],
    ], col_widths=[200, 270]))
    s.append(sp)
    para(s, "Filter by entity type, action, performer, or date range.")

    # 17
    section(s, "17. Shift Management (Full Control)")
    para(s, "As the owner, you have full shift control including the ability to " + B("delete shifts") + " (permanent). Supervisors and managers cannot delete shifts.")
    bull(s, "Create, update, deactivate, complete, reconcile, and delete shifts")
    bull(s, "Delete removes the shift and all associated readings and handovers")
    note(s, "Use delete with caution. Consider deactivating instead if you just want to stop the shift.")

    # 18
    section(s, "18. FAQ")
    faqs = [
        ("I need to change the business name on reports", "Go to Settings -> System Information and update the Business Name. It takes effect on the next report generated."),
        ("How do I add a new tank?", "Go to Infrastructure, click Create Tank, enter the ID, fuel type, capacity, and initial level."),
        ("Can I have more than one owner?", "The system supports one owner account per station. Multiple managers can share administrative duties."),
        ("I changed the reconciliation mode but old data looks the same", "Mode changes only affect future calculations. Past results are not recalculated."),
        ("An email notification failed", "Check Settings -> Email Notifications. Verify the Resend API key is valid, recipient addresses are correct, and send a test email."),
        ("How do I set up a second station?", "Go to Stations, click Create Station, and complete the setup wizard for the new station."),
        ("What happens if I delete a station?", "All data for that station is permanently removed. This cannot be undone."),
        ("I want to change the tolerance mode -- which should I use?", "Start with Percentage (default). If large volumes are passing with too much loss, switch to Hybrid. For full control, use Tiered."),
    ]
    for q, a in faqs:
        para(s, B("Q: " + q))
        indent(s, "A: " + a)
        s.append(sp)

    s.append(Spacer(1, 30))
    para(s, "-- End of Owner Manual --")


# ============================================================================
# GENERATE ALL
# ============================================================================
if __name__ == "__main__":
    print("Generating role-specific manuals...")
    build_pdf("ATTENDANT_MANUAL.pdf", build_attendant)
    build_pdf("SUPERVISOR_MANUAL.pdf", build_supervisor)
    build_pdf("MANAGER_MANUAL.pdf", build_manager)
    build_pdf("OWNER_MANUAL.pdf", build_owner)
    print("Done. All 4 manuals generated.")
