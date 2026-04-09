"""
Unified payroll generation endpoint.

POST /generate-payroll — orchestrates: Payroll Entry + Salary Slips + Wedding Allowances + Commissions
"""

import json
from fastapi import APIRouter, Query
from pydantic import BaseModel
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger
from webhook_v2.routers.allowance import _get_rate, _get_project_data

log = get_logger(__name__)
router = APIRouter()


class GeneratePayrollRequest(BaseModel):
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD


COMMISSION_COMPONENTS = [
    "Lead Planner Commission", "Support Planner Commission", "Assistant Commission",
    "Full Package Commission", "Partial Package Commission",
]

# Vietnam PIT 2026 transitional: new deductions, old 7 brackets
PIT_PERSONAL_DEDUCTION = 15_500_000
PIT_DEPENDENT_DEDUCTION = 6_200_000
PIT_BRACKETS = [
    (10_000_000,  0.05, 0),
    (30_000_000,  0.10, 500_000),
    (60_000_000,  0.20, 3_500_000),
    (100_000_000, 0.30, 9_500_000),
    (float("inf"), 0.35, 14_500_000),
]
PIT_COMPONENT = "Income Tax"
STANDARD_WORKING_DAYS = 26  # Vietnam standard: 26 days/month for salary proration


def _calc_pit(gross_pay: float, si_deductions: float, dependents: int) -> int:
    """Calculate monthly PIT using Vietnam progressive brackets."""
    tax_reduction = PIT_PERSONAL_DEDUCTION + dependents * PIT_DEPENDENT_DEDUCTION
    taxable = gross_pay - si_deductions - tax_reduction
    if taxable <= 0:
        return 0
    for limit, rate, qd in PIT_BRACKETS:
        if taxable <= limit:
            return round(taxable * rate - qd)
    limit, rate, qd = PIT_BRACKETS[-1]
    return round(taxable * rate - qd)


def _ensure_salary_structure_assignments(client: ERPNextClient):
    """Create SSA for any active employee who doesn't have one yet (base from ctc)."""
    active_emps = client._get("/api/resource/Employee", params={
        "filters": json.dumps([["status", "=", "Active"]]),
        "fields": json.dumps(["name", "date_of_joining", "ctc"]),
        "limit_page_length": 200,
    }).get("data", [])

    existing_ssas = client._get("/api/resource/Salary Structure Assignment", params={
        "filters": json.dumps([["docstatus", "=", 1]]),
        "fields": json.dumps(["employee"]),
        "limit_page_length": 500,
    }).get("data", [])
    has_ssa = {s["employee"] for s in existing_ssas}

    created = 0
    for emp in active_emps:
        if emp["name"] in has_ssa:
            continue
        try:
            from_date = emp.get("date_of_joining") or "2026-01-01"
            ssa = client._post("/api/resource/Salary Structure Assignment", {
                "employee": emp["name"],
                "salary_structure": "Monthly Salary",
                "from_date": from_date,
                "base": emp.get("ctc") or 0,
                "company": "Meraki Wedding Planner",
            })
            client._post("/api/method/frappe.client.submit", {
                "doc": json.dumps(ssa["data"]),
            })
            created += 1
            log.info("ssa_auto_created", employee=emp["name"])
        except Exception as e:
            log.error("ssa_auto_create_failed", employee=emp["name"], error=str(e))

    if created:
        log.info("ssa_auto_created_total", count=created)


