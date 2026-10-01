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

import requests
from fastapi import HTTPException, Request

from webhook_v2.core.logging import get_logger
from webhook_v2.services.erpnext import ERPNextClient

log = get_logger(__name__)

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


def require_roles(*roles: str):
    """FastAPI dependency: caller must be logged in and hold one of `roles`."""

    def dependency(request: Request) -> str:
        user = get_current_user(request)

        if user == "Administrator":
            return user

        client = ERPNextClient()
        user_data = client._get(f"/api/resource/User/{user}").get("data", {})
        user_roles = {r["role"] for r in user_data.get("roles", [])}

        if not user_roles & set(roles):
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
