"""
Wedding allowance generation endpoint.

GET  /generate-allowances/{project_name} — preview (dry run)
POST /generate-allowances/{project_name} — create Additional Salary records
"""

from datetime import date

from fastapi import APIRouter, HTTPException
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()


def _get_rate(employee: dict, wedding_type: str, service_type: str) -> float:
    """Look up the allowance rate for this employee based on wedding type + service type."""
    is_dest = "destination" in (wedding_type or "").lower()
    is_full = "full" in (service_type or "").lower()

    if is_dest and is_full:
        field = "custom_allowance_dest_full"
    elif is_dest and not is_full:
        field = "custom_allowance_dest_partial"
    elif not is_dest and is_full:
        field = "custom_allowance_hcm_full"
    else:
        field = "custom_allowance_hcm_partial"

    return float(employee.get(field) or 0)


def _get_project_data(client: ERPNextClient, project_name: str) -> dict:
    """Fetch project + linked Sales Order data."""
    try:
        proj_resp = client._get(f"/api/resource/Project/{project_name}")
        project = proj_resp.get("data", {})
    except Exception:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_name}")

    # Get wedding type and service type from linked Sales Order
    so_name = project.get("sales_order") or project.get("custom_sales_order")
    wedding_type = project.get("custom_wedding_type", "HCM")
    service_type = project.get("custom_service_type", "Full Package")

    if so_name:
        try:
            so_resp = client._get(f"/api/resource/Sales Order/{so_name}")
            so = so_resp.get("data", {})
            wedding_type = so.get("custom_wedding_type") or wedding_type
            service_type = so.get("custom_service_type") or service_type
        except Exception:
            pass

    return {
        "project": project,
        "project_name": project_name,
        "wedding_type": wedding_type,
        "service_type": service_type,
    }


def _get_assigned_employees(client: ERPNextClient, project: dict) -> list[dict]:
    """Get all employees assigned to this project."""
    employee_ids = set()
    for field in ["custom_lead_planner", "custom_support_planner", "custom_assistant_1", "custom_assistant_2"]:
        emp_id = project.get(field)
        if emp_id:
            employee_ids.add(emp_id)

    employees = []
    for emp_id in employee_ids:
        try:
            resp = client._get(f"/api/resource/Employee/{emp_id}")
            emp = resp.get("data", {})
            employees.append(emp)
        except Exception:
            pass

    return employees


def _build_preview(client: ERPNextClient, project_name: str) -> dict:
    data = _get_project_data(client, project_name)
    project = data["project"]
    wedding_type = data["wedding_type"]
    service_type = data["service_type"]

    employees = _get_assigned_employees(client, project)

    created = []
    skipped = []

    for emp in employees:
        rate = _get_rate(emp, wedding_type, service_type)
        if rate > 0:
            created.append({
                "employee": emp.get("name"),
                "employee_name": emp.get("employee_name"),
                "amount": rate,
                "wedding_type": wedding_type,
                "service_type": service_type,
            })
        else:
            skipped.append({
                "employee": emp.get("name"),
                "employee_name": emp.get("employee_name"),
                "reason": "No allowance rate configured",
            })

    return {
        "project_name": project_name,
        "project_title": project.get("project_name") or project_name,
        "wedding_type": wedding_type,
        "service_type": service_type,
        "created": created,
        "skipped": skipped,
    }


@router.get("/generate-allowances/{project_name}")
async def preview_allowances(project_name: str):
    """Preview wedding allowances without creating records."""
    client = ERPNextClient()
    return _build_preview(client, project_name)


@router.post("/generate-allowances/{project_name}")
async def generate_allowances(project_name: str):
    """Create Additional Salary records for all eligible staff on this project."""
    client = ERPNextClient()
    preview = _build_preview(client, project_name)

    payroll_date = date.today().isoformat()
    company = "Meraki Wedding Planner"

    results = []
    errors = []

    for item in preview["created"]:
        try:
            resp = client._post("/api/resource/Additional Salary", {
                "employee": item["employee"],
                "salary_component": "Wedding Allowance",
                "amount": item["amount"],
                "payroll_date": payroll_date,
                "company": company,
                "custom_wedding_project": project_name,
                "custom_wedding_type": item["wedding_type"],
                "custom_service_type": item["service_type"],
            })
            doc_name = resp.get("data", {}).get("name", "")

            # Submit the Additional Salary
            client._post("/api/method/frappe.client.submit", {
                "doc": {"doctype": "Additional Salary", "name": doc_name}
            })

            results.append({**item, "doc": doc_name, "status": "created"})
            log.info("allowance_created", employee=item["employee"], amount=item["amount"], doc=doc_name)

        except Exception as e:
            log.error("allowance_create_failed", employee=item["employee"], error=str(e))
            errors.append({"employee": item["employee"], "error": str(e)})

    return {
        "status": "ok",
        "project_name": project_name,
        "wedding_type": preview["wedding_type"],
        "service_type": preview["service_type"],
        "created": results,
        "skipped": preview["skipped"],
        "errors": errors,
    }
