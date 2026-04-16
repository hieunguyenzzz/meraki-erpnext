"""Enable unlimited Sick Leave: allow_negative_balance + allocations for all active employees."""


def run(client):
    # 1. Update Sick Leave leave type
    lt = client.get("Leave Type", "Sick Leave")
    if not lt:
        print("  ERROR: Leave Type 'Sick Leave' not found")
        return

    updates = {}
    if not lt.get("allow_negative_balance"):
        updates["allow_negative_balance"] = 1
    # include_holiday=1 is currently set — keep it as-is (company policy)

    if updates:
        client.update("Leave Type", "Sick Leave", updates)
        print(f"  Updated Sick Leave: {updates}")
    else:
        print("  Sick Leave already has allow_negative_balance=1")

    # 2. Create Sick Leave allocations for all active employees
    #    Use the same broad period as Annual Leave (Jan 2026 – Jul 2027)
    FROM_DATE = "2026-01-01"
    TO_DATE = "2027-07-31"
    DAYS = 365

    employees = client.get_list(
        "Employee",
        filters=[["status", "=", "Active"]],
        fields=["name", "employee_name"],
        limit=200,
    )

    created = 0
    skipped = 0
    for emp in employees:
        # Check if allocation already exists for this employee + period
        existing = client.get_list(
            "Leave Allocation",
            filters=[
                ["employee", "=", emp["name"]],
                ["leave_type", "=", "Sick Leave"],
                ["from_date", "=", FROM_DATE],
                ["to_date", "=", TO_DATE],
                ["docstatus", "!=", 2],  # not cancelled
            ],
            fields=["name"],
            limit=1,
        )
        if existing:
            skipped += 1
            continue

        alloc = client.create("Leave Allocation", {
            "employee": emp["name"],
            "leave_type": "Sick Leave",
            "from_date": FROM_DATE,
            "to_date": TO_DATE,
            "new_leaves_allocated": DAYS,
        })
        if alloc:
            alloc_name = alloc.get("name", "")
            if alloc_name:
                # Re-fetch full doc then submit (avoids TimestampMismatchError)
                fresh = client.get("Leave Allocation", alloc_name)
                if fresh:
                    fresh["docstatus"] = 1
                    try:
                        import requests as _req
                        _req.post(
                            f"{client.url}/api/method/frappe.client.submit",
                            headers=client._get_headers(),
                            json={"doc": fresh},
                            timeout=30,
                        )
                    except Exception as e:
                        print(f"  WARNING: Could not submit {alloc_name}: {e}")
            created += 1

    print(f"  Sick Leave allocations: {created} created, {skipped} already existed")
