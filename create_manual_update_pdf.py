#!/usr/bin/env python3
"""Generate USER_MANUAL_UPDATE_2026_04_14.pdf — comprehensive update for
scheduled price change times, validation threshold litre equivalents,
and reconciliation tolerance modes."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, cm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether,
)

# ── Colours ──────────────────────────────────────────────
BLUE = HexColor("#2c5aa0")
DARK = HexColor("#1a1a1a")
GREY = HexColor("#555555")
LIGHT_BLUE = HexColor("#e8f0fe")
LIGHT_GREY = HexColor("#f5f5f5")
GREEN = HexColor("#1a7a2e")
ORANGE = HexColor("#b45309")
RED = HexColor("#b91c1c")
WHITE = HexColor("#ffffff")

# ── Styles ───────────────────────────────────────────────
styles = getSampleStyleSheet()

title_style = ParagraphStyle("Title", parent=styles["Heading1"], fontSize=22,
    textColor=DARK, spaceAfter=6, alignment=TA_CENTER)
subtitle_style = ParagraphStyle("Subtitle", parent=styles["Normal"], fontSize=11,
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
bullet = ParagraphStyle("Bullet", parent=body, leftIndent=28, bulletIndent=14,
    spaceBefore=2, spaceAfter=2)
note_style = ParagraphStyle("Note", parent=body, fontSize=9, textColor=GREY,
    leftIndent=20, rightIndent=20, spaceBefore=4, spaceAfter=4,
    backColor=LIGHT_GREY)
role_style = ParagraphStyle("Role", parent=styles["Heading2"], fontSize=13,
    textColor=WHITE, spaceBefore=12, spaceAfter=8, backColor=BLUE,
    leftIndent=6, rightIndent=6, borderPadding=(4, 6, 4, 6))
table_header = ParagraphStyle("TH", parent=body, fontSize=9, textColor=WHITE, alignment=TA_CENTER)
table_cell = ParagraphStyle("TD", parent=body, fontSize=9, alignment=TA_CENTER)
table_cell_left = ParagraphStyle("TDL", parent=body, fontSize=9, alignment=TA_LEFT)

sp = Spacer(1, 6)
sp2 = Spacer(1, 12)

def B(text):
    return f"<b>{text}</b>"

def I(text):
    return f"<i>{text}</i>"

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


# ── Build document ───────────────────────────────────────
pdf_filename = "USER_MANUAL_UPDATE_2026_04_14.pdf"
doc = SimpleDocTemplate(pdf_filename, pagesize=A4,
    rightMargin=60, leftMargin=60, topMargin=50, bottomMargin=40)

story = []

# ── Cover ────────────────────────────────────────────────
story.append(Spacer(1, 80))
story.append(Paragraph("NextStop Fuel Management System", title_style))
story.append(Paragraph("User Manual Update", title_style))
story.append(Spacer(1, 12))
story.append(Paragraph("14 April 2026", subtitle_style))
story.append(Spacer(1, 20))
story.append(Paragraph("This update covers three feature changes:", body))
story.append(Paragraph("1. Scheduled price changes now include hour and minute", bullet))
story.append(Paragraph("2. Validation thresholds display litre equivalents", bullet))
story.append(Paragraph("3. Reconciliation tolerances support four selectable modes", bullet))
story.append(Spacer(1, 20))
story.append(Paragraph(
    "Each section is organised by user role so you can jump to the part relevant to you. "
    "Roles covered: " + B("Owner") + ", " + B("Manager") + ", " + B("Supervisor") + ", " + B("Attendant") + ".",
    body))
story.append(PageBreak())

# ══════════════════════════════════════════════════════════
# PART 1 — SCHEDULED PRICE CHANGE TIME PICKER
# ══════════════════════════════════════════════════════════
story.append(Paragraph("Part 1: Scheduled Price Change &mdash; Time Picker", h1))
story.append(Paragraph(
    "Previously, a scheduled price change would activate at midnight (00:00) on the effective date. "
    "Now owners and managers can specify the " + B("exact hour and minute") + " when the new price kicks in.",
    body))
story.append(Paragraph(
    "This is useful when a price change is announced mid-day, when you want the new price to align with "
    "shift changeover (06:00 or 18:00), or when a supplier price takes effect at a specific hour.",
    body))

# ── Owner / Manager ─────────────────────────────────────
story.append(Paragraph("Owner / Manager", role_style))
story.append(Paragraph(B("Where:") + " Administration &rarr; Settings &rarr; Fuel Settings tab &rarr; Scheduled Price Changes", body))
story.append(sp)
story.append(Paragraph(B("How to schedule a price change with a specific time:"), body))
story.append(Paragraph("1. Select " + B("Fuel Type") + " (Diesel or Petrol)", bullet))
story.append(Paragraph("2. Enter the " + B("New Price") + " (ZMW per litre)", bullet))
story.append(Paragraph("3. Pick the " + B("Effective Date") + " using the date picker", bullet))
story.append(Paragraph("4. Pick the " + B("Time") + " using the time picker (new field, 24-hour format HH:MM)", bullet))
story.append(Paragraph("&nbsp;&nbsp;&nbsp;&nbsp;Default is 00:00 (midnight). Examples: 06:00 = Day Shift start, 14:00 = 2 PM, 18:00 = Night Shift start", body_indent))
story.append(Paragraph("5. Click " + B("Schedule"), bullet))
story.append(sp)
story.append(Paragraph(
    "The confirmation message shows both date and time, e.g.: " +
    I("\"Diesel price K28.50 scheduled for 2026-04-15 at 14:00\""), body))
story.append(sp)
story.append(Paragraph(B("Viewing scheduled changes:"), body))
story.append(Paragraph(
    "Below the form, all scheduled changes are listed showing fuel type, new price, effective date AND time, "
    "and status (Pending or Applied). Pending changes can be cancelled; applied changes cannot.", body))
story.append(sp)
story.append(Paragraph(B("Important notes:"), body))
story.append(Paragraph("The date AND time must be in the future &mdash; you cannot schedule for a time already passed.", bullet))
story.append(Paragraph("You can schedule multiple changes for the same fuel on the same date at different times.", bullet))
story.append(Paragraph("The price activates automatically when the system next processes a shift handover or nozzle reading after the effective date+time.", bullet))
story.append(Paragraph("If a price change falls during a Night Shift (spanning midnight), the system detects it and calculates revenue using both old and new prices, split at the changeover time.", bullet))

# ── Supervisor ───────────────────────────────────────────
story.append(Paragraph("Supervisor", role_style))
story.append(Paragraph("Supervisors " + B("cannot") + " schedule price changes (owner/manager only).", body))
story.append(Paragraph("However, be aware that:", body))
story.append(Paragraph("A price change during a night shift will cause the handover summary to show split pricing (old and new prices).", bullet))
story.append(Paragraph("Nozzle revenue calculations use the correct price for each portion of the shift before and after the changeover.", bullet))
story.append(Paragraph("If an attendant reports a revenue discrepancy on a shift that crossed a price change, check the Price Change indicator in the handover review.", bullet))

# ── Attendant ────────────────────────────────────────────
story.append(Paragraph("Attendant", role_style))
story.append(Paragraph("Attendants do " + B("not") + " interact with price scheduling.", body))
story.append(Paragraph("If a price change occurred during your shift, your handover summary may show two price lines for the same fuel type. Your nozzle revenue is calculated correctly &mdash; no action required.", body))

story.append(PageBreak())

# ══════════════════════════════════════════════════════════
# PART 2 — VALIDATION THRESHOLDS LITRE EQUIVALENTS
# ══════════════════════════════════════════════════════════
story.append(Paragraph("Part 2: Validation Thresholds &mdash; Litre Equivalents", h1))
story.append(Paragraph(
    "The validation thresholds (PASS, WARNING, FAIL for tank variance, and meter discrepancy) are still "
    "configured as percentages. The change is purely " + B("visual") + ": each threshold field now shows what "
    "the percentage means in real litres at different scales.", body))

story.append(Paragraph("Owner / Manager", role_style))
story.append(Paragraph(B("Where:") + " Administration &rarr; Settings &rarr; Validation Thresholds tab", body))
story.append(sp)
story.append(Paragraph(
    "Each threshold input now shows a " + B("litre equivalent") + " below it that updates live as you change "
    "the percentage. For example:", body))
story.append(sp)

story.append(make_table(
    ["Threshold", "Setting", "Litre equivalent shown"],
    [
        ["PASS Threshold", "0.5%", "100L on 20,000L tank, 25L on 5,000L"],
        ["WARNING Threshold", "1.0%", "200L on 20,000L tank, 50L on 5,000L"],
        ["Meter Discrepancy", "0.5%", "10.0L on 2,000L dispensed, 2.5L on 500L"],
    ],
    col_widths=[120, 60, 290],
))
story.append(sp)
story.append(Paragraph(
    B("Why this matters:") + " A percentage can be deceptive at scale. 0.5% sounds tight, but 0.5% of 20,000L "
    "is 100L of fuel. The litre equivalents help you set thresholds that make sense for your station's actual "
    "tank sizes and throughput.", body))

story.append(Paragraph("Supervisor / Attendant", role_style))
story.append(Paragraph(
    "No change to your workflow. The PASS / WARNING / FAIL indicators on tank readings and nozzle "
    "discrepancies work exactly as before.", body))

story.append(PageBreak())

# ══════════════════════════════════════════════════════════
# PART 3 — RECONCILIATION TOLERANCE MODES
# ══════════════════════════════════════════════════════════
story.append(Paragraph("Part 3: Reconciliation Tolerance Modes", h1))
story.append(Paragraph(
    "This is the largest change. Previously, reconciliation used a fixed approach. Now the owner can choose "
    "from " + B("four different modes") + " for how volume tolerances are calculated. Cash tolerances (ZMW) "
    "remain unchanged &mdash; always a flat amount regardless of mode.", body))

story.append(Paragraph("Owner", role_style))
story.append(Paragraph(B("Where:") + " Administration &rarr; Settings &rarr; Reconciliation tab", body))
story.append(sp)
story.append(Paragraph(
    "At the top of the tab there is a " + B("Volume Tolerance Mode") + " dropdown with four options. "
    "When you select a mode, only the fields relevant to that mode appear, and a description box "
    "explains how the selected mode works.", body))

# ── Mode 1: Percentage ──────────────────────────────────
story.append(Paragraph("Mode 1: Percentage", h2))
story.append(Paragraph(B("How it works:") + " Tolerance = volume &times; percentage / 100", body))
story.append(make_table(
    ["Volume", "At 0.5%", "At 2.0%"],
    [
        ["20,000 L", "100 L tolerance", "400 L tolerance"],
        ["5,000 L", "25 L tolerance", "100 L tolerance"],
        ["500 L", "2.5 L tolerance", "10 L tolerance"],
    ],
    col_widths=[120, 170, 170],
))
story.append(sp)
story.append(Paragraph(B("Fields shown:"), body))
story.append(Paragraph("Acceptable (%) &mdash; variance up to this = acceptable", bullet))
story.append(Paragraph("Investigation (%) &mdash; above acceptable but within this = investigate; beyond = CRITICAL", bullet))
story.append(Paragraph("Minimum Volume for % Calculation (L) &mdash; below this, percentage is not calculated", bullet))
story.append(sp)
story.append(Paragraph(B("When to use:") + " Good for stations where volumes vary widely. Be aware that on very large volumes, the absolute litre tolerance can become large.", body))

# ── Mode 2: Fixed Litres ────────────────────────────────
story.append(Paragraph("Mode 2: Fixed Litres", h2))
story.append(Paragraph(B("How it works:") + " Tolerance = flat litre value, regardless of volume", body))
story.append(make_table(
    ["Volume", "At 5 L fixed", "At 15 L fixed"],
    [
        ["20,000 L", "5 L tolerance", "15 L tolerance"],
        ["5,000 L", "5 L tolerance", "15 L tolerance"],
        ["500 L", "5 L tolerance", "15 L tolerance"],
    ],
    col_widths=[120, 170, 170],
))
story.append(sp)
story.append(Paragraph(B("Fields shown:"), body))
story.append(Paragraph("Acceptable (L) &mdash; variance up to this many litres = acceptable", bullet))
story.append(Paragraph("Investigation (L) &mdash; above acceptable but within this = investigate; beyond = CRITICAL", bullet))
story.append(sp)
story.append(Paragraph(B("When to use:") + " Best when you want tight, predictable control. Every shift is held to the same absolute standard.", body))

# ── Mode 3: Hybrid ───────────────────────────────────────
story.append(Paragraph("Mode 3: Hybrid (Percentage + Cap)", h2))
story.append(Paragraph(B("How it works:") + " Tolerance = min(volume &times; %, cap). The system uses " + B("whichever is smaller") + ".", body))
story.append(make_table(
    ["Volume", "0.5% alone", "With 5 L cap", "Which governs?"],
    [
        ["20,000 L", "100 L", "5 L", "Cap (5 L)"],
        ["5,000 L", "25 L", "5 L", "Cap (5 L)"],
        ["200 L", "1 L", "5 L", "Percentage (1 L)"],
    ],
    col_widths=[90, 100, 100, 130],
))
story.append(sp)
story.append(Paragraph(B("Fields shown:"), body))
story.append(Paragraph("Acceptable (%) and Investigation (%)", bullet))
story.append(Paragraph("Cap &mdash; Acceptable (L) and Cap &mdash; Investigation (L). Set to 0 to disable the cap.", bullet))
story.append(Paragraph("Minimum Volume for % Calculation (L)", bullet))
story.append(sp)
story.append(Paragraph(B("When to use:") + " Best of both worlds. Proportional sensitivity on small volumes, but large volumes cannot hide big losses behind a small percentage. " + B("Recommended for most stations."), body))

# ── Mode 4: Tiered ───────────────────────────────────────
story.append(Paragraph("Mode 4: Tiered (Volume Brackets)", h2))
story.append(Paragraph(B("How it works:") + " You define volume ranges (brackets), each with its own litre tolerance. The system looks up the bracket matching the shift's volume.", body))
story.append(sp)
story.append(Paragraph(B("Example tier configuration:"), body))
story.append(make_table(
    ["Volume Range", "Acceptable", "Investigation"],
    [
        ["0 \u2013 1,000 L", "2 L", "5 L"],
        ["1,001 \u2013 5,000 L", "5 L", "15 L"],
        ["5,001 \u2013 20,000 L", "8 L", "20 L"],
        ["20,001+ L", "10 L", "30 L"],
    ],
    col_widths=[160, 140, 140],
))
story.append(sp)
story.append(Paragraph("A 15,000L shift falls in the 5,001\u201320,000L bracket: acceptable = 8L, investigation = 20L.", body_indent))
story.append(sp)
story.append(Paragraph(B("How to set up tiers:"), body))
story.append(Paragraph('1. Click "+ Add Tier" to add your first bracket', bullet))
story.append(Paragraph("2. Set the \"Up to\" volume (e.g., 1000)", bullet))
story.append(Paragraph("3. Set the acceptable and investigation tolerances for that range", bullet))
story.append(Paragraph("4. Repeat for each volume range you want to cover", bullet))
story.append(Paragraph("5. The last tier automatically covers everything above its upper bound", bullet))
story.append(sp)
story.append(Paragraph(B("Rules:"), body))
story.append(Paragraph("At least one tier is required", bullet))
story.append(Paragraph("Tiers must be in ascending order by volume", bullet))
story.append(Paragraph("Each tier's acceptable must be less than its investigation value", bullet))
story.append(sp)
story.append(Paragraph(B("When to use:") + " Maximum control. Use when your station handles a wide range of volumes and you want to precisely define tolerances at each scale. This is the closest thing to a custom formula.", body))

# ── Cash Tolerances ──────────────────────────────────────
story.append(Paragraph("Cash Tolerances (All Modes)", h2))
story.append(Paragraph(
    "Cash tolerances appear below the volume mode section and are always flat ZMW amounts, "
    "independent of the selected volume mode.", body))
story.append(Paragraph("Acceptable (ZMW) &mdash; cash variance up to this = acceptable", bullet))
story.append(Paragraph("Investigation (ZMW) &mdash; above acceptable but within this = investigate; beyond = CRITICAL", bullet))

# ── Reconciliation Levels ────────────────────────────────
story.append(Paragraph("Reconciliation Levels Reference", h2))
story.append(make_table(
    ["Status", "Meaning", "Action"],
    [
        ["BALANCED", "All sources match within acceptable tolerance", "No action needed"],
        ["INVESTIGATION", "Exceeds acceptable but within investigation threshold", "Supervisor/owner should review"],
        ["CRITICAL", "Exceeds investigation threshold", "Immediate action \u2014 check for leaks, theft, meter errors"],
    ],
    col_widths=[100, 200, 170],
))

# ── Switching Modes ──────────────────────────────────────
story.append(sp2)
story.append(Paragraph("Switching Modes", h3))
story.append(Paragraph(
    "You can switch modes at any time. All field values are preserved in the background &mdash; switching back "
    "to a previous mode restores its values. Click " + B("Save Reconciliation Tolerances") + " to apply. "
    "The change affects all future reconciliation calculations. Historical results are not recalculated.", body))

# ── Setup Wizard ─────────────────────────────────────────
story.append(Paragraph("Initial Station Setup", h3))
story.append(Paragraph(
    "When setting up a new station (Administration &rarr; Setup, Step 4: Operational Settings), the "
    "reconciliation section now includes the mode dropdown with the same four options. The default for "
    "new stations is Percentage mode with: Acceptable 0.5%, Investigation 2.0%, Cash 500/2,000 ZMW.", body))

# ── Manager ──────────────────────────────────────────────
story.append(Paragraph("Manager", role_style))
story.append(Paragraph(
    "Managers can view and update reconciliation tolerance settings (same access as owner). Managers should "
    "understand which mode is active, what the values mean for typical shift volumes, and use the mode "
    "descriptions and live examples in the UI to verify settings.", body))

# ── Supervisor ───────────────────────────────────────────
story.append(Paragraph("Supervisor", role_style))
story.append(Paragraph("Supervisors " + B("cannot") + " change reconciliation tolerance settings.", body))
story.append(Paragraph("What to know:", body))
story.append(Paragraph("BALANCED / INVESTIGATION / CRITICAL status on shift reconciliation is driven by these settings.", bullet))
story.append(Paragraph("If the owner changes mode or tightens tolerances, more shifts may be flagged &mdash; this does not mean performance got worse, the system is more sensitive.", bullet))
story.append(Paragraph("Variance is shown in both litres and percentage so you can assess the actual impact.", bullet))

# ── Attendant ────────────────────────────────────────────
story.append(Paragraph("Attendant", role_style))
story.append(Paragraph("Attendants do " + B("not") + " interact with reconciliation tolerance settings.", body))
story.append(Paragraph("Your handover process is unchanged. The nozzle discrepancy note requirement is separate (Validation Thresholds). If tolerances are tightened, you may be asked for more detailed notes on smaller discrepancies.", body))

story.append(PageBreak())

# ══════════════════════════════════════════════════════════
# PART 4 — AUDIT TRAIL
# ══════════════════════════════════════════════════════════
story.append(Paragraph("Part 4: Audit Trail", h1))
story.append(Paragraph("All changes to these settings are logged:", body))
story.append(make_table(
    ["Change", "Audit Action", "Entity Type"],
    [
        ["Price change scheduled", "price_change_scheduled", "fuel_settings"],
        ["Price change cancelled", "price_change_cancelled", "fuel_settings"],
        ["Validation thresholds updated", "threshold_update", "validation_thresholds"],
        ["Reconciliation tolerances updated", "reconciliation_tolerance_update", "reconciliation_tolerance_settings"],
    ],
    col_widths=[180, 160, 150],
))
story.append(sp)
story.append(Paragraph(B("Where to view:") + " Administration &rarr; Audit Log. Filter by entity type to narrow results.", body))

story.append(sp2)

# ══════════════════════════════════════════════════════════
# PART 5 — QUICK REFERENCE BY ROLE
# ══════════════════════════════════════════════════════════
story.append(Paragraph("Part 5: Quick Reference &mdash; What Changed by Role", h1))

story.append(make_table(
    ["Role", "What's New"],
    [
        ["Owner",
         "Schedule price changes with specific hour/minute\n"
         "See litre equivalents on validation thresholds\n"
         "Choose reconciliation tolerance mode (Percentage / Fixed / Hybrid / Tiered)\n"
         "Configure tiered volume brackets\n"
         "All changes logged to audit trail"],
        ["Manager",
         "Schedule price changes with specific hour/minute\n"
         "See litre equivalents on validation thresholds\n"
         "View and update reconciliation tolerance mode"],
        ["Supervisor",
         "Be aware of mid-shift price changes (shown in handover review)\n"
         "Reconciliation status may change if owner adjusts tolerance mode or values"],
        ["Attendant",
         "No direct changes to workflow\n"
         "Mid-shift price changes handled automatically\n"
         "Handover may show split pricing if a change occurred during shift"],
    ],
    col_widths=[80, 390],
))

story.append(sp2)

# ══════════════════════════════════════════════════════════
# PART 6 — FAQ
# ══════════════════════════════════════════════════════════
story.append(Paragraph("Part 6: Frequently Asked Questions", h1))

faqs = [
    ("Can I schedule a price change for today?",
     "Yes, as long as the time is still in the future. If it is 10:00 AM, you can schedule for today at 14:00, but not for 09:00."),
    ("What happens if no one submits readings until the next day?",
     "The price change applies the first time any shift data is processed after the effective date+time. It catches up automatically."),
    ("Can I have two price changes for the same fuel on the same day?",
     "Yes, as long as they are at different times. For example, Diesel at 06:00 and Diesel at 18:00."),
    ("Which reconciliation mode should I use?",
     "Start with Percentage (default). If large-volume shifts pass with unacceptable losses, switch to Hybrid with a litre cap. For maximum control, use Tiered."),
    ("If I switch modes, do old shifts get recalculated?",
     "No. The mode change only affects future calculations. Past results stay as they were."),
    ("What happens if I set the volume cap to 0 in Hybrid mode?",
     "A cap of 0 means no cap \u2014 the percentage alone governs, making Hybrid identical to Percentage."),
    ("What if my volume exceeds all tiers in Tiered mode?",
     "The last tier's tolerances are used for any volume above its bracket."),
    ("Do cash tolerances change with the volume mode?",
     "No. Cash tolerances are always flat ZMW amounts, independent of volume mode."),
    ("Who can change these settings?",
     "Owners and managers can change fuel pricing schedules and all tolerance settings. Supervisors and attendants cannot."),
]

for q, a in faqs:
    story.append(Paragraph(B("Q: " + q), body))
    story.append(Paragraph("A: " + a, body_indent))
    story.append(sp)

# ── Footer ───────────────────────────────────────────────
story.append(Spacer(1, 30))
story.append(Paragraph("&mdash; End of User Manual Update &mdash; 14 April 2026 &mdash;", subtitle_style))

# ── Generate ─────────────────────────────────────────────
doc.build(story)
print(f"Generated: {pdf_filename}")
