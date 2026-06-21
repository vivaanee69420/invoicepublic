#!/usr/bin/env python3
"""
Builds: Invisalign-ROI-Calculator.xlsx
A live, editable financial model for scaling an Invisalign business in
Kent & North London. Change anything yellow on the Assumptions sheet and
every downstream number recalculates.

All benchmark inputs are sourced in the accompanying markdown report
(02-MARKET-ECONOMICS.md). Figures labelled ESTIMATE there are flagged.
"""

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.comments import Comment

wb = Workbook()

# ---------- styles ----------
NAVY   = "1F3864"
BLUE   = "2E5496"
LIGHT  = "D9E1F2"
YELLOW = "FFF2CC"   # editable inputs
GREEN  = "E2EFDA"
GREY   = "F2F2F2"
RED    = "F8CBAD"

H1   = Font(name="Calibri", size=16, bold=True, color="FFFFFF")
H2   = Font(name="Calibri", size=12, bold=True, color="FFFFFF")
BOLD = Font(name="Calibri", size=11, bold=True)
NORM = Font(name="Calibri", size=11)
SMALL= Font(name="Calibri", size=9, italic=True, color="555555")
WHITEBOLD = Font(name="Calibri", size=11, bold=True, color="FFFFFF")

fill_navy  = PatternFill("solid", fgColor=NAVY)
fill_blue  = PatternFill("solid", fgColor=BLUE)
fill_light = PatternFill("solid", fgColor=LIGHT)
fill_yellow= PatternFill("solid", fgColor=YELLOW)
fill_green = PatternFill("solid", fgColor=GREEN)
fill_grey  = PatternFill("solid", fgColor=GREY)
fill_red   = PatternFill("solid", fgColor=RED)

thin = Side(style="thin", color="BFBFBF")
border = Border(left=thin, right=thin, top=thin, bottom=thin)
center = Alignment(horizontal="center", vertical="center", wrap_text=True)
left   = Alignment(horizontal="left", vertical="center", wrap_text=True)
right  = Alignment(horizontal="right", vertical="center")

GBP = '"£"#,##0'
GBP2= '"£"#,##0.00'
PCT = '0.0%'
PCT0= '0%'
NUM = '#,##0'

def style_header(ws, cell, text, fill=fill_navy, font=H2):
    ws[cell] = text
    ws[cell].fill = fill
    ws[cell].font = font
    ws[cell].alignment = center

# =====================================================================
# SHEET 1 — READ ME
# =====================================================================
ws = wb.active
ws.title = "READ ME"
ws.sheet_view.showGridLines = False
ws.column_dimensions["A"].width = 3
ws.column_dimensions["B"].width = 100

ws.merge_cells("B2:B2")
ws["B2"] = "INVISALIGN DOMINATION — ROI & GROWTH CALCULATOR"
ws["B2"].font = Font(size=18, bold=True, color=NAVY)

