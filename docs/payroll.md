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

### Steps

1. **Fetch Sales Orders** for the month
   - Filter: `delivery_date between [start, end]` AND `docstatus = 1` (submitted only)
   - Each SO represents a wedding; `net_total` is the wedding value

2. **Fetch Projects** linked to those SOs
   - Each Project has four employee fields: `custom_lead_planner`, `custom_support_planner`, `custom_assistant_1`, `custom_assistant_2`

3. **Fetch employee commission rates**
   - Each Employee has: `custom_lead_commission_pct`, `custom_support_commission_pct`, `custom_assistant_commission_pct`

4. **Calculate commission totals per employee**
   - For each wedding: `commission = net_total × employee_commission_pct / 100`
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

Submits each draft Salary Slip individually. Once all slips are submitted, this button (and "Recalculate Commissions") disappears.

### Steps

For each draft slip (`docstatus = 0`):
1. Fetch the **full Salary Slip document** from `/api/resource/Salary Slip/{name}`
2. Call `frappe.client.submit(doc)` with the full document

### Why fetch the full doc first?

`frappe.client.submit(doc)` calls `frappe.get_doc(dict)` — it constructs a Document object **from the passed dict**, it does NOT re-fetch from the database. Passing a partial document (e.g. just `{doctype, name}`) causes ERPNext validation to fail because required fields like `employee`, `joining_date`, etc. are missing from the constructed object.

### Effect of submission

Submitting a Salary Slip in ERPNext:
- Sets `docstatus = 1`
- **Locks the slip** — it can no longer be edited
- Makes it an official payroll record visible in reports
- To make changes after submission you must Cancel → Amend

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

### Salary Components (commission earning rows)
- `Lead Planner Commission`
- `Support Planner Commission`
- `Assistant Commission`

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
