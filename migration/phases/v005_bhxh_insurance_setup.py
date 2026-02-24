from modules.insurance_setup import setup


def run(client):
    """Set up Vietnamese social insurance (BHXH) deductions.

    - Creates custom_insurance_salary field on Employee
    - Creates BHXH/BHYT/BHTN salary components
    - Amends Monthly Salary structure to include deduction rows
    - Populates custom_insurance_salary on all employees from their base salary
    """
    success = setup(client)
    if not success:
        raise RuntimeError("BHXH insurance setup failed — check logs above")