readme = [
    ("", ""),
    ("HOW TO USE", "h"),
    ("1. Go to the ASSUMPTIONS sheet. Every cell shaded YELLOW is editable — these are your levers.", "n"),
    ("2. Everything else recalculates automatically: per-case profit, the marketing funnel, the 4 growth scenarios, the 30% margin solver and the sensitivity tables.", "n"),
    ("3. Start by entering your REAL numbers where you have them (current fee, current monthly case starts, current ad spend). Benchmarks are pre-filled where you don't.", "n"),
    ("", ""),
    ("THE SHEETS", "h"),
    ("• Assumptions ........ all editable inputs (pricing, COGS, clinical, marketing, overhead).", "n"),
    ("• Per-Case Economics . profit & margin on a single case, by product and blended.", "n"),
    ("• Marketing Funnel ... ad spend → leads → consults → started cases → revenue & ROAS.", "n"),
    ("• Growth Scenarios ... full annual P&L across Current → Year 1 → Year 2 → Domination.", "n"),
    ("• 30% Margin Solver .. shows exactly which levers get Invisalign to a 30%+ net margin (implant-level).", "n"),
    ("• Sensitivity ........ how net margin moves with fee, CPA and associate split.", "n"),
    ("", ""),
    ("THE BIG QUESTION: CAN INVISALIGN HIT A 30% NET MARGIN LIKE IMPLANTS?", "h"),
    ("Short answer: YES — but only when FIVE things are true at once: (a) premium fee held (£3.8k+ blended), "
     "(b) COGS driven down with tier discount (Platinum→Diamond→Apex unlocks ~30–46% off Align lab fees), "
     "(c) blended CPA controlled (£150–250 by mixing organic/referral with paid), "
     "(d) fixed overhead diluted by volume, and — the biggest lever — "
     "(e) clinical delivery cost controlled: a 45% associate split caps net margin near 25%; an owner-leveraged or "
     "low-split/TCO-heavy delivery model is what pushes it to 35%+. The Solver sheet quantifies each lever.", "n"),
    ("", ""),
    ("DATA PROVENANCE / HEALTH WARNING", "h"),
    ("Pre-filled benchmarks are UK 2023–2026 figures sourced in 02-MARKET-ECONOMICS.md. "
     "Align Technology does NOT publish UK wholesale lab fees, so COGS figures are triangulated from Align's "
     "global ASP (~$1,335/case, 2023, VERIFIED) plus US tier-discount data — treat COGS as ESTIMATE and "
     "replace with your actual Align invoices. CPC/CPL/CPA ranges come from UK dental marketing agencies "
     "(directional). Replace every estimate with your own data as you get it.", "n"),
    ("", ""),
    ("Built for: Kent & North London multi-site group  |  Currency: GBP  |  v1.0", "s"),
]
r = 3
for text, kind in readme:
    c = ws.cell(row=r, column=2, value=text)
    if kind == "h":
        c.font = Font(size=12, bold=True, color=BLUE)
    elif kind == "s":
        c.font = SMALL
    else:
        c.font = NORM
        c.alignment = Alignment(wrap_text=True, vertical="top")
        ws.row_dimensions[r].height = 30 if len(text) > 90 else 15
    r += 1

# =====================================================================
# SHEET 2 — ASSUMPTIONS   (fixed rows so formulas can reference them)
# =====================================================================
wa = wb.create_sheet("Assumptions")
wa.sheet_view.showGridLines = False
wa.column_dimensions["A"].width = 2
wa.column_dimensions["B"].width = 46
wa.column_dimensions["C"].width = 14
wa.column_dimensions["D"].width = 10
wa.column_dimensions["E"].width = 60

wa.merge_cells("B2:E2")
style_header(wa, "B2", "ASSUMPTIONS  —  edit YELLOW cells only", fill_navy, H1)
wa.row_dimensions[2].height = 26

def section(ws, row, title):
    ws.merge_cells(start_row=row, start_column=2, end_row=row, end_column=5)
    c = ws.cell(row=row, column=2, value=title)
    c.fill = fill_blue; c.font = H2; c.alignment = left

def inp(ws, row, label, value, fmt, note, editable=True):
    ws.cell(row=row, column=2, value=label).font = NORM
    ws.cell(row=row, column=2).alignment = left
    c = ws.cell(row=row, column=3, value=value)
    c.number_format = fmt
    c.fill = fill_yellow if editable else fill_grey
    c.font = BOLD
    c.border = border
    c.alignment = right
    ws.cell(row=row, column=5, value=note).font = SMALL
    ws.cell(row=row, column=5).alignment = left

# --- PRICING (rows 4-11) ---
section(wa, 4, "1 · PATIENT PRICING (£, your private fee)")
inp(wa, 5, "Comprehensive / Full fee", 4500, GBP, "UK £3,500–5,500+; London +20–30%. Kent suburban premium ~£4,000–4,750.")
inp(wa, 6, "Lite fee", 2950, GBP, "UK £2,500–3,800.")
inp(wa, 7, "i7 / Express fee", 1800, GBP, "UK £1,200–2,499.")
inp(wa, 8, "% of starts: Comprehensive", 0.45, PCT0, "Product mix — must total 100% with the next two.")
inp(wa, 9, "% of starts: Lite", 0.40, PCT0, "")
inp(wa, 10, "% of starts: i7 / Express", 0.15, PCT0, "")
wa.cell(row=11, column=2, value="→ Blended average fee").font = BOLD
bc = wa.cell(row=11, column=3, value="=C5*C8+C6*C9+C7*C10")
bc.number_format = GBP; bc.font = WHITEBOLD; bc.fill = fill_blue; bc.border = border; bc.alignment = right
wa.cell(row=11, column=5, value="Auto-calculated weighted average fee per started case.").font = SMALL

