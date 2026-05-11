"""Backfill Payment Entries for all submitted Purchase Invoices with outstanding balance."""

COMPANY = "Meraki Wedding Planner"


def run(client):
    unpaid = client.get_list(
        "Purchase Invoice",
        filters={"docstatus": 1, "outstanding_amount": [">", 0]},
        fields=["name"],
        limit=0,
    )

    if not unpaid:
        print("  No unpaid submitted Purchase Invoices — skipping")
        return

    paid = 0
    skipped = 0
    failed = 0

    for row in unpaid:
        pi_name = row["name"]
        pi = client.get("Purchase Invoice", pi_name)
        if not pi:
            print(f"  WARN: Could not fetch {pi_name} — skipping")
            skipped += 1
            continue

        outstanding = pi.get("outstanding_amount", 0)
        if outstanding <= 0:
            skipped += 1
            continue

        supplier = pi.get("supplier")
        posting_date = pi.get("posting_date")
        currency = pi.get("currency", "VND")

        pe_data = {
            "payment_type": "Pay",
            "party_type": "Supplier",
            "party": supplier,
            "paid_from": "Cash - MWP",
            "paid_to": "Creditors - MWP",
            "paid_from_account_currency": currency,
            "paid_to_account_currency": currency,
            "paid_amount": outstanding,
            "received_amount": outstanding,
            "posting_date": posting_date,
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
                raise ValueError("Payment Entry created but response was empty")
            pe_name = pe.get("name")
            if not pe_name:
                raise ValueError("Payment Entry created but name not returned")

            result = client.submit_document("Payment Entry", pe_name)
            if not result:
                raise ValueError(f"Failed to submit Payment Entry {pe_name}")

            print(f"  Paid {pi_name} ({supplier}, {outstanding:,.0f} VND)")
            paid += 1
        except Exception as e:
            print(f"  ERROR: Failed to pay {pi_name}: {e}")
            failed += 1

    print(f"  Done: {paid} paid, {skipped} skipped, {failed} failed")
