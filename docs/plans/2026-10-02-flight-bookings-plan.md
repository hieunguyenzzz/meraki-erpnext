# Flight Bookings Implementation Plan (MWP-72)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Every day, pull airline emails from `hoadon.merakiwp@gmail.com`, extract the ticket data with OpenAI `gpt-6.1-sol`, store it as ERPNext `Flight Booking` records, and manage them at `/finance/flights`.

**Architecture:** The design is in `docs/plans/2026-10-02-flight-bookings-design.md`. The pipeline lives in `webhook_v2/` and is split by concern:
- **mailbox** fetches raw email bytes;
- **extractor** builds the model input and calls OpenAI;
- **checks** and **merge** are pure functions and fully unit-tested;
- **processor** orchestrates the run and records state in Postgres;
- **router** is the API used by the page.

The ERPNext doctypes come from migration phase v096. The frontend stays "dumb": one endpoint per action.

**Tech stack:** FastAPI, httpx (OpenAI Responses API, no SDK), imaplib, poppler `pdftotext`, psycopg3, APScheduler CronTrigger, ERPNext REST, React with Refine v5 and Shadcn.

**Source of the tested prompt:** the eval that scored 100% is at
a local eval folder kept outside the repo (see `webhook_v2/tools/README_flight_eval.md`).
Copy `PROMPT`, the schema (`SEG`, `DOC`, `SCHEMA`), `html_to_text`, `pdf_text` and `build_input` **verbatim**. The wording was tuned and verified; do not reword it. The real emails in that folder are **staff data: never copy them into the repo.**

**Global rules:**
- Do not modify shared code beyond what each task states.
- Do not create any external infrastructure.
- Never commit `.env`.
- Commit messages are 1–2 lines with the `MWP-72:` prefix and no Claude attribution.
- Run tests with `cd webhook_v2 && .venv/bin/python -m pytest tests/unit -v` (PYTHONPATH = repo root). If that venv is broken, run them inside the container instead: `docker compose -f docker-compose.yml -f docker-compose.local.yml exec email-processor-v2 pytest webhook_v2/tests/unit -v`.

---

### Task 1: Config, dependencies, compose env

**Files:**
- Modify: `webhook_v2/config.py` (add settings near the IMAP block)
- Modify: `webhook_v2/requirements.txt` (add `tzdata>=2024.1`)
- Modify: `webhook_v2/Dockerfile` (add `poppler-utils` to the apt line)
- Modify: `docker-compose.prod.yml` and `docker-compose.local.yml`, in the `email-processor-v2` `environment:` list
- Modify: `.env.example`

**Step 1:** Add these settings to `Settings`:
```python
    # Flight bookings (MWP-72): invoice Gmail mailbox + OpenAI extraction
    hoadon_imap_host: str = "imap.gmail.com"
    hoadon_imap_port: int = 993
    hoadon_imap_user: str = ""
    hoadon_imap_password: str = ""
    flight_backfill_since: str = "2026-01-01"
    openai_api_key: str = ""
    openai_model: str = "gpt-6.1-sol"
    openai_reasoning_effort: str = "high"
    flight_sync_enabled: bool = True
    flight_sync_hour: int = 6  # Asia/Ho_Chi_Minh
```
**Step 2:** Compose, for both files:
```yaml
      - HOADON_IMAP_USER=${HOADON_IMAP_USER:-hoadon.merakiwp@gmail.com}
      - HOADON_IMAP_PASSWORD=${HOADON_IMAP_PASSWORD}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - OPENAI_MODEL=${OPENAI_MODEL:-gpt-6.1-sol}
      - OPENAI_REASONING_EFFORT=${OPENAI_REASONING_EFFORT:-high}
```
`.env.example`: add the same keys with empty values.

**Step 3:** Dockerfile apt line becomes `gcc libpq-dev poppler-utils`.