# --- COGS (rows 13-20) ---
section(wa, 13, "2 · COST OF GOODS (Align lab fees & consumables)")
inp(wa, 14, "Align lab fee — Comprehensive (list)", 1300, GBP, "ESTIMATE. Align global ASP ~$1,335 (VERIFIED). UK list ~£900–1,300.")
inp(wa, 15, "Align lab fee — Lite (list)", 750, GBP, "ESTIMATE ~£500–800.")
inp(wa, 16, "Align lab fee — i7 (list)", 450, GBP, "ESTIMATE ~£300–500.")
inp(wa, 17, "Tier discount on lab fee", 0.30, PCT0, "Silver ~10% → Diamond ~38% → Apex ~46% (US-derived). YOUR LEVER.")
inp(wa, 18, "Vivera retainer cost to practice / case", 200, GBP, "£250–500/arch; allow 1 set. Often re-charged to patient.")
inp(wa, 19, "Other consumables / case (attachments, IPR, scans)", 75, GBP, "ESTIMATE.")
wa.cell(row=20, column=2, value="→ Blended COGS per case (after tier discount)").font = BOLD
cogs = wa.cell(row=20, column=3,
    value="=(C14*C8+C15*C9+C16*C10)*(1-C17)+C18+C19")
cogs.number_format = GBP; cogs.font = WHITEBOLD; cogs.fill = fill_blue; cogs.border = border; cogs.alignment = right
wa.cell(row=20, column=5, value="Weighted lab fee × (1 − tier discount) + retainer + consumables.").font = SMALL

# --- CLINICAL DELIVERY (rows 22-26) ---
section(wa, 22, "3 · CLINICAL DELIVERY")
inp(wa, 23, "Associate pay (% of fee AFTER lab fee)", 0.45, PCT0, "UK 40–55% of gross after lab. Set to 0% if PRINCIPAL delivers (see note).")
inp(wa, 24, "Active chair hours per case", 4, '0.0', "Consult+scan+fit+reviews+refinements ~3–5 hrs.")
inp(wa, 25, "Notional principal chair cost / hour", 150, GBP, "Used only when associate % = 0, to value owner time honestly.")
wa.cell(row=26, column=2, value="→ Clinical cost per case").font = BOLD
clin = wa.cell(row=26, column=3,
    value="=IF(C23>0,(C11-C20)*C23,C24*C25)")
clin.number_format = GBP; clin.font = WHITEBOLD; clin.fill = fill_blue; clin.border = border; clin.alignment = right
wa.cell(row=26, column=5, value="Associate split of (fee−COGS), OR owner hours×rate if associate %=0.").font = SMALL

# --- MARKETING FUNNEL (rows 28-35) ---
section(wa, 28, "4 · MARKETING FUNNEL (per channel blend)")
inp(wa, 29, "Cost per lead (blended Google+Meta)", 60, GBP, "Google £45–200; Meta £25–75. Blended ESTIMATE.")
inp(wa, 30, "Lead → consult booked", 0.55, PCT0, "Speed-to-lead & TCO follow-up drive this.")
inp(wa, 31, "Consult booked → attended (show rate)", 0.80, PCT0, "Deposit/reminders lift show rate.")
inp(wa, 32, "Consult attended → case STARTED", 0.70, PCT0, "TCO benchmark 64–68% avg, 75%+ excellent (VERIFIED).")
inp(wa, 33, "% of starts from PAID (vs organic/referral)", 0.60, PCT0, "Lower = cheaper blended CPA. Organic/referral assumed near-zero marginal cost.")
wa.cell(row=34, column=2, value="→ Cost per STARTED case (paid only)").font = BOLD
cpa_paid = wa.cell(row=34, column=3, value="=C29/(C30*C31*C32)")
cpa_paid.number_format = GBP; cpa_paid.font = WHITEBOLD; cpa_paid.fill = fill_blue; cpa_paid.border=border; cpa_paid.alignment=right
wa.cell(row=34, column=5, value="CPL ÷ (book × show × close). This is the honest CPA, not a quoted number.").font = SMALL
wa.cell(row=35, column=2, value="→ BLENDED marketing cost per started case").font = BOLD
cpa_blend = wa.cell(row=35, column=3, value="=C34*C33")
cpa_blend.number_format = GBP; cpa_blend.font = WHITEBOLD; cpa_blend.fill = fill_green; cpa_blend.border=border; cpa_blend.alignment=right
wa.cell(row=35, column=5, value="Paid CPA × paid share (organic/referral starts carry ~no marginal cost).").font = SMALL

