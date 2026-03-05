import os, json as json_lib


def run(client):
    site_name = os.environ.get("SITE_NAME", "")
    headers = dict(client._get_headers())
    if site_name:
        headers["Host"] = site_name

    print("v028: Scoping Employee User Permissions (disable apply_to_all_doctypes)...")

    r = client.session.get(
        f"{client.url}/api/resource/User%20Permission",
        headers=headers,
        params={
            "filters": json_lib.dumps({"allow": "Employee", "apply_to_all_doctypes": 1}),
            "fields": json_lib.dumps(["name", "user", "for_value", "apply_to_all_doctypes"]),
            "limit_page_length": 0,
        },
        timeout=30,
    )
    if r.status_code != 200:
        raise RuntimeError(f"Failed to list User Permissions: {r.status_code} - {r.text[:300]}")

    perms = r.json().get("data", [])
    print(f"  Found {len(perms)} Employee User Permissions with apply_to_all_doctypes=1")

    for perm in perms:
        name = perm["name"]
        user = perm["user"]
        r2 = client.session.put(
            f"{client.url}/api/resource/User%20Permission/{name}",
            headers=headers,
            json={"apply_to_all_doctypes": 0},
            timeout=30,
        )
        if r2.status_code == 200:
            print(f"  Updated {name} for {user}: apply_to_all_doctypes=0")
        else:
            raise RuntimeError(f"Failed to update {name}: {r2.status_code} - {r2.text[:300]}")

    print("v028: Done.")
