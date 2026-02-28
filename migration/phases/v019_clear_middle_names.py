"""
Clear middle_name field on all Employee records.
The business does not use middle names — first + last name only.
"""

def run(client):
    print("v019: Clearing middle_name on all employees...")
    employees = client.get_list("Employee", fields=["name", "middle_name"], limit=0)
    count = 0
    for emp in employees:
        if emp.get("middle_name"):
            client.update("Employee", emp["name"], {"middle_name": ""})
            count += 1
    print(f"v019: Cleared middle_name on {count} employee(s). Done.")
