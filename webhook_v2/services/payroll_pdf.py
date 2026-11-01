"""Vietnamese monthly payroll summary PDF (A4 landscape), built from enriched salary slips.

Two parts: `build_report` (pure: slips -> rows/totals/footer) and `render_pdf` (report -> bytes).
"""
from datetime import datetime, timedelta, timezone

import pymupdf

COMMISSION_COMPONENTS = (
    "Lead Planner Commission", "Support Planner Commission", "Assistant Commission",
    "Full Package Commission", "Partial Package Commission",
)
SI_TYPES = ("BHXH", "BHYT", "BHTN")
FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
VN_TZ = timezone(timedelta(hours=7))

# (header, key, width in pt, kind). Money keys are summed in the totals row.
COLUMNS = [
    ("STT", "stt", 20, "int"),
    ("Họ & Tên", "name", 78, "text"),
    ("Chức vụ", "designation", 64, "text"),
    ("Ngày công", "payment_days", 28, "num"),
    ("Lương cơ bản", "basic", 52, "money"),
    ("Hoa hồng", "commission", 52, "money"),
    ("Phụ cấp cưới", "wedding", 46, "money"),
    ("Thưởng", "bonus", 42, "money"),
    ("Tổng thu nhập", "gross", 54, "money"),
    ("BHXH 8%", "bhxh", 44, "money"),
    ("BHYT 1.5%", "bhyt", 38, "money"),
    ("BHTN 1%", "bhtn", 38, "money"),
    ("Giảm trừ gia cảnh", "tax_reduction", 54, "money"),
    ("TN tính thuế", "taxable", 48, "money"),
    ("Thuế TNCN", "pit", 42, "money"),
    ("Tổng khấu trừ", "total_deduction", 48, "money"),
    ("Thực nhận", "net", 54, "money"),
]
MONEY_KEYS = [k for _, k, _, kind in COLUMNS if kind == "money"]


def format_vnd(amount: float) -> str:
    return f"{round(amount):,}".replace(",", ".")


def _amount(items: list[dict], *components: str) -> float:
    return sum(i.get("amount", 0) for i in items if i.get("salary_component") in components)


def _employee_si(deductions: list[dict], kind: str) -> float:
    return _amount(deductions, f"{kind} (Employee)")


def _employer_si(deductions: list[dict], kind: str) -> float:
    return _amount(deductions, f"{kind} Employer Payable")


def _slip_row(slip: dict) -> dict:
    earnings, deductions = slip["earnings"], slip["deductions"]
    bhxh, bhyt, bhtn = (_employee_si(deductions, k) for k in SI_TYPES)
    pit = _amount(deductions, "Income Tax")
    designation = slip.get("designation") or ""
    if slip.get("is_probation"):
        designation = f"{designation} (Thử việc)".strip()
    name = slip.get("employee_display_name") or slip.get("employee_name") or slip["employee"]
    if slip.get("pit_method") == "Flat 10%":
        name = f"{name} (TNCN 10%)"
    return {
        "name": name,
        "designation": designation,
        "payment_days": slip.get("payment_days") or 0,
        "basic": _amount(earnings, "Basic Salary"),
        "commission": _amount(earnings, *COMMISSION_COMPONENTS),
        "wedding": _amount(earnings, "Wedding Allowance"),
        "bonus": _amount(earnings, "Bonus"),
        "gross": slip["gross_pay"],
        "bhxh": bhxh, "bhyt": bhyt, "bhtn": bhtn,
        "tax_reduction": slip.get("tax_reduction", 0),
        "taxable": max(slip.get("taxable_income", 0), 0),
        "pit": pit,
        "total_deduction": bhxh + bhyt + bhtn + pit,
        "net": slip["net_pay"],
    }


def build_report(slips: list[dict], month: str) -> dict:
    """slips: enriched slips in display order. month: 'YYYY-MM'.

    Mirrors the Payroll page: zero-gross slips are hidden; cancelled slips are excluded.
    """
    used = [s for s in slips if s["gross_pay"] > 0 and s.get("docstatus") != 2]
    rows = [{"stt": i, **_slip_row(s)} for i, s in enumerate(used, 1)]
    totals = {k: sum(r[k] for r in rows) for k in MONEY_KEYS}
    employee = {k: sum(_employee_si(s["deductions"], k) for s in used) for k in SI_TYPES}
    employer = {k: sum(_employer_si(s["deductions"], k) for s in used) for k in SI_TYPES}
    year, mon = month.split("-")
    return {
        "title": "BÁO CÁO TỔNG HỢP LƯƠNG",
        "subtitle": f"Tháng {mon}/{year}",
        "company": "Meraki Wedding Planner",
        "is_draft": any(s.get("docstatus") == 0 for s in used),
        "rows": rows,
        "totals": totals,
        "si_employee": employee,
        "si_employer": employer,
    }


# ---------- rendering ----------

MARGIN = 20
FONT_SIZE = 6.5
LINE_H = 8.5
PAD = 2.5
PAGE_W, PAGE_H = 842, 595  # A4 landscape


