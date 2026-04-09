"""
Employee management endpoints.

Uses a Frappe Server Script (meraki_set_employee_fields) that calls
frappe.db.set_value — bypasses full-document link validation (e.g. invalid
leave_approver) that causes 417 errors when saving via frappe.client.set_value.

The Server Script is created by migration phase v015.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()


def _should_send_welcome_email(client: ERPNextClient) -> int:
    """Read HR Settings toggle for welcome email on invite."""
    try:
        hr = client._get("/api/resource/HR Settings/HR Settings", params={
            "fields": '["custom_send_welcome_email_on_invite"]',
        }).get("data", {})
        return int(hr.get("custom_send_welcome_email_on_invite", 0))
    except Exception:
        return 0

ASSIGNABLE_ROLES_PY = [
    {"role": "System Manager",   "label": "Admin"},
    {"role": "Sales Manager",    "label": "Sales Manager"},
    {"role": "Sales User",       "label": "Sales"},
    {"role": "HR Manager",       "label": "HR Manager"},
    {"role": "HR User",          "label": "HR"},
    {"role": "Accounts Manager", "label": "Finance Mgr"},
    {"role": "Accounts User",    "label": "Finance"},
    {"role": "Projects User",    "label": "Planner"},
    {"role": "Inbox User",       "label": "Inbox"},
]

# Must match ALLOWED_FIELDS in migration/phases/v015_employee_set_value_script.py
# (v016 adds user_id)
ALLOWED_FIELDS = {
    "employee_name",
    "first_name",
    "middle_name",
    "last_name",
    "gender",
    "date_of_birth",
    "company_email",
    "designation",
    "department",
    "date_of_joining",
    "custom_staff_roles",
    "ctc",
    "custom_insurance_salary",
    "custom_lead_commission_pct",
    "custom_support_commission_pct",
    "custom_assistant_commission_pct",
    "custom_sales_commission_pct",
    "custom_full_package_commission_pct",
    "custom_partial_package_commission_pct",
    "user_id",
    "custom_last_review_date",
    "custom_review_notes",
    "custom_allowance_hcm_full",
    "custom_allowance_hcm_partial",
    "custom_allowance_dest_full",
    "custom_allowance_dest_partial",
    "custom_display_order",
    "custom_number_of_dependents",
    "custom_pit_method",
}


class EmployeeUpdateRequest(BaseModel):
    values: dict


@router.patch("/employee/{employee_id}")
async def update_employee(employee_id: str, request: EmployeeUpdateRequest):
    """
    Update employee fields via the meraki_set_employee_fields Server Script.
    Uses frappe.db.set_value internally — no link validation.
    """
    client = ERPNextClient()

    updates = {k: v for k, v in request.values.items() if k in ALLOWED_FIELDS}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    # If first_name or last_name is changing, compute employee_name
    if "first_name" in updates or "last_name" in updates:
        try:
            emp = client._get(f"/api/resource/Employee/{employee_id}")
            current = emp.get("data", {})
            first = updates.get("first_name", current.get("first_name", ""))
            last = updates.get("last_name", current.get("last_name", ""))
            full_name = f"{first} {last}".strip() if last else first
            updates["employee_name"] = full_name
        except Exception as e:
            log.warning("employee_name_compute_failed", employee=employee_id, error=str(e))

    # If company_email is changing and the employee has a linked User, rename the User
    if "company_email" in updates:
        try:
            emp = client._get(f"/api/resource/Employee/{employee_id}")
            current = emp.get("data", {})
            user_id = current.get("user_id")
            new_email = updates["company_email"]
            if user_id and new_email and user_id != new_email:
                try:
                    client._post("/api/method/frappe.client.rename_doc", {
                        "doctype": "User",
                        "old_name": user_id,
                        "new_name": new_email,
                        "merge": False,
                    })
                    updates["user_id"] = new_email
                    log.info("user_renamed", old=user_id, new=new_email)
                except Exception as rename_err:
                    log.warning("user_rename_failed", old=user_id, new=new_email, error=str(rename_err))
        except Exception as fetch_err:
            log.warning("employee_fetch_failed", employee=employee_id, error=str(fetch_err))

    try:
        result = client._post(
            "/api/method/meraki_set_employee_fields",
            {"employee_id": employee_id, **updates},
        )
    except Exception as e:
        log.error("employee_update_failed", employee=employee_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

    updated = result.get("message", {}).get("updated", list(updates.keys()))

    # If salary (ctc) changed, also update active Salary Structure Assignment base
    if "ctc" in updates:
        import json as _j
        new_base = updates["ctc"] or 0
        try:
            ssa_list = client._get("/api/resource/Salary Structure Assignment", params={
                "filters": _j.dumps([["employee", "=", employee_id], ["docstatus", "=", 1]]),
                "fields": _j.dumps(["name", "base", "salary_structure", "from_date", "company"]),
                "order_by": "from_date desc",
                "limit_page_length": 1,
            }).get("data", [])
            if ssa_list:
                old_ssa = ssa_list[0]
                # Cancel and delete old SSA, create new with updated base
                client._post("/api/method/frappe.client.cancel", {
                    "doctype": "Salary Structure Assignment",
                    "name": old_ssa["name"],
                })
                client._delete(f"/api/resource/Salary Structure Assignment/{old_ssa['name']}")
                new_ssa = client._post("/api/resource/Salary Structure Assignment", {
                    "employee": employee_id,
                    "salary_structure": old_ssa["salary_structure"],
                    "from_date": old_ssa["from_date"],
                    "company": old_ssa["company"],
                    "base": new_base,
                    "docstatus": 1,
                })
                log.info("ssa_recreated", employee=employee_id, old=old_ssa["name"],
                         new=new_ssa.get("data", {}).get("name"), base=new_base)
        except Exception as e:
            log.warning("ssa_base_update_failed", employee=employee_id, error=str(e))

    log.info("employee_updated", employee=employee_id, fields=updated)
    return {"status": "ok", "updated": updated}


import json as _json
import random


class LinkUserRequest(BaseModel):
    email: str


@router.post("/employee/{employee_id}/link-user")
async def link_user_to_employee(employee_id: str, request: LinkUserRequest):
    """
    Find or create an ERPNext User for the given email, assign roles from
    employee's custom_staff_roles, then link the user to the employee.
    Returns {user_id, created}.
    """
    client = ERPNextClient()
    email = request.email.strip()

    # 1. Fetch employee
    try:
        emp_resp = client._get(f"/api/resource/Employee/{employee_id}")
        emp = emp_resp.get("data", {})
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Employee not found: {e}")

    employee_name = emp.get("employee_name") or emp.get("first_name", email)

    # 2. Check if user already exists
    try:
        existing = client._get("/api/resource/User", params={
            "filters": _json.dumps([["name", "=", email]]),
            "fields": _json.dumps(["name"]),
            "limit_page_length": 1,
        })
        user_exists = bool(existing.get("data"))
    except Exception:
        user_exists = False

    created = False

    # 3. Create user if not found
    if not user_exists:
        send_welcome = _should_send_welcome_email(client)
        try:
            client._post("/api/resource/User", {
                "email": email,
                "first_name": employee_name,
                "enabled": 1,
                "send_welcome_email": send_welcome,
                "roles": [{"role": "Employee Self Service"}],
            })
            created = True
            log.info("link_user_created", email=email, employee=employee_id)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to create user: {e}")

    # 4. Ensure default roles are set (Employee + Employee Self Service)
    #    Roles will be customised separately via the set-roles endpoint.
    if not user_exists:
        try:
            client._put(f"/api/resource/User/{email}", {
                "roles": [{"role": "Employee"}, {"role": "Employee Self Service"}],
            })
        except Exception as e:
            log.warning("link_user_roles_failed", email=email, error=str(e))

    # 5. Link user to employee
    try:
        client._post("/api/method/meraki_set_employee_fields", {
            "employee_name": employee_id,
            "user_id": email,
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to link user to employee: {e}")

    log.info("link_user_done", email=email, employee=employee_id, created=created)
    return {"user_id": email, "created": created}


class InviteStaffRequest(BaseModel):
    full_name: str
    email: str
    gender: str = "Female"
    date_of_birth: str = "2000-01-01"
    date_of_joining: str
    password: str | None = None  # if None, backend generates "Meraki-{4digits}"


@router.post("/staff/invite")
async def invite_staff(request: InviteStaffRequest):
    """
    Invite a new staff member:
    1. Create User with Employee Self Service role
    2. Fetch max custom_meraki_id from existing employees → increment
    3. Create Employee linked to that User
    Returns {employee_name, user_id, password}
    """
    client = ERPNextClient()

    # Generate password if not provided
    password = request.password or f"Meraki-{random.randint(1000, 9999)}"

    name_parts = request.full_name.strip().split(" ")
    first_name = name_parts[0]
    last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""

    # 1. Create User (or reuse existing)
    email = request.email.strip()
    try:
        existing_user = client._get(f"/api/resource/User/{email}")
        # User exists — check if already linked to an Employee
        existing_emps = client._get("/api/resource/Employee", params={
            "filters": _json.dumps([["user_id", "=", email]]),
            "fields": _json.dumps(["name"]),
            "limit_page_length": 1,
        }).get("data", [])
        if existing_emps:
            raise HTTPException(
                status_code=409,
                detail=f"User {email} is already linked to employee {existing_emps[0]['name']}",
            )
        log.info("staff_user_reused", email=email)
    except HTTPException:
        raise
    except Exception:
        # User doesn't exist — create it
        send_welcome = _should_send_welcome_email(client)
        try:
            user_values = {
                "email": email,
                "first_name": first_name,
                "enabled": 1,
                "new_password": password,
                "send_welcome_email": send_welcome,
                "roles": [{"role": "Employee Self Service"}],
            }
            if last_name:
                user_values["last_name"] = last_name
            client._post("/api/resource/User", user_values)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to create user: {e}")
        log.info("staff_user_created", email=email)

    # 2. Fetch max custom_meraki_id
    try:
        emp_data = client._get("/api/resource/Employee", params={
            "fields": _json.dumps(["custom_meraki_id"]),
            "limit_page_length": 500,
        }).get("data", [])
        max_id = max((int(e.get("custom_meraki_id") or 0) for e in emp_data), default=0)
        next_meraki_id = max_id + 1
    except Exception:
        next_meraki_id = 1

    # 3. Create Employee
    try:
        emp_values = {
            "first_name": first_name,
            "employee_name": request.full_name.strip(),
            "company": "Meraki Wedding Planner",
            "user_id": email,
            "date_of_joining": request.date_of_joining,
            "gender": request.gender,
            "date_of_birth": request.date_of_birth,
            "status": "Active",
            "custom_meraki_id": next_meraki_id,
        }
        if last_name:
            emp_values["last_name"] = last_name
        emp_resp = client._post("/api/resource/Employee", emp_values)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create employee: {e}")

    employee_name = emp_resp.get("data", {}).get("name")
    log.info("staff_employee_created", employee=employee_name, meraki_id=next_meraki_id)

    return {
        "employee_name": employee_name,
        "user_id": email,
        "password": password,
    }


class SetRolesRequest(BaseModel):
    roles: list[str]  # list of ASSIGNABLE role names to set


@router.post("/employee/{employee_id}/set-roles")
async def set_employee_roles(employee_id: str, request: SetRolesRequest):
    """
    Directly set ERPNext User roles for the employee's linked user.
    Always includes Employee + Employee Self Service.
    Only touches roles from ASSIGNABLE_ROLES — preserves all others.
    """
    client = ERPNextClient()

    emp = client._get(f"/api/resource/Employee/{employee_id}").get("data", {})
    user_id = emp.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="Employee has no linked user")

    MANAGEABLE = {r["role"] for r in ASSIGNABLE_ROLES_PY}

    user_data = client._get(f"/api/resource/User/{user_id}").get("data", {})
    current_roles = user_data.get("roles", [])

    requested = set(request.roles) & MANAGEABLE
    always = {"Employee", "Employee Self Service"}
    new_roles = []
    seen = set()
    for r in current_roles:
        name = r["role"]
        if name not in MANAGEABLE:
            new_roles.append(r)
            seen.add(name)
    for name in always | requested:
        if name not in seen:
            new_roles.append({"role": name})

    client._put(f"/api/resource/User/{user_id}", {"roles": new_roles})
    return {"status": "ok", "roles": [r["role"] for r in new_roles]}


@router.get("/employees/roles-map")
async def get_employees_roles_map():
    """
    Returns {employee_name: [role1, role2, ...]} for all employees that have a linked user.
    Only returns roles from ASSIGNABLE_ROLES.
    """
    client = ERPNextClient()
    emps_response = client._get("/api/resource/Employee", params={
        "fields": '["name","user_id"]',
        "filters": '[["user_id","!=",""]]',
        "limit_page_length": 500,
    })
    emps = emps_response.get("data", [])

    result = {}
    MANAGEABLE = {r["role"] for r in ASSIGNABLE_ROLES_PY}
    for emp in emps:
        uid = emp.get("user_id")
        if not uid:
            continue
        try:
            user_data = client._get(f"/api/resource/User/{uid}").get("data", {})
            roles = [r["role"] for r in user_data.get("roles", []) if r["role"] in MANAGEABLE]
            result[emp["name"]] = roles
        except Exception:
            result[emp["name"]] = []
    return result
