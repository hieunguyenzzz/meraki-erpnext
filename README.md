# Meraki Wedding Planner - ERPNext Integration

Migrate Meraki Wedding Planner data from NocoDB (PostgreSQL) to ERPNext for Finance, CRM, and HR management.

## Quick Start

```bash
# 1. Deploy ERPNext
docker context use 100.65.0.28
docker compose up -d
docker compose --profile setup up create-site

# 2. Configure ERPNext (via UI)
# - Complete setup wizard
# - Generate API keys
# - Update .env with API keys

# 3. Run migration
pip install psycopg2-binary requests python-dotenv
python migration/migrate.py
```

## Project Structure

```
meraki-manager/
├── docker-compose.yml    # ERPNext deployment
├── .env                  # Environment config
├── migration/
│   ├── migrate.py        # Main entry point
│   ├── config.py         # Configuration
│   ├── erpnext_client.py # ERPNext API client
│   ├── pg_client.py      # PostgreSQL client
│   └── migrate_*.py      # Migration modules
└── docs/
    ├── migrate_guide.md  # Step-by-step guide
    └── testing_guide.md  # Verification procedures
```

## Data Mapping

| Source (PostgreSQL) | ERPNext Doctype |
|---------------------|-----------------|
| staff | Employee |
| venue | Supplier |
| weddings.client | Customer |
| weddings | Sales Order + Project |
| wedding_addon | Item |
| task | Task |
| cost | Journal Entry |
| payroll | Salary Slip |

## Key Features

- **Weddings as Sales Orders + Projects**: Revenue tracking via Sales Order, task management via Project
- **Staff Assignments**: Lead Planner, Support Planner, Assistants linked to Projects
- **Commission Tracking**: Custom fields on Employee for commission percentages
- **Full Audit Trail**: All migrated records include original Meraki IDs

## Documentation

- [Migration Guide](docs/migrate_guide.md) - Complete setup and migration instructions
- [Testing Guide](docs/testing_guide.md) - Verification procedures

## URLs

- ERPNext: http://100.65.0.28:8082
- Source DB: 14.225.210.164:5432 (meraki_nocodb)
