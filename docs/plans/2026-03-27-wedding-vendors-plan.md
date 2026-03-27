# Wedding Vendors Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Vendors tab on the wedding detail page to track which vendors (photographer, decorator, MC, etc.) are involved in each wedding, with vendors linked to ERPNext Suppliers.

**Architecture:** Custom child doctype `Wedding Vendor` attached to Project via `custom_wedding_vendors` table field. Backend endpoint in `wedding.py` overwrites the child table. Frontend adds a Vendors tab with inline add/delete rows.

**Tech Stack:** ERPNext API, FastAPI (webhook_v2), React + Refine v5 + Shadcn UI

---

### Task 1: Migration — Create Wedding Vendor doctype, custom field, supplier group

**Files:**
- Create: `migration/phases/v041_wedding_vendors.py`
- Modify: `migration/runner.py`

**Step 1: Create migration phase**

Create `migration/phases/v041_wedding_vendors.py`:

```python
"""
v041: Wedding Vendors setup.

Creates the Wedding Vendor child doctype, attaches it to Project,
and creates a Wedding Vendors supplier group.
"""

import json

COMPANY = "Meraki Wedding Planner"

VENDOR_CATEGORIES = [
    "Decoration / Floral",
    "Photography",
    "Videography",
    "Makeup & Hair",
    "MC / Emcee",
    "Music / DJ / Band",
    "Catering",
    "Wedding Cake",
    "Invitation / Stationery",
    "Bridal Attire",
    "Transportation",
    "Lighting / Effects",
]


def run(client):
    # 1. Create Wedding Vendor child doctype
    if not client.exists("DocType", {"name": "Wedding Vendor"}):
        client.create("DocType", {
            "name": "Wedding Vendor",
            "module": "Projects",
            "istable": 1,
            "editable_grid": 1,
            "fields": [
                {
                    "fieldname": "category",
                    "fieldtype": "Select",
                    "label": "Category",
                    "options": "\n".join(VENDOR_CATEGORIES),
                    "in_list_view": 1,
                    "reqd": 1,
                },
                {
                    "fieldname": "supplier",
                    "fieldtype": "Link",
                    "label": "Vendor",
                    "options": "Supplier",
                    "in_list_view": 1,
                    "reqd": 1,
                },
                {
                    "fieldname": "notes",
                    "fieldtype": "Small Text",
                    "label": "Notes",
                    "in_list_view": 1,
                },
            ],
            "permissions": [
                {"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1},
                {"role": "Projects Manager", "read": 1, "write": 1, "create": 1, "delete": 1},
                {"role": "Projects User", "read": 1, "write": 1, "create": 1, "delete": 1},
            ],
        })
        print("  Created DocType: Wedding Vendor")
    else:
        print("  DocType exists: Wedding Vendor")

    # 2. Add custom_wedding_vendors table field on Project
    if not client.exists("Custom Field", {"name": "Project-custom_wedding_vendors"}):
        client.create("Custom Field", {
            "dt": "Project",
            "fieldname": "custom_wedding_vendors",
            "fieldtype": "Table",
            "label": "Wedding Vendors",
            "options": "Wedding Vendor",
            "insert_after": "custom_assistant_commission_pct",
        })
        print("  Created Custom Field: Project.custom_wedding_vendors")
    else:
        print("  Custom Field exists: Project.custom_wedding_vendors")

    # 3. Create Wedding Vendors supplier group
    if not client.exists("Supplier Group", {"name": "Wedding Vendors"}):
        client.create("Supplier Group", {
            "supplier_group_name": "Wedding Vendors",
            "parent_supplier_group": "All Supplier Groups",
            "is_group": 0,
        })
        print("  Created Supplier Group: Wedding Vendors")
    else:
        print("  Supplier Group exists: Wedding Vendors")

    print("  v041 wedding vendors setup complete.")
```

**Step 2: Register in runner.py**

Add to `ORDERED_PHASES`:
```python
ORDERED_PHASES = [
    "v041_wedding_vendors",
]
```

Add to `run_pending`:
```python
def run_pending(client) -> int:
    from phases import v041_wedding_vendors

    phase_fns = {
        "v041_wedding_vendors": v041_wedding_vendors.run,
    }
```

**Step 3: Run migration on local ERPNext**

Since the migration runner has issues with earlier phases, run directly:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml exec email-processor-v2 python3 -c "
import json
from webhook_v2.services.erpnext import ERPNextClient
# ... run v041 logic directly via API
"
```

**Step 4: Verify on local**

```bash
curl -s http://frontend.merakierp.loc/api/resource/DocType/Wedding%20Vendor | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['name'])"
# Expected: Wedding Vendor
```

**Step 5: Commit**

```bash
git add migration/phases/v041_wedding_vendors.py migration/runner.py
git commit -m "feat: migration v041 — Wedding Vendor child doctype + supplier group"
```

---

### Task 2: Backend — Add vendors endpoint to wedding.py

**Files:**
- Modify: `webhook_v2/routers/wedding.py`

**Step 1: Add Pydantic models and endpoint**

Add to `webhook_v2/routers/wedding.py`:

```python
class VendorItem(BaseModel):
    category: str
    supplier: str
    notes: str = ""


