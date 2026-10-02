"""
Builds the model input from a raw email and extracts flight data with OpenAI (MWP-72).

PROMPT, SCHEMA, html_to_text, pdf_text and build_input are copied verbatim from the
evaluation that scored 100% on 77 real emails. Do not reword or reorder them; re-run
the regression tool (Task 12) after any change.
"""
import base64, email, html, json, re, subprocess, tempfile
from email.errors import HeaderParseError
from email.header import decode_header, make_header

import httpx

from webhook_v2.config import settings
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)

OPENAI_URL = "https://api.openai.com/v1/responses"

PROMPT = """You are a data-entry clerk copying airline ticket data from emails into an accounting system for a Vietnamese company.
Accuracy is critical: a wrong digit causes financial damage. COPY values exactly as printed. Never calculate, infer, round, translate or guess.
If a value is not printed, return null. Each PDF is given twice: as the file and as its extracted text layer; they are the same document.

## email_type (pick exactly one)
- ticket: contains one or more e-ticket receipts ("ELECTRONIC TICKET RECEIPT", "Vé điện tử", "Thông tin hành trình", "Travel Reservation", "Đặt chỗ ... cho ...")
- emd: contains only Electronic Miscellaneous Document receipts (paid extras: seat, baggage, change fee) and no e-ticket
- booking_summary: booking/order confirmation without a ticket receipt (e.g. "Your Order", "Your Booking Confirmation")
- boarding_pass
- schedule_change: airline notice that a flight's time or number changed
- refund: refund/cancellation request, reply or confirmation (including auto-replies to a refund request)
- airline_invoice: VAT e-invoice (hóa đơn điện tử) issued by an AIRLINE company for air transport
- not_flight: anything else, including invoices from airport restaurants/shops, airport authorities, hotels, calendar invites

## booking_code
The 6-character booking reference printed as "Booking ref", "Mã đặt chỗ", "booking code", "mã số đặt chỗ". Uppercase.
Look in the Subject line too: airline subjects carry it, e.g. "Online support K3P9QX - ...", "Đặt chỗ vào 15JAN - MNRTZA cho ...", "... (H7WD2L)", "NAME, 4QZRYB, 20JAN2026".
This applies to every email_type, including refunds and automatic replies. null only if it appears nowhere in subject, body or attachments.

## airline
Use exactly one of: "Vietnam Airlines", "Vietjet Air", "Sun PhuQuoc Airways", "Bamboo Airways", "Vietravel Airlines", "Pacific Airlines". If another airline, copy its name as printed. This is the airline that issued the ticket/email, not the operating carrier.

## segments (one per flight leg, in travel order)
- flight_no: carrier code + number with NO space, uppercase, e.g. "VN1340", "9G1955", "VJ123".
- origin / destination: 3-letter IATA airport code. Map from the airport name printed in the From/To columns:
  SGN = Ho Chi Minh City Tan Son Nhat; HAN = Ha Noi Noi Bai; DAD = Da Nang; CXR = Nha Trang Cam Ranh; PQC = Phu Quoc;
  TBB = Tuy Hoa Dong Tac; HUI = Hue Phu Bai; DLI = Da Lat Lien Khuong; VCA = Can Tho; HPH = Hai Phong Cat Bi; VII = Vinh;
  UIH = Quy Nhon Phu Cat; BMV = Buon Ma Thuot; VDO = Quang Ninh Van Don; THD = Thanh Hoa Tho Xuan; PXU = Pleiku;
  VCS = Con Dao; VCL = Chu Lai; VDH = Dong Hoi; DIN = Dien Bien; CAH = Ca Mau; VKG = Rach Gia.
  Other airports: the IATA code printed next to the name, e.g. "(BKK)". NEVER take codes from the "Fare Calculation"/"Chi tiết tính giá"
  line: it contains city codes such as NHA that are NOT airport codes.
- departure / arrival: local date-time "YYYY-MM-DDTHH:MM" from the departure/arrival columns of that leg.
- fare_family: the cabin/fare name before the comma, as printed, e.g. "Economy Lite", "Economy Classic", "Economy". null if not printed.
- booking_class: the single letter after the comma in the class field (e.g. "Economy Lite, X" -> "X"; "Class: , L" -> "L"). null if absent.
For schedule_change: segments = the CHANGED (new) flights; original_segments = the ORIGINAL flights as shown. For all other types original_segments = [].
For boarding_pass / booking_summary: fill segments if printed; documents may be empty.

## documents (one per ticket or EMD receipt in the email; empty list if none)
- doc_type: "ticket" or "emd"
- passenger_name: exactly as printed after "Passenger:" / "Hành khách:", WITHOUT the title (Mr/Ms/Mrs/Miss/Mstr) and WITHOUT the type "(ADT)"/"(CHD)"/"(INF)". Keep the printed word order. E.g. "Phan Ngoc Yen Ms (ADT)" -> "Phan Ngoc Yen".
- document_number: digits only, no spaces. For tickets the "Ticket number"/"Số vé"; for EMD the "Document Number"/"Số chứng từ".
- related_ticket_number: EMD only, the "In connection with" ticket number, digits only; null for tickets.
- issue_date: "YYYY-MM-DD" from the "Date:"/"Ngày:" field near the issuing office.
- fare_amount: the number after "Fare:"/"Giá vé:" in FARE DETAILS / CHI TIẾT GIÁ VÉ. Digits only, e.g. "VND 801000" -> 801000.
- total_amount: the number after "Total amount:"/"Tổng tiền:"/"Tổng thanh toán:". Digits only. Copy it even if it is smaller than the fare.
- currency: as printed, e.g. "VND".
- has_previously_paid_items: true if any tax/fee line carries the marker "PD" (previously paid) or the receipt says amounts were previously paid; else false.
- service: EMD only, the service description and seat/bag detail as printed, e.g. "Seat Assignment, Seat: 20E"; null for tickets.

## invoice (airline_invoice only, else all null)
- invoice_number: the invoice number (Số hóa đơn / HĐ / eInvoice No), digits only as printed.
- invoice_date: "YYYY-MM-DD".
- invoice_total: grand total payable incl. VAT (Tổng tiền thanh toán / Total payment), digits only.

## note
One short English sentence with facts a finance person needs that are not in other fields (e.g. "Flight VN1234 on 2026-01-15 moved from 08:00 to 09:30", "Refund requested for ticket 7380000000123"). Empty string if nothing notable. Do not speculate.
"""

