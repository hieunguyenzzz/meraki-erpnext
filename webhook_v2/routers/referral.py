"""
Referral commission endpoints — record partner referral income.

Creates a Sales Invoice + Payment Entry atomically (same pattern as wedding milestones).
"""

import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()


class RecordReferralRequest(BaseModel):
    partner: str        # Customer name (from Referral Partners group)
    amount: float
    date: str           # YYYY-MM-DD
    project: str | None = None   # Optional wedding project link
    note: str | None = None      # Optional description


class CreatePartnerRequest(BaseModel):
    customer_name: str


def _cancel(client: ERPNextClient, doctype: str, name: str) -> None:
    try:
        client._post(
            "/api/method/frappe.client.cancel",
            {"doctype": doctype, "name": name},
        )
    except Exception as e:
        log.warning("cancel_error", doctype=doctype, name=name, error=str(e))


def _delete_gl_entries(client: ERPNextClient, voucher_no: str) -> int:
    gl_entries = client._get("/api/resource/GL Entry", params={
        "filters": json.dumps([["voucher_no", "=", voucher_no]]),
        "fields": json.dumps(["name"]),
        "limit_page_length": 500,
    }).get("data", [])
    for gl in gl_entries:
        try:
            client._delete(f"/api/resource/GL Entry/{gl['name']}")
        except Exception as e:
            log.warning("gl_entry_delete_error", entry=gl["name"], error=str(e))
    return len(gl_entries)


def _delete_payment_ledger_entries(client: ERPNextClient, voucher_no: str) -> int:
    entries = client._get("/api/resource/Payment Ledger Entry", params={
        "filters": json.dumps([["voucher_no", "=", voucher_no]]),
        "fields": json.dumps(["name"]),
        "limit_page_length": 500,
    }).get("data", [])
    for entry in entries:
        try:
            client._delete(f"/api/resource/Payment Ledger Entry/{entry['name']}")
        except Exception as e:
            log.warning("payment_ledger_delete_error", entry=entry["name"], error=str(e))
    return len(entries)


@router.get("/referral/partners")
def list_partners():
    """List customers in the Referral Partners group."""
    client = ERPNextClient()
    data = client._get("/api/resource/Customer", params={
        "filters": json.dumps([["customer_group", "=", "Referral Partners"]]),
        "fields": json.dumps(["name", "customer_name"]),
        "limit_page_length": 0,
    }).get("data", [])
    return data


@router.post("/referral/partners")
def create_partner(req: CreatePartnerRequest):
    """Create a new customer in the Referral Partners group."""
    client = ERPNextClient()
    result = client._post("/api/resource/Customer", {
        "customer_name": req.customer_name,
        "customer_group": "Referral Partners",
        "customer_type": "Company",
        "territory": "Vietnam",
    }).get("data", {})
    log.info("referral_partner_created", customer=result.get("name"))
    return {"name": result.get("name"), "customer_name": result.get("customer_name")}


@router.post("/referral/record")
def record_referral(req: RecordReferralRequest):
    """Create a Sales Invoice + Payment Entry for a referral commission."""
    client = ERPNextClient()

    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")

    item_name = f"Referral Commission"
    if req.note:
        item_name = f"Referral Commission — {req.note}"

    # 1. Create + submit Sales Invoice
    inv_payload = {
        "customer": req.partner,
        "company": "Meraki Wedding Planner",
        "set_posting_time": 1,
        "posting_date": req.date,
        "due_date": req.date,
        "currency": "VND",
        "selling_price_list": "Standard Selling VND",
        "custom_invoice_category": "Referral Commission",
        "items": [{
            "item_code": "REFERRAL-COMMISSION",
            "item_name": item_name,
            "qty": 1,
            "rate": req.amount,
            "income_account": "Referral Commission Income - MWP",
        }],
    }
    # Build remarks (project can't go on invoice — customer mismatch with wedding project)
    remarks_parts = []
    if req.project:
        remarks_parts.append(f"Referral commission for wedding {req.project}")
    if req.note:
        remarks_parts.append(req.note)
    if remarks_parts:
        inv_payload["remarks"] = " — ".join(remarks_parts)

    inv = client._post("/api/resource/Sales Invoice", inv_payload).get("data", {})
    inv_name = inv["name"]
    full_inv = client._get(f"/api/resource/Sales Invoice/{inv_name}").get("data", {})
    client._post("/api/method/frappe.client.submit", {"doc": full_inv})

    # Refetch to get actual outstanding_amount after ERPNext rounding
    submitted_inv = client._get(f"/api/resource/Sales Invoice/{inv_name}").get("data", {})
    actual_amount = submitted_inv.get("outstanding_amount") or req.amount

    # 2. Create + submit Payment Entry
    try:
        pe = client._post("/api/resource/Payment Entry", {
            "payment_type": "Receive",
            "party_type": "Customer",
            "party": req.partner,
            "paid_from": "Debtors - MWP",
            "paid_to": "Cash - MWP",
            "paid_from_account_currency": "VND",
            "paid_to_account_currency": "VND",
            "paid_amount": actual_amount,
            "received_amount": actual_amount,
            "posting_date": req.date,
            "company": "Meraki Wedding Planner",
            "references": [{
                "reference_doctype": "Sales Invoice",
                "reference_name": inv_name,
                "allocated_amount": actual_amount,
                "total_amount": actual_amount,
                "outstanding_amount": actual_amount,
            }],
        }).get("data", {})
        pe_name = pe["name"]
        full_pe = client._get(f"/api/resource/Payment Entry/{pe_name}").get("data", {})
        client._post("/api/method/frappe.client.submit", {"doc": full_pe})
    except Exception as e:
        # Rollback: cancel + delete the orphaned invoice
        _cancel(client, "Sales Invoice", inv_name)
        _delete_gl_entries(client, inv_name)
        _delete_payment_ledger_entries(client, inv_name)
        try:
            client._delete(f"/api/resource/Sales Invoice/{inv_name}")
        except Exception:
            pass
        raise HTTPException(status_code=400, detail=f"Payment Entry failed: {str(e)}")

    log.info("referral_recorded", invoice=inv_name, payment_entry=pe_name, partner=req.partner, amount=req.amount)
    return {"success": True, "invoice": inv_name, "payment_entry": pe_name}