**Step 4:** Verify: `python -c "from webhook_v2.config import settings; print(settings.openai_model)"` prints `gpt-6.1-sol`. Commit.

---

### Task 2: ERPNext doctypes (migration v096)

**Files:**
- Create: `migration/phases/v096_flight_booking.py`
- Modify: `migration/runner.py`, in **4 places**:
  1. `ORDERED_PHASES`;
  2. the `from migration.phases import` block;
  3. the fallback `from phases import` block;
  4. the `phase_fns` dict.

Use `v092_wedding_event_model.py` as the template (exists check, child tables before the parent, `custom: 1`, module "Accounts"). Use **Datetime** fields for departure and arrival; Frappe's `Time` field has the nowtime gotcha documented in v092.

1. **`Flight Booking Segment`** (`istable: 1`, `editable_grid: 1`):
   - `flight_no` Data (reqd, in_list_view)
   - `origin` Data (in_list_view)
   - `destination` Data (in_list_view)
   - `departure` Datetime (in_list_view)
   - `arrival` Datetime
   - `fare_family` Data
   - `booking_class` Data
   - `original_departure` Datetime
2. **`Flight Booking Passenger`** (`istable: 1`):
   - `passenger_name` Data (reqd, in_list_view)
   - `employee` Link → Employee (in_list_view)
   - `ticket_number` Data (in_list_view)
   - `previous_ticket_numbers` Small Text
   - `fare` Currency
   - `total` Currency (in_list_view)
   - `change_fees` Currency
   - `extras` Currency
   - `extras_detail` Small Text
3. **`Flight Booking`**:
   - `autoname: "format:FB-{#####}"`, `title_field: "booking_code"`
   - `booking_code` Data (reqd, in_list_view, in_standard_filter)
   - `airline` Data (reqd, in_list_view)
   - `status` Select `Confirmed\nChanged\nCancelled\nRefunded` (default Confirmed)
   - `first_departure` Datetime (in_list_view; used for sorting and filtering)
   - `qty` Int (read_only)
   - `total_amount` Currency (read_only)
   - `currency` Data (default VND)
   - `project` Link → Project
   - `note` Small Text
   - `needs_review` Check
   - `review_reasons` Small Text
   - `invoice_total` Currency
   - `manual_fields` Small Text (hidden; JSON list of field paths edited by people)
   - `source_emails` Long Text (hidden; JSON list)
   - `segments` Table → Flight Booking Segment
   - `passengers` Table → Flight Booking Passenger
   - Permissions on all 3 doctypes: System Manager, Accounts Manager, Accounts User, Projects User and Sales Manager get read, write and create; System Manager also gets delete.

**Verify:**
1. Run migrations locally the usual way: `docker compose -f docker-compose.yml -f docker-compose.local.yml --profile migrate up migration --build`.
2. Check `curl -s -u <key:secret> http://merakierp.loc/api/resource/DocType/Flight%20Booking | jq '.data.fields|length'` returns 20 or more.
3. Re-run the migration and confirm it prints "exists" (idempotent).

Commit.

---

### Task 3: Postgres email-state table

**Files:**
- Modify: `webhook_v2/core/database.py`: append to the `init_schema` SQL and add methods.
- Test: `webhook_v2/tests/unit/test_flight_state_sql.py`, a light test that the SQL string contains the table. The DB methods themselves are verified in Task 13.

```sql
CREATE TABLE IF NOT EXISTS flight_emails (
    message_id VARCHAR(512) PRIMARY KEY,
    imap_uid BIGINT,
    subject TEXT,
    received_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL,          -- done | skipped | failed
    email_type VARCHAR(30),
    booking VARCHAR(40),                  -- Flight Booking name
    attempts INT NOT NULL DEFAULT 0,
    error TEXT,
    extraction JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS flight_sync_runs (
    id SERIAL PRIMARY KEY, started_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ,
    status VARCHAR(20), stats JSONB, error TEXT
);
```

