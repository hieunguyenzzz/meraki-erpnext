"""Convert quick-expense Journal Entries to Purchase Invoices.

Identifies JEs matching the pattern: debit expense account + credit Cash - MWP,
creates equivalent Purchase Invoices against 'Company Expense' supplier,
then cancels the original JEs so GL entries don't double-count.
"""

COMPANY = "Meraki Wedding Planner"
CASH_ACCOUNT = "Cash - MWP"

# Salary/payroll JEs should not be converted
SKIP_KEYWORDS = ["salary", "bhxh", "bhyt", "bhtn", "insurance", "payroll", "accrual"]


def _is_quick_expense(client, je_name):
    """Return expense info dict if JE is a quick expense, else None."""
    doc = client.get("Journal Entry", je_name)
    if not doc:
        return None

    accounts = doc.get("accounts", [])
    if len(accounts) != 2:
        return None

    debit_row = credit_row = None
    for acc in accounts:
        if acc.get("debit_in_account_currency", 0) > 0 and acc.get("credit_in_account_currency", 0) == 0:
            debit_row = acc
        elif acc.get("credit_in_account_currency", 0) > 0 and acc.get("debit_in_account_currency", 0) == 0:
            credit_row = acc

    if not debit_row or not credit_row:
        return None
    if credit_row["account"] != CASH_ACCOUNT:
        return None

    remark = (doc.get("user_remark") or "").lower()
    expense_account = debit_row["account"].lower()
    if any(kw in remark or kw in expense_account for kw in SKIP_KEYWORDS):
        return None

    return {
        "posting_date": doc["posting_date"],
        "description": doc.get("user_remark") or "Expense",
        "amount": debit_row["debit_in_account_currency"],
        "expense_account": debit_row["account"],
        "project": doc.get("project") or "",
    }


def run(client):
    # Get all submitted JEs
    jes = client.get_list("Journal Entry", filters={"docstatus": 1}, fields=["name"], limit=0)
    if not jes:
        print("  No submitted Journal Entries found — skipping")
        return

    converted = 0
    skipped = 0
    for je in jes:
        je_name = je["name"]
        info = _is_quick_expense(client, je_name)
        if not info:
            skipped += 1
            continue

        # Create equivalent Purchase Invoice
        pi_data = {
            "supplier": "Company Expense",
            "posting_date": info["posting_date"],
            "set_posting_time": 1,
            "company": COMPANY,
            "remarks": f"Converted from {je_name}",
            "items": [{
                "item_code": "EXPENSE-ITEM",
                "item_name": info["description"],
                "description": info["description"],
                "expense_account": info["expense_account"],
                "qty": 1,
                "rate": info["amount"],
            }],
        }
        if info["project"]:
            pi_data["project"] = info["project"]
            pi_data["items"][0]["project"] = info["project"]

        pi = client.create("Purchase Invoice", pi_data)
        if not pi:
            print(f"  ERROR: Failed to create PI for {je_name}")
            continue

        pi_name = pi.get("name")

        # Submit the PI
        result = client.submit_document("Purchase Invoice", pi_name)
        if not result:
            print(f"  ERROR: Failed to submit PI {pi_name} for {je_name}")
            continue

        # Cancel the original JE via raw session (no cancel method on client)
        try:
            resp = client.session.post(
                f"{client.url}/api/method/frappe.client.cancel",
                headers=client._get_headers(),
                json={"doctype": "Journal Entry", "name": je_name},
                timeout=30,
            )
            if resp.status_code != 200:
                print(f"  WARN: Failed to cancel {je_name}: {resp.status_code} {resp.text[:200]}")
        except Exception as e:
            print(f"  WARN: Failed to cancel {je_name}: {e}")

        print(f"  Converted {je_name} → {pi_name} ({info['description']}, {info['amount']:,.0f})")
        converted += 1

    print(f"  Done: {converted} converted, {skipped} skipped (salary/non-expense)")
