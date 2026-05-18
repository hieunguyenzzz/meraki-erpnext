"""
Venue endpoints — listing.

The frontend stays dumb: this router fetches Supplier + child wedding-areas
in two calls (parent list + bulk child query), groups them server-side,
and returns a single JSON response — avoiding N+1 child-table fetches.
"""

import json
from typing import Any

from fastapi import APIRouter, HTTPException

from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter(prefix="/venues", tags=["venues"])


_SUPPLIER_FIELDS = [
    "name", "supplier_name", "disabled",
    "custom_venue_external_key", "custom_venue_city",
    "custom_venue_location_subarea", "custom_venue_type",
    "custom_venue_price_range", "custom_venue_wedding_package_text",
    "custom_venue_wedding_package_url", "custom_venue_insights",
    "custom_venue_accommodation", "custom_venue_fnb",
    "custom_venue_av_policy", "custom_venue_facility",
    "custom_venue_after_party", "custom_venue_contact_raw",
    "custom_venue_source", "custom_cover_photo",
]

_AREA_FIELDS = [
    "name", "parent", "area_name", "area_type", "function",
    "capacity_min", "capacity_max", "capacity_notes",
    "policy_min_spend", "setup_notes", "meraki_weddings",
    "photos_url", "idx",
]


def list_venues(city: str | None = None, _client: ERPNextClient | None = None) -> dict[str, Any]:
    """Return active wedding venues + their child wedding-areas, grouped."""
    client = _client or ERPNextClient()

    filters: list[list[Any]] = [
        ["supplier_group", "=", "Wedding Venues"],
        ["disabled", "=", 0],
    ]
    if city:
        filters.append(["custom_venue_city", "=", city])

    venues = client._get("/api/resource/Supplier", params={
        "filters": json.dumps(filters),
        "fields": json.dumps(_SUPPLIER_FIELDS),
        "limit_page_length": 0,
    }).get("data", [])

    venue_names = [v["name"] for v in venues]

    if venue_names:
        area_filters = [
            ["parent", "in", venue_names],
            ["parenttype", "=", "Supplier"],
        ]
        areas = client._get("/api/resource/Venue Wedding Area", params={
            "filters": json.dumps(area_filters),
            "fields": json.dumps(_AREA_FIELDS),
            "order_by": "parent asc, idx asc",
            "limit_page_length": 0,
        }).get("data", [])
        areas_by_parent: dict[str, list[dict]] = {}
        for a in areas:
            areas_by_parent.setdefault(a["parent"], []).append(a)
    else:
        areas_by_parent = {}

    for v in venues:
        v["areas"] = areas_by_parent.get(v["name"], [])

    return {"venues": venues}


@router.get("/listing")
def get_listing(city: str | None = None) -> dict[str, Any]:
    """HTTP wrapper around list_venues."""
    try:
        return list_venues(city=city)
    except Exception as exc:
        log.exception("Failed to list venues")
        raise HTTPException(status_code=500, detail=str(exc))