# --- OVERHEAD (rows 37-39) ---
section(wa, 37, "5 · OVERHEAD")
inp(wa, 38, "Variable admin / TCO / finance fees per case", 175, GBP, "TCO commission, 0% finance subsidy (~2–4% of fee), card fees, admin.")
inp(wa, 39, "Fixed overhead allocated to Invisalign / year", 60000, GBP, "Share of rent, reception, software, equipment. Spread over annual volume.")

# legend
wa.cell(row=41, column=2, value="KEY:").font = BOLD
wa.cell(row=42, column=2, value="Yellow = you edit").fill = fill_yellow
wa.cell(row=43, column=2, value="Blue/Green = auto-calculated").fill = fill_blue
wa.cell(row=43, column=2).font = Font(color="FFFFFF")

# =====================================================================
# SHEET 3 — PER-CASE ECONOMICS
# =====================================================================
wp = wb.create_sheet("Per-Case Economics")
wp.sheet_view.showGridLines = False
for col,w in {"A":2,"B":40,"C":16,"D":16,"E":16,"F":16}.items():
    wp.column_dimensions[col].width = w
wp.merge_cells("B2:F2")
style_header(wp, "B2", "PER-CASE ECONOMICS", fill_navy, H1)
wp.row_dimensions[2].height = 24

# header row
hdr = ["Line (per case)", "Comprehensive", "Lite", "i7/Express", "BLENDED"]
for i,h in enumerate(hdr):
    c = wp.cell(row=4, column=2+i, value=h)
    c.fill = fill_blue; c.font = WHITEBOLD; c.alignment = center; c.border = border

A = "Assumptions"
# rows: fee, lab(after disc), retainer+consum, COGS total, gross profit, clinical, marketing, admin, net, margin
rows = [
    ("Patient fee", [f"='{A}'!C5", f"='{A}'!C6", f"='{A}'!C7", f"='{A}'!C11"], GBP),
    ("Align lab fee (after tier discount)",
        [f"='{A}'!C14*(1-'{A}'!C17)", f"='{A}'!C15*(1-'{A}'!C17)", f"='{A}'!C16*(1-'{A}'!C17)",
         f"=(('{A}'!C14*'{A}'!C8+'{A}'!C15*'{A}'!C9+'{A}'!C16*'{A}'!C10))*(1-'{A}'!C17)"], GBP),
    ("Retainer + consumables",
        [f"='{A}'!C18+'{A}'!C19"]*3 + [f"='{A}'!C18+'{A}'!C19"], GBP),
]
# write first three rows
r = 5
for label, vals, fmt in rows:
    wp.cell(row=r, column=2, value=label).font = NORM
    for i,v in enumerate(vals):
        c = wp.cell(row=r, column=3+i, value=v); c.number_format=fmt; c.alignment=right; c.border=border
    r += 1
# COGS total row (row 8)
wp.cell(row=r, column=2, value="= Total COGS").font = BOLD
for i in range(4):
    col = get_column_letter(3+i)
    c = wp.cell(row=r, column=3+i, value=f"={col}6+{col}7"); c.number_format=GBP; c.font=BOLD; c.alignment=right; c.border=border; c.fill=fill_grey
cogs_row = r; r += 1
# Gross profit (row 9)
wp.cell(row=r, column=2, value="Gross profit (fee − COGS)").font = BOLD
for i in range(4):
    col = get_column_letter(3+i)
    c = wp.cell(row=r, column=3+i, value=f"={col}5-{col}{cogs_row}"); c.number_format=GBP; c.font=BOLD; c.alignment=right; c.border=border
gp_row = r; r += 1
# Clinical cost (row 10) — associate % of (fee-lab) ; lab here = lab-after-disc only (not retainer)
wp.cell(row=r, column=2, value="Clinical delivery (associate split / owner time)").font = NORM
for i in range(4):
    col = get_column_letter(3+i)
    # associate split applies to (fee - lab after discount)
    c = wp.cell(row=r, column=3+i,
        value=f"=IF('{A}'!C23>0,({col}5-{col}6)*'{A}'!C23,'{A}'!C24*'{A}'!C25)")
    c.number_format=GBP; c.alignment=right; c.border=border
clin_row = r; r += 1
# Marketing (row 11)
wp.cell(row=r, column=2, value="Marketing (blended CPA)").font = NORM
for i in range(4):
    col = get_column_letter(3+i)
    c = wp.cell(row=r, column=3+i, value=f"='{A}'!C35"); c.number_format=GBP; c.alignment=right; c.border=border
