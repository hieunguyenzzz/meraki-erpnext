# Meraki ERPNext Migration Guide

Step-by-step guide for migrating Meraki Wedding Planner data to ERPNext.

## Prerequisites

- Docker and Docker Compose installed
- Access to server 100.65.0.28
- Python 3.8+ with pip
- PostgreSQL client (psql) for verification

## Step 1: Deploy ERPNext

### 1.1 Set Docker Context

```bash
docker context use 100.65.0.28
```

### 1.2 Configure Environment

```bash
cd /Users/hieunguyen/projects/erpnext/meraki-manager

# Review and update .env file
cat .env
```

Ensure these values are set:
- `ADMIN_PASSWORD` - Strong password for ERPNext admin
- `DB_PASSWORD` - Strong password for MariaDB

### 1.3 Start ERPNext Services

```bash
docker compose up -d
```

Wait for services to start (~2-3 minutes).

### 1.4 Create ERPNext Site

```bash
docker compose --profile setup up create-site
```

This creates the site with ERPNext installed. Wait for completion.

### 1.5 Verify ERPNext is Running

Open in browser: http://100.65.0.28:8082

Login with:
- Username: `Administrator`
- Password: (value from `ADMIN_PASSWORD` in .env)

## Step 2: Configure ERPNext

### 2.1 Complete Setup Wizard

1. Set Company: **Meraki Wedding Planner**
2. Set Abbreviation: **MWP**
3. Set Currency: **VND**
4. Set Country: **Vietnam**

### 2.2 Disable Unnecessary Modules

Disable these modules (not needed for a wedding planning service business):

- **Buying** — no procurement
- **Website** — not using ERPNext website builder
- **Manufacturing** — not applicable
- **Quality Management** — no quality inspection workflows needed
- **Projects** — workspace hidden (Project doctypes still used for wedding tracking)
- **Support** — no customer support ticketing needed
- **Stock** — workspace hidden and replaced with Services (Item doctype still used for service items)

Two steps are required:

**Step 1: Hide Workspaces** (prevents direct URL access like `/app/manufacturing`):

```bash
# Set public=0 and is_hidden=1 on each Workspace via API
for module in Buying Website Manufacturing "Quality Management" Projects Support Stock; do
  curl -s -X PUT "http://merakierp.loc/api/resource/Workspace/$module" \
    -H 'Content-Type: application/json' \
    -H "Authorization: token $ERPNEXT_API_KEY:$ERPNEXT_API_SECRET" \
    -d '{"public": 0, "is_hidden": 1}'
done
```

**Step 2: Block modules per user** (hides from sidebar):

```bash
docker compose exec -T db mariadb -u root -p$DB_PASSWORD $DB_NAME -e "
INSERT INTO \`tabBlock Module\` (name, creation, modified, modified_by, owner, docstatus, idx, module, parent, parentfield, parenttype)
SELECT CONCAT('bm-', REPLACE(u.name, '@', '-'), '-', LOWER(m.module)),
       NOW(), NOW(), 'Administrator', 'Administrator', 0, 0, m.module, u.name, 'block_modules', 'User'
FROM (SELECT 'Buying' AS module UNION SELECT 'Website' UNION SELECT 'Manufacturing' UNION SELECT 'Quality Management' UNION SELECT 'Projects' UNION SELECT 'Support' UNION SELECT 'Stock') m
CROSS JOIN (SELECT name FROM tabUser WHERE enabled=1 AND user_type='System User') u;
"
```

**Step 3: Create Services workspace** (replaces Stock with a service-oriented view):

