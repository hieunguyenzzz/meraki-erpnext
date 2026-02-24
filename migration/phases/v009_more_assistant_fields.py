def run(client):
    new_fields = [
        {"dt": "Project", "fieldname": "custom_assistant_3", "label": "Assistant 3",
         "fieldtype": "Link", "options": "Employee", "insert_after": "custom_assistant_2"},
        {"dt": "Project", "fieldname": "custom_assistant_4", "label": "Assistant 4",
         "fieldtype": "Link", "options": "Employee", "insert_after": "custom_assistant_3"},
        {"dt": "Project", "fieldname": "custom_assistant_5", "label": "Assistant 5",
         "fieldtype": "Link", "options": "Employee", "insert_after": "custom_assistant_4"},
    ]
    for field in new_fields:
        fname = f"{field['dt']}-{field['fieldname']}"
        if client.exists("Custom Field", {"dt": field["dt"], "fieldname": field["fieldname"]}):
            print(f"  Field exists: {fname}")
        else:
            client.create("Custom Field", field)
            print(f"  Created: {fname}")
