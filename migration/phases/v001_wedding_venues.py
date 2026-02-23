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
    if not client.exists("Supplier Group", {"supplier_group_name": "Wedding Venues"}):
        client.create("Supplier Group", {
            "supplier_group_name": "Wedding Venues",
        })
        print("  Created supplier group: Wedding Venues")

    created = 0
    for name in VENUES:
        if not client.exists("Supplier", {"supplier_name": name.strip(), "supplier_group": "Wedding Venues"}):
            client.create("Supplier", {
                "supplier_name": name.strip(),
                "supplier_group": "Wedding Venues",
                "supplier_type": "Company",
            })
            created += 1

    print(f"  Venues: {created} created, {len(VENUES) - created} already existed")
