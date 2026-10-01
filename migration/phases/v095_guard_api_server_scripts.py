"""Lock down API Server Scripts that any logged-in user can call (MWP-69).

Background: these Server Scripts have allow_guest=0 but perform no role or
ownership check of their own. Any authenticated ERPNext user (any role) can
POST /api/method/<api_method> and trigger them directly:

- meraki-set-employee-fields: raw frappe.db.set_value on Employee for a
  broad allowlist (ctc, commission %, dependents, insurance salary, user_id).
- meraki-create-approved-leave / meraki-leave-db-update: raw DB writes that
  bypass ERPNext's own Leave Application/Allocation validation.
- meraki-update-so-taxes: rewrites a submitted Sales Order's taxes.
- create_payroll_accrual_jv: creates and submits Journal Entries.
- update_leave_status: approves/rejects any Leave Application by name.

All six are only ever called by webhook_v2 (or not called at all), and
webhook_v2's API key resolves to the "Administrator" user. So each gets an
Administrator-only guard prepended as its first statement. A marker comment
lets a rerun detect the guard is already in place (idempotent).

The three notification scripts (get_all_notifications, get_my_notifications,
handle_notification_action) are called directly by the frontend with the
caller's own session and already scope every read/write to
`frappe.session.user` (see v060_notification_pending_status.py and
v085_notification_action_wfh_status.py) — verified by reading the current
source, no change needed there.
"""

GUARD_MARKER = "# MWP-69 guard"
GUARD = (
    f'{GUARD_MARKER}\n'
    'if frappe.session.user != "Administrator":\n'
    '    frappe.throw("Not permitted", frappe.PermissionError)\n'
)

GUARDED_SCRIPTS = [
    "meraki-set-employee-fields",
    "meraki-create-approved-leave",
    "meraki-leave-db-update",
    "meraki-update-so-taxes",
    "create_payroll_accrual_jv",
    "update_leave_status",
]


def run(client):
    for script_name in GUARDED_SCRIPTS:
        script = client.get("Server Script", script_name)
        if not script:
            print(f"  Server Script '{script_name}' not found, skipping")
            continue

        current = script.get("script") or ""
        if GUARD_MARKER in current:
            print(f"  {script_name} already guarded, skipping")
            continue

        updated = GUARD + current
        result = client.update("Server Script", script_name, {"script": updated})
        if result:
            print(f"  Guarded {script_name} (Administrator-only)")
        else:
            print(f"  ERROR: Failed to guard {script_name}")
