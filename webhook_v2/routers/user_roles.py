"""
User role sync endpoint.

Syncs ERPNext User roles based on staff role assignments.
Uses admin API key — avoids browser CSRF/session limitations.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()

# Maps staff roles to the ERPNext roles they grant
STAFF_ROLE_TO_ERPNEXT_ROLES: dict[str, list[str]] = {
    "Director":   ["System Manager", "Sales Manager", "HR Manager", "Accounts Manager", "Projects User", "Sales User"],
    "Sales":      ["Sales User", "Inbox User", "Super Email User"],
    "HR":         ["HR User", "HR Manager"],
    "Accounting": ["Accounts User"],
    "Planner":    ["Projects User"],
}

# All ERPNext roles that are managed by staff role assignments
MANAGED_ROLES: set[str] = {
    role
    for roles in STAFF_ROLE_TO_ERPNEXT_ROLES.values()
    for role in roles
}


class SyncRolesRequest(BaseModel):
    user_id: str
    staff_roles: list[str]  # e.g. ["Director", "HR"]


@router.post("/sync-user-roles")
async def sync_user_roles(request: SyncRolesRequest):
    """
    Update ERPNext User roles to match the given staff roles.
    - Adds required roles that are missing
    - Removes managed roles that are no longer required
    - Preserves any roles not managed by staff roles (e.g. Employee Self Service)
    """
    client = ERPNextClient()

    required: set[str] = {"Employee"}
    for staff_role in request.staff_roles:
        for erp_role in STAFF_ROLE_TO_ERPNEXT_ROLES.get(staff_role, []):
            required.add(erp_role)

    # Fetch current roles
    try:
        data = client._get(f"/api/resource/User/{request.user_id}")
        current_roles: list[dict] = data.get("data", {}).get("roles", [])
    except Exception as e:
        log.error("fetch_user_failed", user=request.user_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to fetch user: {e}")

    # Build new roles list: keep unmanaged roles + add all required
    new_roles: list[dict] = []
    seen: set[str] = set()

    for r in current_roles:
        role_name = r["role"]
        if role_name not in MANAGED_ROLES:
            # Keep: not managed by staff roles
            new_roles.append(r)
            seen.add(role_name)
        elif role_name in required:
            # Keep: still required
            new_roles.append(r)
            seen.add(role_name)
        # else: managed role no longer required — drop it

    for role_name in required:
        if role_name not in seen:
            new_roles.append({"role": role_name})

    # Update user
    try:
        client._put(f"/api/resource/User/{request.user_id}", {"roles": new_roles})
    except Exception as e:
        log.error("update_user_roles_failed", user=request.user_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to update user roles: {e}")

    added = [r["role"] for r in new_roles]
    log.info("user_roles_synced", user=request.user_id, roles=added)
    return {"status": "ok", "roles": added}
