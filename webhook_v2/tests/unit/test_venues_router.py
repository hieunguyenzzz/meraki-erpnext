"""Unit tests for venues router."""

import json
import pytest
from unittest.mock import MagicMock


def test_listing_returns_venues_with_areas():
    """list_venues fetches child areas from the parent doc and attaches them."""
    from webhook_v2.routers.venues import list_venues

    venue_doc = {
        "name": "An Lâm Retreat",
        "supplier_name": "An Lâm Retreat",
        "custom_venue_city": "Nha Trang",
        "custom_venue_type": "Resort/Retreat",
        "custom_venue_price_range": "MID",
        "custom_venue_wedding_areas": [
            {"name": "row1", "area_name": "Lawn",
             "area_type": "Lawn", "capacity_min": 120, "capacity_max": 160, "idx": 1},
            {"name": "row2", "area_name": "Beach",
             "area_type": "Beach", "capacity_min": 80, "capacity_max": 120, "idx": 2},
        ],
    }

    def _fake_get(url, params=None):
        if url == "/api/resource/Supplier":
            return {"data": [{
                "name": "An Lâm Retreat",
                "supplier_name": "An Lâm Retreat",
                "custom_venue_city": "Nha Trang",
            }]}
        elif url.startswith("/api/resource/Supplier/"):
            return {"data": venue_doc}
        raise ValueError(f"Unexpected URL: {url}")

    fake_client = MagicMock()
    fake_client._get.side_effect = _fake_get

    result = list_venues(city=None, _client=fake_client)

    assert "venues" in result
    assert len(result["venues"]) == 1
    v = result["venues"][0]
    assert v["name"] == "An Lâm Retreat"
    assert len(v["areas"]) == 2
    assert v["areas"][0]["area_name"] == "Lawn"
    assert v["areas"][1]["area_name"] == "Beach"


def test_listing_filters_by_city():
    """When `city` is provided, it's pushed into the supplier filter."""
    from webhook_v2.routers.venues import list_venues

    fake_client = MagicMock()
    # Empty venue list — no per-venue fetches will happen
    fake_client._get.return_value = {"data": []}

    list_venues(city="HCM", _client=fake_client)

    # First _get call = supplier query
    first_call = fake_client._get.call_args_list[0]
    params = first_call.kwargs.get("params") or first_call.args[1]
    filters = json.loads(params["filters"])
    assert ["custom_venue_city", "=", "HCM"] in filters


def test_listing_excludes_disabled_and_filters_wedding_venues():
    """list_venues always restricts to active Wedding Venues."""
    from webhook_v2.routers.venues import list_venues

    fake_client = MagicMock()
    # Empty venue list — no per-venue fetches will happen
    fake_client._get.return_value = {"data": []}

    list_venues(city=None, _client=fake_client)

    first_call = fake_client._get.call_args_list[0]
    params = first_call.kwargs.get("params") or first_call.args[1]
    filters = json.loads(params["filters"])
    assert ["supplier_group", "=", "Wedding Venues"] in filters
    assert ["disabled", "=", 0] in filters


def test_listing_returns_empty_areas_when_venue_has_none():
    """A venue with zero child rows still appears in the result with areas=[]."""
    from webhook_v2.routers.venues import list_venues

    def _fake_get(url, params=None):
        if url == "/api/resource/Supplier":
            return {"data": [{"name": "Lonely", "supplier_name": "Lonely Venue"}]}
        elif url.startswith("/api/resource/Supplier/"):
            return {"data": {"name": "Lonely", "custom_venue_wedding_areas": []}}
        raise ValueError(f"Unexpected URL: {url}")

    fake_client = MagicMock()
    fake_client._get.side_effect = _fake_get

    result = list_venues(city=None, _client=fake_client)

    assert len(result["venues"]) == 1
    assert result["venues"][0]["areas"] == []


# ---------------------------------------------------------------------------
# Task 5: create + update endpoints
# ---------------------------------------------------------------------------

def test_venue_payload_requires_supplier_name():
    """Pydantic model rejects empty supplier_name."""
    from webhook_v2.routers.venues import VenuePayload, AreaPayload
    import pydantic

    with pytest.raises((pydantic.ValidationError, Exception)):
        VenuePayload(supplier_name="", areas=[AreaPayload(area_name="Hall")])