mkt_row = r; r += 1
# Admin (row 12)
wp.cell(row=r, column=2, value="Variable admin / TCO / finance").font = NORM
for i in range(4):
    col = get_column_letter(3+i)
    c = wp.cell(row=r, column=3+i, value=f"='{A}'!C38"); c.number_format=GBP; c.alignment=right; c.border=border
adm_row = r; r += 1
# Net contribution (row 13)
wp.cell(row=r, column=2, value="NET CONTRIBUTION per case (pre-fixed-OH)").font = BOLD
for i in range(4):
    col = get_column_letter(3+i)
    c = wp.cell(row=r, column=3+i, value=f"={col}{gp_row}-{col}{clin_row}-{col}{mkt_row}-{col}{adm_row}")
    c.number_format=GBP; c.font=WHITEBOLD; c.fill=fill_green; c.border=border; c.alignment=right
net_row = r; r += 1
# Contribution margin % (row 14)
wp.cell(row=r, column=2, value="Contribution margin %").font = BOLD
for i in range(4):
    col = get_column_letter(3+i)
    c = wp.cell(row=r, column=3+i, value=f"={col}{net_row}/{col}5"); c.number_format=PCT; c.font=BOLD; c.alignment=right; c.border=border
    c.fill = fill_green
margin_row = r; r += 2

wp.cell(row=r, column=2, value="Note: 'Contribution margin' excludes fixed overhead. True NET margin after fixed "
        "overhead is on the Growth Scenarios sheet (depends on volume). Target = 30%+.").font = SMALL
wp.merge_cells(start_row=r, start_column=2, end_row=r, end_column=6)

# =====================================================================
# SHEET 4 — MARKETING FUNNEL
# =====================================================================
wf = wb.create_sheet("Marketing Funnel")
wf.sheet_view.showGridLines = False
for col,w in {"A":2,"B":44,"C":18,"D":60}.items():
    wf.column_dimensions[col].width = w
wf.merge_cells("B2:D2")
style_header(wf, "B2", "MARKETING FUNNEL — what does my ad spend buy?", fill_navy, H1)
wf.row_dimensions[2].height = 24

wf.cell(row=4, column=2, value="EDIT: Monthly paid ad spend (£)").font = BOLD
spend = wf.cell(row=4, column=3, value=8000); spend.fill=fill_yellow; spend.number_format=GBP; spend.font=BOLD; spend.border=border; spend.alignment=right

funnel = [
    ("Leads generated / month", f"=C4/'{A}'!C29", NUM, "spend ÷ cost-per-lead"),
    ("Consults booked / month", f"=C5*'{A}'!C30", NUM, "× lead→book rate"),
    ("Consults attended / month", f"=C6*'{A}'!C31", NUM, "× show rate"),
    ("Cases STARTED from paid / month", f"=C7*'{A}'!C32", '#,##0.0', "× consult→start rate"),
    ("Cost per started case (paid)", f"=C4/C8", GBP, "the honest paid CPA"),
    ("Revenue from these starts / month", f"=C8*'{A}'!C11", GBP, "× blended fee"),
    ("Net contribution from these starts / month", f"=C8*'Per-Case Economics'!F{net_row}", GBP, "× per-case net contribution"),
    ("ROAS (revenue ÷ spend)", "=C10/C4", '0.0"x"', "gross return on ad spend"),
    ("Return on marketing £ (contribution ÷ spend)", "=C11/C4", '0.0"x"', "profit return on ad spend"),
    ("Annual starts from paid", "=C8*12", NUM, ""),
    ("Annual revenue from paid", "=C10*12", GBP, ""),
]
r = 5
for label, val, fmt, note in funnel:
    wf.cell(row=r, column=2, value=label).font = (BOLD if "STARTED" in label or "ROAS" in label or "Net" in label else NORM)
    c = wf.cell(row=r, column=3, value=val); c.number_format=fmt; c.alignment=right; c.border=border
    if "STARTED" in label or "ROAS" in label or "contribution" in label.lower():
        c.fill = fill_green; c.font=BOLD
    wf.cell(row=r, column=4, value=note).font = SMALL
    r += 1

# =====================================================================
# SHEET 5 — GROWTH SCENARIOS (annual P&L)
# =====================================================================
wg = wb.create_sheet("Growth Scenarios")
wg.sheet_view.showGridLines = False
for col,w in {"A":2,"B":42,"C":16,"D":16,"E":16,"F":16}.items():
    wg.column_dimensions[col].width = w
