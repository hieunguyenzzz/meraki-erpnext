---
name: meraki-erp
description: Develop the Meraki Wedding Planner ERPNext system and React frontend. Use when working on meraki-manager, merakierp.loc, the React frontend at frontend.merakierp.loc, ERPNext API calls, CRM pages, HR pages, finance pages, migration scripts, or Docker deployment.
---

# Meraki ERP

Meraki Wedding Planner ERPNext integration with React frontend.

## Quick Reference

| Resource | URL |
|----------|-----|
| ERPNext | http://merakierp.loc |
| React Frontend | http://frontend.merakierp.loc |
| Plane Project | MWP |

## Architecture

```
meraki-manager/
├── frontend/          # React 18 + TypeScript + Vite + shadcn/ui
│   └── src/
│       ├── pages/     # CRM, HR, Finance pages
│       ├── components/# Layout, ProtectedRoute, MetricCard, ui/
│       ├── contexts/  # UserContext (auth + roles)
│       └── lib/       # types.ts, roles.ts, format.ts, utils.ts
├── migration/         # Python migration scripts (PostgreSQL → ERPNext)
│   ├── core/          # config, erpnext_client, pg_client
│   ├── modules/       # items, employees, suppliers, customers, sales, projects, accounting
│   ├── setup/         # company, currency, base_data
│   └── verify/        # QA checks
├── scripts/           # Utility scripts
├── docs/              # erpnext_setup.md, migrate_guide.md
└── docker-compose.yml # ERPNext + MariaDB + Redis + React frontend
```

## Frontend Development

### Tech Stack

- React 18.3, TypeScript, Vite 6
- UI: shadcn/ui (Radix + Tailwind CSS + CVA)
- Icons: Lucide React
- Charts: Recharts
- Routing: React Router v6
- API: frappe-react-sdk

### Key Patterns

**API hooks** (from `frappe-react-sdk`):
```tsx
import { useFrappeGetDoc, useFrappeGetDocList, useFrappeCreateDoc, useFrappePostCall } from "frappe-react-sdk";

// Fetch single doc
const { data: lead, mutate } = useFrappeGetDoc("Lead", name ?? "");

// Fetch list with filters
const { data: orders } = useFrappeGetDocList("Sales Order", {
  fields: ["name", "customer_name", "grand_total", "status"],
  filters: [["status", "=", "Completed"]],
  orderBy: { field: "creation", order: "desc" },
  limit: 0,  // 0 = fetch all
});

// Create document
const { createDoc } = useFrappeCreateDoc();
await createDoc("Comment", { comment_type: "Comment", reference_doctype: "Lead", reference_name: leadName, content: text });

// Call server method
const { call } = useFrappePostCall("frappe.client.set_value");
await call({ doctype: "Lead", name: leadName, fieldname: "status", value: "Open" });
```

**Page structure** - List page + Detail page per entity:
- List: `useFrappeGetDocList` + table display
- Detail: `useFrappeGetDoc` with name from `useParams`
- Routes: `/crm/leads` (list), `/crm/leads/:name` (detail)

**UI components** available in `@/components/ui/`:
Button, Card (CardHeader, CardTitle, CardContent), Badge, Input, Label, Textarea, Separator, Select, Dialog, Table, Tabs, Sidebar

**Badge variants**: `default`, `secondary`, `destructive`, `outline`, `info`, `success`, `warning`

**Formatting** (`@/lib/format.ts`):
- `formatVND(amount)` - Vietnamese Dong with Intl.NumberFormat
- `formatDate(date)` - "DD MMM YYYY" format (en-GB locale)

**Role-based access** (`@/lib/roles.ts`):
- CRM: System Manager, Sales Manager, Sales User
- HR: System Manager, HR Manager, HR User
- Finance: System Manager, Accounts Manager, Accounts User

### TypeScript Types

All ERPNext document types are defined in `frontend/src/lib/types.ts`:
Customer, SalesOrder, SalesOrderItem, Employee, SalesInvoice, JournalEntry, Project, Lead, Opportunity, LeaveApplication, LeaveAllocation, EmployeeOnboarding, OnboardingActivity