S = lambda: {"type": "string"}
NS = lambda: {"type": ["string", "null"]}
NN = lambda: {"type": ["number", "null"]}
SEG = {"type": "object", "additionalProperties": False,
       "required": ["flight_no", "origin", "destination", "departure", "arrival", "fare_family", "booking_class"],
       "properties": {"flight_no": S(), "origin": S(), "destination": S(), "departure": NS(), "arrival": NS(),
                      "fare_family": NS(), "booking_class": NS()}}
DOC = {"type": "object", "additionalProperties": False,
       "required": ["doc_type", "passenger_name", "document_number", "related_ticket_number", "issue_date", "fare_amount",
                    "total_amount", "currency", "has_previously_paid_items", "service"],
       "properties": {"doc_type": {"type": "string", "enum": ["ticket", "emd"]}, "passenger_name": S(), "document_number": NS(),
                      "related_ticket_number": NS(), "issue_date": NS(), "fare_amount": NN(), "total_amount": NN(),
                      "currency": NS(), "has_previously_paid_items": {"type": "boolean"}, "service": NS()}}
SCHEMA = {"type": "object", "additionalProperties": False,
          "required": ["email_type", "airline", "booking_code", "segments", "original_segments", "documents", "invoice", "note"],
          "properties": {"email_type": {"type": "string", "enum": ["ticket", "emd", "booking_summary", "boarding_pass", "schedule_change",
                                                                    "refund", "airline_invoice", "not_flight"]},
                         "airline": NS(), "booking_code": NS(),
                         "segments": {"type": "array", "items": SEG}, "original_segments": {"type": "array", "items": SEG},
                         "documents": {"type": "array", "items": DOC},
                         "invoice": {"type": "object", "additionalProperties": False,
                                     "required": ["invoice_number", "invoice_date", "invoice_total"],
                                     "properties": {"invoice_number": NS(), "invoice_date": NS(), "invoice_total": NN()}},
                         "note": S()}}


def dh(s):
    try:
        return str(make_header(decode_header(s or "")))
    except (UnicodeDecodeError, LookupError, ValueError, HeaderParseError) as exc:
        log.warning("flight_header_decode_failed", error=repr(exc))
        return s or ""


