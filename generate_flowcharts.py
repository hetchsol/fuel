"""
Generate flow chart PDFs for the dip-based delivery recording design.
Outputs two PDFs to C:\Projects\Fuel\docs\
"""
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
import os

os.makedirs(r"C:\Projects\Fuel\docs", exist_ok=True)

# ─── colour palette ───────────────────────────────────────────────────────────
C_ACTOR   = HexColor("#1F4E79")   # dark blue  – actor/role boxes
C_ACTION  = HexColor("#2E75B6")   # mid blue   – process steps
C_SYSTEM  = HexColor("#4472C4")   # lighter    – system-computed steps
C_GUARD   = HexColor("#C55A11")   # orange     – guard / reject paths
C_STORE   = HexColor("#375623")   # dark green – data stores
C_RECON   = HexColor("#7030A0")   # purple     – reconciliation
C_END     = HexColor("#538135")   # green      – success terminal
C_WARN    = HexColor("#BF8F00")   # amber      – warning output
C_TEXT    = colors.white
C_LINE    = HexColor("#2E2E2E")
C_BG      = HexColor("#F2F2F2")

W, H = landscape(A4)   # 297 × 210 mm in points (841.89 × 595.28 pt)

def new_canvas(path, title):
    c = canvas.Canvas(path, pagesize=landscape(A4))
    c.setTitle(title)
    c.setAuthor("Fuel Management System")
    c.setFillColor(C_BG)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    return c

# ─── primitive helpers ────────────────────────────────────────────────────────

def box(c, x, y, w, h, bg, text, text2=None, fontsize=7.5, radius=4):
    """Draw a rounded rectangle with centred text (1 or 2 lines)."""
    c.setFillColor(bg)
    c.setStrokeColor(C_LINE)
    c.setLineWidth(0.6)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)
    c.setFillColor(C_TEXT)
    c.setFont("Helvetica-Bold", fontsize)
    if text2:
        c.drawCentredString(x + w/2, y + h/2 + 1, text)
        c.setFont("Helvetica", fontsize - 0.5)
        c.drawCentredString(x + w/2, y + h/2 - fontsize + 1, text2)
    else:
        c.drawCentredString(x + w/2, y + h/2 - fontsize/3, text)

def diamond(c, cx, cy, w, h, bg, text, fontsize=7):
    """Draw a diamond decision shape."""
    c.setFillColor(bg)
    c.setStrokeColor(C_LINE)
    c.setLineWidth(0.6)
    p = c.beginPath()
    p.moveTo(cx,      cy + h/2)
    p.lineTo(cx + w/2, cy)
    p.lineTo(cx,      cy - h/2)
    p.lineTo(cx - w/2, cy)
    p.close()
    c.drawPath(p, fill=1, stroke=1)
    c.setFillColor(C_TEXT)
    c.setFont("Helvetica-Bold", fontsize)
    c.drawCentredString(cx, cy - fontsize/3, text)

def arrow(c, x1, y1, x2, y2, label=None, label_right=False):
    """Draw an arrow between two points with optional label."""
    c.setStrokeColor(C_LINE)
    c.setLineWidth(0.8)
    c.line(x1, y1, x2, y2)
    # arrowhead
    import math
    angle = math.atan2(y2 - y1, x2 - x1)
    aw = 5
    for side in (+0.4, -0.4):
        ax = x2 - aw * math.cos(angle - side)
        ay = y2 - aw * math.sin(angle - side)
        c.line(x2, y2, ax, ay)
    if label:
        mx = (x1 + x2) / 2
        my = (y1 + y2) / 2
        c.setFillColor(C_LINE)
        c.setFont("Helvetica", 6)
        if label_right:
            c.drawString(mx + 3, my, label)
        else:
            c.drawCentredString(mx, my + 3, label)

