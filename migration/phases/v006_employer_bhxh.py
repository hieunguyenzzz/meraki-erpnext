"""
v006: Employer BHXH dual-component setup.

Vietnam employer social insurance rates (2026):
  BHXH: 17.5%, BHYT: 3%, BHTN: 1%

Each contribution uses a pair of components:
  - Expense (Earning, do_not_include_in_total=1): records the employer cost in GL
  - Payable (Deduction, do_not_include_in_total=1): records the liability in GL

Both sides cancel each other in net pay, showing the expense and payable separately
in accounting without affecting the employee's take-home salary.
"""

import json
import uuid
import os

COMPANY = "Meraki Wedding Planner"
COMPANY_ABBR = "MWP"

SITE_CONFIG_PATH = os.getenv(
    "FRAPPE_SITE_CONFIG",
    "/home/frappe/frappe-bench/sites/erp.merakiwp.com/site_config.json",
)

# GL accounts to create (check existence before creating)
GL_ACCOUNTS = [
    {
        "account_name": "Social Insurance Expense",
        "account_type": "Expense Account",
        "root_type": "Expense",
        "parent_account": f"Indirect Expenses - {COMPANY_ABBR}",
    },
    {
        "account_name": "BHXH Payable - Employer",
        "account_type": "Payable",
        "root_type": "Liability",
        "parent_account": f"Current Liabilities - {COMPANY_ABBR}",
    },
    {
        "account_name": "BHYT Payable - Employer",
        "account_type": "Payable",
        "root_type": "Liability",
        "parent_account": f"Current Liabilities - {COMPANY_ABBR}",
    },
    {
        "account_name": "BHTN Payable - Employer",
        "account_type": "Payable",
        "root_type": "Liability",
        "parent_account": f"Current Liabilities - {COMPANY_ABBR}",
    },
    # Employee-side payable accounts (for linking to existing employee components)
    {
        "account_name": "BHXH Payable - Employee",
        "account_type": "Payable",
        "root_type": "Liability",
        "parent_account": f"Current Liabilities - {COMPANY_ABBR}",
    },
    {
        "account_name": "BHYT Payable - Employee",
        "account_type": "Payable",
        "root_type": "Liability",
        "parent_account": f"Current Liabilities - {COMPANY_ABBR}",
    },
    {
        "account_name": "BHTN Payable - Employee",
        "account_type": "Payable",
        "root_type": "Liability",
        "parent_account": f"Current Liabilities - {COMPANY_ABBR}",
    },
]

# 6 new employer components: (expense, payable) pairs per insurance type
EMPLOYER_COMPONENTS = [
    {
        "salary_component": "BHXH Employer Expense",
        "salary_component_abbr": "BHXHE",
        "type": "Earning",
        "formula": "custom_insurance_salary * 0.175",
        "gl_account": f"Social Insurance Expense - {COMPANY_ABBR}",
        "parentfield": "earnings",
    },
    {
        "salary_component": "BHXH Employer Payable",
        "salary_component_abbr": "BHXHEP",
        "type": "Deduction",
        "formula": "custom_insurance_salary * 0.175",
        "gl_account": f"BHXH Payable - Employer - {COMPANY_ABBR}",
        "parentfield": "deductions",
    },
    {
        "salary_component": "BHYT Employer Expense",
        "salary_component_abbr": "BHYTE",
        "type": "Earning",
        "formula": "custom_insurance_salary * 0.03",
        "gl_account": f"Social Insurance Expense - {COMPANY_ABBR}",
        "parentfield": "earnings",
    },
    {
        "salary_component": "BHYT Employer Payable",
        "salary_component_abbr": "BHYTEP",
        "type": "Deduction",
        "formula": "custom_insurance_salary * 0.03",
        "gl_account": f"BHYT Payable - Employer - {COMPANY_ABBR}",
        "parentfield": "deductions",
    },
    {
        "salary_component": "BHTN Employer Expense",
        "salary_component_abbr": "BHTNE",
        "type": "Earning",
        "formula": "custom_insurance_salary * 0.01",
        "gl_account": f"Social Insurance Expense - {COMPANY_ABBR}",
        "parentfield": "earnings",
    },
    {
        "salary_component": "BHTN Employer Payable",
        "salary_component_abbr": "BHTNEP",
        "type": "Deduction",
        "formula": "custom_insurance_salary * 0.01",
        "gl_account": f"BHTN Payable - Employer - {COMPANY_ABBR}",
        "parentfield": "deductions",
    },
]

# Existing employee components need GL accounts set
EMPLOYEE_COMPONENT_ACCOUNTS = [
    ("BHXH (Employee)", f"BHXH Payable - Employee - {COMPANY_ABBR}"),
    ("BHYT (Employee)", f"BHYT Payable - Employee - {COMPANY_ABBR}"),
    ("BHTN (Employee)", f"BHTN Payable - Employee - {COMPANY_ABBR}"),
]


def _account_full_name(account_name: str) -> str:
    return f"{account_name} - {COMPANY_ABBR}"


def _ensure_gl_account(erp, account: dict) -> bool:
    full_name = _account_full_name(account["account_name"])
    if erp.exists("Account", {"name": full_name}):
        print(f"    Account exists: {full_name}")
        return True

    result = erp.create("Account", {
        "account_name": account["account_name"],
        "account_type": account["account_type"],
        "root_type": account["root_type"],
        "parent_account": account["parent_account"],
        "company": COMPANY,
        "is_group": 0,
    })
    if result:
        print(f"    Created account: {full_name}")
        return True
    print(f"    Failed to create account: {full_name}")
    return False


