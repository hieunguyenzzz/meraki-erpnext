"""
Pure safety checks applied to every flight extraction before it is saved (MWP-72).

The model output is never trusted blindly: every identifier and amount must be
grounded in the source text, and formats must be plausible.
"""

import re
import unicodedata

AIRPORTS = {"SGN", "HAN", "DAD", "CXR", "PQC", "TBB", "HUI", "DLI", "VCA", "HPH", "VII", "UIH", "BMV", "VDO", "THD", "PXU",
            "VCS", "VCL", "VDH", "DIN", "CAH", "VKG",
            "BKK", "SIN", "ICN", "NRT", "HND", "KUL", "HKG", "TPE", "CAN", "PVG", "DPS", "REP", "PNH", "VTE", "LPQ"}
FLIGHT_RE = re.compile(r"^[A-Z0-9]{2}\d{1,4}$")
TITLES = {"mr", "ms", "mrs", "miss", "mstr"}
NUM_RE = re.compile(r"\d+(?:[.,]\d+)*")
GROUPED_RE = re.compile(r"(?<!\d)\d{1,4}(?:[ \-]\d{2,})+(?!\d)")  # "738 1234 567890", "1 930 000", "738-1234567890"
MINUS_SIGNS = "-\u2212"


def _digits(value) -> str:
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return re.sub(r"\D", "", str(abs(value)) if isinstance(value, (int, float)) else str(value))


def _number_tokens(src: str) -> tuple[set[str], set[str]]:
    """Whole-number tokens in the source as (unsigned, negative); negative = '-'/U+2212 not glued to a word, or wrapped in '(...)'."""
    positive: set[str] = set()
    negative: set[str] = set()

    def add(match: re.Match, digits: str) -> None:
        start, end = match.start(), match.end()
        prev = src[start - 1] if start else ""
        before = src[start - 2] if start > 1 else ""
        minus = bool(prev) and prev in MINUS_SIGNS and not before.isalnum()
        negated = minus or (prev == "(" and src[end:end + 1] == ")")
        (negative if negated else positive).add(digits)

    for m in NUM_RE.finditer(src):
        text = m.group()
        add(m, re.sub(r"\D", "", text))
        decimal = re.fullmatch(r"(.*\d)[.,](\d{1,2})", text)  # "1,930,000.00" -> "1930000"
        if decimal:
            add(m, re.sub(r"\D", "", decimal.group(1)))
    for m in GROUPED_RE.finditer(src):
        add(m, re.sub(r"\D", "", m.group()))
    return positive, negative


def _all_segments(extraction: dict) -> list[dict]:
    return (extraction.get("segments") or []) + (extraction.get("original_segments") or [])


def grounding_errors(extraction: dict, source_text: str) -> list[str]:
    """Every code, number and amount the model returned must appear in the source."""
    positive, negative = _number_tokens(source_text)
    source_code = re.sub(r"\s", "", source_text).upper()
    errors: list[str] = []

    def need_code(label: str, value) -> None:
        if value and re.sub(r"\s", "", str(value)).upper() not in source_code:
            errors.append(f"{label} {value} not found in source")

    def need_digits(label: str, value, signed: bool = False) -> None:
        if value is None or value == "":
            return
        digits = _digits(value)
        if not digits:
            return
        if not signed:
            found = digits in positive or digits in negative
        elif value < 0:
            found = digits in negative
        else:
            found = digits in positive
        if not found:
            errors.append(f"{label} {value} not found in source")

    need_code("booking_code", extraction.get("booking_code"))
    for seg in _all_segments(extraction):
        need_code("flight_no", seg.get("flight_no"))
    for doc in extraction.get("documents") or []:
        need_digits("document_number", doc.get("document_number"))
        need_digits("related_ticket_number", doc.get("related_ticket_number"))
        need_digits("fare_amount", doc.get("fare_amount"), signed=True)
        need_digits("total_amount", doc.get("total_amount"), signed=True)
    invoice = extraction.get("invoice") or {}
    need_digits("invoice_number", invoice.get("invoice_number"))
    need_digits("invoice_total", invoice.get("invoice_total"), signed=True)
    return errors


def format_errors(extraction: dict) -> list[str]:
    errors: list[str] = []
    for seg in _all_segments(extraction):
        flight_no = seg.get("flight_no") or ""
        if not FLIGHT_RE.match(flight_no):
            errors.append(f"flight_no {flight_no!r} is not a valid flight number")
        for field in ("origin", "destination"):
            if seg.get(field) not in AIRPORTS:
                errors.append(f"{field} {seg.get(field)!r} is not a known airport")
        departure, arrival = seg.get("departure"), seg.get("arrival")
        if departure and arrival and arrival <= departure:
            errors.append(f"{flight_no} arrival {arrival} is not after departure {departure}")
    for doc in extraction.get("documents") or []:
        for field in ("fare_amount", "total_amount"):
            value = doc.get(field)
            if value is not None and value <= 0:
                errors.append(f"{field} {value} must be positive")
    invoice_total = (extraction.get("invoice") or {}).get("invoice_total")
    if invoice_total == 0:
        errors.append("invoice_total must not be zero")
    return errors


def is_change_fee(doc: dict) -> bool:
    """A ticket receipt that only charges the difference: total below fare with previously-paid items."""
    return (doc.get("doc_type") == "ticket"
            and bool(doc.get("has_previously_paid_items"))
            and doc.get("total_amount") is not None
            and doc.get("fare_amount") is not None
            and doc["total_amount"] < doc["fare_amount"])


def normalise_name(s: str) -> frozenset[str]:
    s = s.replace("đ", "d").replace("Đ", "D").replace("ð", "d").replace("Ð", "D")
    stripped = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    tokens = re.split(r"[^a-z]+", stripped.lower())
    return frozenset(t for t in tokens if t and t not in TITLES)


def match_employee(passenger_name: str, employees: list[dict]) -> str | None:
    """Employee name iff exactly one employee has the same set of name tokens, else None."""
    target = normalise_name(passenger_name)
    if not target:
        return None
    matches = [e["name"] for e in employees if normalise_name(e["employee_name"]) == target]
    return matches[0] if len(matches) == 1 else None
