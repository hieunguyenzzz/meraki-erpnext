"""
Idempotent upsert of venue data into ERPNext.

Supplier upserted by custom_venue_external_key.
Child wedding areas replaced wholesale on update.
Contact upserted by (supplier, email) → (supplier, phone) → (supplier, name).
Address upserted by (supplier, address_title).
"""

import logging
import re
from typing import Optional

from slugify import slugify

from core.erpnext_client import ERPNextClient


logger = logging.getLogger(__name__)

_SUPPLIER_GROUP = "Wedding Venues"

_PRICE_PREFIX_RE = re.compile(r"^\s*(LOW|MID|HIGH|LUXURY)\b", re.IGNORECASE)


def build_external_key(city: str, venue_name: str) -> str:
    return slugify(f"{city}-{venue_name}", lowercase=True)


def _map_price_range(raw: str) -> str:
    """Extract LOW/MID/HIGH/LUXURY from sheet text like 'MID (80$ - 130$/ Pax)'.

    Sheet values are already half-structured; a simple prefix regex beats LLM
    normalisation here. Falls back to UNKNOWN when no prefix matches.
    """
    if not raw:
        return "UNKNOWN"
    match = _PRICE_PREFIX_RE.match(raw.strip())
    if match:
        return match.group(1).upper()
    return "UNKNOWN"


def _clean_venue_type(raw: str) -> str:
    """Trim sheet's 'Type of venue' value (e.g. 'Resort/ Retreat' -> 'Resort/Retreat')."""
    if not raw:
        return ""
    return re.sub(r"\s*/\s*", "/", raw.strip())


def _truncate_url(url: str | None, max_len: int = 140) -> str:
    """Truncate a URL to max_len characters to fit ERPNext Data field limit."""
    if not url:
        return ""
    if len(url) <= max_len:
        return url
    logger.warning("URL truncated to %d chars: %s...", max_len, url[:60])
    return url[:max_len]


def _truncate_data(text: str | None, max_len: int = 140) -> str:
    """Normalise whitespace and truncate any Data-field value to max_len.

    Collapses newlines/runs of whitespace into single spaces — ERPNext's resource
    endpoint cannot URL-encode names containing newlines (returns 404 on lookup
    by name), and the source sheet contains multi-line venue-name cells.
    Also enforces the 140-char Data fieldtype limit with an ellipsis when truncated.
    """
    if not text:
        return ""
    s = re.sub(r"\s+", " ", str(text)).strip()
    if len(s) <= max_len:
        return s
    return s[: max_len - 1] + "…"


_PHONE_EXT_RE = re.compile(r"\s*(ext\.?|x|,)\s*\d+.*$", re.IGNORECASE)
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _clean_phone(raw: str | None) -> str:
    """Strip extension suffixes (e.g. 'Ext. 6523') that Frappe's phone validator rejects."""
    if not raw:
        return ""
    return _PHONE_EXT_RE.sub("", str(raw).strip())


def _clean_email(raw: str | None) -> str:
    """Return email only if it parses; otherwise empty string."""
    if not raw:
        return ""
    e = str(raw).strip()
    return e if _EMAIL_RE.match(e) else ""


def _build_area_rows(extracted_areas: list[dict], parsed_areas: list[dict]) -> list[dict]:
    """Merge Gemini-extracted area data with sheet-sourced URLs.

    When Gemini returns a different area count than the sheet, fall back to
    using only the parsed (sheet) data for area names and types, with no
    Gemini-extracted capacity numbers. This handles cases where Gemini
    splits or merges areas incorrectly.
    """
    def _row(ext: dict | None, prs: dict) -> dict:
        row = {
            "doctype": "Venue Wedding Area",
            "area_name": _truncate_data(
                (ext.get("area_name") if ext else None) or prs.get("area_name_text", "")
            ),
            "area_type": (ext.get("area_type") if ext else None) or _map_area_type(prs.get("area_type_text", "")),
            "function": (ext.get("function") if ext else None) or prs.get("area_function_text", ""),
            "capacity_notes": (ext.get("capacity_notes") if ext else None) or prs.get("area_capacity_text", ""),
            "policy_min_spend": prs.get("area_policy_text", ""),
            "setup_notes": prs.get("area_setup_text", ""),
            "meraki_weddings": prs.get("area_meraki_weddings_text", ""),
            "photos_url": _truncate_url(prs.get("area_photos_url")),
        }
        if ext:
            cmin = ext.get("capacity_min")
            cmax = ext.get("capacity_max")
            if cmin:
                row["capacity_min"] = cmin
            if cmax:
                row["capacity_max"] = cmax
        return row

    if len(extracted_areas) != len(parsed_areas):
        logger.warning(
            "Area count mismatch: Gemini returned %d, sheet has %d. "
            "Using sheet-only data for areas.",
            len(extracted_areas), len(parsed_areas),
        )
        return [_row(None, prs) for prs in parsed_areas]

    return [_row(extracted_areas[i], parsed_areas[i]) for i in range(len(parsed_areas))]


