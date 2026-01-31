# Meraki Wedding Planner - ERPNext Integration

ERPNext-based business management for Meraki Wedding Planner. Migrated from NocoDB (PostgreSQL) to ERPNext for Finance, CRM, and HR — with a custom React admin panel.

## Architecture

- **ERPNext** (v15 + HRMS) - Backend: API, data, workflows
- **React Frontend** (`refinefrontend/`) - Custom admin panel built with Refine v5, Shadcn UI, TailwindCSS
- **Docker Compose** - Local development via Traefik reverse proxy

## Local Development

```bash
# Start all services (ERPNext + React frontend)
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d

# Rebuild React frontend after changes
docker compose -f docker-compose.yml -f docker-compose.local.yml up react-frontend --build -d
```

| Service | URL |
|---------|-----|
| React Frontend | http://frontend.merakierp.loc |
| ERPNext | http://merakierp.loc |

Requires the [local Traefik proxy](https://github.com/hieunguyenzzz/traefik-local) on the `local-dev` Docker network.

## Project Structure

```
meraki-manager/
├── docker-compose.yml          # ERPNext services
├── docker-compose.local.yml    # Local dev overrides (Traefik, React frontend)
├── refinefrontend/             # React admin panel
│   ├── src/                    # App source (pages, components, providers)
│   ├── e2e/                    # Playwright E2E tests (46 tests)
│   ├── playwright.config.ts
│   ├── Dockerfile              # Nginx-based production build
│   └── nginx.conf              # API proxy to ERPNext
├── migration/                  # PostgreSQL → ERPNext migration scripts
│   ├── run.py                  # Main entry point
│   ├── modules/                # Migration modules per doctype
│   ├── setup/                  # ERPNext setup scripts
│   └── verify/                 # Migration verification
├── scripts/                    # One-off maintenance scripts
├── docs/
│   ├── erpnext_setup.md        # ERPNext configuration reference
│   ├── frontend_stack.md       # React frontend conventions
│   ├── frontend_testing.md     # E2E testing guide
│   └── migrate_guide.md        # Migration instructions
└── MIGRATION_STATUS.md         # Current migration progress
```

## React Frontend

Custom admin panel at `refinefrontend/` — see [docs/frontend_stack.md](docs/frontend_stack.md) for conventions.

**Stack:** React 19, Refine v5, React Router v7, Recharts, Shadcn UI, TailwindCSS

**Modules:**
- **CRM** - Customers, Weddings (Sales Orders), Leads, Opportunities
- **HR** - Employees, Leave Management, Onboarding
- **Finance** - Invoices, Expenses, Payments, Journal Entries, Revenue Overview

## E2E Tests

46 Playwright tests covering auth, dashboard, navigation, and all page modules.

```bash
cd refinefrontend
npm run test:e2e              # headless
npm run test:e2e:ui           # Playwright UI mode
npm run test:e2e:headed       # watch in browser
```

Set `E2E_ADMIN_PASSWORD` env var if the admin password differs from the default.

## Data Migration

Migrates from PostgreSQL (NocoDB) to ERPNext:

| Source (PostgreSQL) | ERPNext Doctype |
|---------------------|-----------------|
| staff | Employee |
| venue | Supplier |
| weddings.client | Customer |
| weddings | Sales Order + Project |
| wedding_addon | Item |
| cost | Journal Entry |

See [MIGRATION_STATUS.md](MIGRATION_STATUS.md) for current progress and [docs/migrate_guide.md](docs/migrate_guide.md) for instructions.
