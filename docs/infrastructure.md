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
