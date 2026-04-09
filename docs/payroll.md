# Payroll Processing

The payroll page (`/hr/payroll`) handles monthly salary processing for all Meraki staff.
It is implemented in `refinefrontend/src/pages/hr/PayrollPage.tsx`.

## Overview

The process has three stages, each triggered by a button:

```
[Generate for Month] → [Recalculate Commissions] → [Submit All]
```

- **Generate** creates the Payroll Entry and draft Salary Slips
- **Recalculate Commissions** updates commission amounts based on weddings delivered that month
- **Submit All** finalizes (locks) all salary slips

The "Recalculate Commissions" and "Submit All" buttons are only shown when a Payroll Entry exists with draft slips. Both disappear once all slips are submitted.

---

## Stage 1: Generate for [Month]

**Button:** `Generate for [Month]` — shown when no Payroll Entry exists for the current month.

### Steps

1. **Create Payroll Entry** — POST `/api/resource/Payroll Entry`
   - Fields: `payroll_frequency: Monthly`, date range covering the month, company, accounts (`Cash - MWP`, `Payroll Payable - MWP`)

2. **Fill Employee Details** — `run_doc_method` → `fill_employee_details`
   - ERPNext queries all active employees and populates the Payroll Entry's employee child table
   - The updated doc is saved back via PUT

3. **Create Salary Slips** — `run_doc_method` → `create_salary_slips`
   - ERPNext creates one **Salary Slip** per employee
   - Each slip is pre-filled from the employee's assigned Salary Structure (base pay, allowances, deductions)
   - All slips start as **Draft** (`docstatus = 0`)

4. **Calculate Commissions** — runs automatically after slip creation (same logic as Stage 2)

---

## Stage 2: Recalculate Commissions

**Button:** `Recalculate Commissions` — shown while any slips are still in Draft.

This is **custom Meraki logic** — ERPNext has no built-in commission feature. It calculates how much commission each employee earned from weddings delivered that month.

### Commission Rate Priority

Commission rates can be set at two levels:

1. **Per-wedding** (Project custom fields) — highest priority
2. **Per-employee** (Employee custom fields) — default fallback

If a Project has `custom_lead_commission_pct` set, that rate is used for that wedding. Otherwise, the Employee's default rate is used. This allows freelancers or special arrangements to have different rates per wedding.

### Steps

1. **Fetch Sales Orders** for the month
   - Filter: `delivery_date between [start, end]` AND `docstatus = 1` (submitted only)
   - Each SO represents a wedding; `custom_commission_base` (or `net_total`) is the wedding value

2. **Fetch Projects** linked to those SOs
   - Each Project has four employee fields: `custom_lead_planner`, `custom_support_planner`, `custom_assistant_1`, `custom_assistant_2`
   - Each Project can optionally have per-wedding commission rate overrides

3. **Fetch employee commission rates** (default fallback)
   - Each Employee has: `custom_lead_commission_pct`, `custom_support_commission_pct`, `custom_assistant_commission_pct`

4. **Calculate commission totals per employee**
   - For each wedding: `commission = commission_base × rate / 100`
   - Rate = project-level override if set, else employee-level default
   - Summed across all weddings the employee worked on that month
   - An employee can earn multiple commission types (e.g. lead on one wedding, support on another)

5. **Write back to each draft Salary Slip**
   - Fetch full slip, strip existing commission rows, append new ones:
     - `Lead Planner Commission`
     - `Support Planner Commission`
     - `Assistant Commission`
   - Amounts are rounded to nearest VND integer
   - Only non-zero commissions are written

### Why recalculate?

Wedding SOs may be submitted after payroll is generated (e.g. a wedding happens on the 25th, SO submitted on the 26th). Recalculating picks up any new weddings. Run this once you're confident all weddings for the month are finalized, before submitting slips.

---

## Stage 3: Submit All

**Button:** `Submit All` — shown while any slips are in Draft.

Uses ERPNext's native `submit_salary_slips` method on the Payroll Entry, which:
1. Submits all draft Salary Slips
2. Creates an **accrual Journal Entry** recording salary as company expense

### Accounting entries created

The accrual JV (auto-submitted, dated end of pay period):

| Account | Debit | Credit |
|---------|-------|--------|
| Salary - MWP | Gross earnings | |
| Social Insurance Expense - MWP | Employer BHXH/BHYT/BHTN | |
| | | Payroll Payable - MWP (per employee) |
| | | BHXH/BHYT/BHTN Payable accounts |

**Per-employee breakdown**: `Payroll Settings → Process Payroll Accounting Entry Based on Employee` is enabled, so the Payroll Payable credit is split into one line per employee with their Employee ID as party.

### Effect of submission

- Salary Slips set to `docstatus = 1` (locked)
- Salary recorded as company expense in GL/P&L
- Payroll Payable liability created per employee
- To make changes after submission: Cancel → Amend

---

## ERPNext Documents Involved

| Document | Role |
|----------|------|
| `Payroll Entry` | Groups the whole monthly payroll run; links to all Salary Slips |
| `Salary Slip` | One per employee per month; contains earnings + deductions breakdown |
| `Salary Structure` | Template defining an employee's standard pay components |
| `Sales Order` | Each wedding; `net_total` used for commission calculation |
| `Project` | Links wedding SO to the staff who worked it (lead/support/assistant fields) |
| `Employee` | Stores commission % rates on custom fields |

