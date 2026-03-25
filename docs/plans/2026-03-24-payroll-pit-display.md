# Payroll PIT Display Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Display estimated Personal Income Tax (PIT) and tax reduction columns in the payroll table, purely for informational purposes — no changes to ERPNext salary structures or payroll generation.

**Architecture:** Add `custom_number_of_dependents` field on Employee (via migration + Server Script update). Frontend fetches employee dependents alongside salary slips, computes tax reduction and estimated PIT per employee using Vietnam's current 7-bracket progressive tax table (with 2026 deduction rates), and displays as two new columns.

**Tech Stack:** Python migration, Frappe Server Script, React/TypeScript frontend

---

### Task 1: Migration — Add `custom_number_of_dependents` Custom Field

**Files:**
- Create: `migration/phases/v037_employee_dependents_field.py`
- Modify: `migration/runner.py`

**Step 1: Create migration file**

Create `migration/phases/v037_employee_dependents_field.py`:

```python
"""Add custom_number_of_dependents field on Employee for PIT calculation display."""


def run(client):
    # 1. Add custom field on Employee
    existing = client.get_list(
        "Custom Field",
        filters={"dt": "Employee", "fieldname": "custom_number_of_dependents"},
        fields=["name"],
        limit=1,
    )
    if not existing:
        client.create("Custom Field", {
            "dt": "Employee",
            "fieldname": "custom_number_of_dependents",
            "fieldtype": "Int",
            "label": "Number of Dependents (PIT)",
            "insert_after": "custom_insurance_salary",
            "default": "0",
            "description": "Number of registered tax dependents for PIT deduction calculation",
        })
        print("  Created Employee.custom_number_of_dependents")
    else:
        print("  Already exists: Employee.custom_number_of_dependents (skip)")

    # 2. Update Server Script to include new field in ALLOWED_FIELDS
    script_name = "meraki-set-employee-fields"
    existing_script = client.get("Server Script", script_name)
    if existing_script:
        old_body = existing_script.get("script", "")
        if "custom_number_of_dependents" not in old_body:
            new_body = old_body.replace(
                '"custom_display_order",',
                '"custom_display_order",\n    "custom_number_of_dependents",',
            )
            client.update("Server Script", script_name, {
                "script": new_body,
                "disabled": 0,
            })
            print("  Updated Server Script ALLOWED_FIELDS with custom_number_of_dependents")
        else:
            print("  Server Script already has custom_number_of_dependents (skip)")
```

**Step 2: Register in runner.py**

In `migration/runner.py`:

- Add `"v037_employee_dependents_field"` to the end of `ORDERED_PHASES` list (after `"v036_welcome_email_setting"`)
- Add to the import line (line 71): `, v037_employee_dependents_field`
- Add to `phase_fns` dict: `"v037_employee_dependents_field": v037_employee_dependents_field.run,`

**Step 3: Commit**

```bash
git add migration/phases/v037_employee_dependents_field.py migration/runner.py
git commit -m "feat: add custom_number_of_dependents field on Employee for PIT display"
```

---

### Task 2: Backend — Add field to ALLOWED_FIELDS in employee.py

**Files:**
- Modify: `webhook_v2/routers/employee.py:44-70`

**Step 1: Add field to ALLOWED_FIELDS set**

In `webhook_v2/routers/employee.py`, add `"custom_number_of_dependents"` to the `ALLOWED_FIELDS` set (after `"custom_display_order"`):

```python
    "custom_display_order",
    "custom_number_of_dependents",
}
```

**Step 2: Commit**

```bash
git add webhook_v2/routers/employee.py
git commit -m "feat: allow custom_number_of_dependents in employee update endpoint"
```

---

### Task 3: Frontend — Add field to Employee type

**Files:**
- Modify: `refinefrontend/src/lib/types.ts:1-31`

**Step 1: Add field to Employee interface**

After line 24 (`custom_insurance_salary?: number;`), add:

```typescript
  custom_number_of_dependents?: number;
```

**Step 2: Commit**

```bash
git add refinefrontend/src/lib/types.ts
git commit -m "feat: add custom_number_of_dependents to Employee type"
```

---

### Task 4: Frontend — Add dependents field to Employee Detail Page

**Files:**
- Modify: `refinefrontend/src/pages/hr/EmployeeDetailPage.tsx`

**Step 1: Add to edit state initialization**

Find where `custom_insurance_salary` is added to `editValues` (around line 343). Add below it:

```typescript
        custom_number_of_dependents: employee.custom_number_of_dependents ?? 0,
```

**Step 2: Add to numeric fields list**

Find the `numericFields` array (around line 374). Add `"custom_number_of_dependents"` to it.

**Step 3: Add display in Compensation section**

Find where `custom_insurance_salary` is displayed (around line 712-716). Add after that block:

```tsx
                {employee.custom_number_of_dependents != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax Dependents</span>
                    <span>{employee.custom_number_of_dependents}</span>
                  </div>
                )}
```

**Step 4: Add edit input**

Find the Insurance Salary input (around line 1312-1314). Add after that `<div>`:

```tsx
                <div className="space-y-2">
                  <Label htmlFor="edit-dependents">Tax Dependents (PIT)</Label>
                  <Input id="edit-dependents" type="number" min="0" value={editValues.custom_number_of_dependents} onChange={(e) => setEditValues((prev) => ({ ...prev, custom_number_of_dependents: e.target.value }))} />
                </div>
```

**Step 5: Commit**

```bash
git add refinefrontend/src/pages/hr/EmployeeDetailPage.tsx
git commit -m "feat: add tax dependents field to employee detail page"
```

---

