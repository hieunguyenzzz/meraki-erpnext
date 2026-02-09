# Meraki Manager - Claude Guidelines

> **This project uses Subagent-Driven Development**
> Always delegate ERPNext tasks to `erpnext-developer` or `erpnext-tester` agents.

## Core Principles

### 1. Quality First - "Make It Right"

> **Making it right is the HIGHEST priority. Don't rush.**

- Take time to understand ERPNext best practices
- Use proper document statuses and workflows
- Validate data integrity at every step
- If something isn't working correctly, fix the root cause - don't patch over it

### 2. ERPNext Best Practices for Weddings

**Sales Order Lifecycle:**
```
Draft → Submitted (To Deliver and Bill) → Completed
```

For a wedding to reach **"Completed"** status properly:
1. Sales Order created and **submitted** (not just saved)
2. Delivery Note created (service delivered) - OR - use % Delivered field
3. Sales Invoice created and paid - OR - use % Billed field
4. Status auto-changes to "Completed"

**Do NOT use "Closed" status** - it's a manual override that:
- Excludes orders from standard reports
- Doesn't represent proper completion
- Causes charts to show zero by default

**Payment Structure:**
- 50% Deposit (on booking)
- 30% Second payment (before wedding)
- 20% Final payment (after wedding)

## Project Overview

ERPNext integration for Meraki Wedding Planner business operations. Migrating from PostgreSQL (NocoDB) to ERPNext for Finance, CRM, and HR management.

### Migration Status

See **[MIGRATION_STATUS.md](./MIGRATION_STATUS.md)** for current progress.

**Target Outcomes:**
- Employees: 16 with `custom_meraki_id`
- Customers: ~132 (no duplicates)
- Sales Orders: 134 with **Completed** status (past weddings)
- Projects: 134 linked to Sales Orders
- Suppliers/Venues: 35 with `custom_meraki_venue_id`
- Journal Entries: 18 submitted

### Financial History Migration

To enable monthly P&L reports showing historical revenue and expenses:

**Revenue (from Weddings):**
- Create **Sales Invoice** for each wedding, dated on wedding date
- Amount = 100% of wedding value (treat as fully paid on wedding date)
- Links to existing Sales Order

**Salary Expenses (calculated):**
- Create monthly **Journal Entry** for each month with active staff
- Calculate: Sum of all active employees' monthly salary for that month
- Debit: Salary Expense account
- Credit: Bank/Cash account (treated as paid)

**Expected Result:**
- Monthly P&L shows revenue from weddings in the month they occurred
- Monthly P&L shows salary expenses for each month based on active staff

## Local Development

**Docker-based deployment** accessible via `http://merakierp.loc` through the local Traefik reverse proxy.

> **Always use `http://merakierp.loc`** for all API calls and browser access. Never use the direct IP:port (`http://100.65.0.28:8082`).

**Local Admin Testing Credentials:**
- Username: `Administrator`
- Password: `admin123`

```bash
docker context use default
docker compose up -d
```

## Development Methodology: Subagent-Driven Development

This project follows **Subagent-Driven Development** - the main Claude acts as **orchestrator/decision maker**, while specialized subagents are **executors**.

### Core Principle

> **You are the decision maker, subagents are executors.**
> - YOU decide the approach and solution
> - Give subagents EXPLICIT instructions on what to do
> - Don't let subagents decide strategy - they execute your plan
> - Guide and redirect agents if they go off track

### Available Agents

| Agent | Role |
|-------|------|
| `erpnext-developer` | Implementation: custom doctypes, server scripts, hooks, API integrations, migrations, Frappe framework development |
| `erpnext-tester` | Testing: verify migrations, validate API endpoints, confirm ERPNext features work correctly |

### How to Delegate

**ALWAYS use subagents for ERPNext tasks.** Don't run commands directly - delegate to the appropriate agent.

**Example - Migration Fix:**
```
Use Task tool with subagent_type='erpnext-developer':
"Fix the migrate_employees.py script:
1. The parent_department should be 'All Departments' not 'All Departments - MWP'
2. Update line 30 in /Users/hieunguyen/projects/erpnext/meraki-manager/migration/migrate_employees.py
3. After fixing, sync files to server with: rsync -avz . root@100.65.0.28:/opt/meraki-manager/
4. Rebuild and run migration: ssh root@100.65.0.28 'cd /opt/meraki-manager && docker compose --profile migrate up migration --build'"
```

