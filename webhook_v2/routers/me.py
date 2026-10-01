"""
Self-service profile endpoints (MWP-68).

Employee sensitive fields (DOB, bank details, address, emergency contact,
personal email/phone, CTC, commission %...) sit at Custom DocPerm permlevel
1/2 as of migration v094, so Employee Self Service can no longer read or
write them directly via the ERPNext REST API — not even on their own
record. This router is the replacement path: it always resolves the caller's
OWN Employee record from their session (never a client-supplied id) and
talks to ERPNext with the admin API key, which bypasses field permlevels.
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from webhook_v2.auth import get_current_user, resolve_employee
from webhook_v2.core.logging import get_logger
from webhook_v2.services.erpnext import ERPNextClient

log = get_logger(__name__)
router = APIRouter()

# Must match PROFILE_FIELDS in refinefrontend/src/hooks/useMyEmployee.ts
PROFILE_FIELDS = [
    "name", "employee_name", "first_name", "middle_name", "last_name",
    "gender", "date_of_birth", "designation", "department", "status",
    "date_of_joining", "cell_number", "personal_email",
    "current_address", "permanent_address",
    "person_to_be_contacted", "emergency_phone_number", "relation",
    "bank_name", "bank_ac_no", "iban",
]

# Fields MyProfilePage.tsx lets an employee edit on themselves. Subset of
# PROFILE_FIELDS, and of meraki_set_employee_fields's ALLOWED_FIELDS
# (extended by migration v094 to cover these).
WRITABLE_FIELDS = {
    "first_name",
    "last_name",
    "gender",
    "date_of_birth",
    "cell_number",
    "personal_email",
    "current_address",
    "permanent_address",
    "person_to_be_contacted",
    "relation",
    "emergency_phone_number",
    "bank_name",
    "bank_ac_no",
}


class ProfileUpdateRequest(BaseModel):
    values: dict


@router.get("/me/profile")
async def get_my_profile(request: Request):
    try:
        employee_id = resolve_employee(request, None)
    except HTTPException as e:
        # Sessions with no (or more than one) linked Employee — e.g.
        # Administrator — have no profile to show. useMyEmployee is mounted
        # on nearly every page, so degrade to "no profile" instead of a 403
        # (matches the pre-MWP-68 behaviour, which just returned an empty
        # Refine list for such sessions).
        if e.status_code == 403:
            log.info("me_profile_no_employee", user=get_current_user(request))
            return {"data": {}}
        raise
    client = ERPNextClient()
    # The single-doc REST GET (frappe.client.get) has no `fields` filter — it
    # always returns the full document. Fetch it (admin key bypasses field
    # permlevels for the caller's own record) and narrow down here instead.
    full = client._get(f"/api/resource/Employee/{employee_id}").get("data", {})
    data = {field: full.get(field) for field in PROFILE_FIELDS}
    log.info("me_profile_read", employee=employee_id)
    return {"data": data}


@router.patch("/me/profile")
async def update_my_profile(body: ProfileUpdateRequest, request: Request):
    employee_id = resolve_employee(request, None)

    # A list/dict value would otherwise reach meraki_set_employee_fields's
    # frappe.db.set_value call and fail there with a 500 (SQL can't bind a
    # list/dict) — reject it here with a clean 400 instead.
    bad_types = sorted(k for k, v in body.values.items() if not isinstance(v, (str, type(None))))
    if bad_types:
        log.warning("me_profile_update_invalid_type", employee=employee_id, fields=bad_types)
        raise HTTPException(status_code=400, detail=f"Values must be strings: {', '.join(bad_types)}")

    rejected = sorted(set(body.values.keys()) - WRITABLE_FIELDS)
    if rejected:
        log.warning("me_profile_update_rejected", employee=employee_id, fields=rejected)
        raise HTTPException(status_code=400, detail=f"Not allowed to set: {', '.join(rejected)}")

    updates = {k: v for k, v in body.values.items() if k in WRITABLE_FIELDS}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    client = ERPNextClient()

    if "first_name" in updates or "last_name" in updates:
        current = client._get(f"/api/resource/Employee/{employee_id}").get("data", {})
        first = updates.get("first_name", current.get("first_name", ""))
        last = updates.get("last_name", current.get("last_name", ""))
        updates["employee_name"] = f"{first} {last}".strip() if last else first

    try:
        result = client._post(
            "/api/method/meraki_set_employee_fields",
            {"employee_id": employee_id, **updates},
        )
    except Exception as e:
        log.error("me_profile_update_failed", employee=employee_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

    updated = result.get("message", {}).get("updated", list(updates.keys()))
    log.info("me_profile_updated", employee=employee_id, fields=sorted(updates.keys()))
    return {"data": {"updated": updated}}