@router.post("/generate-payroll")
async def generate_payroll(request: GeneratePayrollRequest):
    """
    Orchestrate full payroll generation for a period:
    1. Get or create Payroll Entry
    2. Fill employees + create salary slips (only for new PE)
    3. Auto-generate wedding allowances (idempotent)
    4. Recalculate commissions (always fresh)
    """
    client = ERPNextClient()
    start_date = request.start_date
    end_date = request.end_date

    # Step 1: Get or create Payroll Entry
    existing = client._get("/api/resource/Payroll Entry", params={
        "filters": json.dumps([
            ["start_date", "=", start_date],
            ["docstatus", "!=", 2],
        ]),
        "fields": json.dumps(["name", "docstatus"]),
        "limit_page_length": 1,
    }).get("data", [])

    if existing:
        pe_name = existing[0]["name"]
        is_new = False
        log.info("payroll_entry_exists", pe=pe_name)
    else:
        pe_resp = client._post("/api/resource/Payroll Entry", {
            "payroll_frequency": "Monthly",
            "posting_date": end_date,
            "start_date": start_date,
            "end_date": end_date,
            "company": "Meraki Wedding Planner",
            "cost_center": "Main - MWP",
            "payment_account": "Cash - MWP",
            "payroll_payable_account": "Payroll Payable - MWP",
            "exchange_rate": 1,
        })
        pe_name = pe_resp["data"]["name"]
        is_new = True
        log.info("payroll_entry_created", pe=pe_name)

    # Step 1b: Auto-create Salary Structure Assignments for employees missing one
    _ensure_salary_structure_assignments(client)

    # Step 2: Fill employees + create salary slips
    if is_new:
        # fill_employee_details returns updated doc but does NOT persist; save employees back
        fill_resp = client._post("/api/method/run_doc_method", {
            "dt": "Payroll Entry", "dn": pe_name, "method": "fill_employee_details"
        })
        docs = fill_resp.get("docs", [])
        employees = docs[0].get("employees", []) if docs else []
        if employees:
            # Strip client-only fields that cause validation errors
            clean_employees = [
                {k: v for k, v in emp.items() if not k.startswith("__")}
                for emp in employees
            ]
            client._put(f"/api/resource/Payroll Entry/{pe_name}", {"employees": clean_employees})
            log.info("payroll_employees_saved", pe=pe_name, count=len(clean_employees))
        client._post("/api/method/run_doc_method", {
            "dt": "Payroll Entry", "dn": pe_name, "method": "create_salary_slips"
        })
        log.info("salary_slips_created", pe=pe_name)
    else:
        # Re-generate: delete draft slips, re-fill employees, recreate
        existing_slips = client._get("/api/resource/Salary Slip", params={
            "filters": json.dumps([["payroll_entry", "=", pe_name], ["docstatus", "=", 0]]),
            "fields": json.dumps(["name"]),
            "limit_page_length": 200,
        }).get("data", [])
        for slip in existing_slips:
            try:
                client._delete(f"/api/resource/Salary Slip/{slip['name']}")
            except Exception:
                pass
        # Re-fill employees (same as new flow — fill_employee_details does not persist)
        fill_resp = client._post("/api/method/run_doc_method", {
            "dt": "Payroll Entry", "dn": pe_name, "method": "fill_employee_details"
        })
        docs = fill_resp.get("docs", [])
        employees = docs[0].get("employees", []) if docs else []
        if employees:
            clean_employees = [
                {k: v for k, v in emp.items() if not k.startswith("__")}
                for emp in employees
            ]
            client._put(f"/api/resource/Payroll Entry/{pe_name}", {"employees": clean_employees})
        client._post("/api/method/run_doc_method", {
            "dt": "Payroll Entry", "dn": pe_name, "method": "create_salary_slips"
        })
        log.info("salary_slips_regenerated", pe=pe_name, deleted=len(existing_slips))

    # Step 3: Apply allowances + commissions directly to draft salary slips
    extras_result = _apply_allowances_and_commissions(client, pe_name, start_date, end_date)
    log.info("extras_applied", **extras_result)

    # Final slip count
    slips = client._get("/api/resource/Salary Slip", params={
        "filters": json.dumps([["payroll_entry", "=", pe_name], ["docstatus", "!=", 2]]),
        "fields": json.dumps(["name"]),
        "limit_page_length": 200,
    }).get("data", [])

    return {
        "status": "ok",
        "payroll_entry": pe_name,
        "is_new": is_new,
        "slips_count": len(slips),
        "extras": extras_result,
    }


