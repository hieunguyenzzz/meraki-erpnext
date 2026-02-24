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
    from phases import v001_wedding_venues, v002_wedding_service_item, v003_wedding_service_item_fix, v004_remove_meraki_id_unique_constraint, v005_bhxh_insurance_setup, v006_employer_bhxh, v007_fix_jv_and_bh_accounts

    phase_fns = {
        "v001_wedding_venues": v001_wedding_venues.run,
        "v002_wedding_service_item": v002_wedding_service_item.run,
        "v003_wedding_service_item_fix": v003_wedding_service_item_fix.run,
        "v004_remove_meraki_id_unique_constraint": v004_remove_meraki_id_unique_constraint.run,
        "v005_bhxh_insurance_setup": v005_bhxh_insurance_setup.run,
        "v006_employer_bhxh": v006_employer_bhxh.run,
        "v007_fix_jv_and_bh_accounts": v007_fix_jv_and_bh_accounts.run,
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
