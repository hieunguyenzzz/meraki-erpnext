"""Create 'Company Insurance Contribution' salary component for employees with zero salary but active insurance."""


def run(client):
    comp_name = "Company Insurance Contribution"
    existing = client.exists("Salary Component", comp_name)
    if existing:
        print(f"  Salary Component '{comp_name}' already exists, skipping")
        return
    client.create("Salary Component", {
        "name": comp_name,
        "salary_component": comp_name,
        "salary_component_abbr": "CIC",
        "type": "Earning",
        "is_tax_applicable": 0,
        "is_flexible_benefit": 0,
    })
    print(f"  Created Salary Component '{comp_name}'")
