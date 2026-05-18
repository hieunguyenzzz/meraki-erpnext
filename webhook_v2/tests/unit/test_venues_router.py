"""Unit tests for venues router."""

import json
import pytest
from unittest.mock import MagicMock


def test_listing_returns_venues_with_areas():
    """list_venues groups child areas under their parent venue."""
    from webhook_v2.routers.venues import list_venues

    fake_client = MagicMock()
    fake_client._get.side_effect = [
        # First call: supplier list
        {"data": [
            {
                "name": "An Lâm Retreat",
                "supplier_name": "An Lâm Retreat",
                "custom_venue_city": "Nha Trang",
                "custom_venue_type": "Resort/Retreat",
                "custom_venue_price_range": "MID",
            }
        ]},
        # Second call: child rows
        {"data": [
            {"parent": "An Lâm Retreat", "name": "row1", "area_name": "Lawn",
             "area_type": "Lawn", "capacity_min": 120, "capacity_max": 160, "idx": 1},
            {"parent": "An Lâm Retreat", "name": "row2", "area_name": "Beach",
             "area_type": "Beach", "capacity_min": 80, "capacity_max": 120, "idx": 2},
        ]},
    ]

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
    fake_client._get.side_effect = [
        {"data": []},  # no venues
        {"data": []},  # no areas (skipped when venues empty, but side_effect needs it)
    ]

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
    fake_client._get.side_effect = [{"data": []}, {"data": []}]

    list_venues(city=None, _client=fake_client)

    first_call = fake_client._get.call_args_list[0]
    params = first_call.kwargs.get("params") or first_call.args[1]
    filters = json.loads(params["filters"])
    assert ["supplier_group", "=", "Wedding Venues"] in filters
    assert ["disabled", "=", 0] in filters


def test_listing_returns_empty_areas_when_venue_has_none():
    """A venue with zero child rows still appears in the result with areas=[]."""
    from webhook_v2.routers.venues import list_venues

    fake_client = MagicMock()
    fake_client._get.side_effect = [
        {"data": [{"name": "Lonely", "supplier_name": "Lonely Venue"}]},
        {"data": []},
    ]

    result = list_venues(city=None, _client=fake_client)

    assert len(result["venues"]) == 1
    assert result["venues"][0]["areas"] == []
