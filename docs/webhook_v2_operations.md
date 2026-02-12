# Webhook V2 Operations Guide

This document covers common operations for the email processing webhook system.

## Architecture Overview

The webhook_v2 system has two separate concerns:
1. **IMAP Fetch** - Pulls emails from Zoho and stores in PostgreSQL
2. **Backfill** - Processes stored emails and creates Leads/Communications in ERPNext

## Flush and Re-process Leads/Communications

When you need to re-test the backfill process from scratch, follow these steps:

### 1. Delete All Communications and Leads from ERPNext

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml exec email-processor-v2 python -c "
import requests
from webhook_v2.config import settings

url = settings.erpnext_url
headers = {
    'Authorization': f'token {settings.erpnext_api_key}:{settings.erpnext_api_secret}',
    'X-Frappe-Site-Name': 'erp.merakiwp.com'
}

# Delete all communications first (they reference leads)
result = requests.get(f'{url}/api/resource/Communication', params={'limit_page_length': 1000, 'fields': '[\"name\"]'}, headers=headers).json()
comms = result.get('data', [])
print(f'Deleting {len(comms)} communications...')
for comm in comms:
    requests.delete(f'{url}/api/resource/Communication/{comm[\"name\"]}', headers=headers)
    print(f'  Deleted: {comm[\"name\"]}')

# Delete all leads
result = requests.get(f'{url}/api/resource/Lead', params={'limit_page_length': 1000, 'fields': '[\"name\"]'}, headers=headers).json()
leads = result.get('data', [])
print(f'Deleting {len(leads)} leads...')
for lead in leads:
    requests.delete(f'{url}/api/resource/Lead/{lead[\"name\"]}', headers=headers)
    print(f'  Deleted: {lead[\"name\"]}')

print('Done!')
"
```

### 2. Reset PostgreSQL Processed Flags

Reset the processed flag for emails you want to reprocess:

```bash
# Reset last 3 days
docker compose -f docker-compose.yml -f docker-compose.local.yml exec email-storage psql -U email_processor -d email_processing -c "
UPDATE emails
SET processed = FALSE,
    processed_at = NULL,
    classification = NULL,
    classification_data = NULL,
    error_message = NULL,
    retry_count = 0
WHERE email_date >= '2026-02-06'::date;
"

# Also clear processing logs
docker compose -f docker-compose.yml -f docker-compose.local.yml exec email-storage psql -U email_processor -d email_processing -c "
DELETE FROM processing_logs
WHERE email_id IN (SELECT id FROM emails WHERE email_date >= '2026-02-06'::date);
"
```

### 3. Run Backfill

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml exec email-processor-v2 \
  python -m webhook_v2.processors.backfill --since 2026-02-06 --log-level INFO
```

## Backfill CLI Reference

```bash
python -m webhook_v2.processors.backfill [OPTIONS]
```

### Options

| Option | Description |
|--------|-------------|
| `--since YYYY-MM-DD` | Start date for email processing |
| `--until YYYY-MM-DD` | End date (optional, defaults to now) |
| `--force` | Reprocess all emails in date range (requires --since) |
| `--dry-run` | Preview without processing |
| `--limit N` | Max emails to process |
| `--log-level` | DEBUG, INFO, WARNING, ERROR (default: INFO) |

### Examples

```bash
# Process unprocessed emails (default)
python -m webhook_v2.processors.backfill

# Process last 7 days
python -m webhook_v2.processors.backfill --since 2026-02-05

# Force reprocess date range (ignores processed flag)
python -m webhook_v2.processors.backfill --since 2026-02-01 --until 2026-02-07 --force

# Dry run to preview
python -m webhook_v2.processors.backfill --since 2026-02-01 --dry-run

# Process with limit
python -m webhook_v2.processors.backfill --since 2026-02-01 --limit 10 --log-level DEBUG
```

### Batch Summary Optimization

The backfill uses batch mode for AI summaries to minimize API calls:

1. **Email Processing Phase**: Creates leads and communications without generating summaries
2. **Summary Generation Phase**: Generates one summary per unique lead at the end

This reduces API calls from N (per email) to M (per unique lead), typically saving 80-90% of summary API calls.

## Diagnose Duplicates and Missing Communications

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml exec email-processor-v2 python -c "
from webhook_v2.services.erpnext import ERPNextClient

client = ERPNextClient()

# Get all leads
result = client._get('/api/resource/Lead', params={
    'limit_page_length': 1000,
    'fields': '[\"name\",\"lead_name\",\"email_id\",\"creation\"]'
})
leads = result.get('data', [])
print(f'=== LEADS ({len(leads)}) ===')
for lead in leads:
    print(f\"  {lead['name']}: {lead.get('lead_name')} - {lead.get('email_id')}\")

# Get all communications
result = client._get('/api/resource/Communication', params={
    'limit_page_length': 1000,
    'fields': '[\"name\",\"reference_name\",\"subject\",\"custom_email_message_id\"]'
})
comms = result.get('data', [])
print(f\"\\n=== COMMUNICATIONS ({len(comms)}) ===\")

# Check for duplicates
print(\"\\n=== DUPLICATE CHECK (by message_id) ===\")
message_ids = {}
for comm in comms:
    mid = comm.get('custom_email_message_id')
    if mid:
        if mid in message_ids:
            message_ids[mid].append(comm['name'])
        else:
            message_ids[mid] = [comm['name']]

duplicates = {k: v for k, v in message_ids.items() if len(v) > 1}
if duplicates:
    print(f'Found {len(duplicates)} duplicate message_ids:')
    for mid, names in duplicates.items():
        print(f'  {mid}: {names}')
else:
    print('No duplicates found!')
"
```

## Useful Queries

### Check PostgreSQL Email Stats

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml exec email-storage psql -U email_processor -d email_processing -c "
SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE processed = TRUE) as processed,
    COUNT(*) FILTER (WHERE processed = FALSE) as pending,
    COUNT(*) FILTER (WHERE classification = 'new_lead') as new_leads,
    COUNT(*) FILTER (WHERE classification = 'client_message') as client_messages,
    COUNT(*) FILTER (WHERE classification = 'irrelevant') as irrelevant
FROM emails;
"
```

### Check Recent Emails

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml exec email-storage psql -U email_processor -d email_processing -c "
SELECT id, email_date, subject, sender, classification, processed
FROM emails
ORDER BY email_date DESC
LIMIT 10;
"
```

### Check Processing Logs

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml exec email-storage psql -U email_processor -d email_processing -c "
SELECT pl.id, pl.action, pl.result_id, pl.created_at, e.subject
FROM processing_logs pl
JOIN emails e ON e.id = pl.email_id
ORDER BY pl.created_at DESC
LIMIT 20;
"
```

## ERPNext API Notes

When calling ERPNext API from outside Docker, you may get 401 errors due to nginx issues. Use the email-processor-v2 container which connects directly to the backend:

```bash
# This works (inside container, direct to backend)
docker compose exec email-processor-v2 python -c "
from webhook_v2.services.erpnext import ERPNextClient
client = ERPNextClient()
result = client._get('/api/resource/Lead', params={'limit_page_length': 5})
print(result)
"

# This may fail intermittently (outside container, through nginx)
curl "http://merakierp.loc/api/resource/Lead" -H "Authorization: token ..."
```

The processor connects to `http://meraki-backend:8000` directly with the `X-Frappe-Site-Name: erp.merakiwp.com` header to bypass nginx.