def test_create_venue_requires_at_least_one_area():
    """create_venue raises 400 when areas list is empty."""
    from webhook_v2.routers.venues import create_venue, VenuePayload
    from fastapi import HTTPException

    payload = VenuePayload(supplier_name="Test", areas=[])
    fake_client = MagicMock()
    with pytest.raises(HTTPException) as excinfo:
        create_venue(payload, _client=fake_client)
    assert excinfo.value.status_code == 400
    assert "area" in str(excinfo.value.detail).lower()


def test_create_venue_posts_supplier_with_child_rows():
    """create_venue calls _post with Supplier doc containing the area child rows."""
    from webhook_v2.routers.venues import create_venue, VenuePayload, AreaPayload

    payload = VenuePayload(
        supplier_name="Test Venue",
        custom_venue_city="HCM",
        areas=[
            AreaPayload(area_name="Main Hall", area_type="Ballroom/Indoor",
                        capacity_min=100, capacity_max=200),
        ],
    )
    fake_client = MagicMock()
    fake_client._post.return_value = {"data": {"name": "Test Venue"}}

    result = create_venue(payload, _client=fake_client)

    assert result["name"] == "Test Venue"
    # First _post call should be the Supplier
    first_call = fake_client._post.call_args_list[0]
    endpoint = first_call.args[0] if first_call.args else first_call.kwargs.get("endpoint")
    data = first_call.args[1] if len(first_call.args) > 1 else first_call.kwargs.get("data")
    assert endpoint == "/api/resource/Supplier"
    assert data["supplier_name"] == "Test Venue"
    assert data["supplier_group"] == "Wedding Venues"
    assert len(data["custom_venue_wedding_areas"]) == 1
    assert data["custom_venue_wedding_areas"][0]["area_name"] == "Main Hall"


def test_update_venue_puts_supplier_with_child_rows():
    """update_venue calls _put on the named Supplier doc."""
    from webhook_v2.routers.venues import update_venue, VenuePayload, AreaPayload

    payload = VenuePayload(
        supplier_name="Test Venue Renamed",
        areas=[AreaPayload(area_name="Hall")],
    )
    fake_client = MagicMock()
    fake_client._put.return_value = {"data": {"name": "Test Venue"}}
    fake_client._get.return_value = {"data": []}  # no existing contact

    result = update_venue("Test Venue", payload, _client=fake_client)

    assert result["name"] == "Test Venue"
    first_put = fake_client._put.call_args_list[0]
    endpoint = first_put.args[0] if first_put.args else first_put.kwargs.get("endpoint")
    assert endpoint == "/api/resource/Supplier/Test Venue"


def test_create_venue_with_contact_upserts_contact():
    """When payload includes a Contact, it is created and linked to the Supplier."""
    from webhook_v2.routers.venues import create_venue, VenuePayload, AreaPayload, ContactPayload

    payload = VenuePayload(
        supplier_name="Test Venue",
        areas=[AreaPayload(area_name="Hall")],
        contact=ContactPayload(name="Jane", email="jane@example.com", phone="+84 901 234 567"),
    )
    fake_client = MagicMock()
    fake_client._post.return_value = {"data": {"name": "Test Venue"}}
    fake_client._get.return_value = {"data": []}  # no existing contact

    create_venue(payload, _client=fake_client)

    # Should have called _post twice: once for Supplier, once for Contact
    endpoints = [c.args[0] for c in fake_client._post.call_args_list]
    assert "/api/resource/Supplier" in endpoints
    assert "/api/resource/Contact" in endpoints

    # Contact data should reference the venue
    contact_call = [c for c in fake_client._post.call_args_list
                    if c.args[0] == "/api/resource/Contact"][0]
    contact_data = contact_call.args[1] if len(contact_call.args) > 1 else contact_call.kwargs.get("data")
    assert contact_data["first_name"] == "Jane"
    assert any(link["link_doctype"] == "Supplier" and link["link_name"] == "Test Venue"
               for link in contact_data["links"])
