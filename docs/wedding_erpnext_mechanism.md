# Wedding ERPNext Mechanism

How a wedding booking maps to ERPNext documents — creation, payments, add-ons, editing, and deletion.

---

## ERPNext Document Map

Every wedding involves exactly these documents:

```
Customer
  └── Sales Order (submitted)          ← wedding package + add-ons
        └── Sales Invoice × N          ← one per payment milestone
              └── Payment Entry × N    ← one per invoice (paid immediately)
Project                                ← linked to Sales Order, holds team + stage
```

---

## 1. Create Wedding

**UI:** `CreateWeddingDialog.tsx` (4-step wizard)

**Steps executed (in order):**

| # | ERPNext Action | Details |
|---|---------------|---------|
| 1 | `POST /api/resource/Customer` | Creates couple as Customer (type: Individual, group: Wedding Clients) |
| 1b | `POST /api/resource/Contact` (best-effort) | Extra CC email addresses linked to Customer |
| 2 | `POST /api/resource/Sales Order` | Draft SO with all items (see below) |
| 3 | `frappe.client.submit` on SO | Submits the SO → status becomes "To Bill" |
| 3b | `frappe.client.set_value` `per_delivered=100` | Marks service as delivered (prevents "To Deliver" status) |
| 4 | `POST /api/resource/Project` | Creates Project linked to SO + Customer, assigns team |

### Sales Order items at creation

```
items: [
  { item_code: "Wedding Planning Service", qty: 1, rate: <packageAmount> },
  { item_code: "<addon_code>",             qty: 1, rate: <addonPrice> },   // repeated per add-on
  ...
]
```

### Commission base (`custom_commission_base`)

Calculated on the frontend before creating the SO:

```
commissionBase = packageAmount
               + sum(addon.price for addon where addon.includeInCommission == true)
```

Add-ons with **"Include in Commission" unchecked** are still included in the SO total but do **not** contribute to `custom_commission_base`.

### Tax (optional)

If `taxType === "vat_included"`:
```json
taxes: [{ charge_type: "On Net Total", account_head: "Output Tax - MWP", rate: 8, included_in_print_rate: 1 }]
```

### Project stage on creation

- Wedding date **in the future** → `custom_project_stage: "Onboarding"`
- Wedding date **in the past** → `custom_project_stage: "Completed"`

---

## 2. Payment Milestones

**Standard structure:** 50% deposit → 30% mid-payment → 20% final

**Endpoint:** `POST /inquiry-api/wedding/{project_name}/milestone`
**File:** `webhook_v2/routers/wedding.py` → `create_milestone()`

Each milestone creates **two documents atomically**:

```
Sales Invoice (submitted, dated on invoice_date)
  └── Payment Entry (submitted, allocated_amount = invoice.outstanding_amount)
```

The Payment Entry uses `outstanding_amount` from the re-fetched submitted invoice (not `req.amount`) to avoid ERPNext rounding 417 errors.

**Rollback:** if Payment Entry creation fails, the invoice is cancelled and deleted.

### SO billing status progression

| Milestones paid | SO `per_billed` | SO status |
|-----------------|-----------------|-----------|
| None | 0% | To Bill |
| 50% deposit | ~50% | To Bill |
| 50% + 30% | ~80% | To Bill |
| All three | 100% | Completed |

---

## 3. Edit Wedding Details

**UI:** "Edit" button in **Wedding Details** card header → opens a Sheet
**File:** `ProjectDetailPage.tsx` → `handleSaveDetails()`

### Venue

```
POST /api/method/frappe.client.set_value
  { doctype: "Sales Order", name: <so_name>, fieldname: "custom_venue", value: <venue> }
```

Only called if the venue changed. Does not touch other SO fields.

### Add-ons

**Endpoint:** `PUT /inquiry-api/wedding/{project_name}/addons`
**File:** `webhook_v2/routers/wedding.py` → `update_addons()`

Uses ERPNext's standard **`update_child_qty_rate`** API (the same method the "Update Items" button uses in the ERPNext UI):

```
POST /api/method/erpnext.controllers.accounts_controller.update_child_qty_rate
  {
    parent_doctype: "Sales Order",
    trans_items: JSON.stringify([
      // existing "Wedding Planning Service" row — pass docname to UPDATE, not insert
      { docname: "<row_name>", item_code: "Wedding Planning Service", qty: 1, rate: ... },
      // add-on rows — pass docname if updating existing, omit for new
      { item_code: "ADDON-1", item_name: "Welcome Dinner", qty: 1, rate: 5000000 },
    ]),
    parent_doctype_name: "<so_name>",
    child_docname: "items"
  }
```

