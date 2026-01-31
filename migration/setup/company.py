"""
Setup: company
Creates the Meraki Wedding Planner company in ERPNext.
"""

from core.erpnext_client import ERPNextClient


COMPANY_NAME = 'Meraki Wedding Planner'
COMPANY_ABBR = 'MWP'


def create_company(erp: ERPNextClient) -> bool:
    """Create the company if it doesn't exist."""
    existing = erp.find_one('Company', {'name': COMPANY_NAME})
    if existing:
        print(f"  Company already exists: {COMPANY_NAME}")
        return True

    data = {
        'company_name': COMPANY_NAME,
        'abbr': COMPANY_ABBR,
        'default_currency': 'VND',
        'country': 'Vietnam',
        'create_chart_of_accounts_based_on': 'Standard Template',
    }

    result = erp.create('Company', data)
    if result:
        print(f"  Created Company: {COMPANY_NAME} ({COMPANY_ABBR})")
        return True
    else:
        print(f"  Failed to create Company: {COMPANY_NAME}")
        return False


if __name__ == "__main__":
    from core.config import get_config, validate_config

    print("=" * 60)
    print("CREATE COMPANY")
    print("=" * 60)

    config = get_config()
    if not validate_config(config):
        print("\nAborted due to configuration errors.")
        exit(1)

    erp = ERPNextClient(config['erpnext'])

    if create_company(erp):
        print("\nCompany created successfully")
    else:
        print("\nFailed to create company")
        exit(1)