```bash
curl -s -X POST "http://merakierp.loc/api/resource/Workspace" \
  -H 'Content-Type: application/json' \
  -H "Authorization: token $ERPNEXT_API_KEY:$ERPNEXT_API_SECRET" \
  -d '{
  "label": "Services",
  "title": "Services",
  "module": "Stock",
  "icon": "file",
  "public": 1,
  "is_hidden": 0,
  "sequence_id": 3,
  "shortcuts": [
    {"type": "DocType", "link_to": "Item", "label": "Item", "doc_view": "List", "color": "Blue"},
    {"type": "DocType", "link_to": "Sales Order", "label": "Sales Order", "doc_view": "List", "color": "Orange"},
    {"type": "DocType", "link_to": "Sales Invoice", "label": "Sales Invoice", "doc_view": "List", "color": "Green"},
    {"type": "DocType", "link_to": "Customer", "label": "Customer", "doc_view": "List", "color": "Purple"}
  ],
  "links": [
    {"type": "Card Break", "label": "Service Catalogue"},
    {"type": "Link", "label": "Item", "link_to": "Item", "link_type": "DocType"},
    {"type": "Link", "label": "Item Group", "link_to": "Item Group", "link_type": "DocType"},
    {"type": "Card Break", "label": "Selling"},
    {"type": "Link", "label": "Sales Order", "link_to": "Sales Order", "link_type": "DocType"},
    {"type": "Link", "label": "Sales Invoice", "link_to": "Sales Invoice", "link_type": "DocType"},
    {"type": "Link", "label": "Payment Entry", "link_to": "Payment Entry", "link_type": "DocType"},
    {"type": "Card Break", "label": "CRM"},
    {"type": "Link", "label": "Customer", "link_to": "Customer", "link_type": "DocType"},
    {"type": "Link", "label": "Quotation", "link_to": "Quotation", "link_type": "DocType"}
  ]
}'
```

Then clear cache:

```bash
docker compose exec -T backend bench --site erp.merakiwp.com clear-cache
```

### 2.3 Generate API Keys

1. Go to **Settings > Users**
2. Click on **Administrator**
3. Scroll to **API Access**
4. Click **Generate Keys**
5. Copy the API Key and API Secret
6. Update `.env`:
   ```
   ERPNEXT_API_KEY=your_api_key
   ERPNEXT_API_SECRET=your_api_secret
   ```

## Step 3: Run Migration

### 3.1 Install Python Dependencies

```bash
cd /Users/hieunguyen/projects/erpnext/meraki-manager
pip install psycopg2-binary requests python-dotenv
```

### 3.2 Test Database Connection

```bash
# Test PostgreSQL connection (source database)
PGPASSWORD='fFQzy12u2c5492xp' psql -h 14.225.210.164 -p 5432 -U meraki_noco_usr -d meraki_nocodb -c "SELECT COUNT(*) FROM weddings;"
```

### 3.3 Run Migration

```bash
python migration/migrate.py
```

The migration runs in this order:
1. Items (wedding services)
2. Employees (staff)
3. Venues (suppliers)
4. Customers (wedding clients)
5. Weddings (Sales Orders + Projects)
6. Tasks
7. Costs (Journal Entries)
8. Payroll (Salary Slips)

## Step 4: Verify Migration

See [testing_guide.md](./testing_guide.md) for detailed verification steps.

### Quick Verification

1. **Check counts in ERPNext:**
   - Customers: Should match unique wedding clients
   - Employees: Should match staff count
   - Suppliers: Should match venue count
   - Sales Orders: Should match wedding count
   - Projects: Should match wedding count

2. **Spot check a wedding:**
   - Find a Sales Order
   - Verify it links to a Project
   - Check Project has correct staff assignments

## Troubleshooting

### ERPNext Not Accessible

```bash
# Check container status
docker compose ps

# Check logs
docker compose logs frontend
docker compose logs backend
```

### Migration Fails

1. Check `.env` has correct API keys
2. Verify ERPNext is running: http://100.65.0.28:8082
3. Check migration logs for specific errors

### Duplicate Records

If re-running migration:
- Records with matching Meraki IDs are skipped
- To re-migrate, delete records in ERPNext first

## Rollback

To start fresh:

```bash
# Remove all containers and volumes
docker compose down -v

# Recreate
docker compose up -d
docker compose --profile setup up create-site
```
