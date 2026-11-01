"""Skip BHXH/BHYT/BHTN for the month when the employee left before the 15th (relieving_date day 1-14)."""

EARLY_LEAVER = (
    "(relieving_date and getdate(start_date) <= getdate(relieving_date) <= getdate(end_date)"
    " and getdate(relieving_date).day < 15)"
)

FORMULA_UPDATES = {
    # Deductions
    "BHXH (Employee)": f"custom_insurance_salary * 0.08 if not custom_is_probation and not {EARLY_LEAVER} else 0",
    "BHYT (Employee)": f"custom_insurance_salary * 0.015 if not custom_is_probation and not {EARLY_LEAVER} else 0",
    "BHTN (Employee)": f"custom_insurance_salary * 0.01 if not custom_is_probation and not {EARLY_LEAVER} else 0",
    "BHXH Employer Payable": f"custom_insurance_salary * 0.175 if not custom_is_probation and not {EARLY_LEAVER} else 0",
    "BHYT Employer Payable": f"custom_insurance_salary * 0.03 if not custom_is_probation and not {EARLY_LEAVER} else 0",
    "BHTN Employer Payable": f"custom_insurance_salary * 0.01 if not custom_is_probation and not {EARLY_LEAVER} else 0",
    # Earnings
    "BHXH Employer Expense": f"custom_insurance_salary * 0.175 if not custom_is_probation and not {EARLY_LEAVER} else 0",
    "BHYT Employer Expense": f"custom_insurance_salary * 0.03 if not custom_is_probation and not {EARLY_LEAVER} else 0",
    "BHTN Employer Expense": f"custom_insurance_salary * 0.01 if not custom_is_probation and not {EARLY_LEAVER} else 0",
}

SALARY_STRUCTURE = "Monthly Salary"


def run(client):
    ss = client.get("Salary Structure", SALARY_STRUCTURE)
    if not ss:
        print(f"  ERROR: Salary Structure '{SALARY_STRUCTURE}' not found")
        return

    updated = 0
    for section in ("earnings", "deductions"):
        for row in ss.get(section, []):
            comp = row.get("salary_component", "")
            if comp in FORMULA_UPDATES:
                new_formula = FORMULA_UPDATES[comp]
                if row.get("formula") != new_formula:
                    row["formula"] = new_formula
                    updated += 1

    if updated == 0:
        print("  Salary Structure formulas already have early-leaver check, skipping")
        return

    client.update("Salary Structure", SALARY_STRUCTURE, {
        "earnings": ss["earnings"],
        "deductions": ss["deductions"],
    })
    print(f"  Updated {updated} BHXH formulas with early-leaver check")