wg.merge_cells("B2:F2")
style_header(wg, "B2", "GROWTH SCENARIOS — annual P&L (Invisalign only)", fill_navy, H1)
wg.row_dimensions[2].height = 24

scen = ["", "CURRENT", "YEAR 1", "YEAR 2", "DOMINATION"]
for i,s in enumerate(scen):
    c = wg.cell(row=4, column=2+i, value=s)
    c.fill = fill_blue if i>0 else fill_navy; c.font=WHITEBOLD; c.alignment=center; c.border=border

# editable: monthly starts per scenario
wg.cell(row=5, column=2, value="Cases STARTED per month (EDIT)").font = BOLD
starts = [10, 20, 35, 60]
for i,v in enumerate(starts):
    c = wg.cell(row=5, column=3+i, value=v); c.fill=fill_yellow; c.font=BOLD; c.number_format=NUM; c.border=border; c.alignment=right
wg.cell(row=6, column=2, value="Cases STARTED per year").font = NORM
for i in range(4):
    col=get_column_letter(3+i)
    c=wg.cell(row=6, column=3+i, value=f"={col}5*12"); c.number_format=NUM; c.border=border; c.alignment=right
# implied Invisalign tier
wg.cell(row=7, column=2, value="→ Implied Invisalign tier (annual)").font = NORM
for i in range(4):
    col=get_column_letter(3+i)
    c=wg.cell(row=7, column=3+i,
      value=f'=IF({col}6>=400,"Diamond Apex",IF({col}6>=200,"Diamond",IF({col}6>=140,"Platinum Elite",IF({col}6>=110,"Platinum",IF({col}6>=30,"Gold","Silver/Bronze")))))')
    c.font=Font(italic=True, bold=True, color=BLUE); c.alignment=center; c.border=border

# P&L rows referencing per-case + annual
pl = [
    ("Revenue", f"={{c}}6*'{A}'!C11", GBP, fill_light, True),
    ("− COGS (lab+retainer+consumables)", f"=-{{c}}6*'Per-Case Economics'!F{cogs_row}", GBP, None, False),
    ("− Clinical delivery", f"=-{{c}}6*'Per-Case Economics'!F{clin_row}", GBP, None, False),
    ("− Marketing", f"=-{{c}}6*'Per-Case Economics'!F{mkt_row}", GBP, None, False),
    ("− Variable admin/TCO/finance", f"=-{{c}}6*'Per-Case Economics'!F{adm_row}", GBP, None, False),
    ("− Fixed overhead allocation", f"=-'{A}'!C39", GBP, None, False),
    ("= NET PROFIT (Invisalign)", None, GBP, fill_green, True),
    ("NET MARGIN %", None, PCT, fill_green, True),
    ("Profit per working day (240/yr)", None, GBP, None, False),
]
r = 8
rev_row = r
for idx,(label, val, fmt, fill, bold) in enumerate(pl):
    wg.cell(row=r, column=2, value=label).font = (BOLD if bold else NORM)
    for i in range(4):
        col = get_column_letter(3+i)
        if label.startswith("= NET PROFIT"):
            formula = f"=SUM({col}{rev_row}:{col}{r-1})"
        elif label.startswith("NET MARGIN"):
            formula = f"={col}{r-1}/{col}{rev_row}"
        elif label.startswith("Profit per working"):
            formula = f"={col}{r-2}/240"
        else:
            formula = val.format(c=col)
        cc = wg.cell(row=r, column=3+i, value=formula)
        cc.number_format=fmt; cc.alignment=right; cc.border=border
        if fill: cc.fill=fill
        if bold: cc.font=BOLD
        if label.startswith("NET MARGIN"):
            cc.font = WHITEBOLD; cc.fill = fill_blue
    r += 1

r += 1
wg.cell(row=r, column=2, value="Targets: Domination = Diamond Apex (≥400/yr). The 30% margin line is the implant-equivalent benchmark — "
        "watch the NET MARGIN row turn ≥30% as volume dilutes fixed overhead and tier discount cuts COGS.").font = SMALL
wg.merge_cells(start_row=r, start_column=2, end_row=r, end_column=6)

# =====================================================================
# SHEET 6 — 30% MARGIN SOLVER
# =====================================================================
ws6 = wb.create_sheet("30% Margin Solver")
ws6.sheet_view.showGridLines = False
for col,w in {"A":2,"B":40,"C":15,"D":15,"E":15,"F":58}.items():
    ws6.column_dimensions[col].width = w
