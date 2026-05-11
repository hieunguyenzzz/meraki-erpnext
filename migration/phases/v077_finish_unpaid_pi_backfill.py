"""Submit orphan Draft Payment Entries from v076 and pay any remaining unpaid PIs.

v076 created 92 Draft Payment Entries but submit failed with TimestampMismatchError
because submit_document() sends only {doctype, name}, which makes
frappe.client.submit treat it as a new doc instead of loading the existing one.

Fix: fetch the full doc first, then submit with the full payload. Same pattern
as webhook_v2/routers/expenses.py:_mark_pi_paid.
"""

COMPANY = "Meraki Wedding Planner"


def _submit_with_full_doc(client, doctype, name):
    """Fetch fresh doc + submit via frappe.client.submit with full payload."""
    full_doc = client.get(doctype, name)
    if not full_doc:
        return False, f"could not fetch {doctype}/{name}"
    resp = client.session.post(
        f"{client.url}/api/method/frappe.client.submit",
        headers=client._get_headers(),
        json={"doc": full_doc},
        timeout=30,
    )
    if resp.status_code != 200:
        return False, f"submit {resp.status_code}: {resp.text[:300]}"
    return True, None


def run(client):
    # Step 1: submit Draft Payment Entries that reference a Purchase Invoice
    draft_pes = client.get_list(
        "Payment Entry",
        filters={"docstatus": 0, "payment_type": "Pay"},
        fields=["name"],
        limit=0,
    )

    submitted = 0
    submit_failed = 0
    for row in draft_pes:
        pe_name = row["name"]
        pe = client.get("Payment Entry", pe_name)
        if not pe:
            continue
        refs = pe.get("references", [])
        if not any(r.get("reference_doctype") == "Purchase Invoice" for r in refs):
            continue
        ok, err = _submit_with_full_doc(client, "Payment Entry", pe_name)
        if ok:
            print(f"  Submitted {pe_name}")
            submitted += 1
        else:
            print(f"  ERROR submitting {pe_name}: {err}")
            submit_failed += 1

    print(f"  Draft PE submit: {submitted} ok, {submit_failed} failed")

    # Step 2: create+submit PE for any submitted PI still unpaid
    unpaid = client.get_list(
        "Purchase Invoice",
        filters={"docstatus": 1, "outstanding_amount": [">", 0]},
        fields=["name"],
        limit=0,
    )

    paid = 0
    failed = 0
    for row in unpaid:
        pi_name = row["name"]
        pi = client.get("Purchase Invoice", pi_name)
        if not pi:
            continue
        outstanding = pi.get("outstanding_amount", 0)
        if outstanding <= 0:
            continue

        pe_data = {
            "payment_type": "Pay",
            "party_type": "Supplier",
            "party": pi.get("supplier"),
            "paid_from": "Cash - MWP",
            "paid_to": "Creditors - MWP",
            "paid_from_account_currency": pi.get("currency", "VND"),
            "paid_to_account_currency": pi.get("currency", "VND"),
            "paid_amount": outstanding,
            "received_amount": outstanding,
            "posting_date": pi.get("posting_date"),
            "company": COMPANY,
            "references": [{
                "reference_doctype": "Purchase Invoice",
                "reference_name": pi_name,
                "allocated_amount": outstanding,
                "total_amount": outstanding,
                "outstanding_amount": outstanding,
            }],
        }
        try:
            pe = client.create("Payment Entry", pe_data)
            if not pe:
                raise ValueError("create returned empty")
            pe_name = pe.get("name")
            ok, err = _submit_with_full_doc(client, "Payment Entry", pe_name)
            if not ok:
                raise ValueError(f"submit: {err}")
            print(f"  Paid {pi_name} ({pi.get('supplier')}, {outstanding:,.0f} VND)")
            paid += 1
        except Exception as e:
            print(f"  ERROR paying {pi_name}: {e}")
            failed += 1

    print(f"  PI backfill: {paid} paid, {failed} failed")
