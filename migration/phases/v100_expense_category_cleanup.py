"""Expense category cleanup (MWP-79). Rewrites accounting data, so it is deliberately strict.

1. Merge duplicate categories with ERPNext's own merge_account (GL Entries and
   Purchase Invoice lines move to the kept account):
     Travel Expenses -> Di chuyển, Khách Sạn -> Lưu trú, Viettel Post -> Vận chuyển
2. Delete the unused accounts "ă" and "ship" (only if they have no GL Entry and no PI line).
3. Create two group accounts under Indirect Expenses and move every category under one:
     Wedding Categories - shown in the wedding expense picker
     Office Categories  - company-only, hidden from the wedding picker
   (Not named "Office Expenses"/"Wedding Expenses": a standard "Office Expenses - MWP"
   ledger already exists.)

Order matters: merges run before any re-parenting.

Idempotent: each step is skipped when already done. Fails loudly: the client's
get/create/update swallow errors and the runner records a phase as applied once
run() returns, so every step goes through direct requests, is verified afterwards
and raises RuntimeError on any problem.
"""

import json
import time
from urllib.parse import quote

COMPANY = "Meraki Wedding Planner"
PARENT = "Indirect Expenses - MWP"
WEDDING_GROUP = "Wedding Categories - MWP"
OFFICE_GROUP = "Office Categories - MWP"

MERGES = [  # (merged away, kept)
    ("Travel Expenses - MWP", "Di chuyển - MWP"),
    ("Khách Sạn - MWP", "Lưu trú - MWP"),
    ("Viettel Post - MWP", "Vận chuyển - MWP"),
]
DELETES = ["ă - MWP", "ship - MWP"]
WEDDING_CATEGORIES = [
    "Ăn uống - MWP", "Di chuyển - MWP", "Vé máy bay - MWP", "Lưu trú - MWP",
    "Dụng cụ/Thiết bị - MWP", "Khác - MWP", "Site check - MWP", "Lương CTV (Tax Free) - MWP",
]
OFFICE_CATEGORIES = [
    "BHBV - MWP", "Company Trip - MWP", "internet - MWP", "Nước uống VP - MWP",
    "Phí kế toán - MWP", "Sinh nhật - MWP", "Thuế - MWP", "Vận chuyển - MWP", "Vệ Sinh VP - MWP",
]

# ERPNext refuses account merges within 5 minutes of the last GL Entry update.
IDLE_RETRIES = 12
IDLE_WAIT_SECONDS = 30


def _request(client, method, path, **kwargs):
    return client.session.request(
        method, f"{client.url}{path}", headers=client._get_headers(), timeout=300, **kwargs
    )


def _get_account(client, name):
    """Return the Account dict, or None only if it genuinely does not exist."""
    response = _request(client, "GET", f"/api/resource/Account/{quote(name, safe='')}")
    if response.status_code == 404:
        return None
    if response.status_code != 200:
        raise RuntimeError(f"Could not read Account {name}: {response.status_code} {response.text[:200]}")
    return response.json()["data"]


def _gl_entry_count(client, account):
    """All GL Entries on the account, including cancelled ones."""
    response = _request(client, "GET", "/api/method/frappe.client.get_count", params={
        "doctype": "GL Entry", "filters": json.dumps([["account", "=", account]]),
    })
    if response.status_code != 200:
        raise RuntimeError(f"Could not count GL Entries for {account}: {response.status_code} {response.text[:200]}")
    return response.json()["message"]


def _pi_line_count(client, account):
    """All Purchase Invoice lines on the account, any docstatus."""
    response = _request(client, "GET", "/api/method/frappe.client.get_list", params={
        "doctype": "Purchase Invoice",
        "fields": json.dumps(["`tabPurchase Invoice Item`.name as line"]),
        "filters": json.dumps([["Purchase Invoice Item", "expense_account", "=", account]]),
        "limit_page_length": 0,
    })
    if response.status_code != 200:
        raise RuntimeError(f"Could not count PI lines for {account}: {response.status_code} {response.text[:200]}")
    return len(response.json()["message"])


def _ensure_group(client, name):
    account = _get_account(client, name)
    if account:
        if not account["is_group"] or account["parent_account"] != PARENT:
            raise RuntimeError(f"Account {name} exists but is not a group under {PARENT}")
        print(f"  Group {name} already exists, skipping")
        return
    response = _request(client, "POST", "/api/resource/Account", json={
        "account_name": name.removesuffix(" - MWP"),
        "parent_account": PARENT,
        "root_type": "Expense",
        "report_type": "Profit and Loss",
        "company": COMPANY,
        "is_group": 1,
    })
    if response.status_code not in (200, 201):
        raise RuntimeError(f"Failed to create group {name}: {response.status_code} {response.text[:300]}")
    created = _get_account(client, name)
    if not created or not created["is_group"]:
        raise RuntimeError(f"Group {name} not found after creation")
    print(f"  Created group: {name}")


