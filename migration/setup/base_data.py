"""
Setup: base_data
Seeds basic ERPNext data required for migrations (warehouse types, UOMs, etc.)
"""

from core.erpnext_client import ERPNextClient


def seed_warehouse_types(erp: ERPNextClient) -> bool:
    """Create required warehouse types."""
    types = ['Transit', 'Work In Progress', 'Finished Goods', 'Stores', 'Sample']

    for wh_type in types:
        if erp.exists('Warehouse Type', {'name': wh_type}):
            print(f"    Warehouse Type exists: {wh_type}")
            continue

        result = erp.create('Warehouse Type', {'name': wh_type})
        if result:
            print(f"    Created Warehouse Type: {wh_type}")
        else:
            print(f"    Failed to create Warehouse Type: {wh_type}")

    return True


def seed_uom(erp: ERPNextClient) -> bool:
    """Create basic Units of Measure."""
    uoms = [
        {'uom_name': 'Unit', 'must_be_whole_number': 1},
        {'uom_name': 'Package', 'must_be_whole_number': 1},
        {'uom_name': 'Service', 'must_be_whole_number': 1},
        {'uom_name': 'Hour', 'must_be_whole_number': 0},
        {'uom_name': 'Day', 'must_be_whole_number': 0},
    ]

    for uom in uoms:
        if erp.exists('UOM', {'uom_name': uom['uom_name']}):
            print(f"    UOM exists: {uom['uom_name']}")
            continue

        result = erp.create('UOM', uom)
        if result:
            print(f"    Created UOM: {uom['uom_name']}")
        else:
            print(f"    Failed to create UOM: {uom['uom_name']}")

    return True


def seed_territory(erp: ERPNextClient) -> bool:
    """Create Vietnam territory."""
    if erp.exists('Territory', {'territory_name': 'Vietnam'}):
        print(f"    Territory exists: Vietnam")
        return True

    data = {
        'territory_name': 'Vietnam',
        'parent_territory': 'All Territories',
    }

    result = erp.create('Territory', data)
    if result:
        print(f"    Created Territory: Vietnam")
    else:
        print(f"    Failed to create Territory: Vietnam")

    return True


def seed_base_data(erp: ERPNextClient) -> bool:
    """Run all base data seeding steps."""
    print("  Creating Warehouse Types...")
    seed_warehouse_types(erp)

    print("  Creating Units of Measure...")
    seed_uom(erp)

    print("  Creating Territory...")
    seed_territory(erp)

    return True


if __name__ == "__main__":
    from core.config import get_config, validate_config

    print("=" * 60)
    print("SEED BASE DATA")
    print("=" * 60)

    config = get_config()
    if not validate_config(config):
        print("\nAborted due to configuration errors.")
        exit(1)

    erp = ERPNextClient(config['erpnext'])
    seed_base_data(erp)

    print("\nBase data seeded successfully")