Methods, in the same style as `insert_email`, using `Json()` for JSONB:
- `get_flight_email(message_id) -> dict | None`
- `upsert_flight_email(message_id, **fields)`: an `INSERT ... ON CONFLICT (message_id) DO UPDATE` that increments `attempts` when status is `failed`
- `start_flight_run() -> int`
- `finish_flight_run(run_id, status, stats, error=None)`
- `last_flight_run() -> dict | None`
- `count_flight_emails(status) -> int`

Commit.

---

### Task 4: Mailbox fetcher

**Files:**
- Create: `webhook_v2/services/flight_mailbox.py`
- Test: `webhook_v2/tests/unit/test_flight_mailbox.py`

Do **not** modify `services/imap.py`: it discards attachment bytes and other code relies on it.

```python
@dataclass
class RawEmail:
    uid: int
    message_id: str
    subject: str
    sender: str
    date: datetime | None
    raw: bytes

class FlightMailbox:
    def __init__(self, host=None, port=None, user=None, password=None)  # default: settings.hoadon_imap_*
    def fetch_since(self, since: date) -> Iterator[RawEmail]
        # select the folder flagged \All (Gmail "[Gmail]/All Mail"); fall back to INBOX
        # readonly=True; SEARCH SINCE dd-Mon-YYYY; first fetch headers only (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID)])
        # and run is_candidate(); fetch BODY.PEEK[] (full raw) only for candidates
def is_candidate(sender: str, subject: str) -> bool
```

`is_candidate` is a cheap pre-filter, case-insensitive:
- **True** when the sender domain is in `{vietnamairlines.com, vietjetair.com, sunphuquocairways.com, bambooairways.com, vietravelairlines.com, pacificairlines.com.vn}`.
- **Also true** when the subject matches `hoàn vé|vé máy bay|boarding pass|e-ticket|itinerary|schedule change|đặt chỗ|hành trình` **and** the sender is `hoadon.merakiwp@gmail.com`, so forwarded refund threads are kept.

**Tests:**
1. VNA, Vietjet einvoice, Sun PhuQuoc and the forwarded refund subject → True.
2. Autogrill einvoice (`noreply@einvoice.com.vn`, subject containing "sân bay"), restaurants and Google security alerts → False.

Commit.

---

### Task 5: Extractor (OpenAI)

**Files:**
- Create: `webhook_v2/services/flight_extractor.py`
- Test: `webhook_v2/tests/unit/test_flight_extractor.py`

1. Copy `PROMPT`, `SEG`/`DOC`/`SCHEMA`, `html_to_text`, `pdf_text` and `build_input` verbatim from the eval file named in the header.
2. Change `build_input` to accept `raw: bytes` instead of a path.
3. Wrap the call:
```python
class ExtractionError(Exception): ...

def extract(raw: bytes, *, http: httpx.Client | None = None) -> tuple[dict, str]:
    """Returns (extraction, source_text). Raises ExtractionError on API/parse failure — never returns partial data."""
    content, source_text = build_input(raw)
    body = {"model": settings.openai_model, "instructions": PROMPT,
            "reasoning": {"effort": settings.openai_reasoning_effort},
            "input": [{"role": "user", "content": content}],
            "text": {"format": {"type": "json_schema", "name": "flight_email", "strict": True, "schema": SCHEMA}}}
    # POST https://api.openai.com/v1/responses, timeout 300 s, Authorization: Bearer settings.openai_api_key
    # parse the output_text of the message item; json.loads; on any HTTP error / missing output / JSON error -> raise ExtractionError
    # log.info("flight_extract_done", model=..., input_tokens=..., output_tokens=..., email_type=...)
```

