"""
Venue endpoints — listing, create, update.

The frontend stays dumb: this router fetches Supplier + child wedding-areas
server-side and returns a single JSON response.
Create/update orchestrate Supplier + Contact mutations in one call.
"""

import json
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger
from webhook_v2.auth import require_roles, PLANNER
from webhook_v2.routers.my_weddings import _get_in

log = get_logger(__name__)
COVER_BATCH = 40  # each id travels in the GET query string; keep one request well under 4 KB

router = APIRouter(prefix="/venues", tags=["venues"], dependencies=[Depends(require_roles(*PLANNER))])


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

    if not venues:
        return {"venues": []}

    def _fetch_areas(venue_name: str) -> list[dict]:
        encoded = quote(venue_name, safe="")
        doc = client._get(f"/api/resource/Supplier/{encoded}").get("data", {})
        return doc.get("custom_venue_wedding_areas") or []

    with ThreadPoolExecutor(max_workers=10) as pool:
        results = list(pool.map(_fetch_areas, [v["name"] for v in venues]))

    cover_names = [v["custom_cover_photo"] for v in venues if v.get("custom_cover_photo")]
    cover_urls: dict[str, str] = {}
    try:
        files = _get_in(client, "File", cover_names, ["name", "file_url"], batch_size=COVER_BATCH) if cover_names else []
        cover_urls = {f["name"]: f["file_url"] for f in files if f.get("file_url")}
    except Exception:
        log.exception("Venue cover lookup failed; listing without covers")

    for v, areas in zip(venues, results):
        v["areas"] = areas
        v["cover_url"] = cover_urls.get(v.get("custom_cover_photo") or "")

    return {"venues": venues}


@router.get("/listing")
def get_listing(city: str | None = None) -> dict[str, Any]:
    """HTTP wrapper around list_venues."""
    try:
        return list_venues(city=city)
    except Exception as exc:
        log.exception("Failed to list venues")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{name}/contact")
def get_contact(name: str) -> dict[str, Any]:
    """The Contact linked to a venue (names, title, email, primary and second phone)."""
    try:
        return get_venue_contact(name)
    except Exception as exc:
        log.exception("Failed to load venue contact", extra={"venue": name})
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# Pydantic models for create / update
# ---------------------------------------------------------------------------

class AreaPayload(BaseModel):
    name: str | None = None  # set on update for existing rows, omitted for new
    area_name: str
    area_type: str | None = None
    function: str | None = None
    capacity_min: int | None = None
    capacity_max: int | None = None
    capacity_notes: str | None = None
    policy_min_spend: str | None = None
    setup_notes: str | None = None
    meraki_weddings: str | None = None
    photos_url: str | None = None
    idx: int | None = None


class ContactPayload(BaseModel):
    name: str | None = None        # display name / first_name
    full_name: str | None = None   # alias used by frontend
    title: str | None = None
    email: str | None = None
    phone: str | None = None
    alt_phone: str | None = None


class VenuePayload(BaseModel):
    supplier_name: str = Field(..., min_length=1)
    custom_venue_city: str | None = None
    custom_venue_location_subarea: str | None = None
    custom_venue_type: str | None = None
    custom_venue_price_range: str | None = None
    custom_venue_wedding_package_text: str | None = None
    custom_venue_wedding_package_url: str | None = None
    custom_venue_insights: str | None = None
    custom_venue_accommodation: str | None = None
    custom_venue_fnb: str | None = None
    custom_venue_av_policy: str | None = None
    custom_venue_facility: str | None = None
    custom_venue_after_party: str | None = None
    custom_venue_contact_raw: str | None = None
    custom_cover_photo: str | None = None
    areas: list[AreaPayload]
    contact: ContactPayload | None = None


# Fields copied verbatim from VenuePayload → Supplier doc
_VENUE_FIELDS = [
    "custom_venue_city", "custom_venue_location_subarea",
    "custom_venue_type", "custom_venue_price_range",
    "custom_venue_wedding_package_text", "custom_venue_wedding_package_url",
    "custom_venue_insights", "custom_venue_accommodation",
    "custom_venue_fnb", "custom_venue_av_policy",
    "custom_venue_facility", "custom_venue_after_party",
    "custom_venue_contact_raw", "custom_cover_photo",
]


def _build_supplier_doc(payload: VenuePayload) -> dict[str, Any]:
    doc: dict[str, Any] = {
        "supplier_name": payload.supplier_name.strip(),
        "supplier_group": "Wedding Venues",
        "supplier_type": "Company",
        "country": "Vietnam",
    }
    for field in _VENUE_FIELDS:
        val = getattr(payload, field, None)
        if val is not None:
            doc[field] = val
    doc["custom_venue_wedding_areas"] = [
        {k: v for k, v in a.model_dump().items() if v is not None}
        for a in payload.areas
    ]
    return doc


def _find_contact_name(client: ERPNextClient, supplier_name: str) -> str | None:
    """Name of the Contact linked to this Supplier through its Dynamic Link child table."""
    existing = client._get(
        "/api/resource/Contact",
        params={
            "filters": json.dumps([
                ["Dynamic Link", "link_doctype", "=", "Supplier"],
                ["Dynamic Link", "link_name", "=", supplier_name],
            ]),
            "fields": json.dumps(["name"]),
            "limit_page_length": 1,
        },
    )
    rows = (existing or {}).get("data", [])
    return rows[0]["name"] if rows else None


def _split_phones(phone_rows: list[dict]) -> tuple[dict | None, dict | None]:
    """(primary row, first other row) of a Contact's phone_nos."""
    primary = next(
        (r for r in phone_rows if r.get("is_primary_phone") or r.get("is_primary_mobile_no")),
        phone_rows[0] if phone_rows else None,
    )
    alt = next((r for r in phone_rows if r is not primary), None)
    return primary, alt