**Example - Testing:**
```
Use Task tool with subagent_type='erpnext-tester':
"Test the employee migration:
1. Verify employees were created by calling: curl http://merakierp.loc/api/resource/Employee
2. Check that custom fields exist on Employee doctype
3. Verify 16 employees were migrated from the source database
4. Document results in Plane ticket MWP-33 comment"
```

### Workflow

1. **Plan** - Understand requirements and design approach
2. **Decide** - YOU determine the solution/approach
3. **Delegate** - Spawn agent with EXPLICIT step-by-step instructions
4. **Review** - Validate agent output
5. **Iterate** - Refine and re-delegate as needed

## Ticket Management

**Plane** is used for tracking all work. Project: `MWP` (Meraki Wedding Planner)

### Issue Handling

When an issue is discovered:
1. Ask user: "Would you like me to create a Plane ticket for this?"
2. If yes, create ticket with full context

### Ticket Lifecycle

```
Todo → In Progress → PR Submitted → Testing → Done
        ↑                              ↑
   erpnext-developer              erpnext-tester
```

| Stage | Owner | Actions |
|-------|-------|---------|
| **In Progress** | erpnext-developer | Implements the solution |
| **PR Submitted** | erpnext-developer | Creates PR, merges, deploys to local |
| **Testing** | erpnext-tester | Tests the deployment, verifies functionality |
| **Done** | erpnext-tester | Confirms everything works |

### Agent Responsibilities

**erpnext-developer:**
- Move ticket to "In Progress" when starting
- Implement the solution
- Create and merge PR
- Handle deployment on local (Docker)
- Move ticket to "Testing" when deployment is ready

**erpnext-tester:**
- Pick up tickets in "Testing" status
- Test the implementation on local ERPNext
- Document test results in ticket comments
- Move ticket to "Done" if tests pass
- Move back to "In Progress" if issues found (with details)

## Email Processing (webhook_v2)

The `webhook_v2/` directory contains the email processing pipeline that:
1. Fetches emails from Zoho IMAP and stores in PostgreSQL
2. Classifies emails using Gemini AI
3. Creates Leads and Communications in ERPNext

See **[docs/webhook_v2_operations.md](./docs/webhook_v2_operations.md)** for:
- How to flush and re-process leads/communications
- Diagnosing duplicates and missing data
- Useful PostgreSQL and ERPNext API queries
- Notes on ERPNext API authentication issues

**Key commands:**
```bash
# Run backfill (process stored emails to ERPNext)
docker compose exec email-processor-v2 python -m webhook_v2.processors.backfill --since 2026-02-06

# Check stats
docker compose exec email-processor-v2 python -c "from webhook_v2.services.erpnext import ERPNextClient; c = ERPNextClient(); print(c._get('/api/resource/Lead', params={'limit_page_length': 1000}))"
```

## React Frontend

The custom admin panel lives in `refinefrontend/`. **Before working on frontend code, read [docs/frontend_stack.md](./docs/frontend_stack.md)** -- it covers the Refine v5 API quirks (return shapes differ from standard docs), component library, deployment, and conventions.

Key things to know:
- **Refine v5 return shapes**: `useList` returns `{ result, query }` not `{ data, isLoading }`. `useOne` returns `{ result }` where result IS the record directly.
- **UI**: Shadcn-style local components (not a package) in `components/ui/`, styled with TailwindCSS + Radix UI
- **Build/deploy**: `docker compose -f docker-compose.yml -f docker-compose.local.yml up react-frontend --build -d`
- **URL**: `http://frontend.merakierp.loc`

## ERPNext Configuration

See **[docs/erpnext_setup.md](./docs/erpnext_setup.md)** for the full ERPNext setup reference (company, accounts, items, settings). **Keep this file up to date** when ERPNext configuration changes.

## Key URLs

| Resource | URL |
|----------|-----|
| ERPNext (local) | http://merakierp.loc |
| Source DB | 14.225.210.164:5432 (meraki_nocodb) |
| Plane | https://plane.mobelaris.com (workspace: soundboxstore, project: MWP) |

## Database Connections

**Source (PostgreSQL):**
```
Host: 14.225.210.164
Port: 5432
Database: meraki_nocodb
User: meraki_noco_usr
```

**Target (ERPNext/MariaDB):**
- Managed via Docker containers
- Access via `docker compose exec backend bench ...`