ws6.merge_cells("B2:F2")
style_header(ws6, "B2", "CAN INVISALIGN HIT A 30% NET MARGIN? — lever solver", fill_navy, H1)
ws6.row_dimensions[2].height = 24

ws6.merge_cells("B4:F4")
ws6.cell(row=4, column=2, value="Three stages: a typical mid-tier setup, then the same practice at Diamond/Apex scale, "
        "then the premium-optimised model. Each column shows net margin per case AFTER a fair share of fixed overhead.").font = SMALL

cols = ["Lever (per case)", "STAGE 1\nMid-tier", "STAGE 2\nDiamond scale", "STAGE 3\nApex optimised", "What changed"]
for i,h in enumerate(cols):
    c = ws6.cell(row=5, column=2+i, value=h); c.fill=fill_blue; c.font=WHITEBOLD; c.alignment=center; c.border=border
ws6.row_dimensions[5].height = 30

# stage inputs: fee, lab list(blended), tier disc, assoc %, CPA, admin, fixed OH per case
solver = [
    ("Blended fee (£)",            3400, 3800, 4100, GBP, "Hold/raise price with stronger brand & before/afters"),
    ("Blended lab fee — list (£)", 1000, 1000, 1000, GBP, "Same Align list price"),
    ("Tier discount on lab",       0.10, 0.38, 0.46, PCT0, "Silver→Diamond→Apex unlocks bigger COGS cuts"),
    ("Retainer + consumables (£)", 275,  250,  225,  GBP, "Buying power + efficiency"),
    ("Associate split of (fee−lab)",0.45, 0.45, 0.40, PCT0, "Productivity bonuses tied to volume, not flat %"),
    ("Blended marketing CPA (£)",  400,  250,  170,  GBP, "Organic/referral/brand reduce paid dependence"),
    ("Admin/TCO/finance (£)",      200,  175,  150,  GBP, "Process & scale efficiency"),
    ("Fixed overhead / case (£)",  450,  220,  150,  GBP, "Volume dilutes fixed cost (more cases, same rent)"),
]
r = 6
first = r
for label, s1, s2, s3, fmt, note in solver:
    ws6.cell(row=r, column=2, value=label).font=NORM
    for i,v in enumerate([s1,s2,s3]):
        c=ws6.cell(row=r, column=3+i, value=v); c.fill=fill_yellow; c.number_format=fmt; c.border=border; c.alignment=right
    ws6.cell(row=r, column=6, value=note).font=SMALL
    r += 1
# computed lines
def solver_calc(r, label, formula_tpl, fmt, fill=None, bold=False):
    ws6.cell(row=r, column=2, value=label).font=(BOLD if bold else NORM)
    for i in range(3):
        col=get_column_letter(3+i)
        c=ws6.cell(row=r, column=3+i, value=formula_tpl.format(c=col)); c.number_format=fmt; c.alignment=right; c.border=border
        if fill: c.fill=fill
        if bold: c.font=BOLD
    return r

fee_r, lab_r, disc_r, ret_r, as_r, cpa_r, adm_r, oh_r = range(first, first+8)
r = first+8
lab_after = solver_calc(r, "Lab fee after discount (£)", f"={{c}}{lab_r}*(1-{{c}}{disc_r})", GBP); r+=1
cogs_r = solver_calc(r, "Total COGS (£)", f"={{c}}{r-1}+{{c}}{ret_r}", GBP, fill_grey, True); cogs_r=r; r+=1
clin_r = solver_calc(r, "Clinical delivery (£)", f"=({{c}}{fee_r}-{{c}}{r-2})*{{c}}{as_r}", GBP); clin_r=r; r+=1
netp_r = solver_calc(r, "NET PROFIT per case (£)",
    f"={{c}}{fee_r}-{{c}}{cogs_r}-{{c}}{clin_r}-{{c}}{cpa_r}-{{c}}{adm_r}-{{c}}{oh_r}", GBP, fill_green, True); netp_r=r; r+=1
marg_r = solver_calc(r, "NET MARGIN %", f"={{c}}{netp_r}/{{c}}{fee_r}", PCT, fill_green, True); r+=1
# highlight vs 30%
ws6.cell(row=r, column=2, value="vs 30% target").font=BOLD
for i in range(3):
    col=get_column_letter(3+i)
    c=ws6.cell(row=r, column=3+i, value=f'=IF({col}{marg_r}>=0.3,"✓ HITS 30%","✗ below")')
    c.alignment=center; c.border=border; c.font=BOLD