def _apply_allowances_and_commissions(client: ERPNextClient, pe_name: str, start_date: str, end_date: str) -> dict:
    """Calculate and apply wedding allowances + commissions to all draft salary slips.

    Both are written directly as earning rows on the slip (no Additional Salary docs).
    This is idempotent — old rows are stripped and fresh ones written each time.
    """

    # Fetch submitted SOs with delivery_date in period
    so_data = client._get("/api/resource/Sales Order", params={
        "filters": json.dumps([
            ["delivery_date", "between", [start_date, end_date]],
            ["docstatus", "=", 1],
        ]),
        "fields": json.dumps(["name", "net_total", "custom_commission_base"]),
        "limit_page_length": 500,
    }).get("data", [])

    so_net_map: dict[str, float] = {
        so["name"]: so.get("custom_commission_base") or so.get("net_total") or 0
        for so in so_data
    }

    # Fetch projects linked to those SOs
    projects = []
    so_names = list(so_net_map.keys())
    if so_names:
        projects = client._get("/api/resource/Project", params={
            "filters": json.dumps([["sales_order", "in", so_names]]),
            "fields": json.dumps([
                "name", "sales_order",
                "custom_lead_planner", "custom_support_planner",
                "custom_assistant_1", "custom_assistant_2",
                "custom_lead_commission_pct", "custom_support_commission_pct",
                "custom_assistant_commission_pct",
                "custom_sales_person",
            ]),
            "limit_page_length": 500,
        }).get("data", [])

    # Fetch draft salary slips for this PE
    draft_slips = client._get("/api/resource/Salary Slip", params={
        "filters": json.dumps([["payroll_entry", "=", pe_name], ["docstatus", "=", 0]]),
        "fields": json.dumps(["name", "employee"]),
        "limit_page_length": 200,
    }).get("data", [])

    if not draft_slips:
        return {"applied": 0, "commissions": 0, "allowances": 0}

    # Fetch current SSA base per employee (for syncing Basic Salary)
    employee_ids_for_ssa = list({s["employee"] for s in draft_slips})
    ssa_data = client._get("/api/resource/Salary Structure Assignment", params={
        "filters": json.dumps([["employee", "in", employee_ids_for_ssa], ["docstatus", "=", 1]]),
        "fields": json.dumps(["employee", "base"]),
        "order_by": "from_date desc",
        "limit_page_length": 500,
    }).get("data", [])
    # Keep only the latest SSA per employee
    ssa_base_map: dict[str, float] = {}
    for ssa in ssa_data:
        if ssa["employee"] not in ssa_base_map:
            ssa_base_map[ssa["employee"]] = ssa.get("base") or 0

    # Fetch employee data (commission rates + allowance rates)
    employee_ids = [s["employee"] for s in draft_slips]
    emp_data = client._get("/api/resource/Employee", params={
        "filters": json.dumps([["name", "in", employee_ids]]),
        "fields": json.dumps([
            "name",
            "custom_lead_commission_pct",
            "custom_support_commission_pct",
            "custom_assistant_commission_pct",
            "custom_allowance_hcm_full",
            "custom_allowance_hcm_partial",
            "custom_allowance_dest_full",
            "custom_allowance_dest_partial",
            "custom_full_package_commission_pct",
            "custom_partial_package_commission_pct",
            "custom_number_of_dependents",
            "custom_is_probation",
            "custom_pit_method",
        ]),
        "limit_page_length": 200,
    }).get("data", [])

    emp_map: dict[str, dict] = {emp["name"]: emp for emp in emp_data}

    emp_comm_map: dict[str, dict] = {
        emp["name"]: {
            "lead": float(emp.get("custom_lead_commission_pct") or 0),
            "support": float(emp.get("custom_support_commission_pct") or 0),
            "assistant": float(emp.get("custom_assistant_commission_pct") or 0),
        }
        for emp in emp_data
    }

    # --- Build commission totals per employee ---
    comm_totals: dict[str, dict[str, float]] = {}

    def add_comm(emp_id: str, role: str, net_total: float, proj: dict):
        if not emp_id:
            return
        if emp_id not in comm_totals:
            comm_totals[emp_id] = {"lead": 0.0, "support": 0.0, "assistant": 0.0}
        proj_pct = proj.get(f"custom_{role}_commission_pct")
        if proj_pct is not None and proj_pct > 0:
            pct = float(proj_pct)
        else:
            pct = emp_comm_map.get(emp_id, {}).get(role, 0)
        comm_totals[emp_id][role] += net_total * pct / 100

    for proj in projects:
        net_total = so_net_map.get(proj["sales_order"], 0)
        if not net_total:
            continue
        add_comm(proj.get("custom_lead_planner"), "lead", net_total, proj)
        add_comm(proj.get("custom_support_planner"), "support", net_total, proj)
        add_comm(proj.get("custom_assistant_1"), "assistant", net_total, proj)
        add_comm(proj.get("custom_assistant_2"), "assistant", net_total, proj)

    # --- Build sales commission totals per employee ---
    # Sales commission is based on booking date, not wedding date
    booking_projects = client._get("/api/resource/Project", params={
        "filters": json.dumps([
            ["custom_booking_date", "between", [start_date, end_date]],
            ["status", "!=", "Cancelled"],
        ]),
        "fields": json.dumps(["name", "custom_sales_person"]),
        "limit_page_length": 500,
    }).get("data", [])

    for proj in booking_projects:
        sales_person = proj.get("custom_sales_person")
        if not sales_person:
            continue
        # Determine service type from project detail
        try:
            proj_detail = _get_project_data(client, proj["name"])
        except Exception:
            continue
        service_type = proj_detail.get("service_type", "")
        is_full = "full" in (service_type or "").lower()

        emp = emp_map.get(sales_person, {})
        if is_full:
            amount = float(emp.get("custom_full_package_commission_pct") or 0)
            key = "full_package"
        else:
            amount = float(emp.get("custom_partial_package_commission_pct") or 0)
            key = "partial_package"

        if amount > 0:
            if sales_person not in comm_totals:
                comm_totals[sales_person] = {"lead": 0.0, "support": 0.0, "assistant": 0.0}
            comm_totals[sales_person][key] = comm_totals[sales_person].get(key, 0.0) + amount

    # --- Build allowance totals per employee ---
    allowance_totals: dict[str, float] = {}

    for proj in projects:
        proj_name = proj["name"]
        try:
            proj_detail = _get_project_data(client, proj_name)
        except Exception:
            continue
        wedding_type = proj_detail["wedding_type"]
        service_type = proj_detail["service_type"]

        for field in ["custom_lead_planner", "custom_support_planner",
                      "custom_assistant_1", "custom_assistant_2"]:
            emp_id = proj.get(field)
            if not emp_id or emp_id not in emp_map:
                continue
            rate = _get_rate(emp_map[emp_id], wedding_type, service_type)
            if rate > 0:
                allowance_totals[emp_id] = allowance_totals.get(emp_id, 0.0) + rate

    # --- Write earnings to each draft salary slip ---
    STRIP_COMPONENTS = set(COMMISSION_COMPONENTS + ["Wedding Allowance", "Company Insurance Contribution"])
    STRIP_DEDUCTIONS = {PIT_COMPONENT, "Salary Proration Adj"}
    applied = 0
    employees_with_commission = 0
    employees_with_allowance = 0

    for slip in draft_slips:
        try:
            full_slip = client._get(f"/api/resource/Salary Slip/{slip['name']}").get("data", {})
            current_deductions = full_slip.get("deductions", [])

            # Strip old commission + allowance rows, keep base salary rows
            base_earnings = [
                e for e in full_slip.get("earnings", [])
                if e.get("salary_component") not in STRIP_COMPONENTS
            ]

            # Sync Basic Salary from current SSA base
            emp_id = slip["employee"]
            orig_total_wd = full_slip.get("total_working_days") or 22
            orig_payment_days = full_slip.get("payment_days") or orig_total_wd
            is_partial_month = orig_payment_days < orig_total_wd

            if emp_id in ssa_base_map:
                current_base = ssa_base_map[emp_id]
                # Apply probation reduction (85% of base)
                emp_record = emp_map.get(emp_id, {})
                if emp_record.get("custom_is_probation"):
                    current_base = round(current_base * 0.85)
                base_earnings = [
                    {**e, "amount": current_base} if e.get("salary_component") == "Basic Salary" else e
                    for e in base_earnings
                ]

            new_earnings = list(base_earnings)

            # Add commissions
            has_commission = False
            totals = comm_totals.get(emp_id)
            if totals:
                if totals["lead"] > 0:
                    new_earnings.append({"salary_component": "Lead Planner Commission", "amount": round(totals["lead"])})
                    has_commission = True
                if totals["support"] > 0:
                    new_earnings.append({"salary_component": "Support Planner Commission", "amount": round(totals["support"])})
                    has_commission = True
                if totals["assistant"] > 0:
                    new_earnings.append({"salary_component": "Assistant Commission", "amount": round(totals["assistant"])})
                    has_commission = True
                if totals.get("full_package", 0) > 0:
                    new_earnings.append({"salary_component": "Full Package Commission", "amount": round(totals["full_package"])})
                    has_commission = True
                if totals.get("partial_package", 0) > 0:
                    new_earnings.append({"salary_component": "Partial Package Commission", "amount": round(totals["partial_package"])})
                    has_commission = True

            # Add wedding allowance
            has_allowance = False
            allowance_amt = allowance_totals.get(emp_id, 0)
            if allowance_amt > 0:
                new_earnings.append({"salary_component": "Wedding Allowance", "amount": round(allowance_amt)})
                has_allowance = True

            # If base salary is 0 but employee has insurance deductions,
            # add an earning to offset (company covers employee portion)
            if ssa_base_map.get(emp_id, 0) == 0:
                ins_deductions = sum(
                    d.get("amount", 0) for d in current_deductions
                    if d.get("salary_component", "").startswith(("BHXH", "BHYT", "BHTN"))
                    and "Employer" not in d.get("salary_component", "")
                    and "Payable" not in d.get("salary_component", "")
                )
                if ins_deductions > 0:
                    new_earnings.append({"salary_component": "Company Insurance Contribution", "amount": round(ins_deductions)})

            # Pass 1: Write earnings + strip old PIT (let ERPNext recompute gross_pay)
            new_deductions = [d for d in current_deductions if d.get("salary_component") not in STRIP_DEDUCTIONS]
            client._put(f"/api/resource/Salary Slip/{slip['name']}", {
                "earnings": new_earnings,
                "deductions": new_deductions,
            })

            # Pass 2: Apply /26 proration correction for partial-month employees,
            # then re-read gross and calculate PIT.
            #
            # ERPNext prorates Basic Salary as: base * payment_days / total_working_days.
            # Vietnam standard is /26. For partial months the difference is added as a
            # deduction so the effective base = base * payment_days / 26.
            PRORATION_COMPONENT = "Salary Proration Adj"
            if is_partial_month and emp_id in ssa_base_map:
                erpnext_base = current_base * orig_payment_days / orig_total_wd
                correct_base = current_base * orig_payment_days / STANDARD_WORKING_DAYS
                proration_adj = round(erpnext_base - correct_base)
            else:
                proration_adj = 0

            updated_slip = client._get(f"/api/resource/Salary Slip/{slip['name']}").get("data", {})

            if proration_adj > 0:
                adj_deductions = [d for d in updated_slip.get("deductions", []) if d.get("salary_component") != PRORATION_COMPONENT]
                adj_deductions.append({"salary_component": PRORATION_COMPONENT, "amount": proration_adj})
                client._put(f"/api/resource/Salary Slip/{slip['name']}", {"deductions": adj_deductions})
                updated_slip = client._get(f"/api/resource/Salary Slip/{slip['name']}").get("data", {})

            gross = updated_slip.get("gross_pay", 0)
            si = sum(
                d.get("amount", 0) for d in updated_slip.get("deductions", [])
                if d.get("salary_component", "").startswith(("BHXH", "BHYT", "BHTN"))
                and "Employer" not in d.get("salary_component", "")
            )
            pit_method = emp_map.get(emp_id, {}).get("custom_pit_method") or ""
            if pit_method == "Flat 10%":
                pit = round(gross * 0.10) if gross > 0 else 0
            else:
                dependents = int(emp_map.get(emp_id, {}).get("custom_number_of_dependents") or 0)
                pit = _calc_pit(gross, si, dependents)

            final_deductions = [d for d in updated_slip.get("deductions", []) if d.get("salary_component") != PIT_COMPONENT]
            if pit > 0:
                final_deductions.append({"salary_component": PIT_COMPONENT, "amount": pit})
            client._put(f"/api/resource/Salary Slip/{slip['name']}", {
                "deductions": final_deductions,
            })
            applied += 1
            if has_commission:
                employees_with_commission += 1
            if has_allowance:
                employees_with_allowance += 1
        except Exception as e:
            log.error("extras_apply_failed", slip=slip["name"], error=str(e))

    return {"applied": applied, "commissions": employees_with_commission, "allowances": employees_with_allowance}