**Tests:**
- Use a synthetic `.eml` built with `email.message.EmailMessage`: HTML body with entities plus a tiny generated PDF (make it with `fitz` (PyMuPDF), already installed, holding the text "Booking ref: ABC123").
- `build_input` decodes entities (`&#272;` → `Đ`), attaches the PDF as `input_file`, and includes the PDF text layer in `source_text`.
- An attachment whose filename is RFC 2047-encoded and doesn't end in `.pdf` but has `application/pdf` content type **is attached**. This is the bug found during the eval.
- `extract` with a mocked httpx (`httpx.MockTransport`) returns the parsed dict.
- A 500 response raises `ExtractionError`.

Commit.

---

### Task 6: Safety checks (pure functions)

**Files:**
- Create: `webhook_v2/processors/flight_checks.py`
- Test: `webhook_v2/tests/unit/test_flight_checks.py`

```python
AIRPORTS = {"SGN","HAN","DAD","CXR","PQC","TBB","HUI","DLI","VCA","HPH","VII","UIH","BMV","VDO","THD","PXU","VCS","VCL","VDH","DIN","CAH","VKG",
            "BKK","SIN","ICN","NRT","HND","KUL","HKG","TPE","CAN","PVG","DPS","REP","PNH","VTE","LPQ"}
FLIGHT_RE = re.compile(r"^[A-Z0-9]{2}\d{1,4}$")

def grounding_errors(extraction: dict, source_text: str) -> list[str]
    # every booking_code, flight_no, document_number, related_ticket_number, fare/total, invoice_number/total (abs value)
    # must be present in source: digits compared against re.sub(r"\D","",src); codes against src without whitespace, uppercased
def format_errors(extraction: dict) -> list[str]
    # flight_no matches FLIGHT_RE; origin/destination in AIRPORTS; arrival > departure when both present;
    # amounts > 0 except invoice_total on refund invoices (allowed negative)
def is_change_fee(doc: dict) -> bool
    # doc_type == "ticket" and has_previously_paid_items and total_amount is not None and fare_amount is not None and total_amount < fare_amount
def normalise_name(s: str) -> frozenset[str]
    # strip accents (unicodedata NFD, drop Mn; đ/Đ -> d), lowercase, drop titles mr/ms/mrs/miss/mstr, split on non-letters
def match_employee(passenger_name: str, employees: list[dict]) -> str | None
    # employees: [{"name": "HR-EMP-0001", "employee_name": "Trần Thụy Minh Anh"}]; return the name iff exactly ONE employee's
    # normalised token set == the passenger's token set, else None
```

**Tests, all taken from real eval cases:**
1. **Grounding:** a ticket number that isn't in the source is reported. `-1930000` with the source containing `-1.930.000` passes.
2. **Format:**
   - `BL/VN6151` fails;
   - `NHA` fails;
   - an arrival before the departure fails;
   - `VN1340`, `9G1955`, `CXR` and `TBB` pass.
3. **Change fee:** `fare=801000, total=49000, PD=True` → True. `fare=1196000, total=2430000` → False. `total < fare` but `PD=False` → False.
4. **Names:**
   - `"Anh Tran Thuy Minh"` matches employee `"Trần Thụy Minh Anh"`;
   - `"Do Thi Thu Ha"` matches `"Đỗ Thị Thu Hà"`;
   - two employees with the same token set → None;
   - no match → None.

Commit.

---

### Task 7: Merge logic (pure function, most important)

**Files:**
- Create: `webhook_v2/processors/flight_merge.py`
- Test: `webhook_v2/tests/unit/test_flight_merge.py`

```python
AIRLINE_ALIASES = {"vietjetair": "Vietjet Air", "vietjet": "Vietjet Air", "vietnam airlines": "Vietnam Airlines",
                   "sun phuquoc airways": "Sun PhuQuoc Airways", "bamboo airways": "Bamboo Airways"}
def normalise_airline(s) -> str

@dataclass
class MergeResult:
    doc: dict | None            # Flight Booking dict to save (None = nothing to save)
    review_reasons: list[str]   # appended to doc.review_reasons; non-empty => needs_review=1
    action: str                 # "created" | "updated" | "skipped" | "unmatched"

def merge(existing: dict | None, extraction: dict, email_meta: dict, employees: list[dict], source_text: str) -> MergeResult
```
`email_meta` = `{"message_id", "subject", "date"}`. `existing` is the full Flight Booking doc as ERPNext returns it, or `None`.