class UpdateVendorsRequest(BaseModel):
    vendors: list[VendorItem]


@router.put("/wedding/{project_name}/vendors")
def update_vendors(project_name: str, req: UpdateVendorsRequest):
    """Overwrite the wedding vendors child table on a Project."""
    client = ERPNextClient()

    # Verify project exists
    project = client._get(f"/api/resource/Project/{project_name}").get("data", {})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Build child table rows
    vendor_rows = [
        {"category": v.category, "supplier": v.supplier, "notes": v.notes}
        for v in req.vendors
    ]

    # Update the project's custom_wedding_vendors field
    client._post("/api/method/frappe.client.set_value", {
        "doctype": "Project",
        "name": project_name,
        "fieldname": "custom_wedding_vendors",
        "value": json.dumps(vendor_rows),
    })

    log.info("vendors_updated", project=project_name, count=len(vendor_rows))
    return {"success": True, "count": len(vendor_rows)}
```

Note: `frappe.client.set_value` with a JSON-encoded array for a Table field replaces all child rows. If this doesn't work, fall back to fetching the full Project doc, replacing `custom_wedding_vendors`, and saving via PUT.

**Step 2: Add a create-vendor endpoint**

```python
class CreateVendorSupplierRequest(BaseModel):
    supplier_name: str


@router.post("/wedding/vendors/create-supplier")
def create_vendor_supplier(req: CreateVendorSupplierRequest):
    """Create a new supplier in the Wedding Vendors group."""
    client = ERPNextClient()
    result = client._post("/api/resource/Supplier", {
        "supplier_name": req.supplier_name,
        "supplier_group": "Wedding Vendors",
        "supplier_type": "Company",
    }).get("data", {})
    log.info("vendor_supplier_created", supplier=result.get("name"))
    return {"name": result.get("name"), "supplier_name": result.get("supplier_name")}
```

**Step 3: Rebuild and test**

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up email-processor-v2 --build -d
# Test:
curl -s -X PUT http://frontend.merakierp.loc/inquiry-api/wedding/PROJ-0001/vendors \
  -H 'Content-Type: application/json' \
  -d '{"vendors":[{"category":"Photography","supplier":"Some Supplier","notes":"test"}]}'
```

**Step 4: Commit**

```bash
git add webhook_v2/routers/wedding.py
git commit -m "feat: PUT /wedding/{project}/vendors endpoint"
```

---

### Task 3: Frontend — Add Vendors tab to ProjectDetailPage

**Files:**
- Modify: `refinefrontend/src/pages/projects/ProjectDetailPage.tsx`

**Step 1: Add vendor constants and state**

At the top of the file, add the categories constant:

```typescript
const VENDOR_CATEGORIES = [
  "Decoration / Floral",
  "Photography",
  "Videography",
  "Makeup & Hair",
  "MC / Emcee",
  "Music / DJ / Band",
  "Catering",
  "Wedding Cake",
  "Invitation / Stationery",
  "Bridal Attire",
  "Transportation",
  "Lighting / Effects",
];
```

Inside the component, add state:

```typescript
// Vendor tab state
const [vendors, setVendors] = useState<{category: string; supplier: string; supplierName: string; notes: string}[]>([]);
const [addingVendor, setAddingVendor] = useState(false);
const [newVendor, setNewVendor] = useState({ category: "", supplier: "", notes: "" });
const [vendorSupplierOpen, setVendorSupplierOpen] = useState(false);
const [vendorSupplierSearch, setVendorSupplierSearch] = useState("");
const [isSavingVendors, setIsSavingVendors] = useState(false);
const [vendorError, setVendorError] = useState<string | null>(null);
```

**Step 2: Add `custom_wedding_vendors` to the Project useOne fields**

In the `useOne` for Project, add `"custom_wedding_vendors"` to the fields array.

**Step 3: Fetch all suppliers for the vendor dropdown**

```typescript
const { result: allSuppliersResult } = useList({
  resource: "Supplier",
  pagination: { mode: "off" as const },
  meta: { fields: ["name", "supplier_name"] },
});
const allSuppliers = (allSuppliersResult?.data ?? []) as { name: string; supplier_name: string }[];
```

**Step 4: Initialize vendors from project data**

In a useEffect, sync vendors from the project doc:

```typescript
useEffect(() => {
  if (project?.custom_wedding_vendors) {
    setVendors(project.custom_wedding_vendors.map((v: any) => ({
      category: v.category,
      supplier: v.supplier,
      supplierName: allSuppliers.find(s => s.name === v.supplier)?.supplier_name || v.supplier,
      notes: v.notes || "",
    })));
  }
}, [project?.custom_wedding_vendors, allSuppliers]);
```

Note: wrap `allSuppliers` in a useMemo to avoid infinite loops (per memory: "useMemo for derived arrays").

**Step 5: Add save/delete/add handlers**