class SubmitPayrollRequest(BaseModel):
    payroll_entry: str


@router.post("/payroll/submit-all")
async def submit_payroll(request: SubmitPayrollRequest):
    """
    Submit all draft Salary Slips for a Payroll Entry + create GL accrual JV.

    Uses ERPNext's native submit_salary_slips method which:
    1. Submits all draft slips
    2. Creates the accrual Journal Entry (Debit: Salary Expense, Credit: Payroll Payable)
    This records salary as a company expense in the GL.
    """
    client = ERPNextClient()
    pe_name = request.payroll_entry

    # Count draft slips before submission
    draft_slips = client._get("/api/resource/Salary Slip", params={
        "filters": json.dumps([["payroll_entry", "=", pe_name], ["docstatus", "=", 0]]),
        "fields": json.dumps(["name"]),
        "limit_page_length": 200,
    }).get("data", [])

    if not draft_slips:
        return {"submitted": 0, "failed": [], "jv_name": None, "message": "No draft slips to submit"}

    # Reset "Failed" status so ERPNext allows re-running submit_salary_slips
    pe_doc_pre = client._get(f"/api/resource/Payroll Entry/{pe_name}").get("data", {})
    if pe_doc_pre.get("salary_slips_submitted") == 0 and pe_doc_pre.get("status") == "Failed":
        client._put(f"/api/resource/Payroll Entry/{pe_name}", {"status": "Draft", "error_message": ""})
        log.info("reset_failed_pe", pe=pe_name)

    # Use ERPNext's native method: submits slips + creates accrual JV in one call.
    try:
        resp = client._post("/api/method/run_doc_method", {
            "dt": "Payroll Entry",
            "dn": pe_name,
            "method": "submit_salary_slips",
        })
    except Exception as e:
        error_msg = str(e)
        log.error("submit_salary_slips_failed", pe=pe_name, error=error_msg)
        return {"submitted": 0, "failed": [error_msg], "jv_name": None}

    # Check if PE ended up in "Failed" state (e.g. missing salary component account)
    pe_after = client._get(f"/api/resource/Payroll Entry/{pe_name}").get("data", {})
    if pe_after.get("status") == "Failed":
        error_msg = (pe_after.get("error_message") or "")[:500]
        if not error_msg:
            # Try Error Log for details
            errors = client._get("/api/resource/Error Log", params={
                "filters": json.dumps([["method", "like", f"%{pe_name}%"]]),
                "fields": json.dumps(["error"]),
                "order_by": "creation desc",
                "limit_page_length": 1,
            }).get("data", [])
            error_msg = errors[0]["error"][:500] if errors else "Unknown error — check ERPNext Error Log"
        log.error("pe_failed_after_submit", pe=pe_name, error=error_msg)
        return {"submitted": 0, "failed": [f"ERPNext submission failed: {error_msg}"], "jv_name": None}

    # Count how many were actually submitted
    submitted_slips = client._get("/api/resource/Salary Slip", params={
        "filters": json.dumps([["payroll_entry", "=", pe_name], ["docstatus", "=", 1]]),
        "fields": json.dumps(["name"]),
        "limit_page_length": 200,
    }).get("data", [])

    # Check if accrual JV was created
    jv_name = None
    pe_doc = client._get(f"/api/resource/Payroll Entry/{pe_name}").get("data", {})
    if pe_doc.get("salary_slips_submitted"):
        # ERPNext stores PE dates in user_remark like "Accrual JE for salaries from X to Y"
        start = pe_doc.get("start_date", "")
        end = pe_doc.get("end_date", "")
        jvs = client._get("/api/resource/Journal Entry", params={
            "filters": json.dumps([
                ["user_remark", "like", f"%{start}%{end}%"],
                ["voucher_type", "=", "Journal Entry"],
                ["docstatus", "=", 1],
            ]),
            "fields": json.dumps(["name"]),
            "limit_page_length": 1,
            "order_by": "creation desc",
        }).get("data", [])
        if jvs:
            jv_name = jvs[0]["name"]

    log.info("payroll_submitted", pe=pe_name, submitted=len(submitted_slips), jv=jv_name)
    return {
        "submitted": len(submitted_slips),
        "failed": [],
        "jv_name": jv_name,
    }