**Why `update_child_qty_rate` and not cancel+amend:**

| Approach | Works with linked invoices? | Accounting safe? |
|----------|-----------------------------|-----------------|
| cancel + amend + resubmit | ❌ `LinkExistsError` if any invoice exists | N/A |
| `update_child_qty_rate` | ✅ Yes (adding new rows works at any billing %) | ✅ Yes |

**Constraint:** Rate reductions on rows that already have `billed_amt > 0` are blocked by ERPNext backend validation. New rows can always be added regardless of billing percentage.

**Required setup:** `Stock Settings.default_warehouse = "Stores - MWP"` (set by migration v017). ERPNext's `update_child_qty_rate` runs item validation which requires a default warehouse even for non-stock service items.

---

## 4. Edit Team

**UI:** "Edit" button in **Team** card header → opens a Sheet
**File:** `ProjectDetailPage.tsx` → `handleSaveStaff()`

Updates **Project** fields only (no SO involvement):

```
PUT /api/resource/Project/<project_name>
  {
    custom_lead_planner:    "<employee_id>",
    custom_support_planner: "<employee_id>",
    custom_assistant_1:     "<employee_id>",
    ...
    custom_assistant_5:     "<employee_id>",
  }
```

Staff is stored on the Project, not the Sales Order.

---

## 5. Create New Add-on Item

When a user types a name that doesn't exist in the add-on dropdown:

**Endpoint:** `POST /inquiry-api/wedding/addon-item`

```python
POST /api/resource/Item {
  item_name: <name>,
  item_code: <name>,       # same as item_name
  item_group: "Add-on Services",
  is_sales_item: 1,
  is_stock_item: 0,        # service item — no warehouse tracking
  stock_uom: "Nos",
}
```

---

## 6. Delete Wedding

**Endpoint:** `POST /inquiry-api/wedding/{project_name}/delete`
**File:** `webhook_v2/routers/wedding.py` → `delete_wedding()`

Full cascade deletion in strict order (reversing the accounting chain):

```
For each Sales Invoice linked to project:
  For each Payment Entry referencing that invoice:
    1. cancel Payment Entry
    2. delete GL Entries (voucher_no = PE name)
    3. delete Payment Ledger Entries (voucher_no = PE name)
    4. delete Payment Entry
  5. cancel Sales Invoice
  6. delete GL Entries (voucher_no = invoice name)
  7. delete Payment Ledger Entries (voucher_no = invoice name)
  8. delete Sales Invoice
cancel Sales Order
delete Sales Order
delete Project
```

GL and Payment Ledger entries must be deleted manually because ERPNext blocks document deletion while GL rows exist.

---

## Key Custom Fields

| DocType | Field | Purpose |
|---------|-------|---------|
| Sales Order | `custom_venue` | Linked venue (Supplier) |
| Sales Order | `custom_venue` | Linked venue (Supplier) |
| Sales Order | `custom_wedding_type` | Wedding category |
| Sales Order | `custom_commission_base` | Commission calculation base (excludes opt-out add-ons) |
| Project | `custom_project_stage` | Onboarding / In Progress / Completed |
| Project | `custom_lead_planner` | Lead planner (Employee) |
| Project | `custom_support_planner` | Support planner (Employee) |
| Project | `custom_assistant_1..5` | Assistants (Employee) |
| Project | `sales_order` | Links Project ↔ Sales Order |

---

## Sales Order Lifecycle

```
Draft
  → Submit (frappe.client.submit)
      → "To Bill" (service delivered, waiting for payments)
          → payment milestones accumulate per_billed %
              → "Completed" when per_billed = 100%
```

The SO never reaches "Completed" via delivery (we set `per_delivered = 100` at creation). It reaches "Completed" only when all invoices are fully paid (`per_billed = 100%`).

---

## Webhook Endpoints Reference

All behind `/inquiry-api/` proxy → `email-processor-v2:8001`

| Method | Path | Action |
|--------|------|--------|
| `POST` | `/wedding/{project}/delete` | Cascade-delete entire wedding |
| `POST` | `/wedding/{project}/milestone` | Add payment milestone (invoice + payment entry) |
| `PUT` | `/wedding/{project}/addons` | Update add-on items on SO |
| `POST` | `/wedding/addon-item` | Create new add-on Item in ERPNext |