def elbow(c, x1, y1, x2, y2, via_x=None, via_y=None, label=None):
    """L-shaped connector (horizontal then vertical, or via a midpoint)."""
    c.setStrokeColor(C_LINE)
    c.setLineWidth(0.8)
    if via_x is not None:
        c.line(x1, y1, via_x, y1)
        c.line(via_x, y1, via_x, y2)
        c.line(via_x, y2, x2, y2)
        ex, ey = x2, y2
    elif via_y is not None:
        c.line(x1, y1, x1, via_y)
        c.line(x1, via_y, x2, via_y)
        c.line(x2, via_y, x2, y2)
        ex, ey = x2, y2
    else:
        c.line(x1, y1, x2, y1)
        c.line(x2, y1, x2, y2)
        ex, ey = x2, y2
    import math
    # arrowhead at end
    if via_x is not None:
        angle = math.atan2(y2 - y2, x2 - via_x) if x2 != via_x else math.atan2(y2 - y1, 0)
        # final segment is horizontal to x2
        angle = 0 if x2 > via_x else math.pi
    else:
        angle = -math.pi/2 if y2 < via_y else math.pi/2 if via_y is not None else 0
    aw = 5
    for side in (+0.4, -0.4):
        ax = ex - aw * math.cos(angle - side)
        ay = ey - aw * math.sin(angle - side)
        c.line(ex, ey, ax, ay)
    if label:
        c.setFillColor(C_LINE)
        c.setFont("Helvetica", 6)
        c.drawCentredString((x1+x2)/2, (y1+y2)/2 + 3, label)

def title_text(c, text, y=None):
    if y is None:
        y = H - 22
    c.setFillColor(C_ACTOR)
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(W/2, y, text)

def subtitle(c, text, y=None):
    if y is None:
        y = H - 36
    c.setFillColor(HexColor("#444444"))
    c.setFont("Helvetica", 8)
    c.drawCentredString(W/2, y, text)

def legend_entry(c, x, y, bg, text):
    c.setFillColor(bg)
    c.setStrokeColor(C_LINE)
    c.setLineWidth(0.5)
    c.rect(x, y, 10, 7, fill=1, stroke=1)
    c.setFillColor(C_LINE)
    c.setFont("Helvetica", 6.5)
    c.drawString(x + 13, y + 1, text)

# ══════════════════════════════════════════════════════════════════════════════
# CHART 1 — Single Delivery Flow (with guards and reconciliation)
# ══════════════════════════════════════════════════════════════════════════════

