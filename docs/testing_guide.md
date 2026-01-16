# Meraki ERPNext Testing Guide

Procedures for validating the migration from Meraki NocoDB to ERPNext.

## Pre-Migration Baseline

### Source Data Counts

Run these queries on the source PostgreSQL database:

```bash
PGPASSWORD='fFQzy12u2c5492xp' psql -h 14.225.210.164 -p 5432 -U meraki_noco_usr -d meraki_nocodb
```

```sql
-- Count all tables
SELECT 'staff' as table_name, COUNT(*) as count FROM staff
UNION ALL SELECT 'venue', COUNT(*) FROM venue
UNION ALL SELECT 'weddings', COUNT(*) FROM weddings
UNION ALL SELECT 'wedding_addon', COUNT(*) FROM wedding_addon
UNION ALL SELECT 'task', COUNT(*) FROM task
UNION ALL SELECT 'cost', COUNT(*) FROM cost
UNION ALL SELECT 'payroll', COUNT(*) FROM payroll
UNION ALL SELECT 'unique_clients', COUNT(DISTINCT client) FROM weddings WHERE client IS NOT NULL;
```

Record these counts before migration.

## Post-Migration Validation

### 1. Count Comparison

After migration, verify counts in ERPNext match source:

| Source Table | ERPNext Doctype | Expected |
|--------------|-----------------|----------|
| staff | Employee | Match |
| venue | Supplier (Wedding Venues group) | Match |
| unique_clients | Customer (Wedding Clients group) | Match |
| weddings | Sales Order | Match |
| weddings | Project | Match |
| wedding_addon | Item (Add-on Services group) | Match |
| task | Task | Match |
| cost | Journal Entry | Match |
| payroll | Salary Slip | Match |

### 2. Data Integrity Checks

#### 2.1 Employee Verification

```sql
-- Source: Get staff with commissions
SELECT id, name, email, lead_commission, support_commission
FROM staff
WHERE "Status" = 'Active'
ORDER BY id LIMIT 5;
```

In ERPNext, verify:
- [ ] Employee names match
- [ ] Commission percentages are correct in custom fields
- [ ] Department is "Wedding Planning - MWP"

#### 2.2 Venue Verification

```sql
-- Source: Get venues with contact info
SELECT id, title, city, contact_person, email
FROM venue
ORDER BY id LIMIT 5;
```

In ERPNext, verify:
- [ ] Supplier names match venue titles
- [ ] City stored in custom_venue_city field
- [ ] Address and Contact linked (if data existed)

#### 2.3 Wedding → Sales Order + Project

```sql
-- Source: Get wedding with all details
SELECT w.id, w.client, w.date, w.service, w.type, w.amount,
       v.title as venue,
       s1.name as lead_planner,
       s2.name as support_planner
FROM weddings w
LEFT JOIN venue v ON w.venue_id = v.id
LEFT JOIN staff s1 ON w.lead_planner_id = s1.id
LEFT JOIN staff s2 ON w.support_planner_id = s2.id
ORDER BY w.date DESC LIMIT 5;
```

In ERPNext, verify for each wedding:
- [ ] Sales Order exists with correct customer
- [ ] Sales Order amount matches wedding amount
- [ ] Sales Order has custom_service_type set
- [ ] Sales Order links to correct venue (Supplier)
- [ ] Project exists and links to Sales Order
- [ ] Project has correct lead_planner and support_planner

### 3. Relationship Verification

#### 3.1 Sales Order ↔ Project Link

For each migrated wedding:
1. Open Sales Order in ERPNext
2. Check `custom_wedding_project` field links to Project
3. Open the Project
4. Check `custom_wedding_sales_order` field links back to Sales Order

#### 3.2 Project → Employee Links

For Projects with staff assignments:
1. Open Project
2. Verify `custom_lead_planner` links to correct Employee
3. Verify `custom_support_planner` links to correct Employee
4. Verify assistant fields if applicable

### 4. Financial Verification

#### 4.1 Cost Migration

```sql
-- Source: Sum costs by category
SELECT categories, SUM(amount) as total
FROM cost
GROUP BY categories
ORDER BY categories;
```

In ERPNext, verify Journal Entries:
- [ ] Total debits match source amounts
- [ ] Expense accounts match categories
- [ ] Dates are preserved

#### 4.2 Payroll Migration

```sql
-- Source: Sum payroll by staff
SELECT s.name, SUM(p.amount) as total_paid
FROM payroll p
JOIN staff s ON p.staff_id = s.id
GROUP BY s.id, s.name
ORDER BY total_paid DESC;
```

In ERPNext, verify Salary Slips:
- [ ] Total earnings match source amounts
- [ ] Salary components are correctly allocated
- [ ] Employee links are correct

## Sample Verification Script

Run after migration to verify key relationships:

```python
# Quick verification in Python
from migration.config import get_config
from migration.erpnext_client import ERPNextClient
from migration.pg_client import MerakiPGClient

config = get_config()
pg = MerakiPGClient(config['postgres'])
erp = ERPNextClient(config['erpnext'])

# Compare counts
source = pg.get_summary()
print("Source counts:", source)

print("ERPNext counts:")
print(f"  Employees: {erp.count('Employee')}")
print(f"  Suppliers: {erp.count('Supplier')}")
print(f"  Customers: {erp.count('Customer')}")
print(f"  Sales Orders: {erp.count('Sales Order')}")
print(f"  Projects: {erp.count('Project')}")
print(f"  Tasks: {erp.count('Task')}")

pg.close()
```

## Common Issues

### Missing Staff Assignments on Projects

**Symptom:** Projects created but custom_lead_planner is empty

**Cause:** Staff not migrated before weddings, or Meraki ID mismatch

**Fix:** Re-run migration after ensuring employees exist with correct custom_meraki_id

### Sales Order Not Linked to Project

**Symptom:** Sales Order created but custom_wedding_project is empty

**Cause:** Project creation failed

**Fix:** Check migration logs, re-run migrate_weddings.py

### Duplicate Records

**Symptom:** More records in ERPNext than source

**Cause:** Migration run multiple times without cleanup

**Fix:** Records are identified by custom_meraki_*_id fields, duplicates should be skipped

## Sign-off Checklist

Before considering migration complete:

- [ ] All source table counts match ERPNext counts
- [ ] Spot checked 5+ weddings with full details
- [ ] Verified Sales Order ↔ Project bidirectional links
- [ ] Verified staff assignments on sample Projects
- [ ] Verified financial totals (costs, payroll)
- [ ] Tested ERPNext UI navigation
- [ ] Created a test Sales Invoice from Sales Order