```typescript
async function saveVendors(updatedVendors: typeof vendors) {
  setIsSavingVendors(true);
  setVendorError(null);
  try {
    const resp = await fetch(`/inquiry-api/wedding/${name}/vendors`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendors: updatedVendors.map(v => ({
          category: v.category,
          supplier: v.supplier,
          notes: v.notes,
        })),
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to save vendors");
    }
    invalidate({ resource: "Project", invalidates: ["detail"], id: name });
  } catch (error) {
    setVendorError(error instanceof Error ? error.message : "Failed to save vendors");
  } finally {
    setIsSavingVendors(false);
  }
}

function handleAddVendor() {
  if (!newVendor.category || !newVendor.supplier) return;
  const supplierObj = allSuppliers.find(s => s.name === newVendor.supplier);
  const updated = [...vendors, {
    category: newVendor.category,
    supplier: newVendor.supplier,
    supplierName: supplierObj?.supplier_name || newVendor.supplier,
    notes: newVendor.notes,
  }];
  setVendors(updated);
  saveVendors(updated);
  setNewVendor({ category: "", supplier: "", notes: "" });
  setAddingVendor(false);
}

function handleDeleteVendor(index: number) {
  const updated = vendors.filter((_, i) => i !== index);
  setVendors(updated);
  saveVendors(updated);
}
```

**Step 6: Add Vendors tab trigger**

Between the Tasks and Activity tab triggers (line ~737):

```tsx
<TabsTrigger value="vendors" className="flex-1 lg:flex-none">
  Vendors
</TabsTrigger>
```

**Step 7: Add Vendors TabsContent**

After the overview TabsContent (line ~965), before the tasks TabsContent:

```tsx
<TabsContent value="vendors" className="mt-4">
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0">
      <CardTitle>Wedding Vendors</CardTitle>
      <Button size="sm" onClick={() => setAddingVendor(true)} disabled={addingVendor}>
        <Plus className="h-4 w-4 mr-1" />
        Add Vendor
      </Button>
    </CardHeader>
    <CardContent>
      {vendorError && (
        <div className="flex items-center gap-2 p-3 mb-4 text-sm text-destructive bg-destructive/10 rounded-md">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {vendorError}
        </div>
      )}

      <div className="border rounded-md">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left font-medium">Category</th>
              <th className="px-3 py-2 text-left font-medium">Vendor</th>
              <th className="px-3 py-2 text-left font-medium">Notes</th>
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v, i) => (
              <tr key={i} className="border-b last:border-b-0">
                <td className="px-3 py-2">{v.category}</td>
                <td className="px-3 py-2">{v.supplierName}</td>
                <td className="px-3 py-2 text-muted-foreground">{v.notes}</td>
                <td className="px-3 py-2">
                  <Button variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => handleDeleteVendor(i)} disabled={isSavingVendors}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </td>
              </tr>
            ))}
            {addingVendor && (
              <tr className="border-b last:border-b-0 bg-muted/30">
                <td className="px-3 py-2">
                  {/* Category Select dropdown */}
                  <Select value={newVendor.category}
                    onValueChange={(v) => setNewVendor({ ...newVendor, category: v })}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent>
                      {VENDOR_CATEGORIES.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2">
                  {/* Supplier searchable combobox — Popover+Command pattern */}
                  {/* Same pattern as venue/partner dropdowns in ExpensesPage */}
                  {/* Include inline "Create" option */}
                </td>
                <td className="px-3 py-2">
                  <Input className="h-8" placeholder="Notes (optional)"
                    value={newVendor.notes}
                    onChange={e => setNewVendor({ ...newVendor, notes: e.target.value })} />
                </td>
                <td className="px-3 py-2 flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7"
                    onClick={handleAddVendor} disabled={!newVendor.category || !newVendor.supplier}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => { setAddingVendor(false); setNewVendor({ category: "", supplier: "", notes: "" }); }}>
                    <X className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            )}
            {vendors.length === 0 && !addingVendor && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  No vendors added yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </CardContent>
  </Card>
</TabsContent>
```

The vendor supplier Popover+Command follows the exact same pattern as `referralForm.partner` in InvoicesPage.tsx — with search, inline create, and check marks.

**Step 8: Build and test locally**

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up react-frontend --build -d
# Open browser to http://frontend.merakierp.loc, navigate to a wedding, check Vendors tab
```

**Step 9: Commit**

```bash
git add refinefrontend/src/pages/projects/ProjectDetailPage.tsx
git commit -m "feat: Vendors tab on wedding detail page"
```

---

### Task 4: Test end-to-end, deploy to production

**Step 1: Test locally**
- Navigate to a wedding detail page
- Click Vendors tab
- Add a vendor (select category, search/create supplier, add note)
- Verify it saves and persists on page reload
- Delete a vendor, verify it's gone

**Step 2: Run migration on production**
```bash
# Create Wedding Vendor doctype, custom field, and supplier group on production via API
# Same pattern as v040 referral setup
```

**Step 3: Push and monitor deployment**
```bash
git push origin main
# Monitor via dokploy
```

**Step 4: Verify on production**
- Open https://app.merakiwp.com, go to a wedding, check Vendors tab
- Take screenshot to confirm