def chart1():
    path = r"C:\Projects\Fuel\docs\delivery_flow_single.pdf"
    c = new_canvas(path, "Dip-Based Delivery Recording — Single Delivery Flow")

    title_text(c, "Dip-Based Delivery Recording — Single Delivery Flow")
    subtitle(c, "Manager enters dip stick readings (cm); system derives volumes, validates, reconciles, and stores.")

    BW = 115   # box width
    BH = 22    # box height
    GAP = 14   # vertical gap between boxes
    CX = W / 2  # centre x of main column

    def bx(row): return CX - BW/2
    def by(row): return H - 60 - row * (BH + GAP)

    # ── Column centres ──
    MAIN  = CX                       # main flow
    LEFT  = 160                      # reject / side path left
    RIGHT = W - 160                  # store / output right

    rows = {}

    # Row 0 — START
    box(c, MAIN - BW/2, by(0), BW, BH, C_ACTOR,
        "Manager opens Fuel Operations", "selects tank, enters date + time", fontsize=7.5)
    rows[0] = (MAIN, by(0))

    # Row 1 — dip inputs
    box(c, MAIN - BW/2, by(1), BW, BH, C_ACTION,
        "Enter: Dip Before (cm)  |  Dip After (cm)", fontsize=7.5)
    rows[1] = (MAIN, by(1))

    # Row 1b — live preview (offset right)
    PW = 95
    px = MAIN + BW/2 + 18
    py = by(1)
    box(c, px, py, PW, BH, C_SYSTEM,
        "onBlur: GET /tank-calibrations/{tank}/convert", "-> shows computed litres read-only", fontsize=6.5)
    arrow(c, MAIN + BW/2, by(1) + BH/2, px, py + BH/2, "live preview")

    # Row 2 — optional fields
    box(c, MAIN - BW/2, by(2), BW, BH, C_ACTION,
        "Enter: Invoice Volume (L)  |  Flowmeter (L)  |  Supplier", fontsize=7)
    rows[2] = (MAIN, by(2))

    # Row 3 — Add to Queue
    box(c, MAIN - BW/2, by(3), BW, BH, C_ACTION,
        "+ Add to Queue  ->  Submit All", fontsize=7.5)
    rows[3] = (MAIN, by(3))

    # Row 4 — POST
    box(c, MAIN - BW/2, by(4), BW, BH, C_SYSTEM,
        "POST /api/v1/tank-readings/deliveries", fontsize=7.5)
    rows[4] = (MAIN, by(4))

    # Row 5 — Guard 1: role
    diamond(c, MAIN, by(5) + BH/2, BW + 10, BH + 4, C_GUARD, "role in (manager, owner)?", 7)
    rows[5] = (MAIN, by(5))

    # Guard 1 reject
    RW = 90
    rx5 = LEFT - RW/2
    ry5 = by(5)
    box(c, rx5, ry5, RW, BH, C_GUARD, "403 Forbidden", fontsize=7.5)
    arrow(c, MAIN - (BW+10)/2, by(5) + BH/2, rx5 + RW, ry5 + BH/2, "No")

    # Row 6 — dip_to_volume
    box(c, MAIN - BW/2, by(6), BW, BH, C_SYSTEM,
        "dip_to_volume(tank, before_cm)  &  dip_to_volume(tank, after_cm)", fontsize=7)
    rows[6] = (MAIN, by(6))

    # Row 7 — Guard 2: after > before
    diamond(c, MAIN, by(7) + BH/2, BW + 10, BH + 4, C_GUARD, "after_dip > before_dip?", 7)
    rows[7] = (MAIN, by(7))

    rx7 = LEFT - RW/2
    ry7 = by(7)
    box(c, rx7, ry7, RW, BH, C_GUARD, "400 after_dip must be > before_dip", fontsize=6.5)
    arrow(c, MAIN - (BW+10)/2, by(7) + BH/2, rx7 + RW, ry7 + BH/2, "No")

    # Row 8 — Guard 3: overfill
    diamond(c, MAIN, by(8) + BH/2, BW + 10, BH + 4, C_GUARD, "volume_after <= capacity?", 7)
    rows[8] = (MAIN, by(8))

    rx8 = LEFT - RW/2
    ry8 = by(8)
    box(c, rx8, ry8, RW, BH, C_GUARD, "400 Exceeds tank capacity", fontsize=6.5)
    arrow(c, MAIN - (BW+10)/2, by(8) + BH/2, rx8 + RW, ry8 + BH/2, "No")

    # Row 9 — Guard 4: sequence
    diamond(c, MAIN, by(9) + BH/2, BW + 14, BH + 4, C_GUARD, "before_vol >= last_delivery.after_vol - tol?", 6.5)
    rows[9] = (MAIN, by(9))

    rx9 = LEFT - RW/2
    ry9 = by(9)
    box(c, rx9, ry9, RW, BH, C_GUARD, "400 Sequence conflict", "check dip order", fontsize=6.5)
    arrow(c, MAIN - (BW+14)/2, by(9) + BH/2, rx9 + RW, ry9 + BH/2, "No")

    # Row 10 — compute recon
    box(c, MAIN - BW/2, by(10), BW, BH, C_RECON,
        "compute_delivery_recon(invoice, flowmeter, dip_actual)", fontsize=7)
    rows[10] = (MAIN, by(10))

    # Row 11 — store
    box(c, MAIN - BW/2, by(11), BW, BH, C_STORE,
        "Store DEL-{tank}-{date}-{hash}  in  tank_deliveries.json", fontsize=7)
    rows[11] = (MAIN, by(11))

    # Row 11b — update tank level (right side)
    SW = 100
    sx = MAIN + BW/2 + 18
    sy = by(11)
    box(c, sx, sy, SW, BH, C_STORE,
        "Update storage.tanks[tank].current_level", "= volume_after", fontsize=6.5)
    arrow(c, MAIN + BW/2, by(11) + BH/2, sx, sy + BH/2)

    # Row 12 — return
    box(c, MAIN - BW/2, by(12), BW, BH, C_END,
        "Return TankDeliveryOutput  (validation_status, recon_status)", fontsize=7)
    rows[12] = (MAIN, by(12))

    # ── main flow arrows ──
    for i in range(12):
        y_top = by(i)
        y_bot = by(i+1) + BH
        arrow(c, MAIN, y_top, MAIN, y_bot)

    # ── legend ──
    lx = 20
    ly = 90
    c.setFillColor(C_LINE)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(lx, ly + 58, "Legend")
    legend_entry(c, lx, ly + 46, C_ACTOR,  "Actor / entry point")
    legend_entry(c, lx, ly + 36, C_ACTION, "User action")
    legend_entry(c, lx, ly + 26, C_SYSTEM, "System step")
    legend_entry(c, lx, ly + 16, C_GUARD,  "Guard / reject")
    legend_entry(c, lx, ly +  6, C_RECON,  "Reconciliation")
    legend_entry(c, lx, ly -  4, C_STORE,  "Data store")
    legend_entry(c, lx, ly - 14, C_END,    "Success output")

    # ── page number ──
    c.setFillColor(HexColor("#888888"))
    c.setFont("Helvetica", 7)
    c.drawRightString(W - 20, 12, "Page 1 of 2  |  Fuel Management System  |  Issue 2 Part 2")

    c.save()
    print(f"Saved: {path}")

