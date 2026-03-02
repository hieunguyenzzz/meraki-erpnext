"""
Financial overview endpoint.

GET /financial-overview?year={year} — monthly P&L + KPI totals for a given year
"""

import json
from datetime import date

from fastapi import APIRouter, Query
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()


@router.get("/financial-overview")
def get_financial_overview(year: int = Query(default=None, description="Year (defaults to current year)")):
    """
    Return monthly P&L data and KPI totals for the given year.

    Queries:
    - Submitted Sales Invoices (revenue + outstanding)
    - Submitted Journal Entries (expenses)
    - Submitted Payment Entries (received payments)
    - Open Sales Orders (pipeline)
    """
    client = ERPNextClient()

    if year is None:
        year = date.today().year

    year_str = str(year)
    today = date.today().isoformat()

    # Generate all 12 month keys
    months = [f"{year}-{str(m).zfill(2)}" for m in range(1, 13)]

    # Fetch submitted Sales Invoices (all, not just this year — for outstanding calc)
    invoices = client._get("/api/resource/Sales Invoice", params={
        "filters": json.dumps([["docstatus", "=", 1]]),
        "fields": json.dumps(["posting_date", "grand_total", "outstanding_amount"]),
        "limit_page_length": 2000,
    }).get("data", [])

    # Fetch submitted Journal Entries
    journals = client._get("/api/resource/Journal Entry", params={
        "filters": json.dumps([["docstatus", "=", 1]]),
        "fields": json.dumps(["posting_date", "total_debit"]),
        "limit_page_length": 2000,
    }).get("data", [])

    # Fetch submitted Payment Entries (received)
    payments = client._get("/api/resource/Payment Entry", params={
        "filters": json.dumps([["docstatus", "=", 1], ["payment_type", "=", "Receive"]]),
        "fields": json.dumps(["posting_date", "paid_amount"]),
        "limit_page_length": 2000,
    }).get("data", [])

    # Fetch open Sales Orders (pipeline)
    open_orders = client._get("/api/resource/Sales Order", params={
        "filters": json.dumps([["status", "=", "Open"]]),
        "fields": json.dumps(["grand_total", "delivery_date"]),
        "limit_page_length": 500,
    }).get("data", [])

    # Fetch all submitted Sales Orders for wedding count by month
    all_orders = client._get("/api/resource/Sales Order", params={
        "filters": json.dumps([["docstatus", "=", 1]]),
        "fields": json.dumps(["delivery_date"]),
        "limit_page_length": 1000,
    }).get("data", [])

    # Build monthly data for the selected year
    monthly_map: dict[str, dict] = {m: {"revenue": 0, "expenses": 0, "collected": 0} for m in months}

    for inv in invoices:
        month = (inv.get("posting_date") or "")[:7]
        if month in monthly_map:
            monthly_map[month]["revenue"] += inv.get("grand_total") or 0

    for j in journals:
        month = (j.get("posting_date") or "")[:7]
        if month in monthly_map:
            monthly_map[month]["expenses"] += j.get("total_debit") or 0

    for p in payments:
        month = (p.get("posting_date") or "")[:7]
        if month in monthly_map:
            monthly_map[month]["collected"] += p.get("paid_amount") or 0

    # Wedding counts per month (by delivery_date)
    wedding_count: dict[str, int] = {m: 0 for m in months}
    for so in all_orders:
        month = (so.get("delivery_date") or "")[:7]
        if month in wedding_count:
            wedding_count[month] += 1

    monthly_rows = [
        {
            "month": m,
            "revenue": monthly_map[m]["revenue"],
            "expenses": monthly_map[m]["expenses"],
            "net": monthly_map[m]["revenue"] - monthly_map[m]["expenses"],
            "collected": monthly_map[m]["collected"],
            "weddings": wedding_count.get(m, 0),
        }
        for m in months
    ]

    # KPI totals for the selected year
    total_revenue = sum(r["revenue"] for r in monthly_rows)
    total_expenses = sum(r["expenses"] for r in monthly_rows)
    total_collected = sum(r["collected"] for r in monthly_rows)

    # Outstanding receivables (all-time)
    outstanding_invoices = [inv for inv in invoices if (inv.get("outstanding_amount") or 0) > 0]
    outstanding_receivables = sum(
        (inv.get("outstanding_amount") or 0) for inv in outstanding_invoices
    )
    outstanding_invoices_count = len(outstanding_invoices)

    # Active pipeline: open SOs with delivery_date >= today
    active_weddings = [so for so in open_orders if so.get("delivery_date", "") >= today]
    active_pipeline = sum((so.get("grand_total") or 0) for so in active_weddings)
    active_weddings_count = len(active_weddings)

    # Available years from invoice/journal data (for frontend year selector)
    years_set: set[int] = {date.today().year}
    for inv in invoices:
        y = (inv.get("posting_date") or "")[:4]
        if y.isdigit():
            years_set.add(int(y))
    for j in journals:
        y = (j.get("posting_date") or "")[:4]
        if y.isdigit():
            years_set.add(int(y))

    log.info("financial_overview_served", year=year, invoices=len(invoices), journals=len(journals))

    return {
        "year": year,
        "available_years": sorted(years_set, reverse=True),
        "months": monthly_rows,
        "totals": {
            "revenue": total_revenue,
            "expenses": total_expenses,
            "net": total_revenue - total_expenses,
            "collected": total_collected,
            "outstanding_receivables": outstanding_receivables,
            "outstanding_invoices_count": outstanding_invoices_count,
            "active_pipeline": active_pipeline,
            "active_weddings_count": active_weddings_count,
        },
    }
