# Meraki Manager Migration

Migration scripts for importing data from PostgreSQL (NocoDB) to ERPNext.

## Structure

```
migration/
├── core/                      # Infrastructure (shared)
│   ├── config.py              # Configuration loader
│   ├── erpnext_client.py      # ERPNext API client
│   └── pg_client.py           # Source PostgreSQL client
│
├── modules/                   # One script per ERPNext module
│   ├── employees.py           # HR: employees, departments, designations
│   ├── customers.py           # CRM: customers
│   ├── suppliers.py           # Buying: suppliers/venues
│   ├── items.py               # Stock: items, item groups
│   ├── sales.py               # Selling: sales orders
│   ├── projects.py            # Projects: projects, tasks
│   └── accounting.py          # Accounting: journal entries, invoices
│
├── setup/                     # One-time setup (run once)
│   ├── company.py             # Create company
│   ├── currency.py            # Setup currency
│   └── base_data.py           # Chart of accounts, price lists
│
├── verify/                    # Verification
│   └── qa.py                  # Unified QA verification
│
├── run.py                     # Main CLI entry point
├── Dockerfile
└── requirements.txt
```

## Quick Start

### Prerequisites

- Python 3.9+
- Access to source PostgreSQL database
- ERPNext API credentials

### Configuration

Set environment variables (all required):

```bash
# ERPNext
export ERPNEXT_URL="http://your-erpnext-server:8082"
export ERPNEXT_API_KEY="your-api-key"
export ERPNEXT_API_SECRET="your-api-secret"

# PostgreSQL (source database)
export MERAKI_PG_HOST="your-postgres-host"
export MERAKI_PG_PORT="5432"
export MERAKI_PG_USER="your-db-user"
export MERAKI_PG_PASSWORD="your-password"
export MERAKI_PG_DATABASE="your-database"
```

### Running Migrations

```bash
# Run complete migration
python run.py --all

# Run setup only (creates company, currency, base data)
python run.py --setup

# Run specific module
python run.py --module employees
python run.py --module customers
python run.py --module suppliers
python run.py --module items
python run.py --module sales
python run.py --module projects
python run.py --module accounting

# Preview changes without applying
python run.py --module accounting --dry-run

# Run verification
python run.py --verify
```

### Docker

```bash
# Build and run migration
docker compose --profile migrate up migration --build

# Run verification only
docker compose run --rm migration python run.py --verify
```

## Module Responsibilities

| Module | ERPNext Doctypes | Source Data |
|--------|------------------|-------------|
| `employees.py` | Employee, Department, Designation | staff table |
| `customers.py` | Customer, Customer Group | weddings.client |
| `suppliers.py` | Supplier, Supplier Group, Address | venue table |
| `items.py` | Item, Item Group | wedding_addon table |
| `sales.py` | Sales Order | weddings table |
| `projects.py` | Project, Task | weddings + task tables |
| `accounting.py` | Journal Entry, Sales Invoice | costs + salary calc |

## Migration Order

The `--all` flag runs modules in this order:

1. `setup/` (company, currency, base_data)
2. `modules/items.py` (items needed for orders)
3. `modules/employees.py` (staff for assignments)
4. `modules/suppliers.py` (venues for orders)
5. `modules/customers.py` (customers for orders)
6. `modules/sales.py` (sales orders)
7. `modules/projects.py` (projects linked to orders)
8. `modules/accounting.py` (journal entries)
9. `verify/qa.py` (verification)

## Expected Results

After successful migration:

- **Employees**: 16 with `custom_meraki_id`
- **Customers**: ~132 (unique wedding clients)
- **Suppliers**: 35 venues with `custom_meraki_venue_id`
- **Items**: 3 service types + addons
- **Sales Orders**: 134 (submitted)
- **Projects**: 134 linked to Sales Orders
- **Journal Entries**: Cost records + salary history

## Development

### Running Individual Modules

Each module can be run standalone:

```bash
cd migration
python -m modules.employees
python -m modules.sales
```

### Module Template

Each module follows this pattern:

```python
def setup(erp: ERPNextClient) -> bool:
    """Create prerequisites."""
    pass

def migrate(pg: MerakiPGClient, erp: ERPNextClient, dry_run: bool = False) -> dict:
    """Main migration logic. Returns {created, updated, skipped, failed}."""
    pass

def verify(erp: ERPNextClient) -> dict:
    """Verify results. Returns {expected, actual, issues}."""
    pass
```

## Troubleshooting

### Rate Limiting

If you encounter rate limiting errors, increase the delay between API calls:

```python
results = migrate(pg, erp, delay=2.0)  # 2 seconds between calls
```

### Duplicate Data

Running migration multiple times is safe - records are skipped if they already exist (checked by `custom_meraki_id` or similar fields).

### Verification Failures

Run verification to check migration status:

```bash
python run.py --verify
```

Review the output for specific issues with Sales Orders, Projects, or other entities.
