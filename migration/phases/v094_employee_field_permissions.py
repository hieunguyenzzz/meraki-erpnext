"""Lock down sensitive Employee fields to HR/Finance (MWP-68).

Background: every Custom DocPerm row on Employee sits at permlevel 0, and
every field (salary, bank details, DOB, address, commission %, etc.) is also
at permlevel 0. Combined with Employee Self Service holding read=1/write=1 at
that level, any logged-in staff member can read and write a colleague's
bank account, CTC, PIT dependents, commission rates and personal contact
details via the plain ERPNext REST API — not just their own record.

Fix:
1. Move salary/bank/government-ID/personal-contact fields to permlevel 1
   (HR only).
2. Move commission % and allowance fields to permlevel 2 (HR full access,
   Finance read-only).
3. Add Custom DocPerm rows granting HR Manager/HR User read+write at levels
   1 and 2, and Accounts Manager/Accounts User read-only at level 2.
4. Revoke Employee Self Service's level-0 write (self-service writes now go
   through the /me/profile backend endpoint instead, which uses the admin
   API key and bypasses field permlevels for the caller's own record only —
   see webhook_v2/routers/me.py).
5. Extend the meraki_set_employee_fields Server Script's ALLOWED_FIELDS so
   that backend endpoint can still write the self-profile fields via
   frappe.db.set_value (bypasses the link validation a full doc.save() would
   trigger — see migration history, originally added in the now-removed
   v015 phase).

No System Manager row exists at permlevel 0 on Employee (verified against
both the standard DocPerm fixture and live Custom DocPerm), so none is added
at levels 1/2 either — mirroring "whatever level-0 access exists" leaves it
untouched; Administrator bypasses all permission checks regardless.

Code review (MWP-68 PR #43) flagged a second gap: health/personal-background
fields and exit-record fields were still readable by every colleague
(including via the single-doc GET, which has no field filter at all). Also
moved here:
- Personal/health narrative: family_background, health_details,
  marital_status, blood_group.
- Exit record: reason_for_leaving, feedback, held_on (exit interview date),
  new_workplace, leave_encashed, encashment_date. relieving_date and
  resignation_letter_date are included too — both mark an employee's actual
  departure date and are part of the same exit record, not just
  operationally-relevant metadata (relieving_date is only edited by HR on
  EmployeeDetailPage today — grepped the frontend, no non-HR page reads it).
- custom_sales_commission_pct moves from 0 to 2 with the other commission
  fields — it's legacy/superseded in the UI but still in
  meraki_set_employee_fields's ALLOWED_FIELDS and still carries live values.

Fields considered but left at permlevel 0 (out of the salary/bank/
government-ID/exit-record scope this phase targets): attendance_device_id
(a biometric/RF tag id, not a government ID).
"""

STANDARD_FIELD_PERMLEVELS = {
    # Salary / bank
    "ctc": 1,
    "salary_mode": 1,
    "salary_currency": 1,
    "bank_name": 1,
    "bank_ac_no": 1,
    "iban": 1,
    # Government ID (passport)
    "passport_number": 1,
    "date_of_issue": 1,
    "valid_upto": 1,
    "place_of_issue": 1,
    # Personal contact / address
    "date_of_birth": 1,
    "current_address": 1,
    "permanent_address": 1,
    "cell_number": 1,
    "personal_email": 1,
    "person_to_be_contacted": 1,
    "relation": 1,
    "emergency_phone_number": 1,
    # Personal / health narrative
    "family_background": 1,
    "health_details": 1,
    "marital_status": 1,
    "blood_group": 1,
    # Exit record
    "reason_for_leaving": 1,
    "feedback": 1,
    "held_on": 1,
    "new_workplace": 1,
    "leave_encashed": 1,
    "encashment_date": 1,
    "relieving_date": 1,
    "resignation_letter_date": 1,
}

CUSTOM_FIELD_PERMLEVELS = {
    # Salary / government-ID adjacent
    "custom_insurance_salary": 1,
    "custom_number_of_dependents": 1,
    "custom_pit_method": 1,
    "health_insurance_no": 1,
    "health_insurance_provider": 1,
    # Commission / allowance — HR full, Finance read-only
    "custom_lead_commission_pct": 2,
    "custom_support_commission_pct": 2,
    "custom_assistant_commission_pct": 2,
    "custom_full_package_commission_pct": 2,
    "custom_partial_package_commission_pct": 2,
    "custom_allowance_hcm_full": 2,
    "custom_allowance_hcm_partial": 2,
    "custom_allowance_dest_full": 2,
    "custom_allowance_dest_partial": 2,
    "custom_sales_commission_pct": 2,
}

