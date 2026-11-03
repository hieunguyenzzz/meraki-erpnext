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
    # Path is URL-encoded so ERPNext receives the correct doc name even with spaces.
    assert endpoint == "/api/resource/Supplier/Test%20Venue"


def test_update_venue_url_encodes_non_ascii_name():
    """Vietnamese venue names must be URL-encoded in the PUT path."""
    from webhook_v2.routers.venues import update_venue, VenuePayload, AreaPayload

    payload = VenuePayload(
        supplier_name="An Lâm Retreat",
        areas=[AreaPayload(area_name="Hall")],
    )
    fake_client = MagicMock()
    fake_client._put.return_value = {"data": {"name": "An Lâm Retreat"}}
    fake_client._get.return_value = {"data": []}

    update_venue("An Lâm Retreat", payload, _client=fake_client)

    first_put = fake_client._put.call_args_list[0]
    endpoint = first_put.args[0]
    assert endpoint == "/api/resource/Supplier/An%20L%C3%A2m%20Retreat"


def test_update_venue_url_encodes_existing_contact_name():
    """Existing Contact PUT path must also be URL-encoded."""
    from webhook_v2.routers.venues import update_venue, VenuePayload, AreaPayload, ContactPayload

    payload = VenuePayload(
        supplier_name="An Lâm Retreat",
        areas=[AreaPayload(area_name="Hall")],
        contact=ContactPayload(name="Nguyễn Văn A", email="a@example.com"),
    )
    fake_client = MagicMock()
    fake_client._put.return_value = {"data": {}}
    fake_client._get.side_effect = lambda url, params=None: (
        {"data": [{"name": "Nguyễn Văn A-An Lâm"}]} if url == "/api/resource/Contact" else {"data": {}}
    )

    update_venue("An Lâm Retreat", payload, _client=fake_client)

    contact_puts = [
        c for c in fake_client._put.call_args_list
        if c.args[0].startswith("/api/resource/Contact/")
    ]
    assert len(contact_puts) == 1
    endpoint = contact_puts[0].args[0]
    assert "%" in endpoint  # encoded, not raw
    assert " " not in endpoint
    assert "ễ" not in endpoint


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


def _contact_client(doc):
    c = MagicMock()

    def _get(url, params=None):
        if url == "/api/resource/Contact":
            return {"data": [{"name": doc["name"]}]}
        return {"data": doc}

    c._get.side_effect = _get
    return c


def _existing_contact():
    return {
        "name": "Quan Test-Venue",
        "first_name": "Quan",
        "last_name": "Test",
        "email_ids": [{"name": "e1", "email_id": "q@x.com", "is_primary": 1}],
        "phone_nos": [
            {"name": "p1", "phone": "111", "is_primary_phone": 1, "is_primary_mobile_no": 1},
            {"name": "p2", "phone": "222"},
        ],
    }


def test_get_contact_returns_primary_and_alt_phone():
    from webhook_v2.routers.venues import get_venue_contact

    view = get_venue_contact("Venue", _client=_contact_client(_existing_contact()))["contact"]
    assert view["name"] == "Quan Test"
    assert view["phone"] == "111" and view["alt_phone"] == "222"
    assert view["email"] == "q@x.com"


def test_upsert_keeps_alt_phone_when_form_sends_none_and_does_not_double_last_name():
    from webhook_v2.routers.venues import ContactPayload, _upsert_contact

    client = _contact_client(_existing_contact())
    _upsert_contact(client, "Venue", ContactPayload(name="Quan Test", phone="111", email="q@x.com"))
    body = client._put.call_args[0][1]
    assert "first_name" not in body and "last_name" not in body
    assert [p["phone"] for p in body["phone_nos"]] == ["111", "222"]


def test_upsert_changed_name_clears_last_name_and_updates_phones_in_place():
    from webhook_v2.routers.venues import ContactPayload, _upsert_contact

    client = _contact_client(_existing_contact())
    _upsert_contact(client, "Venue", ContactPayload(name="Mai Lan", phone="333", alt_phone="444"))
    body = client._put.call_args[0][1]
    assert body["first_name"] == "Mai Lan" and body["last_name"] == ""
    assert [(p["name"], p["phone"]) for p in body["phone_nos"]] == [("p1", "333"), ("p2", "444")]


def test_listing_returns_cover_url_from_one_file_lookup():
    from webhook_v2.routers.venues import list_venues

    calls = []

    def _fake_get(url, params=None):
        calls.append(url)
        if url == "/api/resource/Supplier":
            return {"data": [
                {"name": "A", "custom_cover_photo": "f1"},
                {"name": "B", "custom_cover_photo": None},
            ]}
        if url == "/api/resource/File":
            return {"data": [{"name": "f1", "file_url": "/files/a.jpg"}]}
        return {"data": {"custom_venue_wedding_areas": []}}

    client = MagicMock()
    client._get.side_effect = _fake_get
    venues = {v["name"]: v for v in list_venues(_client=client)["venues"]}
    assert venues["A"]["cover_url"] == "/files/a.jpg"
    assert venues["B"]["cover_url"] is None
    assert calls.count("/api/resource/File") == 1  # one batch for <= 100 covers


def test_upsert_keeps_other_links_and_adds_supplier_link():
    from webhook_v2.routers.venues import ContactPayload, _upsert_contact

    doc = _existing_contact()
    doc["links"] = [{"name": "l1", "link_doctype": "Customer", "link_name": "C1"}]
    client = _contact_client(doc)
    _upsert_contact(client, "Venue", ContactPayload(name="Quan Test", phone="111"))
    links = client._put.call_args[0][1]["links"]
    assert {(l["link_doctype"], l["link_name"]) for l in links} == {("Customer", "C1"), ("Supplier", "Venue")}


def test_upsert_empty_alt_phone_removes_only_the_alt_row():
    from webhook_v2.routers.venues import ContactPayload, _upsert_contact

    client = _contact_client(_existing_contact())
    _upsert_contact(client, "Venue", ContactPayload(name="Quan Test", phone="111", alt_phone=""))
    assert [p["phone"] for p in client._put.call_args[0][1]["phone_nos"]] == ["111"]


def test_listing_survives_cover_lookup_failure_and_batches():
    from webhook_v2.routers.venues import list_venues

    def _fake_get(url, params=None):
        if url == "/api/resource/Supplier":
            return {"data": [{"name": f"V{i}", "custom_cover_photo": f"f{i}"} for i in range(120)]}
        if url == "/api/resource/File":
            raise RuntimeError("boom")
        return {"data": {"custom_venue_wedding_areas": []}}

    client = MagicMock()
    client._get.side_effect = _fake_get
    venues = list_venues(_client=client)["venues"]
    assert len(venues) == 120 and venues[0]["cover_url"] is None


def test_listing_batches_cover_lookup():
    from webhook_v2.routers.venues import list_venues

    file_calls = []

    def _fake_get(url, params=None):
        if url == "/api/resource/Supplier":
            return {"data": [{"name": f"V{i}", "custom_cover_photo": f"f{i}"} for i in range(120)]}
        if url == "/api/resource/File":
            file_calls.append(params)
            return {"data": []}
        return {"data": {"custom_venue_wedding_areas": []}}

    client = MagicMock()
    client._get.side_effect = _fake_get
    list_venues(_client=client)
    assert len(file_calls) == 2  # VENUE_BATCH (100) + 20
