def run(client):
    existing = client.get_list("Custom Field",
        filters={"dt": "Supplier", "fieldname": "custom_venue_type"}, limit=1)
    if not existing:
        client.create("Custom Field", {
            "dt": "Supplier", "fieldname": "custom_venue_type",
            "label": "Venue Type", "fieldtype": "Select",
            "options": "Hotel\nEvent Hall\nRestaurant\nBeach\nOutdoor Garden\nRooftop\nOther",
            "insert_after": "custom_venue_city", "hidden": 0,
        })
    print("v022: Done.")