# ══════════════════════════════════════════════════════════════════════════════
# CHART 2 — Multi-Delivery Shift Flow (4 deliveries)
# ══════════════════════════════════════════════════════════════════════════════

def chart2():
    path = r"C:\Projects\Fuel\docs\delivery_flow_multi.pdf"
    c = new_canvas(path, "Multi-Delivery Shift Flow — 4 Deliveries with Closing Reconciliation")

    title_text(c, "Multi-Delivery Shift Flow — Intra-Shift Dip Chain & Closing Reconciliation")
    subtitle(c, "Each delivery interrupts the sales period. Sequence guards prevent implausible dips. Closing dip closes the final period.")

    # ── layout constants ──
    # We draw a horizontal timeline of deliveries across the page
    # with a vertical data-flow beneath each one.

    MARGIN = 30
    TY = H - 55       # timeline y-centre
    BH = 20
    BW = 108
    GAP_X = (W - 2*MARGIN - BW) / 3   # horizontal step between delivery columns

    DEL_COLORS = [C_ACTION, C_SYSTEM, C_RECON, C_STORE]

    # Opening row
    OBW = 200
    box(c, W/2 - OBW/2, TY + 18, OBW, BH, C_ACTOR,
        "Shift starts  |  Opening dip taken  ->  opening_volume computed", fontsize=7.5)

    # ── 4 delivery columns ──
    for i in range(4):
        cx = MARGIN + BW/2 + i * GAP_X
        col_color = DEL_COLORS[i]

        # Header: Delivery N
        box(c, cx - BW/2, TY - 14, BW, 20, col_color,
            f"Delivery {i+1}", fontsize=9)

        rows = [
            (C_ACTION, f"Manager enters dip_before_{i+1} cm"),
            (C_ACTION, f"Manager enters dip_after_{i+1} cm"),
            (C_SYSTEM, "dip_to_volume  x2  via calibration"),
        ]
        if i > 0:
            rows.insert(2, (C_GUARD, f"Sequence guard: before_vol_{i+1}"))
            rows.insert(3, (C_GUARD, f">= after_vol_{i}  (prev delivery)"))

        rows += [
            (C_RECON,  "compute_delivery_recon"),
            (C_STORE,  f"Save DEL-{i+1}  ->  tank_deliveries.json"),
            (C_END,    f"actual_{i+1} = after_{i+1} - before_{i+1}"),
        ]

        row_y = TY - 44
        prev_y = TY - 14
        for bg, txt in rows:
            box(c, cx - BW/2, row_y - BH, BW, BH, bg, txt, fontsize=6.5)
            arrow(c, cx, prev_y, cx, row_y)
            prev_y = row_y
            row_y -= BH + 8

        # Sales period annotation (between deliveries)
        if i < 3:
            mid_x = cx + GAP_X/2
            sp_y = TY + 10
            c.setFillColor(HexColor("#888888"))
            c.setFont("Helvetica-Oblique", 6.5)
            c.drawCentredString(mid_x, sp_y,
                f"Sales period {i+1}: after_{i+1} -> before_{i+2}")
            # dashed horizontal line
            c.setDash(3, 3)
            c.setStrokeColor(HexColor("#AAAAAA"))
            c.setLineWidth(0.6)
            c.line(cx + BW/2 + 4, TY + 5, cx + GAP_X - BW/2 - 4, TY + 5)
            c.setDash()

    # ── Closing section ──
    CLOSE_X = W - MARGIN - BW/2
    close_rows = [
        (C_ACTOR,  "End of shift"),
        (C_ACTION, "Manager enters closing_dip cm"),
        (C_SYSTEM, "closing_volume = dip_to_volume(closing_dip)"),
        (C_STORE,  "Tank reading record:"),
        (C_STORE,  "opening_vol, closing_vol, deliveries[]"),
        (C_RECON,  "Tank movement formula:"),
        (C_RECON,  "(open - close) + sum(actual_N)"),
        (C_END,    "Reconciliation complete"),
    ]
    row_y = TY - 14
    prev_y = TY + 38
    for bg, txt in close_rows:
        box(c, CLOSE_X - BW/2, row_y - BH, BW, BH, bg, txt, fontsize=6.5)
        if prev_y < row_y:
            arrow(c, CLOSE_X, prev_y, CLOSE_X, row_y)
        prev_y = row_y
        row_y -= BH + 8

    # ── formula box at bottom ──
    FW = 420
    FH = 32
    fx = W/2 - FW/2
    fy = 28
    c.setFillColor(HexColor("#E2EFDA"))
    c.setStrokeColor(C_STORE)
    c.setLineWidth(1)
    c.roundRect(fx, fy, FW, FH, 4, fill=1, stroke=1)
    c.setFillColor(C_STORE)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(W/2, fy + FH - 13, "Tank Volume Movement  =  (opening_vol - closing_vol)  +  actual_1  +  actual_2  +  actual_3  +  actual_4")
    c.setFont("Helvetica", 7)
    c.setFillColor(HexColor("#444444"))
    c.drawCentredString(W/2, fy + 7, "Each actual_N is dip-derived (after_N - before_N).  Sales extracted implicitly.  No manual volume entry required.")

    # ── legend ──
    lx = W - 145
    ly = H - 110
    c.setFillColor(C_LINE)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(lx, ly + 58, "Legend")
    legend_entry(c, lx, ly + 46, C_ACTOR,  "Actor / shift event")
    legend_entry(c, lx, ly + 36, C_ACTION, "Manager input")
    legend_entry(c, lx, ly + 26, C_SYSTEM, "System computation")
    legend_entry(c, lx, ly + 16, C_GUARD,  "Sequence guard")
    legend_entry(c, lx, ly +  6, C_RECON,  "Reconciliation / formula")
    legend_entry(c, lx, ly -  4, C_STORE,  "Data store write")
    legend_entry(c, lx, ly - 14, C_END,    "Derived value / terminal")

    c.setFillColor(HexColor("#888888"))
    c.setFont("Helvetica", 7)
    c.drawRightString(W - 20, 12, "Page 2 of 2  |  Fuel Management System  |  Issue 2 Part 2")

    c.save()
    print(f"Saved: {path}")

chart1()
chart2()
print("Done.")