class _Canvas:
    def __init__(self):
        self.doc = pymupdf.open()
        self.regular = pymupdf.Font(fontfile=FONT_REGULAR)
        self.bold = pymupdf.Font(fontfile=FONT_BOLD)
        self.page = None

    def new_page(self):
        self.page = self.doc.new_page(width=PAGE_W, height=PAGE_H)
        self.page.insert_font(fontname="dj", fontfile=FONT_REGULAR)
        self.page.insert_font(fontname="djb", fontfile=FONT_BOLD)

    def font(self, bold: bool) -> pymupdf.Font:
        return self.bold if bold else self.regular

    def text(self, x, y, s, size=FONT_SIZE, bold=False, align="left", width=0, color=(0, 0, 0)):
        w = self.font(bold).text_length(s, fontsize=size)
        if align == "right":
            x = x + width - w
        elif align == "center":
            x = x + (width - w) / 2
        self.page.insert_text((x, y), s, fontsize=size, fontname="djb" if bold else "dj", color=color)

    def wrap(self, s: str, width: float, bold=False) -> list[str]:
        font, lines, cur = self.font(bold), [], ""
        for word in s.split():
            trial = f"{cur} {word}".strip()
            if cur and font.text_length(trial, fontsize=FONT_SIZE) > width:
                lines.append(cur)
                cur = word
            else:
                cur = trial
        return lines + [cur] if cur else lines or [""]


def _cell_text(row: dict, key: str, kind: str, zero_dash: bool) -> str:
    v = row[key]
    if kind == "text":
        return v
    if kind == "num":
        return f"{v:g}"
    if kind == "int":
        return str(v)
    return "-" if zero_dash and not v else format_vnd(v)


def _draw_row(c: _Canvas, y: float, cells: list[tuple[str, str]], bold=False, fill=None, centre=False) -> float:
    """cells: (text, kind) per column. Returns y of the next row."""
    lines = [c.wrap(t, w - 2 * PAD, bold) if kind == "text" else [t] for (t, kind), (_, _, w, _) in zip(cells, COLUMNS)]
    height = max(len(ls) for ls in lines) * LINE_H + 2 * PAD - 1
    x = MARGIN
    for ls, (_, _, w, kind) in zip(lines, COLUMNS):
        rect = pymupdf.Rect(x, y, x + w, y + height)
        if fill:
            c.page.draw_rect(rect, color=None, fill=fill)
        c.page.draw_rect(rect, color=(0.6, 0.6, 0.6), width=0.4)
        for i, line in enumerate(ls):
            align = "center" if centre or kind in ("int", "num") else "left" if kind == "text" else "right"
            c.text(x + PAD, y + PAD + 6 + i * LINE_H, line, bold=bold, align=align, width=w - 2 * PAD)
        x += w
    return y + height


def _draw_header(c: _Canvas, y: float) -> float:
    headers = [(h, "text") for h, *_ in COLUMNS]
    return _draw_row(c, y, headers, bold=True, fill=(0.9, 0.9, 0.9), centre=True)


def _draw_title(c: _Canvas, report: dict) -> float:
    inner = PAGE_W - 2 * MARGIN
    c.text(MARGIN, 30, report["company"], size=8, bold=True)
    c.text(MARGIN, 48, report["title"], size=14, bold=True, align="center", width=inner)
    c.text(MARGIN, 62, report["subtitle"], size=9, align="center", width=inner)
    if report["is_draft"]:
        c.text(MARGIN, 76, "BẢN NHÁP", size=11, bold=True, align="center", width=inner, color=(0.8, 0, 0))
    return 86


def _draw_si_footer(c: _Canvas, report: dict, y: float) -> float:
    if y + 60 > PAGE_H - MARGIN:
        c.new_page()
        y = MARGIN
    c.text(MARGIN, y + 8, "Tổng nộp BHXH (NLĐ + DN)", size=8, bold=True)
    y += 14
    cols = [("", 70), ("NLĐ", 70), ("DN", 70), ("Tổng", 70)]
    table = [(k, report["si_employee"][k], report["si_employer"][k]) for k in SI_TYPES]
    table.append(("Cộng", sum(report["si_employee"].values()), sum(report["si_employer"].values())))
    for header, row in [(True, ("", "NLĐ", "DN", "Tổng"))] + [(False, (n, format_vnd(e), format_vnd(d), format_vnd(e + d))) for n, e, d in table]:
        bold = header or row[0] == "Cộng"
        x = MARGIN
        for text, (_, w) in zip(row, cols):
            c.page.draw_rect(pymupdf.Rect(x, y, x + w, y + LINE_H + 2), color=(0.6, 0.6, 0.6), width=0.4)
            c.text(x + PAD, y + 7.5, text, bold=bold, align="left" if x == MARGIN else "right", width=w - 2 * PAD)
            x += w
        y += LINE_H + 2
    return y


def render_pdf(report: dict) -> bytes:
    c = _Canvas()
    c.new_page()
    y = _draw_title(c, report)
    y = _draw_header(c, y)
    for row in report["rows"]:
        cells = [(_cell_text(row, k, kind, True), kind) for _, k, _, kind in COLUMNS]
        if y + 2 * LINE_H + 2 * PAD > PAGE_H - MARGIN - LINE_H:
            c.new_page()
            y = _draw_header(c, MARGIN)
        y = _draw_row(c, y, cells)
    total_cells = [
        ("TỔNG CỘNG" if k == "name" else format_vnd(report["totals"][k]) if k in MONEY_KEYS else "", kind)
        for _, k, _, kind in COLUMNS
    ]
    if y + 2 * LINE_H + 2 * PAD > PAGE_H - MARGIN - LINE_H:
        c.new_page()
        y = MARGIN
    y = _draw_row(c, y, total_cells, bold=True, fill=(0.95, 0.95, 0.85))
    _draw_si_footer(c, report, y + 12)
    c.text(MARGIN, PAGE_H - MARGIN, f"Ngày xuất: {datetime.now(VN_TZ).date().isoformat()}", size=6.5)
    total_pages = len(c.doc)
    for i, page in enumerate(c.doc, 1):
        c.page = page
        c.text(PAGE_W - MARGIN - 60, PAGE_H - MARGIN, f"Trang {i}/{total_pages}", size=6.5, align="right", width=60)
    return c.doc.tobytes()
