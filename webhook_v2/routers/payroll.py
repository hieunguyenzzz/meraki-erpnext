"""
Unified payroll generation endpoint.

POST /generate-payroll — orchestrates: Payroll Entry + Salary Slips + Wedding Allowances + Commissions
"""

import json
from fastapi import APIRouter
from pydantic import BaseModel
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger
from webhook_v2.routers.allowance import generate_allowances_for_period

log = get_logger(__name__)
router = APIRouter()


class GeneratePayrollRequest(BaseModel):
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD


COMMISSION_COMPONENTS = ["Lead Planner Commission", "Support Planner Commission", "Assistant Commission"]


def _ensure_salary_structure_assignments(client: ERPNextClient):
    """Create SSA (base=0) for any active employee who doesn't have one yet."""
    active_emps = client._get("/api/resource/Employee", params={
        "filters": json.dumps([["status", "=", "Active"]]),
        "fields": json.dumps(["name", "date_of_joining"]),
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
                "base": 0,
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

    # Step 3: Auto-generate wedding allowances (idempotent)
    allowance_result = generate_allowances_for_period(client, start_date, end_date)
    log.info("allowances_generated", **allowance_result)

    # Step 4: Recalculate commissions
    commissions_result = _apply_commissions(client, pe_name, start_date, end_date)
    log.info("commissions_applied", **commissions_result)

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
        "allowances": allowance_result,
        "commissions": commissions_result,
    }


def _apply_commissions(client: ERPNextClient, pe_name: str, start_date: str, end_date: str) -> dict:
    """Calculate and apply commission earnings to all draft salary slips for this PE."""

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
        return {"applied": 0, "employees_with_commission": 0}

    # Fetch employee commission percentages
    employee_ids = [s["employee"] for s in draft_slips]
    emp_data = client._get("/api/resource/Employee", params={
        "filters": json.dumps([["name", "in", employee_ids]]),
        "fields": json.dumps([
            "name",
            "custom_lead_commission_pct",
            "custom_support_commission_pct",
            "custom_assistant_commission_pct",
        ]),
        "limit_page_length": 200,
    }).get("data", [])

    emp_comm_map: dict[str, dict] = {
        emp["name"]: {
            "lead": float(emp.get("custom_lead_commission_pct") or 0),
            "support": float(emp.get("custom_support_commission_pct") or 0),
            "assistant": float(emp.get("custom_assistant_commission_pct") or 0),
        }
        for emp in emp_data
    }

    # Build commission totals per employee
    comm_totals: dict[str, dict[str, float]] = {}

    def add_comm(emp_id: str, role: str, net_total: float, proj: dict):
        if not emp_id:
            return
        if emp_id not in comm_totals:
            comm_totals[emp_id] = {"lead": 0.0, "support": 0.0, "assistant": 0.0}
        # Project-level override takes priority, fall back to employee default
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

    # Update each draft salary slip
    applied = 0
    employees_with_commission = 0
    for slip in draft_slips:
        try:
            full_slip = client._get(f"/api/resource/Salary Slip/{slip['name']}").get("data", {})
            current_deductions = full_slip.get("deductions", [])

            # Strip old commission rows, keep everything else
            base_earnings = [
                e for e in full_slip.get("earnings", [])
                if e.get("salary_component") not in COMMISSION_COMPONENTS
            ]

            new_earnings = list(base_earnings)
            has_commission = False
            totals = comm_totals.get(slip["employee"])
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

            client._put(f"/api/resource/Salary Slip/{slip['name']}", {
                "earnings": new_earnings,
                "deductions": current_deductions,
            })
            applied += 1
            if has_commission:
                employees_with_commission += 1
        except Exception as e:
            log.error("commission_apply_failed", slip=slip["name"], error=str(e))

    return {"applied": applied, "employees_with_commission": employees_with_commission}


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

    # Use ERPNext's native method: submits slips + creates accrual JV in one call.
    # This calls submit_salary_slips_for_employees which:
    #   - Submits each draft slip
    #   - Calls make_accrual_jv_entry() to create GL entries
    #   - Sets salary_slips_submitted=1 on the PE
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
