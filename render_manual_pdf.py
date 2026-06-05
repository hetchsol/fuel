#!/usr/bin/env python3
"""Render a Markdown manual to a polished, professional A4 PDF with reportlab.

Supports the subset used by the project manuals: # / ## / ### headings,
bullet and numbered lists (with nesting), > callout/blockquotes, --- rules,
**bold**, and `inline code`. Adds a title block, styled section headings,
callout boxes, and a footer with page numbers.

Usage: python render_manual_pdf.py INPUT.md OUTPUT.pdf "Document Title" ["Subtitle"]
"""
import sys
import re
import html
from datetime import date

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, HRFlowable, Table, TableStyle, KeepTogether,
    PageBreak,
)

# Palette
BLUE = HexColor("#1f4e79")
BLUE_SOFT = HexColor("#d6e2f0")
DARK = HexColor("#1a1a1a")
GREY = HexColor("#5b5b5b")
RULE = HexColor("#c9d6e6")
CALLOUT_BG = HexColor("#eef3fa")

_styles = getSampleStyleSheet()
TITLE = ParagraphStyle("T", parent=_styles["Heading1"], fontName="Helvetica-Bold",
                       fontSize=26, leading=30, textColor=BLUE, spaceAfter=4)
SUBTITLE = ParagraphStyle("Sub", parent=_styles["Normal"], fontSize=12, leading=16,
                          textColor=GREY, spaceAfter=2)
META = ParagraphStyle("Meta", parent=_styles["Normal"], fontSize=9, textColor=GREY)
H1 = ParagraphStyle("H1", parent=_styles["Heading1"], fontName="Helvetica-Bold",
                    fontSize=15, leading=19, textColor=BLUE, spaceBefore=16, spaceAfter=4)
H2 = ParagraphStyle("H2", parent=_styles["Heading2"], fontName="Helvetica-Bold",
                    fontSize=12, leading=16, textColor=DARK, spaceBefore=11, spaceAfter=4)
H3 = ParagraphStyle("H3", parent=_styles["Heading3"], fontName="Helvetica-BoldOblique",
                    fontSize=10.5, leading=14, textColor=GREY, spaceBefore=8, spaceAfter=3)
BODY = ParagraphStyle("B", parent=_styles["Normal"], fontSize=10, leading=14.5,
                      textColor=DARK, spaceAfter=6)
LI = ParagraphStyle("LI", parent=BODY, spaceAfter=3, leading=14)
CALLOUT = ParagraphStyle("C", parent=BODY, fontSize=9.5, leading=13.5, textColor=GREY)

# Cover-page styles (centered)
COVER_BRAND = ParagraphStyle("CvBrand", parent=_styles["Normal"], fontName="Helvetica-Bold",
                             fontSize=12, textColor=GREY, alignment=1, spaceAfter=2)
COVER_TITLE = ParagraphStyle("CvTitle", parent=_styles["Heading1"], fontName="Helvetica-Bold",
                             fontSize=34, leading=40, textColor=BLUE, alignment=1, spaceAfter=6)
COVER_SUB = ParagraphStyle("CvSub", parent=_styles["Normal"], fontSize=14, leading=20,
                           textColor=DARK, alignment=1, spaceAfter=2)
COVER_META = ParagraphStyle("CvMeta", parent=_styles["Normal"], fontSize=10, textColor=GREY,
                            alignment=1)

CONTENT_W = A4[0] - 4 * cm
_FOOTER = "Manual"


def cover(title, subtitle):
    """A standalone title page."""
    return [
        Spacer(1, 5.5 * cm),
        Paragraph("NEXTSTOP", COVER_BRAND),
        Spacer(1, 0.5 * cm),
        HRFlowable(width=5 * cm, thickness=3, color=BLUE, hAlign="CENTER", spaceAfter=12),
        Paragraph(inline(title), COVER_TITLE),
        Paragraph(inline(subtitle), COVER_SUB) if subtitle else Spacer(1, 0),
        Spacer(1, 0.3 * cm),
        Paragraph("User Manual", COVER_SUB),
        Spacer(1, 6 * cm),
        Paragraph(f"Generated {date.today().isoformat()}", COVER_META),
        PageBreak(),
    ]


# Map common typographic characters to plain ASCII. Using \u escapes so the
# source file itself stays ASCII.
_ASCII_MAP = {
    "‐": "-", "‑": "-", "‒": "-", "–": "-",  # hyphens / dashes
    "—": "-", "―": "-",                                 # em dash / bar
    "‘": "'", "’": "'", "“": '"', "”": '"',   # curly quotes
    "…": "...", " ": " ",                               # ellipsis / nbsp
}