# (role, permlevel, read, write)
DOCPERM_ROWS = [
    ("HR Manager", 1, 1, 1),
    ("HR User", 1, 1, 1),
    ("HR Manager", 2, 1, 1),
    ("HR User", 2, 1, 1),
    ("Accounts Manager", 2, 1, 0),
    ("Accounts User", 2, 1, 0),
]

# Fields MyProfilePage lets an employee edit on themselves (see
# webhook_v2/routers/me.py). Not yet in meraki_set_employee_fields's
# ALLOWED_FIELDS — added here so the self-service endpoint can write them.
SELF_PROFILE_FIELDS = [
    "cell_number",
    "personal_email",
    "current_address",
    "permanent_address",
    "person_to_be_contacted",
    "relation",
    "emergency_phone_number",
    "bank_name",
    "bank_ac_no",
]


def _set_standard_field_permlevels(client):
    for fieldname, level in STANDARD_FIELD_PERMLEVELS.items():
        name = f"Employee-{fieldname}-permlevel"
        existing = client.get("Property Setter", name)
        if existing and str(existing.get("value")) == str(level):
            print(f"  Property Setter {name} already at permlevel {level}, skipping")
            continue
        if existing:
            client.update("Property Setter", name, {"value": str(level)})
            print(f"  Updated Property Setter {name} -> permlevel {level}")
        else:
            client.create("Property Setter", {
                "doctype_or_field": "DocField",
                "doc_type": "Employee",
                "field_name": fieldname,
                "property": "permlevel",
                "value": str(level),
                "property_type": "Int",
            })
            print(f"  Created Property Setter {name} -> permlevel {level}")


def _set_custom_field_permlevels(client):
    for fieldname, level in CUSTOM_FIELD_PERMLEVELS.items():
        cf_name = f"Employee-{fieldname}"
        cf = client.get("Custom Field", cf_name)
        if not cf:
            print(f"  WARNING: Custom Field {cf_name} not found, skipping")
            continue
        if cf.get("permlevel") == level:
            print(f"  Custom Field {cf_name} already at permlevel {level}, skipping")
            continue
        client.update("Custom Field", cf_name, {"permlevel": level})
        print(f"  Updated Custom Field {cf_name} -> permlevel {level}")


def _set_docperm_rows(client):
    existing_rows = client.get_list(
        "Custom DocPerm",
        filters={"parent": "Employee"},
        fields=["name", "role", "permlevel", "read", "write"],
    )
    for role, level, read, write in DOCPERM_ROWS:
        match = next(
            (r for r in existing_rows if r["role"] == role and r["permlevel"] == level),
            None,
        )
        if match:
            if match.get("read") == read and match.get("write") == write:
                print(f"  Custom DocPerm {role}@{level} already read={read} write={write}, skipping")
                continue
            client.update("Custom DocPerm", match["name"], {"read": read, "write": write})
            print(f"  Updated Custom DocPerm {role}@{level} -> read={read} write={write}")
        else:
            client.create("Custom DocPerm", {
                "parent": "Employee",
                "parenttype": "DocType",
                "parentfield": "permissions",
                "role": role,
                "permlevel": level,
                "read": read,
                "write": write,
            })
            print(f"  Created Custom DocPerm {role}@{level} read={read} write={write}")

    ess_row = next(
        (r for r in existing_rows if r["role"] == "Employee Self Service" and r["permlevel"] == 0),
        None,
    )
    if not ess_row:
        print("  WARNING: no Employee Self Service level-0 Custom DocPerm row found, nothing to lock down")
    elif ess_row.get("write") == 0:
        print("  Employee Self Service level-0 write already 0, skipping")
    else:
        client.update("Custom DocPerm", ess_row["name"], {"write": 0})
        print("  Set Employee Self Service level-0 write=0")


def _extend_set_employee_fields_script(client):
    doc = client.get("Server Script", "meraki-set-employee-fields")
    if not doc:
        print("  WARNING: meraki-set-employee-fields Server Script not found, skipping self-profile allowlist")
        return

    script = doc.get("script", "")
    missing = [f for f in SELF_PROFILE_FIELDS if f'"{f}"' not in script]
    if not missing:
        print("  meraki-set-employee-fields already allows all self-profile fields, skipping")
        return

    anchor = "}\nDATE_FIELDS"
    if anchor not in script:
        print("  WARNING: could not find ALLOWED_FIELDS end marker in meraki-set-employee-fields, skipping")
        return

    insertion = "".join(f'    "{f}",\n' for f in missing)
    new_script = script.replace(anchor, insertion + anchor, 1)
    client.update("Server Script", "meraki-set-employee-fields", {"script": new_script})
    print(f"  Added to meraki-set-employee-fields ALLOWED_FIELDS: {', '.join(missing)}")


def run(client):
    _set_standard_field_permlevels(client)
    _set_custom_field_permlevels(client)
    _set_docperm_rows(client)
    _extend_set_employee_fields_script(client)
