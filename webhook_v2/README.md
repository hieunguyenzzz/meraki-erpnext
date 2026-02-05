# Email Processing System v2

Clean, extensible email processing pipeline for Meraki Wedding Planner.

## Architecture

```
webhook_v2/
├── config.py           # Pydantic settings (all env vars)
├── core/
│   ├── models.py       # Email, Classification, ProcessingResult dataclasses
│   ├── database.py     # PostgreSQL repository (email-storage container)
│   └── logging.py      # Structlog JSON logging
├── classifiers/
│   ├── base.py         # Abstract classifier interface
│   ├── gemini.py       # Gemini AI implementation
│   └── prompts/        # Doctype-specific prompts (lead.py, expense.py, hr.py)
├── handlers/
│   ├── base.py         # Abstract handler interface
│   ├── registry.py     # Handler registration pattern
│   └── lead/           # Lead handler implementation
├── processors/
│   ├── realtime.py     # Process new emails (scheduler)
│   └── backfill.py     # Historical import
├── services/
│   ├── imap.py         # Zoho IMAP client
│   ├── erpnext.py      # ERPNext API client
│   └── minio.py        # MinIO attachment storage
├── main.py             # FastAPI endpoints
└── scheduler.py        # APScheduler jobs
```

## Key Concepts

### 1. Classification Flow
```
Email → Classifier → Classification → Handler → ERPNext
```

### 2. Classifications
| Value | Description | Handler Action |
|-------|-------------|----------------|
| `new_lead` | First inquiry | Create Lead + Communication |
| `client_message` | Client reply | Update stage + Communication |
| `staff_message` | Meraki sent | Communication only |
| `meeting_confirmed` | Meeting set | Update stage to "meeting" |
| `quote_sent` | Quotation sent | Update stage to "quoted" |
| `irrelevant` | Spam/unrelated | Skip |

### 3. Handler Pattern
```python
class LeadHandler(BaseHandler):
    def can_handle(self, classification) -> bool:
        return classification in (NEW_LEAD, CLIENT_MESSAGE, ...)

    async def handle(self, email, classification) -> ProcessingResult:
        # Create lead or update CRM
```

## Database Schema (email-storage container)

```sql
-- emails: Fetched from IMAP
emails (
    id, message_id, mailbox, folder, subject, sender, recipient,
    email_date, body_plain, body_html, has_attachments,
    doctype, processed, classification, classification_data
)

-- attachments: MinIO URLs
attachments (email_id, filename, content_type, storage_url)

-- processing_logs: Audit trail
processing_logs (email_id, action, doctype, result_id, details)
```

## Environment Variables

```bash
# IMAP
ZOHO_EMAIL=info@merakiweddingplanner.com
ZOHO_PASSWORD=app_password

# Email Storage DB (new container)
EMAIL_STORAGE_HOST=email-storage
EMAIL_STORAGE_PASSWORD=secret

# ERPNext
ERPNEXT_URL=http://merakierp.loc
ERPNEXT_API_KEY=xxx
ERPNEXT_API_SECRET=xxx

# Gemini
GEMINI_API_KEY=xxx
GEMINI_MODEL=gemini-2.0-flash

# MinIO (optional)
MINIO_ENDPOINT=minio-api.hieunguyen.dev
MINIO_ACCESS_KEY=xxx
MINIO_SECRET_KEY=xxx
```

## Adding a New Doctype (e.g., Expenses)

1. **Add prompt** in `classifiers/prompts/expense.py`
2. **Add handler** in `handlers/expense/handler.py`
3. **Register handler** in `handlers/expense/__init__.py`
4. **Add DocType enum** value in `core/models.py`

## Running

```bash
# Development
cd webhook_v2
pip install -r requirements.txt
python -m pytest tests/ -v

# Docker
docker compose -f docker-compose.yml up email-processor-v2 --build

# Manual processing
python -m processors.realtime

# Backfill
python -m processors.backfill --days 30 --dry-run
```

## Testing

```bash
# Unit tests
pytest tests/unit/ -v

# Integration tests (requires DB)
pytest tests/integration/ -v

# All tests with coverage
pytest --cov=webhook_v2 --cov-report=html
```

## Migration from v1

1. Deploy v2 alongside v1 (different port)
2. Process test emails in v2, compare results with v1
3. Full cutover when verified
4. Remove v1 container and code

## Logging

Structured JSON logs via structlog:

```json
{
  "event": "email_processed",
  "email_id": 123,
  "classification": "new_lead",
  "lead_name": "CRM-LEAD-2026-00042",
  "timestamp": "2026-02-05T10:30:00Z"
}
```

## Quick Reference

```python
# Get logger
from webhook_v2.core import get_logger
log = get_logger(__name__)
log.info("processing", email_id=123)

# Use database
from webhook_v2.core import Database
db = Database()
emails = db.get_unprocessed_emails(doctype=DocType.LEAD, limit=50)

# Classify email
from webhook_v2.classifiers import GeminiClassifier
classifier = GeminiClassifier()
result = classifier.classify(email)

# Handle email
from webhook_v2.handlers import get_handler
handler = get_handler(result.classification)
if handler:
    await handler.handle(email, result)
```