### Task 5: Frontend — Add PIT columns to Payroll Page

**Files:**
- Modify: `refinefrontend/src/pages/hr/PayrollPage.tsx`

This is the main task. We need to:
1. Fetch employee dependents data
2. Add PIT calculation helper functions
3. Add two new columns: "Tax Reduction" and "Est. PIT"

**Step 1: Add PIT calculation constants and functions**

Add after the `getEmployerBHXH` function (after line 68), before the `PayrollEntry` interface:

```typescript
// Vietnam PIT constants (2026 — new deductions, old 7 brackets until July 2026)
const PIT_PERSONAL_DEDUCTION = 15_500_000; // VND/month
const PIT_DEPENDENT_DEDUCTION = 6_200_000; // VND/month per dependent

// 7-bracket progressive tax table (monthly taxable income)
const PIT_BRACKETS: { limit: number; rate: number; quickDeduction: number }[] = [
  { limit: 5_000_000, rate: 0.05, quickDeduction: 0 },
  { limit: 10_000_000, rate: 0.10, quickDeduction: 250_000 },
  { limit: 18_000_000, rate: 0.15, quickDeduction: 750_000 },
  { limit: 32_000_000, rate: 0.20, quickDeduction: 1_650_000 },
  { limit: 52_000_000, rate: 0.25, quickDeduction: 3_250_000 },
  { limit: 80_000_000, rate: 0.30, quickDeduction: 5_850_000 },
  { limit: Infinity, rate: 0.35, quickDeduction: 9_850_000 },
];

function calcTaxReduction(dependents: number): number {
  return PIT_PERSONAL_DEDUCTION + dependents * PIT_DEPENDENT_DEDUCTION;
}

function calcEstPIT(grossPay: number, siDeductions: number, dependents: number): number {
  const taxReduction = calcTaxReduction(dependents);
  const taxable = grossPay - siDeductions - taxReduction;
  if (taxable <= 0) return 0;
  const bracket = PIT_BRACKETS.find(b => taxable <= b.limit) ?? PIT_BRACKETS[PIT_BRACKETS.length - 1];
  return Math.round(taxable * bracket.rate - bracket.quickDeduction);
}

function getTotalSI(deductions: SalarySlipEarning[] | undefined): number {
  return getDeductionAmount(deductions, "BHXH (Employee)")
    + getDeductionAmount(deductions, "BHYT (Employee)")
    + getDeductionAmount(deductions, "BHTN (Employee)");
}
```

**Step 2: Update `buildSlipColumns` signature and add columns**

Change the function signature to accept a dependents map:

```typescript
function buildSlipColumns(
  weddingAllowanceMap: Record<string, number>,
  dependentsMap: Record<string, number>,
): ColumnDef<SalarySlip, unknown>[] {
```

Add two new columns after the `employer_bhxh` column (before `net_pay`):

```typescript
    {
      id: "tax_reduction",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tax Reduction" className="text-right" />,
      cell: ({ row }) => {
        const deps = dependentsMap[row.original.employee] ?? 0;
        return <div className="text-right text-muted-foreground">{formatVND(calcTaxReduction(deps))}</div>;
      },
    },
    {
      id: "est_pit",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Est. PIT" className="text-right" />,
      cell: ({ row }) => {
        const deps = dependentsMap[row.original.employee] ?? 0;
        const si = getTotalSI(row.original.deductions);
        const pit = calcEstPIT(row.original.gross_pay, si, deps);
        return <div className="text-right text-red-600 dark:text-red-400">{pit > 0 ? formatVND(pit) : <span className="text-muted-foreground">-</span>}</div>;
      },
    },
```

**Step 3: Fetch employee dependents**

Inside `PayrollPage()`, after the `activeCount` line (around line 278), add a useList to fetch dependents:

```typescript
  // Fetch employee dependents for PIT calculation
  const { result: empDepsResult } = useList({
    resource: "Employee",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "Active" }],
    meta: { fields: ["name", "custom_number_of_dependents"] },
  });

  const dependentsMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const emp of (empDepsResult?.data ?? []) as any[]) {
      map[emp.name] = emp.custom_number_of_dependents ?? 0;
    }
    return map;
  }, [empDepsResult?.data]);
```

**Step 4: Update slipColumns useMemo**

Change the existing `slipColumns` memo (line 302) to pass `dependentsMap`:

```typescript
  const slipColumns = useMemo(() => buildSlipColumns(weddingAllowanceMap, dependentsMap), [weddingAllowanceMap, dependentsMap]);
```

**Step 5: Commit**

```bash
git add refinefrontend/src/pages/hr/PayrollPage.tsx
git commit -m "feat: add Tax Reduction and Est. PIT columns to payroll table"
```

---

### Task 6: Build and Test Locally

**Step 1: Build the frontend**

```bash
cd /home/hieunguyen/projects-miniforums/erpnext/meraki-manager
docker compose -f docker-compose.yml -f docker-compose.local.yml up react-frontend --build -d
```

**Step 2: Run the migration** (to create the custom field)

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up data-migrator --build
```

**Step 3: Verify**

- Open `http://frontend.merakierp.loc` → Payroll page
- Verify two new columns appear: "Tax Reduction" and "Est. PIT"
- Tax Reduction should show `15,500,000` for employees with 0 dependents
- Est. PIT should compute correctly based on gross pay minus SI minus tax reduction
- Open an Employee detail → verify "Tax Dependents" field appears and is editable
- Set dependents to 1 on a test employee → go back to Payroll → verify Tax Reduction increases by 6,200,000

**Step 4: Final commit if any fixes needed, then push**

```bash
git push origin main
```
