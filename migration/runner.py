import json, os, tempfile
from pathlib import Path

# Append-only — never reorder or remove entries
ORDERED_PHASES = [
    "v001_wedding_venues",
    "v002_wedding_service_item",
    "v003_wedding_service_item_fix",
    "v004_remove_meraki_id_unique_constraint",
    "v005_bhxh_insurance_setup",
    "v006_employer_bhxh",
    "v007_fix_jv_and_bh_accounts",
    "v008_fix_venue_unique_constraint",
    "v009_more_assistant_fields",
    "v010_link_projects_to_sales_orders",
    "v011_backfill_venue_and_lead_planner",
    "v012_addon_fields",
    "v013_sales_role",
    "v014_fix_addon_items_non_stock",
    "v015_employee_set_value_script",
    "v016_update_employee_script",
    "v017_stock_settings_default_warehouse",
    "v018_review_history_doctype",
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
    from phases import v001_wedding_venues, v002_wedding_service_item, v003_wedding_service_item_fix, v004_remove_meraki_id_unique_constraint, v005_bhxh_insurance_setup, v006_employer_bhxh, v007_fix_jv_and_bh_accounts, v008_fix_venue_unique_constraint, v009_more_assistant_fields, v010_link_projects_to_sales_orders, v011_backfill_venue_and_lead_planner, v012_addon_fields, v013_sales_role, v014_fix_addon_items_non_stock, v015_employee_set_value_script, v016_update_employee_script, v017_stock_settings_default_warehouse, v018_review_history_doctype

    phase_fns = {
        "v001_wedding_venues": v001_wedding_venues.run,
        "v002_wedding_service_item": v002_wedding_service_item.run,
        "v003_wedding_service_item_fix": v003_wedding_service_item_fix.run,
        "v004_remove_meraki_id_unique_constraint": v004_remove_meraki_id_unique_constraint.run,
        "v005_bhxh_insurance_setup": v005_bhxh_insurance_setup.run,
        "v006_employer_bhxh": v006_employer_bhxh.run,
        "v007_fix_jv_and_bh_accounts": v007_fix_jv_and_bh_accounts.run,
        "v008_fix_venue_unique_constraint": v008_fix_venue_unique_constraint.run,
        "v009_more_assistant_fields": v009_more_assistant_fields.run,
        "v010_link_projects_to_sales_orders": v010_link_projects_to_sales_orders.run,
        "v011_backfill_venue_and_lead_planner": v011_backfill_venue_and_lead_planner.run,
        "v012_addon_fields": v012_addon_fields.run,
        "v013_sales_role": v013_sales_role.run,
        "v014_fix_addon_items_non_stock": v014_fix_addon_items_non_stock.run,
        "v015_employee_set_value_script": v015_employee_set_value_script.run,
        "v016_update_employee_script": v016_update_employee_script.run,
        "v017_stock_settings_default_warehouse": v017_stock_settings_default_warehouse.run,
        "v018_review_history_doctype": v018_review_history_doctype.run,
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
