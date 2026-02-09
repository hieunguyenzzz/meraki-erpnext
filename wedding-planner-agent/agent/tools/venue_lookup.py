"""
Venue lookup tool - fetches venue information from ERPNext Suppliers.
"""

import httpx

from agent.config import settings
from agent.logging import get_logger

log = get_logger(__name__)


def get_venue_info(venue_name: str) -> dict:
    """
    Fetch detailed information about a wedding venue in Vietnam.

    Args:
        venue_name: Name or partial name of the venue (e.g., "The Reverie Saigon", "Amanoi")

    Returns:
        dict with venue details: name, location, capacity, price_range, features, contact, notes
    """
    log.info("venue_lookup_start", venue_name=venue_name)

    if not settings.erpnext_api_key or not settings.erpnext_api_secret:
        log.warning("erpnext_credentials_missing")
        return {
            "status": "error",
            "message": "ERPNext credentials not configured",
        }

    try:
        # Query ERPNext Supplier with venue search
        with httpx.Client(timeout=30.0) as client:
            response = client.get(
                f"{settings.erpnext_url}/api/resource/Supplier",
                params={
                    "filters": f'[["supplier_name", "like", "%{venue_name}%"], ["supplier_group", "=", "Venue"]]',
                    "fields": '["name", "supplier_name", "custom_meraki_venue_id", "custom_location", "custom_capacity_min", "custom_capacity_max", "custom_price_range", "custom_features", "custom_contact_person", "custom_notes", "website"]',
                    "limit_page_length": 5,
                },
                headers={
                    "Authorization": f"token {settings.erpnext_api_key}:{settings.erpnext_api_secret}",
                },
            )

            if response.status_code != 200:
                log.error("venue_lookup_failed", status=response.status_code)
                return {
                    "status": "error",
                    "message": f"Failed to query venues: {response.status_code}",
                }

            data = response.json()
            suppliers = data.get("data", [])

            if not suppliers:
                log.info("venue_not_found", venue_name=venue_name)
                return {
                    "status": "not_found",
                    "message": f"No venue found matching '{venue_name}'",
                }

            venue = suppliers[0]
            log.info("venue_found", venue_name=venue.get("supplier_name"))

            # Format capacity range
            cap_min = venue.get("custom_capacity_min")
            cap_max = venue.get("custom_capacity_max")
            capacity = None
            if cap_min and cap_max:
                capacity = f"{cap_min}-{cap_max} guests"
            elif cap_max:
                capacity = f"Up to {cap_max} guests"

            return {
                "status": "found",
                "name": venue.get("supplier_name"),
                "meraki_id": venue.get("custom_meraki_venue_id"),
                "location": venue.get("custom_location"),
                "capacity": capacity,
                "price_range": venue.get("custom_price_range"),
                "features": venue.get("custom_features"),
                "contact": venue.get("custom_contact_person"),
                "notes": venue.get("custom_notes"),
                "website": venue.get("website"),
            }

    except httpx.RequestError as e:
        log.error("venue_lookup_error", error=str(e))
        return {
            "status": "error",
            "message": f"Request failed: {str(e)}",
        }