def _ensure_salary_component(erp, comp: dict) -> bool:
    name = comp["salary_component"]
    if erp.exists("Salary Component", {"name": name}):
        print(f"    Salary component exists: {name}")
        return True

    accounts_entry = {
        "company": COMPANY,
        "account": comp["gl_account"],
    }

    result = erp.create("Salary Component", {
        "salary_component": name,
        "salary_component_abbr": comp["salary_component_abbr"],
        "type": comp["type"],
        "formula": comp["formula"],
        "amount_based_on_formula": 1,
        "do_not_include_in_total": 1,
        "depends_on_payment_days": 0,
        "accounts": [accounts_entry],
    })
    if result:
        print(f"    Created salary component: {name}")
        return True
    print(f"    Failed to create salary component: {name}")
    return False


def _set_employee_component_account(erp, component_name: str, gl_account: str) -> None:
    comp = erp.get("Salary Component", component_name)
    if not comp:
        print(f"    Salary component not found: {component_name}")
        return

    existing_accounts = comp.get("accounts") or []
    has_account = any(
        a.get("company") == COMPANY for a in existing_accounts
    )
    if has_account:
        print(f"    {component_name} already has company GL account")
        return

    updated_accounts = existing_accounts + [{"company": COMPANY, "account": gl_account}]
    result = erp.update("Salary Component", component_name, {"accounts": updated_accounts})
    if result:
        print(f"    Set GL account on {component_name}: {gl_account}")
    else:
        print(f"    Failed to set GL account on {component_name}")


def _get_db_connection():
    """Connect to MariaDB using credentials from Frappe site_config.json."""
    import pymysql

    with open(SITE_CONFIG_PATH) as f:
        config = json.load(f)

    return pymysql.connect(
        host="db",
        user=config["db_name"],
        password=config["db_password"],
        database=config["db_name"],
        charset="utf8mb4",
        autocommit=True,
    )


def _get_current_max_idx(conn, parent: str, parentfield: str) -> int:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COALESCE(MAX(idx), 0) FROM `tabSalary Detail` WHERE parent = %s AND parentfield = %s",
            (parent, parentfield),
        )
        row = cur.fetchone()
        return row[0] if row else 0


def _structure_has_component(conn, parent: str, abbr: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM `tabSalary Detail` WHERE parent = %s AND abbr = %s",
            (parent, abbr),
        )
        row = cur.fetchone()
        return (row[0] if row else 0) > 0


def _insert_salary_detail(
    conn,
    parent: str,
    parentfield: str,
    idx: int,
    salary_component: str,
    abbr: str,
    formula: str,
) -> None:
    row_name = str(uuid.uuid4())
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO `tabSalary Detail`
                (name, parent, parentfield, parenttype, idx,
                 salary_component, abbr, formula,
                 amount_based_on_formula, do_not_include_in_total,
                 depends_on_payment_days, creation, modified, modified_by, owner, docstatus)
            VALUES
                (%s, %s, %s, 'Salary Structure', %s,
                 %s, %s, %s,
                 1, 1,
                 0, NOW(), NOW(), 'Administrator', 'Administrator', 1)
            """,
            (row_name, parent, parentfield, idx, salary_component, abbr, formula),
        )
    print(f"    Inserted {parentfield} row: {salary_component} ({abbr}) idx={idx}")


def _add_employer_components_to_structure(ss_name: str) -> bool:
    """Insert employer components directly into the submitted salary structure via DB."""
    try:
        conn = _get_db_connection()
    except Exception as e:
        print(f"    DB connection failed: {e}")
        return False

    try:
        for comp in EMPLOYER_COMPONENTS:
            abbr = comp["salary_component_abbr"]
            parentfield = comp["parentfield"]

            if _structure_has_component(conn, ss_name, abbr):
                print(f"    Already in structure: {comp['salary_component']} ({abbr})")
                continue

            next_idx = _get_current_max_idx(conn, ss_name, parentfield) + 1
            _insert_salary_detail(
                conn,
                parent=ss_name,
                parentfield=parentfield,
                idx=next_idx,
                salary_component=comp["salary_component"],
                abbr=abbr,
                formula=comp["formula"],
            )
    finally:
        conn.close()

    return True


def run(client):
    """Set up employer BHXH dual-component accounting in ERPNext.

    Creates GL accounts, salary components, and inserts employer contribution
    rows into the active Monthly Salary structure via direct DB write.
    """
    # Step 1: GL accounts
    print("  Creating GL accounts...")
    for account in GL_ACCOUNTS:
        if not _ensure_gl_account(client, account):
            raise RuntimeError(f"Failed to create GL account: {account['account_name']}")

    # Step 2: Employer salary components
    print("  Creating employer salary components...")
    for comp in EMPLOYER_COMPONENTS:
        if not _ensure_salary_component(client, comp):
            raise RuntimeError(f"Failed to create salary component: {comp['salary_component']}")

    # Step 3: Set GL accounts on existing employee components
    print("  Setting GL accounts on employee components...")
    for component_name, gl_account in EMPLOYEE_COMPONENT_ACCOUNTS:
        _set_employee_component_account(client, component_name, gl_account)

    # Step 4: Insert employer components into Monthly Salary structure via DB
    print("  Adding employer components to Monthly Salary structure...")
    success = _add_employer_components_to_structure("Monthly Salary")
    if not success:
        raise RuntimeError("Failed to insert employer components into salary structure")

    print("  v006 employer BHXH setup complete.")