def html_to_text(t):
    t = re.sub(r"<(style|script)\b.*?</\1>", " ", t, flags=re.S | re.I)
    t = re.sub(r"<br\s*/?>|</p>|</tr>|</div>|</h\d>", "\n", t, flags=re.I)
    t = re.sub(r"</td>|</th>", " | ", t, flags=re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    t = html.unescape(t)
    return re.sub(r"[ \t ]+", " ", re.sub(r"\n\s*\n+", "\n", t)).strip()


def pdf_text(data):
    with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
        f.write(data); f.flush()
        result = subprocess.run(["pdftotext", "-layout", f.name, "-"], capture_output=True, text=True)
        if result.returncode != 0:
            log.warning("flight_pdf_text_failed", returncode=result.returncode, stderr=result.stderr[:200])
        return result.stdout


def build_input(raw: bytes):
    """Returns (content_parts, source_text). source_text = everything the model saw as text, for grounding checks."""
    msg = email.message_from_bytes(raw)
    plain, htm, files, layers = "", "", [], []
    for p in msg.walk():
        fn = dh(p.get_filename()).replace("\r\n", " ") if p.get_filename() else None
        ctype = p.get_content_type()
        if ctype == "application/pdf" or (fn and fn.lower().endswith(".pdf")):
            data = p.get_payload(decode=True)
            files.append({"type": "input_file", "filename": fn or "attachment.pdf",
                          "file_data": "data:application/pdf;base64," + base64.b64encode(data).decode()})
            layers.append(f"===== PDF text layer: {fn} =====\n{pdf_text(data)}")
        elif not fn and ctype in ("text/plain", "text/html"):
            try:
                t = p.get_payload(decode=True).decode(p.get_content_charset() or "utf-8", "replace")
            except (AttributeError, LookupError, UnicodeDecodeError) as exc:
                log.warning("flight_body_part_undecodable", content_type=ctype,
                            charset=p.get_content_charset(), error=repr(exc))
                continue
            if ctype == "text/html" or re.search(r"<(p|td|div|table)\b", t, re.I):
                htm += html_to_text(t) + "\n"
            else:
                plain += html.unescape(t) + "\n"
    body = (htm or plain)[:20000]  # prefer the HTML part (richer); never send both copies
    header = f"From: {dh(msg['From'])}\nSubject: {dh(msg['Subject'])}\nDate: {msg['Date']}\n"
    text = header + "\n===== Email body =====\n" + body + "\n" + "\n".join(layers)
    return [{"type": "input_text", "text": text}] + files, text


class ExtractionError(Exception):
    """The model call or its output could not be turned into a complete extraction."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code  # OpenAI's HTTP status, when the API answered with an error


def extract(raw: bytes, *, http: httpx.Client | None = None) -> tuple[dict, str]:
    """Returns (extraction, source_text). Raises ExtractionError on API/parse failure; never returns partial data."""
    content, source_text = build_input(raw)
    body = {"model": settings.openai_model, "instructions": PROMPT,
            "reasoning": {"effort": settings.openai_reasoning_effort},
            "input": [{"role": "user", "content": content}],
            "text": {"format": {"type": "json_schema", "name": "flight_email", "strict": True, "schema": SCHEMA}}}
    client = http or httpx.Client()
    try:
        response = client.post(OPENAI_URL, json=body, timeout=300,
                               headers={"Authorization": "Bearer " + settings.openai_api_key})
        response.raise_for_status()
        data = response.json()
        if data.get("status") != "completed":
            raise ExtractionError(f"response not completed: status={data.get('status')} "
                                  f"details={data.get('incomplete_details')}")
        texts = [c["text"] for o in data["output"] if o.get("type") == "message"
                 for c in o["content"] if c.get("type") == "output_text"]
        if not texts:
            raise ExtractionError("no output_text in OpenAI response")
        extraction = json.loads(texts[0])
        if not isinstance(extraction, dict):
            raise ExtractionError("model output is not a JSON object")
        usage = data.get("usage", {})
        log.info("flight_extract_done", model=settings.openai_model,
                 input_tokens=usage.get("input_tokens"), output_tokens=usage.get("output_tokens"),
                 email_type=extraction.get("email_type"))
    except ExtractionError as exc:
        log.error("flight_extract_failed", error=str(exc))
        raise
    except httpx.HTTPStatusError as exc:
        detail = f"{exc!r} body={exc.response.text[:500]}"
        log.error("flight_extract_failed", error=detail)
        raise ExtractionError(detail, status_code=exc.response.status_code) from exc
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError) as exc:
        log.error("flight_extract_failed", error=repr(exc))
        raise ExtractionError(repr(exc)) from exc
    finally:
        if http is None:
            client.close()
    return extraction, source_text
