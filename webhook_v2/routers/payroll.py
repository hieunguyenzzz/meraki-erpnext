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
        })
        pe_name = pe_resp["data"]["name"]
        is_new = True
        log.info("payroll_entry_created", pe=pe_name)

    # Step 2: Fill employees + create salary slips
    if is_new:
        client._post("/api/method/run_doc_method", {
            "dt": "Payroll Entry", "dn": pe_name, "method": "fill_employee_details"
        })
        client._post("/api/method/run_doc_method", {
            "dt": "Payroll Entry", "dn": pe_name, "method": "create_salary_slips"
        })
        log.info("salary_slips_created", pe=pe_name)
    else:
        # Re-generate: delete draft slips and recreate
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

    def add_comm(emp_id: str, role: str, net_total: float):
        if not emp_id:
            return
        if emp_id not in comm_totals:
            comm_totals[emp_id] = {"lead": 0.0, "support": 0.0, "assistant": 0.0}
        pct = emp_comm_map.get(emp_id, {}).get(role, 0)
        comm_totals[emp_id][role] += net_total * pct / 100

    for proj in projects:
        net_total = so_net_map.get(proj["sales_order"], 0)
        if not net_total:
            continue
        add_comm(proj.get("custom_lead_planner"), "lead", net_total)
        add_comm(proj.get("custom_support_planner"), "support", net_total)
        add_comm(proj.get("custom_assistant_1"), "assistant", net_total)
        add_comm(proj.get("custom_assistant_2"), "assistant", net_total)

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
