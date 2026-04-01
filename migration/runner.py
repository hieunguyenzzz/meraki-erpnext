import json, os, tempfile
from pathlib import Path

# Old phases (v001–v039) removed — their setup is baked into the DB dump.
# New phases start fresh from here.
ORDERED_PHASES = [
    "v041_wedding_vendors",
    "v042_vendor_budget_fields",
    "v043_vendor_custom_fields",
    "v044_update_notification_scripts",
    "v045_company_expense_supplier",
    "v046_invoice_category_field",
    "v047_convert_je_expenses_to_pi",
    "v048_expense_rejected_field",
    "v049_update_notification_action_script",
    "v050_expense_staff_field",
    "v051_wedding_expense_category_flag",
    "v052_sales_commission_fields",
    "v053_fix_server_script_allowlist",
    "v054_pit_backend_setup",
    "v055_sales_commission_to_fixed",
    "v056_project_service_wedding_type",
]

SKIP_PHASES = set()  # phases that should never auto-run


def get_state_file() -> Path:
    return Path(os.getenv("STATE_FILE", "migration_state.json"))


def load_state(state_file: Path) -> list:
    if not state_file.exists():
        return []
    with open(state_file) as f:
        return json.load(f).get("applied", [])


def save_state(state_file: Path, applied: list) -> None:
    """Atomic write — temp file then rename."""
    fd, tmp = tempfile.mkstemp(dir=state_file.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump({"applied": applied}, f, indent=2)
        Path(tmp).rename(state_file)
    except Exception:
        Path(tmp).unlink(missing_ok=True)
        raise


def run_pending(client) -> int:
    try:
        from migration.phases import (
            v041_wedding_vendors, v042_vendor_budget_fields, v043_vendor_custom_fields,
            v044_update_notification_scripts, v045_company_expense_supplier,
            v046_invoice_category_field, v047_convert_je_expenses_to_pi,
            v048_expense_rejected_field,
            v049_update_notification_action_script,
            v050_expense_staff_field,
            v051_wedding_expense_category_flag,
            v052_sales_commission_fields,
            v053_fix_server_script_allowlist,
            v054_pit_backend_setup,
            v055_sales_commission_to_fixed,
        )
    except ModuleNotFoundError:
        from phases import (
            v041_wedding_vendors, v042_vendor_budget_fields, v043_vendor_custom_fields,
            v044_update_notification_scripts, v045_company_expense_supplier,
            v046_invoice_category_field, v047_convert_je_expenses_to_pi,
            v048_expense_rejected_field,
            v049_update_notification_action_script,
            v050_expense_staff_field,
            v051_wedding_expense_category_flag,
            v052_sales_commission_fields,
            v053_fix_server_script_allowlist,
            v054_pit_backend_setup,
            v055_sales_commission_to_fixed,
        )

    phase_fns = {
        "v041_wedding_vendors": v041_wedding_vendors.run,
        "v042_vendor_budget_fields": v042_vendor_budget_fields.run,
        "v043_vendor_custom_fields": v043_vendor_custom_fields.run,
        "v044_update_notification_scripts": v044_update_notification_scripts.run,
        "v045_company_expense_supplier": v045_company_expense_supplier.run,
        "v046_invoice_category_field": v046_invoice_category_field.run,
        "v047_convert_je_expenses_to_pi": v047_convert_je_expenses_to_pi.run,
        "v048_expense_rejected_field": v048_expense_rejected_field.run,
        "v049_update_notification_action_script": v049_update_notification_action_script.run,
        "v050_expense_staff_field": v050_expense_staff_field.run,
        "v051_wedding_expense_category_flag": v051_wedding_expense_category_flag.run,
        "v052_sales_commission_fields": v052_sales_commission_fields.run,
        "v053_fix_server_script_allowlist": v053_fix_server_script_allowlist.run,
        "v054_pit_backend_setup": v054_pit_backend_setup.run,
        "v055_sales_commission_to_fixed": v055_sales_commission_to_fixed.run,
    }

    state_file = get_state_file()
    applied = load_state(state_file)
    applied_set = set(applied)
    pending = [p for p in ORDERED_PHASES if p not in applied_set and p not in SKIP_PHASES]

    if not pending:
        print("✓ All seed migrations already applied.")
        return 0

    for phase in pending:
        print(f"Applying: {phase}")
        phase_fns[phase](client)
        applied.append(phase)
        save_state(state_file, applied)   # saved after EACH phase (crash-safe)
        print(f"✓ {phase} done")

    return len(pending)