**Rules.** Each rule needs at least one test, using synthetic extractions shaped exactly like the eval outputs.

1. **`boarding_pass` or `not_flight`**, or no `booking_code` → `action="skipped"`, doc None.
2. **`ticket`:**
   - **Segments:** upsert by `flight_no`. Copy origin, destination, departure, arrival, fare_family and booking_class. If the segment exists and its departure differs, set `original_departure` (only if empty) and add a note line.
   - **Passengers:** for each document with `doc_type=="ticket"`:
     - Find the passenger by `ticket_number` first. Failing that, find them by normalised name, and when found that way, treat the new number as a **re-issue**: move the old number to `previous_ticket_numbers` and set the new `ticket_number`.
     - **Change fee** (`is_change_fee(doc)`): add `total_amount` to `change_fees`. Leave `total` and `fare` unchanged. If the passenger is new (a re-issue whose original was never seen), create them with `total=None`, add the review reason "original ticket price unknown", and record the fee in `change_fees`.
     - **Otherwise:** set `fare` and `total`.
     - `employee = match_employee(...)`, unless `employee` is in `manual_fields`. If there's no match, add the review reason `f"no staff match for {name}"`.
3. **`emd`:** find the passenger by `related_ticket_number` (in current or previous ticket numbers). Add `total_amount` to `extras` and append `service` to `extras_detail`. If the passenger isn't found, add a review reason.
4. **`schedule_change`:** for each changed segment, match it to `original_segments` by flight_no and old departure. Update departure and arrival, set `original_departure`, set `status="Changed"`, and add the note `"Schedule change {date}: {flight} {old}→{new}"`.
5. **`refund`:** `status="Refunded"` if the extraction's note says completed, otherwise leave the status and add the note line only. Add the note line once per message_id. Never delete anything.
6. **`booking_summary`:** no change to passengers. Store nothing except a note line with the summary amount, if one is present.
7. **`airline_invoice`:** add `invoice_total` (it can be negative for refunds). Don't change amounts.
8. **Totals cross-check** (when `invoice_total` is set and there are no refunds): `sum(total + change_fees + extras)` must equal the sum of invoice totals, or add the review reason `"ticket totals X ≠ invoice Y"`.
9. **Always:**
   - recompute `qty` (number of passengers) and `total_amount` (sum of total + change_fees + extras);
   - set `first_departure` to the minimum segment departure;
   - append the `email_meta` entry to `source_emails` (skip it if the message_id is already present; that also makes the merge **idempotent**, i.e. no changes);
   - add `grounding_errors` and `format_errors` as review reasons;
   - normalise `airline`.
10. **Manual fields win:** any field path in `manual_fields` (e.g. `"project"`, `"note"`, `"passengers.<ticket>.employee"`, `"passengers.<ticket>.total"`) is never overwritten. The pipeline never writes `project` at all.

**Required tests, from real cases:**
- **AAA111:** five ticket emails, each 1,196,000 fare / 2,430,000 total → qty 5, total 12,150,000. Then the invoice email with 12,150,000 → no review reason.
- **EEE555:** an original ticket at 1,364,181, then a re-issue (new number, total 49,000, fare 801,000, PD) → total stays 1,364,181, change_fees 49,000, old number in `previous_ticket_numbers`.
- **Schedule change** VN8441 18:50 → 19:20 → departure updated, original_departure 18:50, status Changed.
- **EMD** seat 81,000 linked by `related_ticket_number` → extras 81,000.
- **Same email merged twice** → identical output.
- **Manual employee override** survives a re-merge.
- **Ungrounded ticket number** → needs review.