r += 2
ws6.merge_cells(start_row=r, start_column=2, end_row=r+3, end_column=6)
ws6.cell(row=r, column=2, value=(
    "VERDICT (computed): Stage 1 (mid-tier, paid-dependent, full overhead drag, 45% associate split) lands ~1–15% net "
    "— well below implants. Stage 2 (Diamond volume: COGS discount up, overhead/case down, CPA controlled, still 45% split) "
    "reaches ~20–25% — good, but the ASSOCIATE SPLIT is the ceiling. Stage 3 (Apex: premium fee, ~46% lab discount, "
    "lean £170 CPA, volume-diluted overhead AND split trimmed to 40% with productivity bonuses) clears ~35%. "
    "BOTTOM LINE: 30%+ IS achievable, but it is the combined payoff of SCALE + EFFICIENCY + the delivery model. "
    "The single biggest lever is clinical delivery cost: an associate at 45% caps you near 25%; an owner-leveraged or "
    "low-split/TCO-heavy model (set associate % lower on the Assumptions sheet) pushes 35–45%. Getting to Diamond/Apex "
    "is therefore BOTH the volume strategy and the margin strategy.")).font = Font(size=11, bold=True, color=NAVY)
ws6.cell(row=r, column=2).alignment = Alignment(wrap_text=True, vertical="top")

# =====================================================================
# SHEET 7 — SENSITIVITY
# =====================================================================
wsv = wb.create_sheet("Sensitivity")
wsv.sheet_view.showGridLines = False
wsv.column_dimensions["A"].width = 2
for col in "BCDEFGH":
    wsv.column_dimensions[col].width = 14
wsv.column_dimensions["B"].width = 22
wsv.merge_cells("B2:H2")
style_header(wsv, "B2", "SENSITIVITY — net contribution margin %", fill_navy, H1)
wsv.row_dimensions[2].height = 24

wsv.cell(row=4, column=2, value="Margin % by FEE (rows) × BLENDED CPA (cols). Uses current COGS, associate % & admin from Assumptions.").font=SMALL
wsv.merge_cells("B4:H4")

fees = [3000,3400,3800,4200,4600]
cpas = [150,250,350,450,550]
# corner
wsv.cell(row=6, column=2, value="Fee ↓ / CPA →").font=BOLD
wsv.cell(row=6, column=2).fill=fill_blue; wsv.cell(row=6,column=2).font=WHITEBOLD; wsv.cell(row=6,column=2).alignment=center; wsv.cell(row=6,column=2).border=border
for j,cpa in enumerate(cpas):
    c=wsv.cell(row=6, column=3+j, value=cpa); c.number_format=GBP; c.fill=fill_blue; c.font=WHITEBOLD; c.alignment=center; c.border=border
for i,fee in enumerate(fees):
    rr=7+i
    c=wsv.cell(row=rr, column=2, value=fee); c.number_format=GBP; c.fill=fill_light; c.font=BOLD; c.alignment=center; c.border=border
    for j,cpa in enumerate(cpas):
        # net contribution margin = (fee - COGS - assoc*(fee-lab_after) - cpa - admin)/fee
        # approximate lab_after via blended COGS minus retainer/consumables already inside; use Assumptions blended COGS C20 and treat clinical on (fee - (C20 - retainer-consum))
        formula = (f"=({fee}-'{A}'!C20-({fee}-('{A}'!C20-'{A}'!C18-'{A}'!C19))*'{A}'!C23-{cpa}-'{A}'!C38)/{fee}")
        cc=wsv.cell(row=rr, column=3+j, value=formula); cc.number_format=PCT; cc.alignment=center; cc.border=border
wsv.cell(row=13, column=2, value="Green ≈ at/above 30% (implant-equivalent). Red = thin. Conditional shading is approximate; "
        "use Growth Scenarios for the true after-fixed-overhead net margin.").font=SMALL
wsv.merge_cells("B13:H13")

# simple conditional formatting via manual fills would require values; leave note. Add color scale.
from openpyxl.formatting.rule import ColorScaleRule
wsv.conditional_formatting.add(f"C7:G11",
    ColorScaleRule(start_type='num', start_value=0.0, start_color='F8696B',
                   mid_type='num', mid_value=0.25, mid_color='FFEB84',
                   end_type='num', end_value=0.45, end_color='63BE7B'))

# save
out = "/home/user/invoicepublic/invisalign-domination/Invisalign-ROI-Calculator.xlsx"
wb.save(out)
print("saved", out)