## Custom Fields Used

### Employee
| Field | Purpose |
|-------|---------|
| `custom_lead_commission_pct` | % of wedding value paid as Lead Planner commission |
| `custom_support_commission_pct` | % paid as Support Planner commission |
| `custom_assistant_commission_pct` | % paid as Assistant commission |

### Project
| Field | Purpose |
|-------|---------|
| `custom_lead_planner` | Employee who was Lead Planner for this wedding |
| `custom_support_planner` | Employee who was Support Planner |
| `custom_assistant_1` | First assistant |
| `custom_assistant_2` | Second assistant |
| `custom_lead_commission_pct` | Per-wedding override for lead commission % (null = use employee default) |
| `custom_support_commission_pct` | Per-wedding override for support commission % (null = use employee default) |
| `custom_assistant_commission_pct` | Per-wedding override for assistant commission % (null = use employee default) |

### Salary Components (commission earning rows)
- `Lead Planner Commission`
- `Support Planner Commission`
- `Assistant Commission`

---

## Freelancers / Commission-Only Staff

Freelancers (e.g. an external lead planner for a specific wedding) are treated as **regular Employees** with:

- **`base = 0`** in Salary Structure Assignment (no fixed salary)
- **`custom_insurance_salary = 0`** (no BHXH/BHYT/BHTN — formulas produce 0)
- **Commission rates** set per wedding via Project-level overrides, or per employee as defaults
- **Flat 10% PIT** on gross income (Vietnam freelancer tax rate — no personal/dependent deductions)

Set the `custom_pit_method` field on the Employee to `"Flat 10%"` to enable the flat rate. When empty (default), the progressive bracket system with deductions is used.

The monthly payroll flow handles them automatically:
- Salary Slip created with 0 base + 0 deductions
- Commission recalculation adds wedding commissions
- PIT = 10% of gross (flat, no deductions)
- Net pay = commission - PIT

Set `employment_type = "Freelance"` on the Employee for labeling.

---

## Deductions — Vietnamese Social Insurance (BHXH)

Each employee has a dedicated **insurance salary** (`custom_insurance_salary` on Employee) used as the base for mandatory Vietnamese social insurance contributions. This is separate from the employee's actual salary/CTC — commissions and irregular bonuses are legally excluded from the insurance base (Article 89, Social Insurance Law 2014).

### Employee Deduction Components (auto-calculated on each slip)

| Component | Abbr | Rate | Formula |
|-----------|------|------|---------|
| `BHXH (Employee)` | BHXH | 8% | `custom_insurance_salary * 0.08` |
| `BHYT (Employee)` | BHYT | 1.5% | `custom_insurance_salary * 0.015` |
| `BHTN (Employee)` | BHTN | 1% | `custom_insurance_salary * 0.01` |
| **Total employee** | | **10.5%** | |

### Employer Contributions (informational, not on payslip)

| Component | Rate |
|-----------|------|
| BHXH | 17.5% |
| BHYT | 3% |
| BHTN | 1% |
| **Total employer** | **21.5%** |

The employer's 21.5% is **not deducted from the employee's payslip** — it is the company's additional cost. It is shown in the Payroll page table as an "Employer BHXH" column for HR visibility, derived from the employee deductions: `employee_total / 10.5 * 21.5`.

### `custom_insurance_salary` Field

- Custom field on the Employee doctype, visible and editable on the Employee detail page (below CTC)
- Default value: employee's base salary (set when running `migration/modules/insurance_setup.py`)
- Legal constraints: min ≈ 4,960,000 VND (regional minimum wage), max = 46,800,000 VND (20× basic salary level)
- HR can adjust per employee via the Edit Employment dialog

### Setup

Run `migration/modules/insurance_setup.py` to:
1. Create the `custom_insurance_salary` custom field on Employee
2. Create the 3 deduction salary components
3. Amend "Monthly Salary" structure to include the 3 deduction rows
4. Populate `custom_insurance_salary` defaults for all employees (set to their base salary)

Note: `depends_on_payment_days = 0` — insurance is fixed on the declared salary, not prorated by work days.

---

## Known Issues / Gotchas

- **`joining_date` on Salary Slips** — Salary Slips require `joining_date` to be set (pulled from Employee's `date_of_joining`). If slips were created before this field was populated on the Employee record, they will need to be patched via `frappe.client.set_value` before they can be submitted.

- **`frappe.client.submit` requires the full document** — Do not pass a partial doc; ERPNext will validate against the incomplete object and fail. Always fetch the full doc first.

- **Commissions only count submitted SOs** — An SO in Draft state is invisible to the commission calculation. Make sure all weddings for the month are submitted before running Recalculate.

- **PUT to Salary Slip must include `deductions`** — When updating a Salary Slip via the REST API (e.g., to write commission earnings), always include the existing `deductions` array in the payload. Sending only `{ earnings }` causes ERPNext to clear the deductions child table, zeroing out all BHXH/BHYT/BHTN amounts. Always fetch the full slip first and pass `{ earnings: newEarnings, deductions: currentDeductions }`.