_AREA_TYPE_MAP = {
    "ballroom": "Ballroom/Indoor",
    "indoor": "Ballroom/Indoor",
    "lawn": "Lawn",
    "garden": "Lawn",
    "beach": "Beach",
    "restaurant": "Restaurant/Café/Bar",
    "café": "Restaurant/Café/Bar",
    "cafe": "Restaurant/Café/Bar",
    "bar": "Restaurant/Café/Bar",
    "pool": "Pool",
}


def _map_area_type(raw: str) -> str:
    """Map raw area type text to the Select field enum value."""
    raw_lower = raw.lower()
    for keyword, area_type in _AREA_TYPE_MAP.items():
        if keyword in raw_lower:
            return area_type
    return "Other"


def _build_supplier_data(
    external_key: str,
    parsed: dict,
    extracted: dict,
    area_rows: list[dict],
) -> dict:
    return {
        "supplier_name": _truncate_data(parsed["venue_name_raw"]),
        "supplier_group": _SUPPLIER_GROUP,
        "supplier_type": "Company",
        "custom_venue_external_key": _truncate_data(external_key),
        "custom_venue_city": _truncate_data(parsed["city"]),
        "custom_venue_type": _truncate_data(_clean_venue_type(parsed.get("type_of_venue_raw", ""))),
        "custom_venue_price_range": _map_price_range(parsed.get("price_range_raw", "")),
        "custom_venue_location_subarea": _truncate_data(parsed.get("location_subarea") or ""),
        "custom_venue_wedding_package_text": extracted.get("wedding_package_text", ""),
        "custom_venue_wedding_package_url": _truncate_url(parsed.get("wedding_package_url")),
        "custom_venue_insights": extracted.get("insights", ""),
        "custom_venue_accommodation": extracted.get("accommodation", ""),
        "custom_venue_fnb": extracted.get("fnb", ""),
        "custom_venue_av_policy": extracted.get("av_policy", ""),
        "custom_venue_facility": extracted.get("facility", ""),
        "custom_venue_after_party": extracted.get("after_party", "") or "",
        "custom_venue_contact_raw": parsed.get("address_contact_raw", ""),
        "custom_venue_source": (
            f"google-sheet:MERAKI-VENUE:{parsed['tab_name'].strip()}:{parsed['source_row']}"
        ),
        "custom_venue_wedding_areas": area_rows,
    }


def _clean_str(val) -> str:
    """Convert value to string, returning empty string for None/'null' literals."""
    if val is None:
        return ""
    s = str(val).strip()
    if s.lower() in ("null", "none"):
        return ""
    return s