def inline(text: str) -> str:
    # Normalise known typographic characters, then hard-drop any remaining
    # non-ASCII so the PDF can never render a missing-glyph box.
    for k, v in _ASCII_MAP.items():
        text = text.replace(k, v)
    text = "".join(ch for ch in text if ord(ch) < 128)
    text = html.escape(text, quote=False)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"`([^`]+?)`", r'<font face="Courier" size="9">\1</font>', text)
    return text


def callout(text: str):
    t = Table([[Paragraph(inline(text), CALLOUT)]], colWidths=[CONTENT_W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CALLOUT_BG),
        ("LINEBEFORE", (0, 0), (0, -1), 3, BLUE),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return t


def _cover_canvas(canvas, doc):
    """First page is the cover — no footer."""
    return


def _on_page(canvas, doc):
    # Content pages: footer with title and a page number (cover is page 1, so
    # content starts at "Page 1").
    canvas.saveState()
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.5)
    canvas.line(2 * cm, 1.45 * cm, A4[0] - 2 * cm, 1.45 * cm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(GREY)
    canvas.drawString(2 * cm, 1.0 * cm, _FOOTER)
    canvas.drawRightString(A4[0] - 2 * cm, 1.0 * cm, f"Page {doc.page - 1}")
    canvas.restoreState()


def build(md_path, pdf_path, title, subtitle):
    global _FOOTER
    _FOOTER = title
    with open(md_path, encoding="utf-8") as f:
        lines = f.read().splitlines()

    # Cover page, then the content begins on its own page.
    flow = cover(title, subtitle)

    first_h1_skipped = False
    para_buf, quote_buf = [], []

    def flush_para():
        if para_buf:
            flow.append(Paragraph(inline(" ".join(para_buf)), BODY))
            para_buf.clear()

    def flush_quote():
        if quote_buf:
            flow.append(callout(" ".join(quote_buf)))
            flow.append(Spacer(1, 4))
            quote_buf.clear()

    for raw in lines:
        stripped = raw.strip()

        if not stripped:
            flush_para(); flush_quote()
            continue

        if stripped.startswith("> "):
            flush_para()
            quote_buf.append(stripped[2:])
            continue
        flush_quote()

        if stripped == "---":
            flush_para()
            flow.append(Spacer(1, 6))
            flow.append(HRFlowable(width="100%", thickness=0.6, color=RULE))
            flow.append(Spacer(1, 4))
            continue

        m = re.match(r"^(#{1,4})\s+(.*)$", stripped)
        if m:
            flush_para()
            level, txt = len(m.group(1)), m.group(2)
            if level == 1 and not first_h1_skipped:
                first_h1_skipped = True       # title already rendered above
                continue
            if level == 2:                    # section: heading + underline rule
                flow.append(KeepTogether([
                    Paragraph(inline(txt), H1),
                    HRFlowable(width="100%", thickness=0.75, color=BLUE_SOFT, spaceBefore=2, spaceAfter=2),
                ]))
            else:
                flow.append(Paragraph(inline(txt), H2 if level == 3 else H3))
            continue

        lm = re.match(r"^(\s*)([-*]|\d+\.)\s+(.*)$", raw)
        if lm:
            flush_para()
            depth = len(lm.group(1)) // 2
            marker, txt = lm.group(2), lm.group(3)
            bullet = "•" if marker in ("-", "*") else marker
            style = ParagraphStyle(f"li{depth}", parent=LI,
                                   leftIndent=16 + depth * 16, bulletIndent=depth * 16)
            flow.append(Paragraph(inline(txt), style, bulletText=bullet))
            continue

        para_buf.append(stripped)

    flush_para(); flush_quote()

    doc = SimpleDocTemplate(pdf_path, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm,
                            topMargin=1.8 * cm, bottomMargin=2.0 * cm, title=title)
    n = len(flow)
    doc.build(flow, onFirstPage=_cover_canvas, onLaterPages=_on_page)
    print(f"Wrote {pdf_path} ({n} blocks)")


if __name__ == "__main__":
    md = sys.argv[1] if len(sys.argv) > 1 else "OPERATOR_MANUAL.md"
    pdf = sys.argv[2] if len(sys.argv) > 2 else "OPERATOR_MANUAL.pdf"
    title = sys.argv[3] if len(sys.argv) > 3 else "Operator (Attendant) Manual"
    subtitle = sys.argv[4] if len(sys.argv) > 4 else "Fuel Station Management System"
    build(md, pdf, title, subtitle)
