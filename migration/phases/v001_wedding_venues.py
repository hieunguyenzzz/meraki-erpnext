VENUES = [
    "4 Seasons", "Amanoi", "An Lâm", "Ana Mandara ĐL", "Du Thuyền",
    "ĐL Palace", "GEM ", "Hoiana", "Hyatt Regency", "ICDN", "ICPQ",
    "JWPQ", "JWSG", "Lavella", "Legacy", "Mai House", "Maia", "MGallery",
    "Mia Nha Trang", "Mia SG", "Mira", "Movempick", "Nam An", "New World",
    "Nikko", "Park Hyatt", "Pullman", "Regent", "Shilla",
    "The Anam Cam Ranh", "The Campville", "The Deck", "Thisky ",
    "Tư Gia", "White Palace",
]


def run(client):
    # Remove unique constraint from custom_meraki_venue_id so seed suppliers
    # (which have no Meraki ID) don't collide with the INT default value of 0.
    if client.exists("Custom Field", {"dt": "Supplier", "fieldname": "custom_meraki_venue_id"}):
        client.update("Custom Field", "Supplier-custom_meraki_venue_id", {"unique": 0})
        print("  Removed unique constraint from custom_meraki_venue_id")

    if not client.exists("Supplier Group", {"supplier_group_name": "Wedding Venues"}):
        client.create("Supplier Group", {
            "supplier_group_name": "Wedding Venues",
        })
        print("  Created supplier group: Wedding Venues")

    created = 0
    for name in VENUES:
        if not client.exists("Supplier", {"supplier_name": name.strip(), "supplier_group": "Wedding Venues"}):
            result = client.create("Supplier", {
                "supplier_name": name.strip(),
                "supplier_group": "Wedding Venues",
                "supplier_type": "Company",
            })
            if result:
                created += 1

    print(f"  Venues: {created} created, {len(VENUES) - created} already existed")
