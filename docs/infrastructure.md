# Infrastructure

Project infrastructure overview for Meraki Manager. All services run via Docker Compose with Traefik reverse proxy for local `.loc` domains.

## Services

| Service | Description | Local URL |
|---------|-------------|-----------|
| ERPNext (frontend) | Frappe/ERPNext web UI & API | http://merakierp.loc |
| React Frontend | Refine v5 admin panel | http://frontend.merakierp.loc |
| Lead Webhook | Contact form webhook receiver | http://webhook.merakierp.loc |
| Backend | Frappe application server | Internal (port 8000) |
| Websocket | Frappe Socket.IO server | Internal (port 9000) |
| MariaDB | Database (10.6) | Internal (port 3306) |
| Redis Cache | Frappe cache | Internal |
| Redis Queue | Frappe background jobs | Internal |
| Scheduler | Frappe task scheduler | Internal |
| Queue Short | Short/default job worker | Internal |
| Queue Long | Long job worker | Internal |

### Utility Services (run on demand)

| Service | Profile | Purpose |
|---------|---------|---------|
| create-site | `setup` | Creates a new ERPNext site |
| migration | `migrate` | Runs data migration from PostgreSQL source |

## Lead Webhook

Receives contact form submissions from merakiweddingplanner.com and creates Lead documents in ERPNext.

- **Code:** `webhook/`
- **Stack:** Python 3.12, FastAPI, Uvicorn
- **Port:** 8091

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/webhook/lead` | None | Creates a Lead in ERPNext from form data |
| `GET` | `/analytics` | Basic auth | Dashboard showing webhook call logs |
| `GET` | `/health` | None | Health check (`{"status": "ok"}`) |

### Lead Payload

The `/api/webhook/lead` endpoint accepts JSON with these fields:

| Field | Required | Description |
|-------|----------|-------------|
| `firstname` | Yes | Contact first name |
| `lastname` | No | Contact last name |
| `email` | Yes | Contact email |
| `phone` | No | Phone number |
| `address` | No | City/address |
| `coupleName` | No | Couple name (custom field) |
| `weddingVenue` | No | Wedding venue (custom field) |
| `weddingDate` | No | Wedding date in `MM/DD/YY` format |
| `approximate` | No | Approximate guest count |
| `budget` | No | Budget string (e.g., `100000usd`) |
| `position` | No | Relationship to couple |
| `ref` | No | Lead source (`google`, `facebook`, `instagram`, `referral`, `other`) |
| `moreDetails` | No | Additional notes |

### Analytics Auth

The `/analytics` dashboard uses HTTP Basic auth, configurable via environment variables:

| Variable | Default |
|----------|---------|
| `ANALYTICS_USER` | `meraki` |
| `ANALYTICS_PASS` | `meraki123` |

### Data Storage

Webhook call logs are stored in SQLite at `/app/data/webhook.db`, persisted in the `webhook-data` Docker volume.

### Build & Deploy (local)

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up webhook --build -d
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ERPNEXT_URL` | ERPNext base URL (default: `http://frontend:8080`) |
| `ERPNEXT_API_KEY` | ERPNext API key for authentication |
| `ERPNEXT_API_SECRET` | ERPNext API secret for authentication |
| `ANALYTICS_USER` | Basic auth username for analytics page |
| `ANALYTICS_PASS` | Basic auth password for analytics page |

## Email Processor v2 (webhook_v2)

Processes emails from the Meraki inbox, classifies them with AI, and creates/updates Leads and Communications in ERPNext. Runs scheduled jobs for email processing and lead lifecycle management.

- **Code:** `webhook_v2/`
- **Stack:** Python 3.12, FastAPI, APScheduler, Google Gemini AI
- **Port:** 8001
- **Container:** `email-processor-v2`

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/stats` | Processing statistics |
| `POST` | `/process` | Trigger email processing |
| `POST` | `/fetch` | Fetch emails from IMAP |
| `POST` | `/backfill` | Process stored emails to ERPNext |

### Scheduled Jobs

| Job | Interval | Description |
|-----|----------|-------------|
| `process_emails_job` | 5 min | Fetch from IMAP + classify + create leads/communications |
| `mark_stale_leads_job` | 6 hours | Mark leads with no client response for 3+ days as "Do Not Contact" |

### Email Classification (Gemini AI)

| Classification | Action |
|----------------|--------|
| `NEW_LEAD` | Create Lead + Communication |
| `CLIENT_MESSAGE` | Add Communication, set status → "Replied" |
| `STAFF_MESSAGE` | Add Communication (sent) |
| `MEETING_CONFIRMED` | Add Communication, set status → "Interested" |
| `QUOTE_SENT` | Add Communication, set status → "Quotation" |
| `IRRELEVANT` | Skip (not client-related) |

### Lead Lifecycle Automation

```
New inquiry     → Lead (status: "Lead")
Client replies  → Replied
Meeting set     → Interested
Quote sent      → Quotation
No response 3d  → Do Not Contact (stale)
Client returns  → Replied (re-engaged)
```

### Data Storage

- **PostgreSQL:** Email storage and processing state (`email-storage` container)
- **MinIO:** Email attachment storage (optional)

### Build & Deploy (local)

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up email-processor-v2 --build -d
```

### Manual Commands

```bash
# Trigger email processing
curl -X POST http://merakierp.loc:8001/process

# Run stale leads job manually
docker compose exec email-processor-v2 python3 -c "from webhook_v2.scheduler import mark_stale_leads_job; mark_stale_leads_job()"

# View logs
docker compose logs -f email-processor-v2
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ERPNEXT_URL` | ERPNext base URL |
| `ERPNEXT_API_KEY` | ERPNext API key |
| `ERPNEXT_API_SECRET` | ERPNext API secret |
| `IMAP_HOST` | IMAP server hostname |
| `IMAP_USER` | IMAP username |
| `IMAP_PASS` | IMAP password |
| `GEMINI_API_KEY` | Google Gemini API key for classification |
| `DATABASE_URL` | PostgreSQL connection string |