def _merge(client, old, new):
    if _get_account(client, old) is None:
        print(f"  Merge {old} -> {new}: source gone, skipping")
        return
    if _get_account(client, new) is None:
        raise RuntimeError(f"Cannot merge {old}: target {new} does not exist")

    gl_expected = _gl_entry_count(client, old) + _gl_entry_count(client, new)
    pi_expected = _pi_line_count(client, old) + _pi_line_count(client, new)

    for attempt in range(1, IDLE_RETRIES + 1):
        response = _request(client, "POST", "/api/method/erpnext.accounts.doctype.account.account.merge_account",
                            json={"old": old, "new": new})
        if response.status_code == 200:
            break
        if "System In Use" in response.text and attempt < IDLE_RETRIES:
            print(f"  GL Entries were updated in the last 5 minutes, waiting ({attempt}/{IDLE_RETRIES})")
            time.sleep(IDLE_WAIT_SECONDS)
            continue
        raise RuntimeError(f"Merge {old} -> {new} failed: {response.status_code} {response.text[:400]}")

    if _get_account(client, old) is not None:
        raise RuntimeError(f"{old} still exists after merging into {new}")
    gl_after, pi_after = _gl_entry_count(client, new), _pi_line_count(client, new)
    if gl_after != gl_expected or pi_after != pi_expected:
        raise RuntimeError(
            f"Merge {old} -> {new}: expected {gl_expected} GL / {pi_expected} PI lines on target, "
            f"found {gl_after} / {pi_after}"
        )
    print(f"  Merged {old} -> {new} ({gl_after} GL Entries, {pi_after} PI lines now on target)")


def _delete_unused(client, name):
    if _get_account(client, name) is None:
        print(f"  Delete {name}: already gone, skipping")
        return
    gl, pi = _gl_entry_count(client, name), _pi_line_count(client, name)
    if gl or pi:
        raise RuntimeError(f"Refusing to delete {name}: {gl} GL Entries, {pi} PI lines")
    # Not client.delete(): Frappe answers a successful DELETE with 202, which it treats as failure.
    response = _request(client, "DELETE", f"/api/resource/Account/{quote(name, safe='')}")
    if response.status_code not in (200, 202):
        raise RuntimeError(f"Failed to delete {name}: {response.status_code} {response.text[:300]}")
    if _get_account(client, name) is not None:
        raise RuntimeError(f"{name} still exists after delete")
    print(f"  Deleted unused account: {name}")


def _reparent(client, name, group):
    account = _get_account(client, name)
    if account is None:
        print(f"  Move {name}: account not found, skipping")
        return
    if account["parent_account"] == group:
        print(f"  {name} already under {group}, skipping")
        return
    response = _request(client, "PUT", f"/api/resource/Account/{quote(name, safe='')}",
                        json={"parent_account": group})
    if response.status_code != 200:
        raise RuntimeError(f"Failed to move {name} under {group}: {response.status_code} {response.text[:300]}")
    moved = _get_account(client, name)
    if not moved or moved["parent_account"] != group:
        raise RuntimeError(f"{name} not under {group} after update")
    print(f"  Moved {name} under {group}")


def _warn_unplaced(client):
    response = _request(client, "GET", "/api/resource/Account", params={
        "filters": json.dumps([["is_custom_wedding_expense", "=", 1], ["is_group", "=", 0],
                               ["parent_account", "not in", [WEDDING_GROUP, OFFICE_GROUP]]]),
        "fields": json.dumps(["name"]), "limit_page_length": 0,
    })
    if response.status_code != 200:
        raise RuntimeError(f"Could not list leftover categories: {response.status_code} {response.text[:200]}")
    leftovers = [a["name"] for a in response.json()["data"]]
    if leftovers:
        print(f"  WARNING: categories not placed in either group (hidden from scoped pickers): {leftovers}")


def run(client):
    for old, new in MERGES:
        _merge(client, old, new)
    for name in DELETES:
        _delete_unused(client, name)
    _ensure_group(client, WEDDING_GROUP)
    _ensure_group(client, OFFICE_GROUP)
    for name in WEDDING_CATEGORIES:
        _reparent(client, name, WEDDING_GROUP)
    for name in OFFICE_CATEGORIES:
        _reparent(client, name, OFFICE_GROUP)
    _warn_unplaced(client)
