"""
Wedding history tool - queries past weddings from ERPNext Sales Orders.
"""

import httpx

from agent.config import settings
from agent.logging import get_logger

log = get_logger(__name__)


def get_wedding_history(venue_name: str | None = None, limit: int = 10) -> dict:
    """
    Look up past weddings organized by Meraki, optionally filtered by venue.

    Args:
        venue_name: Filter by specific venue (optional)
        limit: Maximum number of results to return (default: 10)

    Returns:
        dict with past weddings: list of {date, customer, venue, guest_count, value}
    """
    log.info("wedding_history_start", venue_name=venue_name, limit=limit)

    if not settings.erpnext_api_key or not settings.erpnext_api_secret:
        log.warning("erpnext_credentials_missing")
        return {
            "status": "error",
            "message": "ERPNext credentials not configured",
        }

    try:
        # Build filters - only submitted orders
        filters = [["docstatus", "=", 1]]
        if venue_name:
            filters.append(["custom_venue", "like", f"%{venue_name}%"])

        with httpx.Client(timeout=30.0) as client:
            response = client.get(
                f"{settings.erpnext_url}/api/resource/Sales Order",
                params={
                    "filters": str(filters).replace("'", '"'),
                    "fields": '["name", "customer_name", "delivery_date", "custom_venue", "custom_guest_count", "grand_total", "status"]',
                    "order_by": "delivery_date desc",
                    "limit_page_length": limit,
                },
                headers={
                    "Authorization": f"token {settings.erpnext_api_key}:{settings.erpnext_api_secret}",
                },
            )

            if response.status_code != 200:
                log.error("wedding_history_failed", status=response.status_code)
                return {
                    "status": "error",
                    "message": f"Failed to query weddings: {response.status_code}",
                }

            data = response.json()
            orders = data.get("data", [])

            if not orders:
                message = f"No past weddings found"
                if venue_name:
                    message += f" at '{venue_name}'"
                log.info("no_weddings_found", venue_name=venue_name)
                return {
                    "status": "not_found",
                    "message": message,
                    "weddings": [],
                }

            weddings = []
            for order in orders:
                weddings.append({
                    "order_id": order.get("name"),
                    "customer": order.get("customer_name"),
                    "date": order.get("delivery_date"),
                    "venue": order.get("custom_venue"),
                    "guest_count": order.get("custom_guest_count"),
                    "value": order.get("grand_total"),
                    "status": order.get("status"),
                })

            log.info(
                "wedding_history_found",
                count=len(weddings),
                venue_name=venue_name,
            )

            return {
                "status": "found",
                "count": len(weddings),
                "weddings": weddings,
            }

    except httpx.RequestError as e:
        log.error("wedding_history_error", error=str(e))
        return {
            "status": "error",
            "message": f"Request failed: {str(e)}",
        }
