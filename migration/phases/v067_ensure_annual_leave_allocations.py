"""Ensure all active employees have an Annual Leave allocation (12 days)."""


def run(client):
    FROM_DATE = "2026-01-01"
    TO_DATE = "2027-07-31"
    DAYS = 12

    employees = client.get_list(
        "Employee",
        filters=[["status", "=", "Active"]],
        fields=["name", "employee_name"],
        limit=200,
    )

    created = 0
    skipped = 0
    for emp in employees:
        existing = client.get_list(
            "Leave Allocation",
            filters=[
                ["employee", "=", emp["name"]],
                ["leave_type", "=", "Annual Leave"],
                ["from_date", "=", FROM_DATE],
                ["to_date", "=", TO_DATE],
                ["docstatus", "!=", 2],
            ],
            fields=["name"],
            limit=1,
        )
        if existing:
            skipped += 1
            continue

        alloc = client.create("Leave Allocation", {
            "employee": emp["name"],
            "leave_type": "Annual Leave",
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
            print(f"  Created Annual Leave allocation for {emp['employee_name']}")

    print(f"  Annual Leave allocations: {created} created, {skipped} already existed")
