"""
Setup: currency
Configures VND currency, exchange rates, and price lists.
"""

from core.erpnext_client import ERPNextClient


COMPANY = 'Meraki Wedding Planner'


def setup_company_currency(erp: ERPNextClient) -> bool:
    """Update company to use VND as default currency."""
    print("  Updating company currency to VND...")

    result = erp.update('Company', COMPANY, {'default_currency': 'VND'})
    if result:
        print(f"    Company currency set to VND")
        return True
    else:
        print(f"    Failed to update company currency")
        return False


def create_currency_exchange(erp: ERPNextClient, from_currency: str, to_currency: str, rate: float) -> bool:
    """Create a currency exchange rate."""
    existing = erp.find_one('Currency Exchange', {
        'from_currency': from_currency,
        'to_currency': to_currency
    })

    if existing:
        print(f"    Currency Exchange exists: {from_currency} -> {to_currency}")
        return True

    data = {
        'from_currency': from_currency,
        'to_currency': to_currency,
        'exchange_rate': rate,
    }

    result = erp.create('Currency Exchange', data)
    if result:
        print(f"    Created Currency Exchange: {from_currency} -> {to_currency} = {rate}")
        return True
    else:
        print(f"    Failed to create Currency Exchange: {from_currency} -> {to_currency}")
        return False


def create_price_list(erp: ERPNextClient) -> bool:
    """Create a standard selling price list for VND."""
    price_list_name = 'Standard Selling VND'

    existing = erp.get('Price List', price_list_name)
    if existing:
        print(f"    Price List exists: {price_list_name}")
        return True

    data = {
        'price_list_name': price_list_name,
        'currency': 'VND',
        'enabled': 1,
        'buying': 0,
        'selling': 1,
    }

    result = erp.create('Price List', data)
    if result:
        print(f"    Created Price List: {price_list_name}")
        return True
    else:
        print(f"    Failed to create Price List: {price_list_name}")
        return False


def setup_currency(erp: ERPNextClient) -> bool:
    """Run all currency setup steps."""
    print("  Setting up currency...")
    setup_company_currency(erp)

    print("  Creating Currency Exchange rates...")
    create_currency_exchange(erp, 'VND', 'VND', 1.0)

    print("  Creating Price List...")
    create_price_list(erp)

    return True


if __name__ == "__main__":
    from core.config import get_config, validate_config

    print("=" * 60)
    print("CURRENCY SETUP")
    print("=" * 60)

    config = get_config()
    if not validate_config(config):
        print("\nAborted due to configuration errors.")
        exit(1)

    erp = ERPNextClient(config['erpnext'])
    setup_currency(erp)

    print("\nCurrency setup complete")
