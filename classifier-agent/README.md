# Classifier Agent

AI-powered email classification microservice using Google Gemini for Meraki Wedding Planner.

## Overview

The Classifier Agent is a standalone microservice that provides email classification and data extraction using Google's Gemini AI. It uses direct Gemini API calls (Custom Agent pattern) for deterministic classification without LLM tool-selection overhead.

## Architecture

```
webhook_v2 (email processor)
    │
    ├── RemoteClassifierClient ──── HTTP ────> classifier-agent (this service)
    │                                               │
    │                                               └── Gemini API
    │
    └── ERPNext (create leads, communications)
```

## Features

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Health check with version and model info |
| `POST /classify` | Classify lead/client emails |
| `POST /classify-expense` | Classify expense/invoice emails |
| `POST /extract-message` | Remove quoted replies from emails |
| `POST /extract-invoice` | Extract invoice data from PDF |

## API Endpoints

### Health Check

```bash
curl http://classifier.merakierp.loc/health
```

Response:
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "model": "gemini-2.0-flash"
}
```

### Classify Lead Email

```bash
curl -X POST http://classifier.merakierp.loc/classify \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Wedding Inquiry",
    "body": "Hi, we are planning our wedding for June 2025...",
    "sender": "couple@gmail.com",
    "recipient": "info@merakiweddingplanner.com",
    "is_contact_form": false
  }'
```

Response:
```json
{
  "classification": "new_lead",
  "is_client_related": true,
  "email": "couple@gmail.com",
  "firstname": "John",
  "lastname": "Doe",
  "wedding_date": "2025-06-15",
  "message_summary": "Planning wedding in June 2025"
}
```

### Classification Types

| Classification | Description |
|---------------|-------------|
| `new_lead` | First inquiry from potential client |
| `client_message` | Follow-up from existing/potential client |
| `staff_message` | Sent by Meraki staff |
| `meeting_confirmed` | Meeting date confirmed |
| `quote_sent` | Quotation/pricing sent |
| `irrelevant` | Spam, newsletters, etc. |
| `supplier_invoice` | Supplier invoice (expense) |

### Classify Expense Email

```bash
curl -X POST http://classifier.merakierp.loc/classify-expense \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Invoice #12345",
    "body": "Please find attached invoice for services...",
    "sender": "billing@vendor.com",
    "recipient": "info@merakiweddingplanner.com",
    "has_pdf": true
  }'
```

### Extract Message

Remove quoted replies from email threads:

```bash
curl -X POST http://classifier.merakierp.loc/extract-message \
  -H "Content-Type: application/json" \
  -d '{
    "body": "Thanks for the update!\n\nOn Mon, Jan 1, 2025 at 10:00 AM...\n> Previous message..."
  }'
```

### Extract Invoice

Extract data from PDF invoices (base64 encoded):

```bash
curl -X POST http://classifier.merakierp.loc/extract-invoice \
  -H "Content-Type: application/json" \
  -d '{
    "pdf_base64": "JVBERi0xLjQK..."
  }'
```

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | (required) | Google Gemini API key |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Gemini model to use |
| `LOG_LEVEL` | `INFO` | Logging level (DEBUG, INFO, WARNING, ERROR) |
| `JSON_LOGS` | `true` | Output JSON logs (false for colored dev output) |

## Local Development

### Run with Docker Compose

```bash
# Start classifier-agent with the full stack
docker compose -f docker-compose.yml -f docker-compose.local.yml up classifier-agent --build -d

# View logs
docker compose logs classifier-agent -f

# Test health endpoint
curl http://classifier.merakierp.loc/health
```

### Run Standalone

```bash
cd classifier-agent
pip install -r requirements.txt
export GEMINI_API_KEY=your-api-key
uvicorn agent.main:app --host 0.0.0.0 --port 8002 --reload
```

## Project Structure

```
classifier-agent/
├── Dockerfile
├── requirements.txt
├── README.md
└── agent/
    ├── __init__.py          # Version info
    ├── main.py              # FastAPI app
    ├── config.py            # Settings from env
    ├── logging.py           # Structured logging (structlog)
    ├── models.py            # Pydantic request/response models
    ├── prompts/
    │   ├── __init__.py
    │   ├── lead.py          # Lead classification prompt
    │   └── expense.py       # Expense classification prompt
    └── tools/
        ├── __init__.py
        ├── classify_email.py    # Lead email classifier
        ├── classify_expense.py  # Expense email classifier
        ├── extract_message.py   # Quote removal
        └── extract_invoice.py   # PDF invoice extraction
```

## Logging

The service uses structured logging with `structlog` for JSON-formatted output:

```json
{
  "event": "email_classified",
  "classification": "new_lead",
  "is_client_related": true,
  "subject": "Wedding Inquiry",
  "timestamp": "2025-02-09T10:30:00Z",
  "level": "info",
  "logger": "agent.tools.classify_email"
}
```

Log events:

| Event | Level | Description |
|-------|-------|-------------|
| `classifier_agent_starting` | INFO | Service startup |
| `gemini_client_initialized` | INFO | Gemini client ready |
| `email_classified` | INFO | Lead email classified |
| `expense_email_classified` | INFO | Expense email classified |
| `message_extracted` | INFO | Quoted replies removed |
| `invoice_extracted` | INFO | Invoice data extracted |
| `gemini_rate_limit` | ERROR | Rate limit hit |
| `gemini_auth_error` | ERROR | Authentication failed |
| `gemini_parse_error` | ERROR | Failed to parse response |

## Integration with webhook_v2

The `webhook_v2` service uses `RemoteClassifierClient` to communicate with this service:

```python
from webhook_v2.services.classifier_client import RemoteClassifierClient

client = RemoteClassifierClient()
result = client.classify(email)  # HTTP POST to /classify
```

Configuration in `webhook_v2/config.py`:
```python
classifier_service_url = "http://classifier-agent:8002"
```

## Error Handling

The service returns errors in the response body rather than throwing HTTP errors for classification failures:

```json
{
  "classification": "irrelevant",
  "is_client_related": false,
  "error": "rate_limit: 429 Too Many Requests"
}
```

This allows the caller to handle errors gracefully and retry if needed.

## Dependencies

- `google-genai` - Gemini AI SDK
- `fastapi` - Web framework
- `uvicorn` - ASGI server
- `PyMuPDF` - PDF processing
- `Pillow` - Image handling
- `pydantic` - Data validation
- `structlog` - Structured logging
- `httpx` - HTTP client