### Build & Deploy

```bash
# Local dev
cd frontend && npm run dev

# Build check
cd frontend && npm run build

# Docker rebuild (from project root)
docker compose -f docker-compose.yml -f docker-compose.local.yml up react-frontend --build -d
```

## ERPNext Configuration

- **Company**: Meraki Wedding Planner (MWP), VND, Vietnam
- **Service business**: skip_delivery_note enabled, no stock management
- **Items**: SVC-FULL, SVC-PARTIAL, SVC-COORDINATOR
- **Custom fields**: custom_meraki_id (Employee), custom_meraki_customer_id (Customer), custom_meraki_venue_id (Supplier)

### Sales Order Lifecycle

```
Draft → Submitted (To Deliver and Bill) → Completed
```
Never use "Closed" status - it excludes orders from reports.

### Accounts

- Revenue: Sales - MWP
- Receivables: Debtors - MWP
- Cash: Cash - MWP
- Expenses: Salary, Office, Marketing, Travel, Software, Miscellaneous (all suffixed "- MWP")

### Payment Structure

50% deposit on booking, 30% before wedding, 20% after wedding.

## ERPNext API

Base URL: `http://merakierp.loc`

### CRUD Operations

```
GET    /api/resource/{DocType}?filters=[]&fields=[]&limit_page_length=0
GET    /api/resource/{DocType}/{name}
POST   /api/resource/{DocType}          (JSON body)
PUT    /api/resource/{DocType}/{name}   (JSON body)
DELETE /api/resource/{DocType}/{name}
```

### Workflow Methods

```
POST /api/method/frappe.client.submit   {"doc": {"doctype": "...", "name": "..."}}
POST /api/method/frappe.client.cancel   {"doc": {"doctype": "...", "name": "..."}}
POST /api/method/frappe.client.set_value {"doctype": "...", "name": "...", "fieldname": "...", "value": "..."}
POST /api/method/frappe.client.get_count {"doctype": "...", "filters": [...]}
```

### Authentication

Header: `Authorization: token {api_key}:{api_secret}`

See `docs/erpnext_setup.md` for credentials.

## Docker Services

| Service | Purpose | URL |
|---------|---------|-----|
| frontend | ERPNext Nginx | merakierp.loc |
| react-frontend | React app (Nginx) | frontend.merakierp.loc |
| backend | ERPNext gunicorn | internal:8000 |
| websocket | Socket.io | internal:9000 |
| db | MariaDB 10.6 | internal:3306 |
| redis-cache/queue | Redis | internal:6379 |

```bash
# Start all
docker compose up -d

# Rebuild React frontend only
docker compose -f docker-compose.yml -f docker-compose.local.yml up react-frontend --build -d

# Run migration
docker compose --profile migrate up migration --build

# ERPNext bench command
docker compose exec backend bench --site erp.merakiwp.com [command]
```

## Migration System

Entry point: `migration/run.py`

```bash
python run.py --setup           # Company + currency + base data
python run.py --module items    # Service items
python run.py --module employees
python run.py --module suppliers
python run.py --module customers
python run.py --module sales    # Sales Orders
python run.py --module projects
python run.py --module accounting  # Journal entries
python run.py --verify          # QA checks
python run.py --all             # Everything
```

Source: PostgreSQL at 14.225.210.164:5432 (meraki_nocodb)

## Development Rules

1. **Subagent-driven**: Delegate ERPNext tasks to `erpnext-developer` or `erpnext-tester` agents
2. **Always use merakierp.loc** for API calls, never direct IP:port
3. **Verify visually**: After frontend changes, take browser screenshots to confirm
4. **Build before deploy**: `npm run build` must pass before Docker rebuild
5. **Types in types.ts**: Add new ERPNext document interfaces there
6. **No class components**: Functional components + hooks only
7. **shadcn/ui only**: Don't add other UI libraries
