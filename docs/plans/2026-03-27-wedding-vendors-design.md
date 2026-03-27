# Wedding Vendors per Project

## Goal

Track which vendors (photographer, decorator, MC, etc.) are involved in each wedding. Vendors are ERPNext Suppliers. Referral commissions are recorded separately via the existing Record Referral flow on the Invoices page.

## Data Model

**Custom Child Doctype: `Wedding Vendor`**

| Field | Type | Details |
|-------|------|---------|
| `category` | Select | Decoration / Floral, Photography, Videography, Makeup & Hair, MC / Emcee, Music / DJ / Band, Catering, Wedding Cake, Invitation / Stationery, Bridal Attire, Transportation, Lighting / Effects |
| `supplier` | Link → Supplier | Any existing supplier |
| `notes` | Small Text | Optional |

**Attached to Project** via custom table field `custom_wedding_vendors`.

**New Supplier Group:** `Wedding Vendors` — for creating new vendors inline from the UI.

## Backend

### Migration: `v041_wedding_vendors.py`

1. Create `Wedding Vendor` child doctype with fields above
2. Add `custom_wedding_vendors` (Table → Wedding Vendor) on Project
3. Create `Wedding Vendors` supplier group

### Endpoint: `PUT /wedding/{project}/vendors`

In `webhook_v2/routers/wedding.py`:
- Accepts `[{category, supplier, notes?}, ...]`
- Overwrites the `custom_wedding_vendors` child table on the Project doc
- Returns updated vendor list

## Frontend

### New "Vendors" tab on ProjectDetailPage

Tab order: Overview | **Vendors** | Tasks | Activity

**UI:**
- Table showing category, vendor name, notes, delete button
- "+ Add Vendor" button adds an inline row with:
  - Category: predefined Select dropdown
  - Vendor: searchable Popover+Command combobox with inline "Create" option
  - Notes: text input
- Auto-save on add/delete — calls `PUT /wedding/{project}/vendors` with full list
- No pagination (5-15 vendors per wedding max)

## Files to Create/Modify

| File | Action |
|------|--------|
| `migration/phases/v041_wedding_vendors.py` | Create: child doctype + custom field + supplier group |
| `migration/runner.py` | Register v041 |
| `webhook_v2/routers/wedding.py` | Add `PUT /wedding/{project}/vendors` endpoint |
| `refinefrontend/src/pages/projects/ProjectDetailPage.tsx` | Add Vendors tab with table + add/delete UI |
