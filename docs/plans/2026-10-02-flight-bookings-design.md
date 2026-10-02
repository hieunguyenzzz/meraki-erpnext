# Flight Bookings — Design (MWP-72)

**Date:** 2026-10-02
**Goal:** Every day, pull airline emails from `hoadon.merakiwp@gmail.com`, extract the flight-ticket data with OpenAI `gpt-6.1-sol`, store it in ERPNext, and manage it on a Finance page.

## Data model (ERPNext, migration phase `v096_flight_booking.py`)

**Flight Booking** (one record per booking)

| Field | Type | Notes |
|---|---|---|
| booking_code | Data | PNR, e.g. EEE555. Unique together with airline |
| airline | Data | Normalised name ("Vietnam Airlines", "Vietjet Air", "Sun PhuQuoc Airways", ...) |
| status | Select | Confirmed / Changed / Cancelled / Refunded |
| qty | Int, read-only | Number of passengers |
| total_amount, currency | Currency, Data | Sum of the passengers' ticket totals plus change fees and extras |
| project | Link → Project, optional | Set by hand. The pipeline never sets or overwrites it |
| note | Small Text | Pipeline adds lines (schedule change, refund); staff can edit |
| needs_review | Check | Set when any safety check fails |
| review_reasons | Small Text | Why the booking was flagged |
| source_emails | Long Text (JSON) | Message-ID, subject, date and email_type for each email merged in |

**Flight Booking Segment** (child): flight_no, origin, destination (IATA), departure, arrival (Datetime, local time), fare_family, booking_class, original_departure (filled when a schedule change has moved the flight).

**Flight Booking Passenger** (child): passenger_name (as printed), employee (Link → Employee, optional), ticket_number, fare, total, change_fees, extras (EMD totals), extras_detail.

## Pipeline (`webhook_v2/`)

1. **Trigger:** an APScheduler job at 06:00 Asia/Ho_Chi_Minh, or `POST /flights/sync`.
2. **Fetch:** IMAP `[Gmail]/All Mail` for mail newer than the last run. The first run backfills from 2026-01-01.
3. **Pre-filter:** keep only airline senders and keywords, so other invoices are never sent to OpenAI.
4. **Extract:** `gpt-6.1-sol` with `reasoning.effort=high`, using the v3 prompt and a strict JSON schema. The input is the cleaned email body (HTML decoded), the PDF and the PDF text layer from `pdftotext`.
5. **Merge:** create or update the booking for (airline, booking_code).
6. **Record:** keep each Message-ID's state in Postgres (`done` / `skipped` / `failed`). A failed email is retried on the next run, up to 3 times, and is never silently dropped.

### Merge rules
- **ticket:** add or update the flights and passengers. A new ticket number for the same booking and passenger replaces that passenger's ticket, and the old number goes into the note.
- **Change fee:** if `total_amount < fare_amount` and `has_previously_paid_items`, the amount is a change fee. Add it to the passenger's `change_fees` and keep the original ticket total.
- **emd:** add to the passenger's `extras`, matched by `related_ticket_number`.
- **schedule_change:** update the flight times, store the old time in `original_departure`, set status to Changed and add a line to the note.
- **refund:** set status to Refunded or Cancelled and add a line to the note. Nothing is deleted.
- **booking_summary / airline_invoice:** used only for the totals cross-check.
- **boarding_pass / not_flight:** skipped.
- **Manual edits win:** fields staff have edited (project, employee, note, amounts) are never overwritten.

### Safety checks (any failure sets `needs_review`, with a reason)
1. **Grounding:** every ticket number, booking code, flight number and amount the model returns must appear in the source text.
2. **Totals:** the sum of the ticket totals must equal the booking-summary or airline-invoice amount once one is seen.
3. **Formats:** flight number matches `^[A-Z0-9]{2}\d{1,4}$`; origin and destination are on the known airport list; arrival is after departure; amounts are positive except on refunds.
4. **Change-fee rule** applied as above.
5. **Staff match:** the passenger name is compared with Employee names as a set of words, accents removed and order ignored. Exactly one match is linked. Zero or several matches leave the field empty and flag the booking for review.

## API (`webhook_v2/routers/flights.py`, proxied at `/inquiry-api/`)

| Endpoint | Roles |
|---|---|
| `GET /flights`: list, filters, sync status | PLANNER_OR_FINANCE |
| `GET /flights/{name}`: detail | PLANNER_OR_FINANCE |
| `PATCH /flights/{name}`: project, note, status, passenger employee | PLANNER_OR_FINANCE |
| `POST /flights/{name}/review`: clear the flags | FINANCE |
| `POST /flights/sync`: run the pipeline now | FINANCE |

## Page: Finance → Flight Bookings (`/finance/flights`)
- **Header:** last sync time and status, "N need review", a Sync now button (Finance only).
- **Filters:** departure date range, staff, airline, project, status, needs review.
- **Table:** departure · booking code · airline · route · flights · qty · staff · total · project · status.
- **Detail:**
  - flights, with the original time struck through after a schedule change;
  - passengers, with an Employee picker;
  - Project picker and note;
  - source emails;
  - review flags and a Mark reviewed button.

## Model evaluation (2026-10-02)
The test used 77 airline-related emails from 2026, scored against an answer key read from the PDF text by regex: 36 tickets and EMDs, every field.

| | Email types | Documents fully correct | Consistent across 2 runs |
|---|---|---|---|
| gpt-6-luna (v3 prompt, high) | 77/77 | 36/36 | No: flipped the sign of a refund invoice |
| **gpt-6.1-sol (v3 prompt, high)** | 77/77 | 36/36 | Yes, except boarding passes, which the pipeline skips |

What improved accuracy from v1 to v3: decoded HTML bodies; the PDF text layer sent alongside the PDF; a copy-exactly prompt with an airport-code table; a ban on codes from the Fare Calculation line; original vs new times for schedule changes; the booking code read from the subject; and reasoning effort high.

## Config
`OPENAI_API_KEY`, `OPENAI_MODEL=gpt-6.1-sol`, `OPENAI_REASONING_EFFORT=high`, `HOADON_IMAP_HOST/PORT/USER/PASSWORD`. Locally these live in `.env`, which git ignores; in production they are Dokploy environment variables. The webhook_v2 image needs `poppler-utils`.

## Testing
1. **pytest:** merge rules, safety checks and name matching, using synthetic fixtures. Real staff emails are never committed.
2. **Model regression:** an eval script that reads emails from a local folder outside git and scores them with the regex answer key.
3. **Local backfill:** expect AAA111 = 5 × 2,430,000 = 12,150,000; BBB222 = 8,717,448; CCC333 = 5,464,086; DDD444 = 1,507,362; EEE555 with re-issue change fees.
4. **Browser check** by the tester agent, with screenshots.