Commit after each green group.

---

### Task 8: Processor (orchestration)

**Files:**
- Create: `webhook_v2/processors/flights.py`
- Test: `webhook_v2/tests/unit/test_flight_processor.py` (mailbox, extractor, db and ERPNext client mocked)

```python
class FlightProcessor:
    def __init__(self, db=None, mailbox=None, client=None, extractor=extract)
    def run(self, since: date | None = None) -> dict  # stats
```

**Flow:**
1. `run_id = db.start_flight_run()`.
2. Work out the start date: `since`, else (the last successful run's start date − 3 days), else `settings.flight_backfill_since`.
3. Load active employees once: `GET /api/resource/Employee` with fields `["name","employee_name"]`, filter `status=Active`, limit 0.
4. For each `RawEmail` from `mailbox.fetch_since(...)`:
   1. `bind_context(message_id=..., flight_run=run_id)`.
   2. If the state is `done` or `skipped`, continue. If it's `failed` with 3 or more attempts, continue.
   3. Try:
      1. `extraction, src = extractor(raw)`.
      2. Find the existing booking: `GET /api/resource/Flight Booking` with filters `booking_code` and `airline`, then GET the full doc.
      3. `merge(...)`.
      4. Save: POST for a new booking, PUT `/api/resource/Flight Booking/{name}` otherwise. Send the whole doc including the child tables. Set `needs_review` and `review_reasons` (dedupe lines).
      5. `upsert_flight_email(status="done" or "skipped", email_type=..., booking=name, extraction=extraction)`.
   4. **Except** `Exception` as e: `log.error("flight_email_failed", error=str(e))`, then `upsert_flight_email(status="failed", error=str(e)[:2000])`, then count it. **No silent catch.**
   5. Finally: `clear_context()`.
5. `finish_flight_run(run_id, "ok" or "partial", stats)`. If an exception escapes, mark the run "error" and re-raise.
6. Stats: `fetched`, `candidates`, `processed`, `created`, `updated`, `skipped`, `failed`, `needs_review`.

Process emails **in date order (oldest first)**, so re-issues and schedule changes apply after the original ticket.

**Tests:**
- The second run skips `done` emails.
- A failure is recorded and doesn't stop the next email.
- Emails are processed in date order.
- An existing booking is updated, not duplicated.

Commit.

---

### Task 9: Scheduler

**Files:** Modify `webhook_v2/scheduler.py`.

Add `flight_sync_job()` in the same style as the existing jobs: lazy import, try/except that logs `scheduled_job_error`. It runs `FlightProcessor().run()`.

Register it in **both** `start_fetch_scheduler()` and `start_scheduler()` when `settings.flight_sync_enabled`:
```python
from apscheduler.triggers.cron import CronTrigger
_scheduler.add_job(flight_sync_job, trigger=CronTrigger(hour=settings.flight_sync_hour, minute=0, timezone="Asia/Ho_Chi_Minh"),
                   id="flight_sync", name="Sync flight bookings", replace_existing=True, max_instances=1, coalesce=True)
```
Use a module-level `threading.Lock` (`_flight_lock`) so the cron job and the Sync now button can never run at the same time. If it's held, `flight_sync_job` logs "already running" and returns.

**Verify:** at startup the log lists the `flight_sync` job with its next run time. Commit.

---

### Task 10: API router

**Files:**
- Create: `webhook_v2/routers/flights.py`
- Modify: `webhook_v2/main.py` (import plus `include_router` after `me_router`)
- Test: `webhook_v2/tests/unit/test_flights_router.py` (use the `_client` injection pattern from `test_venues_router.py`)

`PLANNER_OR_FINANCE = tuple(set(PLANNER) | set(FINANCE))`, defined locally as `expenses.py` does. Don't refactor `expenses.py`.

| Route | Roles | Behaviour |
|---|---|---|
| `GET /flights` | PLANNER_OR_FINANCE | Query params: `date_from`, `date_to` (on first_departure), `airline`, `project`, `employee`, `status`, `needs_review`. Returns `{bookings: [...], sync: {last_run, failed_emails, needs_review_count}}`. Each booking includes `route` (e.g. `SGN → CXR → SGN`), `passengers` (name, employee, employee_name) and `segments`. Fetch the list, then the docs. Volume is small (under ~100 bookings a year), so fetching each doc is fine; a `limit_page_length` of 500 is enough. `employee` filters by passenger employee, which happens in Python. |
| `GET /flights/{name}` | PLANNER_OR_FINANCE | Full doc plus parsed `source_emails` and `review_reasons` as a list. |
| `PATCH /flights/{name}` | PLANNER_OR_FINANCE | Body: `project?`, `note?`, `status?`, `passengers?: [{ticket_number, employee?, total?}]`. Changing a passenger's total is Finance-only (403 otherwise). Every changed path is added to `manual_fields`. The doc is saved with a PUT, and the updated doc is returned. |
| `POST /flights/{name}/review` | FINANCE | `needs_review=0`. Prefix `review_reasons` with `"Reviewed by {user} {iso date}: "`. |
| `POST /flights/sync` | FINANCE | Run `FlightProcessor().run()` in a background thread, guarded by the same lock as Task 9. Returns `{started: true}`, or 409 if a run is in progress. |

Log every endpoint with `log.info("flight_patch", name=..., user=..., fields=[...])`.

**Tests:**
- List filtering by `needs_review`.
- PATCH project adds `"project"` to `manual_fields`.
- A planner changing a total gets 403.
- Review clears the flag.

Commit.

---

### Task 11: Frontend page

**Agent:** refine-shadcn-developer. Read `docs/frontend_stack.md` first, and keep the existing Shadcn look (no new fonts or palettes).

**Files:**
- Create: `refinefrontend/src/pages/finance/FlightBookingsPage.tsx` (list; under ~400 lines)
- Create: `refinefrontend/src/components/flights/FlightBookingSheet.tsx` (detail and edit `Sheet`)
- Create: `refinefrontend/src/components/flights/types.ts`
- Modify: `refinefrontend/src/App.tsx`, adding `<Route path="/finance/flights" element={<FlightBookingsPage />} />` in the Finance block
- Modify: `refinefrontend/src/lib/roles.ts`:
  - import `Plane`;
  - add `{ label: "Flight Bookings", path: "/finance/flights", icon: Plane }` to **Finance** and to **Weddings**, so planners see it (nav roles are module-level only).

**The list page:**
- **Header:** title; sync status ("Last sync 2026-10-02 06:00 · 0 failed"); a "N need review" badge-button that toggles the filter; a **Sync now** button, shown only when `hasModuleAccess(roles, FINANCE_ROLES)`. Sync now POSTs `/inquiry-api/flights/sync`, then polls `GET /flights` every 5 s until `sync.last_run.finished_at` changes (at most 3 minutes).
- **Filters:** date range, airline select, wedding select, staff select (reuse `StaffFilterSelect` if its props fit, otherwise a local combobox), status select.
- **`DataTable` columns:**
  - departure (formatDate + HH:mm)
  - booking code (monospace)
  - airline
  - route
  - flight numbers
  - qty
  - staff (pills, with an amber "unmatched" pill when the employee is empty)
  - total (`formatVND`)
  - wedding
  - status badge
  - a review icon (AlertCircle, amber) when `needs_review`
- Clicking a row opens `FlightBookingSheet`.

**The sheet:**
- **Segments table:** flight, origin → destination, departure and arrival. When `original_departure` is set, show it struck through next to the new time.
- **Passengers table:** printed name, an **employee combobox** (options from `GET /inquiry-api/projects/kanban` `data.staff`, or an Employee `useList`), ticket number (with previous numbers in a tooltip), fare, total, change fees, extras.
- **Wedding:** a combobox from the `useList` `Project` pattern in ExpensesPage.
- **Note:** a textarea.
- **Status:** a select.
- **Review reasons:** an amber callout listing them, plus a **Mark reviewed** button (Finance only).
- **Source emails:** a list (date · type · subject).
- **Save:** one `PATCH /inquiry-api/flights/{name}` carrying only the changed fields, followed by a refetch.

**Verify:**
1. `cd refinefrontend && npm run build` passes.
2. Docker rebuild with `docker compose -f docker-compose.yml -f docker-compose.local.yml up react-frontend --build -d`.

Commit.

---

### Task 12: Model regression tool

**Files:**
- Create: `webhook_v2/tools/flight_eval.py`
- Create: `webhook_v2/tools/README_flight_eval.md`

1. Port the eval's scorer (`score_v2.py`: regex answer key, type rules, grounding check, run-to-run comparison) into this file. Make it import `build_input`, `PROMPT` and `SCHEMA` from `webhook_v2.services.flight_extractor`, so the eval always tests the production prompt.
2. CLI: `python -m webhook_v2.tools.flight_eval --emails <dir of .eml> --runs 2 [--model gpt-6.1-sol]`. It prints a score table and exits non-zero on any mistake.
3. The README states: emails are kept **outside the repo** because they contain staff data; to build the folder, run `python -m webhook_v2.tools.flight_eval --download <dir> --since 2026-01-01`, which uses the `HOADON_*` settings.

**Verify** against the local eval folder (outside the repo): 77 emails, 77/77 types, 36/36 documents. Commit.

---

### Task 13: Local end-to-end verification

**Agent:** erpnext-tester.

1. Rebuild and start the stack locally: `email-processor-v2` and `react-frontend`. Run the migration.
2. Trigger the backfill: `docker compose ... exec email-processor-v2 python -c "from webhook_v2.processors.flights import FlightProcessor; print(FlightProcessor().run())"`.
3. Check in ERPNext (`GET /api/resource/Flight Booking?fields=["booking_code","qty","total_amount","needs_review","status"]`). Expected:

| Booking | Expected |
|---|---|
| AAA111 | 12,150,000 (5 × 2,430,000). The refund for ticket 7381234567890 may appear on FFF666, which is fine |
| HHH888 | ticket 2,808,000 + extras 81,000 + 71,000 |
| EEE555 | 9 original tickets of 1,364,181 each, then change fees of 49,000 on the 7 re-issued tickets; status Changed after the 18:50 → 19:20 notice |
| GGG777 | 2 passengers flagged "original ticket price unknown" (the price is on EEE555). This is expected and correct |
| BBB222 | 8,717,448 (4 × 2,179,362), matching invoice 1000001; status Changed (VN1340 07:05 → 08:10) |
| CCC333 | 5,464,086 |
| DDD444 | 1,507,362 |

   Also check that the Employee links are set wherever a staff member's name matches.
4. Run it a **second time** and confirm 0 processed, 0 new docs (idempotent).
5. Test the page in a browser with the playwright skill, logged in as Administrator / admin123 at `http://frontend.merakierp.loc/finance/flights`:
   - screenshots of the list, the detail sheet and the needs-review filter;
   - link a wedding and save;
   - reload and confirm it persisted.
6. Post the results, with screenshots, as a comment on MWP-72.

---

### Task 14: Review and PR

1. Spawn the `code-reviewer` agent on the branch diff.
2. Fix its findings by sending them back to the implementing agent.
3. `gh pr create`. In the body: summary, root design points, eval results, test evidence, and the **Dokploy env vars that must be added before merge** (`HOADON_IMAP_PASSWORD`, `OPENAI_API_KEY`).
4. Comment on MWP-72 and move it to "PR Submitted".
5. **Do not merge.** That needs the user.