def _upsert_contact(
    client: ERPNextClient,
    supplier_name: str,
    venue_name: str,
    contact_data: dict,
) -> None:
    """Create or update a Contact linked to the Supplier."""
    email = _clean_email(_clean_str(contact_data.get("email")))
    phone = _clean_phone(_clean_str(contact_data.get("phone")))
    name = (contact_data.get("name") or "").strip()

    if not email and not phone:
        return

    # Try to find existing contact by email, then phone, then name
    existing = None
    if email:
        results = client.get_list(
            "Contact",
            filters={"email_id": email},
            fields=["name"],
            limit=1,
        )
        if results:
            existing = results[0]["name"]

    if not existing and phone:
        results = client.get_list(
            "Contact",
            filters={"phone": phone},
            fields=["name"],
            limit=1,
        )
        if results:
            existing = results[0]["name"]

    if not existing and name:
        results = client.get_list(
            "Contact",
            filters={"first_name": name},
            fields=["name"],
            limit=1,
        )
        if results:
            existing = results[0]["name"]

    alt_phone = _clean_phone(_clean_str(contact_data.get("alt_phone")))
    contact_payload = {
        "first_name": name or venue_name,
        "email_ids": [{"email_id": email, "is_primary": 1}] if email else [],
        "phone_nos": [{"phone": phone, "is_primary_phone": 1}] if phone else [],
        "links": [{"link_doctype": "Supplier", "link_name": supplier_name}],
    }
    if _clean_str(contact_data.get("title")):
        contact_payload["designation"] = _clean_str(contact_data["title"])
    if alt_phone:
        contact_payload.setdefault("phone_nos", []).append(
            {"phone": alt_phone, "is_primary_phone": 0}
        )

    if existing:
        client.update("Contact", existing, contact_payload)
    else:
        client.create("Contact", contact_payload)


def _upsert_address(
    client: ERPNextClient,
    supplier_name: str,
    venue_name: str,
    city: str,
    address_data: dict,
) -> None:
    """Create or update an Address linked to the Supplier."""
    line = (address_data.get("line") or "").strip()
    if not line:
        return

    address_title = f"{venue_name} - {city}"

    existing_list = client.get_list(
        "Address",
        filters={"address_title": address_title},
        fields=["name"],
        limit=1,
    )

    payload = {
        "address_title": address_title,
        "address_type": "Office",
        "address_line1": line,
        "city": city,
        "country": "Vietnam",
        "links": [{"link_doctype": "Supplier", "link_name": supplier_name}],
    }
    notes = _clean_str(address_data.get("notes"))
    if notes:
        payload["notes"] = notes

    if existing_list:
        client.update("Address", existing_list[0]["name"], payload)
    else:
        client.create("Address", payload)


def upsert_venue(
    client: ERPNextClient,
    parsed: dict,
    extracted: dict,
) -> tuple[str, str]:
    """Upsert a Supplier (venue) and related Contact/Address.

    Returns:
        (supplier_name, action) where action is "CREATED", "UPDATED", or "SKIPPED".
    """
    external_key = build_external_key(parsed["city"], parsed["venue_name_raw"])

    if not parsed["venue_name_raw"]:
        return ("", "SKIPPED")

    area_rows = _build_area_rows(
        extracted.get("areas", []),
        parsed.get("areas", []),
    )

    supplier_data = _build_supplier_data(external_key, parsed, extracted, area_rows)

    # Check for existing supplier by external key first, then by supplier_name.
    # Pre-existing suppliers from an earlier migration may not have the external key set.
    existing_list = client.get_list(
        "Supplier",
        filters={"custom_venue_external_key": external_key},
        fields=["name"],
        limit=1,
    )

    if not existing_list:
        # Fallback: check by supplier_name to avoid DuplicateEntryError
        existing_list = client.get_list(
            "Supplier",
            filters={"supplier_name": parsed["venue_name_raw"]},
            fields=["name"],
            limit=1,
        )

    if existing_list:
        supplier_name = existing_list[0]["name"]
        result = client.update("Supplier", supplier_name, supplier_data)
        if result is None:
            return (supplier_name, "SKIPPED")
        action = "UPDATED"
    else:
        result = client.create("Supplier", supplier_data)
        if result is None:
            raise RuntimeError(
                f"Failed to create Supplier for external_key={external_key!r} "
                f"venue={parsed['venue_name_raw']!r}"
            )
        supplier_name = result["name"]
        action = "CREATED"

    # Contact
    contact_data = extracted.get("contact") or {}
    if contact_data:
        try:
            _upsert_contact(client, supplier_name, parsed["venue_name_raw"], contact_data)
        except Exception as exc:
            logger.warning("Contact upsert failed for %s: %s", supplier_name, exc)

    # Address
    address_data = extracted.get("address") or {}
    if address_data:
        try:
            _upsert_address(client, supplier_name, parsed["venue_name_raw"], parsed["city"], address_data)
        except Exception as exc:
            logger.warning("Address upsert failed for %s: %s", supplier_name, exc)

    return (supplier_name, action)