# Employee SI rate constants (Vietnam)
_SI_EMPLOYEE_PCT = 10.5  # BHXH 8% + BHYT 1.5% + BHTN 1%
_SI_EMPLOYER_PCT = 21.5  # BHXH 17.5% + BHYT 3% + BHTN 1%


@router.get("/payroll/slips")
def get_payroll_slips(pe_name: str = Query(..., description="Payroll Entry name")):
    """
    Return enriched salary slips for a Payroll Entry.

    Each slip includes earnings/deductions child tables plus pre-computed fields:
    - employee_display_name, dependents
    - employer_bhxh, tax_reduction, taxable_income
    Eliminates N+1 fetches and frontend business logic.
    """
    client = ERPNextClient()

    # 1. Fetch basic slip list
    slips = client._get("/api/resource/Salary Slip", params={
        "filters": json.dumps([["payroll_entry", "=", pe_name]]),
        "fields": json.dumps(["name", "employee"]),
        "limit_page_length": 200,
    }).get("data", [])

    if not slips:
        return {"data": []}

    # 2. Batch-fetch employee data (dependents, names)
    emp_ids = list({s["employee"] for s in slips})
    employees = client._get("/api/resource/Employee", params={
        "filters": json.dumps([["name", "in", emp_ids]]),
        "fields": json.dumps(["name", "first_name", "last_name", "employee_name", "custom_number_of_dependents", "custom_is_probation", "custom_pit_method"]),
        "limit_page_length": 200,
    }).get("data", [])

    emp_info: dict[str, dict] = {}
    for emp in employees:
        display = [emp.get("last_name"), emp.get("first_name")]
        display = " ".join(p for p in display if p)
        if not display or (emp.get("employee_name") or "").startswith("HR-EMP-"):
            display = display or emp.get("employee_name") or emp["name"]
        emp_info[emp["name"]] = {
            "display_name": display,
            "dependents": int(emp.get("custom_number_of_dependents") or 0),
            "is_probation": bool(emp.get("custom_is_probation")),
            "pit_method": emp.get("custom_pit_method") or "",
        }

    # 3. Fetch each slip's full doc (earnings + deductions)
    result = []
    for slip in slips:
        full = client._get(f"/api/resource/Salary Slip/{slip['name']}").get("data", {})
        emp_id = full.get("employee", "")
        info = emp_info.get(emp_id, {"display_name": emp_id, "dependents": 0, "is_probation": False})

        earnings = full.get("earnings", [])
        deductions = full.get("deductions", [])

        # Compute SI total (employee portion)
        si_total = sum(
            d.get("amount", 0) for d in deductions
            if d.get("salary_component", "").startswith(("BHXH", "BHYT", "BHTN"))
            and "Employer" not in d.get("salary_component", "")
        )

        # Employer BHXH = employee SI * (21.5 / 10.5)
        employer_bhxh = round(si_total / _SI_EMPLOYEE_PCT * _SI_EMPLOYER_PCT) if si_total > 0 else 0

        # Tax computations
        gross = full.get("gross_pay", 0)
        dependents = info["dependents"]
        if info["pit_method"] == "Flat 10%":
            tax_reduction = 0
            taxable_income = gross  # flat 10% on gross, no deductions
        else:
            tax_reduction = PIT_PERSONAL_DEDUCTION + dependents * PIT_DEPENDENT_DEDUCTION
            taxable_income = gross - si_total - tax_reduction

        result.append({
            "name": full.get("name"),
            "employee": emp_id,
            "employee_name": full.get("employee_name", ""),
            "employee_display_name": info["display_name"],
            "dependents": dependents,
            "gross_pay": gross,
            "total_deduction": full.get("total_deduction", 0),
            "net_pay": full.get("net_pay", 0),
            "posting_date": full.get("posting_date"),
            "docstatus": full.get("docstatus", 0),
            "modified": full.get("modified"),
            "earnings": [{"salary_component": e.get("salary_component"), "amount": e.get("amount", 0)} for e in earnings],
            "deductions": [{"salary_component": d.get("salary_component"), "amount": d.get("amount", 0)} for d in deductions],
            # Pre-computed fields
            "si_employee": si_total,
            "employer_bhxh": employer_bhxh,
            "tax_reduction": tax_reduction,
            "taxable_income": taxable_income,
            "is_probation": info["is_probation"],
            "pit_method": info["pit_method"],
        })

    # Sort by display name
    result.sort(key=lambda s: s["employee_display_name"])
    return {"data": result}