def _contact_view(doc: dict[str, Any]) -> dict[str, Any]:
    emails = doc.get("email_ids") or []
    primary_email = next((r for r in emails if r.get("is_primary")), emails[0] if emails else None)
    primary, alt = _split_phones(doc.get("phone_nos") or [])
    first = (doc.get("first_name") or "").strip()
    last = (doc.get("last_name") or "").strip()
    return {
        "first_name": first,
        "last_name": last,
        "name": " ".join(p for p in (first, last) if p),
        "title": doc.get("designation") or "",
        "email": (primary_email or {}).get("email_id") or doc.get("email_id") or "",
        "phone": (primary or {}).get("phone") or doc.get("phone") or "",
        "alt_phone": (alt or {}).get("phone") or "",
        "mobile": doc.get("mobile_no") or "",
    }


def get_venue_contact(supplier_name: str, _client: ERPNextClient | None = None) -> dict[str, Any]:
    client = _client or ERPNextClient()
    contact_name = _find_contact_name(client, supplier_name)
    if not contact_name:
        return {"contact": None}
    doc = client._get(f"/api/resource/Contact/{quote(contact_name, safe='')}").get("data", {})
    return {"contact": _contact_view(doc)}


def _merge_phones(existing: list[dict], phone: str | None, alt_phone: str | None) -> list[dict]:
    """Existing rows kept (so nothing the form never showed is dropped); primary/alt updated in place or added.

    alt_phone: None leaves the second phone alone, "" removes it, a value sets it.
    """
    rows = [dict(r) for r in existing]
    primary, alt = _split_phones(rows)
    if phone:
        if primary:
            primary["phone"] = phone
        else:
            primary = {"phone": phone, "is_primary_phone": 1, "is_primary_mobile_no": 1}
            rows.append(primary)
    if alt_phone is None:
        return rows  # untouched
    if alt_phone == "":
        return [r for r in rows if r is not alt]  # explicitly cleared
    if alt:
        alt["phone"] = alt_phone
    else:
        rows.append({"phone": alt_phone})
    return rows


def _merge_emails(existing: list[dict], email: str | None) -> list[dict]:
    rows = [dict(r) for r in existing]
    if not email:
        return rows
    primary = next((r for r in rows if r.get("is_primary")), rows[0] if rows else None)
    if primary:
        primary["email_id"] = email
    else:
        rows.append({"email_id": email, "is_primary": 1})
    return rows


def _upsert_contact(
    client: ERPNextClient,
    supplier_name: str,
    contact: ContactPayload | None,
) -> None:
    if not contact:
        return
    display_name = (contact.full_name or contact.name or "").strip()
    if not (display_name or contact.email or contact.phone):
        return

    contact_name = _find_contact_name(client, supplier_name)
    existing_doc: dict[str, Any] = {}
    if contact_name:
        existing_doc = client._get(f"/api/resource/Contact/{quote(contact_name, safe='')}").get("data", {})

    links = [dict(r) for r in existing_doc.get("links") or []]
    if not any(r.get("link_doctype") == "Supplier" and r.get("link_name") == supplier_name for r in links):
        links.append({"link_doctype": "Supplier", "link_name": supplier_name})
    contact_doc: dict[str, Any] = {"links": links}
    # The form holds one combined name. Only rewrite first/last when it changed,
    # and then clear last_name so "First Last" is not stored as "First Last Last".
    current_name = _contact_view(existing_doc)["name"] if existing_doc else ""
    if display_name and display_name != current_name:
        contact_doc["first_name"] = display_name
        contact_doc["last_name"] = ""
    elif not existing_doc:
        contact_doc["first_name"] = display_name or supplier_name
    if contact.title:
        contact_doc["designation"] = contact.title
    emails = _merge_emails(existing_doc.get("email_ids") or [], contact.email)
    if emails:
        contact_doc["email_ids"] = emails
    phones = _merge_phones(existing_doc.get("phone_nos") or [], contact.phone, contact.alt_phone)
    if phones:
        contact_doc["phone_nos"] = phones

    if contact_name:
        client._put(f"/api/resource/Contact/{quote(contact_name, safe='')}", contact_doc)
    else:
        client._post("/api/resource/Contact", contact_doc)


def create_venue(payload: VenuePayload, _client: ERPNextClient | None = None) -> dict[str, Any]:
    if not payload.areas:
        raise HTTPException(status_code=400, detail="Venue requires at least one area.")
    client = _client or ERPNextClient()
    doc = _build_supplier_doc(payload)
    result = client._post("/api/resource/Supplier", doc)
    created_name = (result.get("data") or {}).get("name") or payload.supplier_name
    _upsert_contact(client, created_name, payload.contact)
    return {"name": created_name}


def update_venue(
    name: str, payload: VenuePayload, _client: ERPNextClient | None = None
) -> dict[str, Any]:
    if not payload.areas:
        raise HTTPException(status_code=400, detail="Venue requires at least one area.")
    client = _client or ERPNextClient()
    doc = _build_supplier_doc(payload)
    client._put(f"/api/resource/Supplier/{quote(name, safe='')}", doc)
    _upsert_contact(client, name, payload.contact)
    return {"name": name}


@router.post("/")
def post_venue(payload: VenuePayload) -> dict[str, Any]:
    try:
        return create_venue(payload)
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Failed to create venue")
        raise HTTPException(status_code=500, detail=str(exc))


@router.put("/{name}")
def put_venue(name: str, payload: VenuePayload) -> dict[str, Any]:
    try:
        return update_venue(name, payload)
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Failed to update venue")
        raise HTTPException(status_code=500, detail=str(exc))
