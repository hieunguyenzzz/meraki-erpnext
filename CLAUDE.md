# Meraki Manager - Claude Guidelines

## Project Overview

ERPNext integration for Meraki Wedding Planner business operations. Migrating from PostgreSQL (NocoDB) to ERPNext for Finance, CRM, and HR management.

## Local Development

**Docker-based deployment** on server `100.65.0.28:8082`

```bash
docker context use 100.65.0.28
docker compose up -d
```

## Development Methodology: Subagent-Driven Development

This project follows **Subagent-Driven Development** - we plan what needs to be done, then delegate execution to specialized agents.

### Available Agents

| Agent | Role |
|-------|------|
| `erpnext-developer` | Implementation: custom doctypes, server scripts, hooks, API integrations, migrations, Frappe framework development |
| `erpnext-tester` | Testing: verify migrations, validate API endpoints, confirm ERPNext features work correctly |

### Workflow

1. **Plan** - Understand requirements and design approach
2. **Delegate** - Spawn appropriate agent with clear instructions
3. **Review** - Validate agent output
4. **Iterate** - Refine as needed

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

## Key URLs

| Resource | URL |
|----------|-----|
| ERPNext (local) | http://100.65.0.28:8082 |
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
