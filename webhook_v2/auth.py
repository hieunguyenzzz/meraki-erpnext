"""
Caller identity for webhook_v2 endpoints.

webhook_v2 itself has no user accounts — it always talks to ERPNext with the
admin API key. These helpers piggyback on the ERPNext session cookie (`sid`)
the React app already sends (same-origin, credentials: "include") to answer
"who is calling" and "do they have an HR role", so admin-only endpoints like
payroll generation aren't open to any staff member with a valid ERPNext login.

By default every route requires a logged-in ERPNext session (see
`require_login`, wired as an app-level dependency in main.py). Routes that
must be reachable without a session are explicitly listed in PUBLIC_ROUTES.
"""

import json

import requests
from fastapi import HTTPException, Request

from webhook_v2.core.logging import get_logger
from webhook_v2.services.erpnext import ERPNextClient

log = get_logger(__name__)

# Role groups — mirror refinefrontend/src/lib/roles.ts exactly. Administrator
# always passes (handled separately in has_roles/require_roles).
CRM = ("System Manager", "Sales Manager", "Sales User")
PLANNER = CRM + ("Projects User",)
HR = ("System Manager", "HR Manager", "HR User")
REPORT = HR
FINANCE = ("System Manager", "Accounts Manager", "Accounts User")
WEDDING_MANAGER = ("System Manager", "Sales Manager")
DIRECTOR = ("System Manager",)

# (method, path) pairs reachable without an ERPNext session.
# Path matches request.url.path as FastAPI sees it (after nginx strips the
# /inquiry-api or /api prefix) — i.e. the route path declared in the router.
PUBLIC_ROUTES: set[tuple[str, str]] = {
    ("POST", "/inquiry"),
    ("POST", "/website-inquiry"),
    ("POST", "/client-questionnaire"),
    ("GET", "/jobs"),
    ("POST", "/jobs/apply"),
    ("GET", "/health"),
}


def require_login(request: Request) -> None:
    """App-level dependency: 401 unless the caller has a valid ERPNext session.

    Lets CORS preflight (OPTIONS) and PUBLIC_ROUTES through untouched.
    """
    if request.method == "OPTIONS":
        return
    if (request.method, request.url.path) in PUBLIC_ROUTES:
        return
    request.state.user = get_current_user(request)


def get_current_user(request: Request) -> str:
    """Resolve the ERPNext user for the caller's `sid` cookie, or 401.

    Returns the cached value from `require_login` when already resolved for
    this request, so routes that depend on both `require_login` (app-level)
    and `require_roles` don't hit ERPNext twice.
    """
    cached_user = getattr(request.state, "user", None)
    if cached_user:
        return cached_user

    sid = request.cookies.get("sid")
    if not sid or sid == "Guest":
        log.warning("auth_missing_sid", path=request.url.path)
        raise HTTPException(status_code=401, detail="Not logged in")

    client = ERPNextClient()
    site_name = client._site_name
    try:
        response = requests.get(
            f"{client.url}/api/method/frappe.auth.get_logged_user",
            headers={
                "Cookie": f"sid={sid}",
                "X-Frappe-Site-Name": site_name,
                "Host": site_name,
            },
            timeout=client.timeout,
        )
    except requests.RequestException as e:
        log.error("auth_erpnext_unreachable", path=request.url.path, error=str(e))
        raise HTTPException(status_code=401, detail="Not logged in")

    if response.status_code != 200:
        log.warning("auth_invalid_session", path=request.url.path, status=response.status_code)
        raise HTTPException(status_code=401, detail="Not logged in")

    user = response.json().get("message")
    if not user or user == "Guest":
        log.warning("auth_guest_session", path=request.url.path)
        raise HTTPException(status_code=401, detail="Not logged in")

    return user


def _get_user_roles(request: Request) -> set[str]:
    """Resolve + cache the caller's ERPNext roles for this request.

    Administrator is represented as {"Administrator"} — has_roles() treats it
    as an automatic pass against every role group.
    """
    cached = getattr(request.state, "roles", None)
    if cached is not None:
        return cached

    user = get_current_user(request)
    if user == "Administrator":
        roles: set[str] = {"Administrator"}
    else:
        client = ERPNextClient()
        user_data = client._get(f"/api/resource/User/{user}").get("data", {})
        roles = {r["role"] for r in user_data.get("roles", [])}

    request.state.roles = roles
    return roles


def has_roles(request: Request, roles) -> bool:
    """True if the caller is Administrator or holds one of `roles`."""
    user_roles = _get_user_roles(request)
    if "Administrator" in user_roles:
        return True
    return bool(user_roles & set(roles))


def require_roles(*roles: str):
    """FastAPI dependency: caller must be logged in and hold one of `roles`."""

    def dependency(request: Request) -> str:
        user = get_current_user(request)

        if not has_roles(request, roles):
            log.warning(
                "auth_forbidden",
                user=user,
                path=request.url.path,
                required_roles=roles,
            )
            raise HTTPException(status_code=403, detail="Not authorized")

        log.info("auth_ok", user=user, path=request.url.path)
        return user

    return dependency


def resolve_employee(request: Request, requested: str | None, override_roles: tuple[str, ...] = ()) -> str:
    """Resolve the Employee a self-service call should act on.

    The session user's own Employee record is the default. A caller may
    request a *different* employee only when they hold one of
    `override_roles` — that check happens first, so a caller exercising a
    valid override (e.g. Administrator, or HR acting on someone else's leave)
    never needs their own Employee record to exist. Only once no override
    applies do we require the session user to be linked to exactly one
    Employee (403 "not linked" otherwise), and then only allow `requested` if
    it matches that own record.
    """
    if requested and override_roles and has_roles(request, override_roles):
        return requested

    user = get_current_user(request)
    client = ERPNextClient()
    employees = client._get("/api/resource/Employee", params={
        "filters": json.dumps([["user_id", "=", user]]),
        "fields": json.dumps(["name"]),
        "limit_page_length": 2,
    }).get("data", [])

    if len(employees) != 1:
        log.warning("resolve_employee_not_linked", user=user, path=request.url.path, matches=len(employees))
        raise HTTPException(status_code=403, detail="Your account is not linked to exactly one employee record")

    session_employee = employees[0]["name"]

    if requested and requested != session_employee:
        log.warning(
            "resolve_employee_forbidden",
            user=user,
            path=request.url.path,
            session_employee=session_employee,
            requested=requested,
        )
        raise HTTPException(status_code=403, detail="Not authorized to access this employee's data")

    return session_employee
