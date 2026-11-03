"""venue_names must batch its `name in [...]` lookups so long lists don't overflow the request line (MWP-100)."""

import json
from unittest.mock import MagicMock

from webhook_v2.routers.my_weddings import VENUE_BATCH, venue_names


def test_250_sales_orders_are_fetched_in_batches():
    ids = {f"SO-{i:04d}" for i in range(250)}

    def fake_get(path, params):
        names = json.loads(params["filters"])[0][2]
        if "Sales Order" in path:
            return {"data": [{"name": n, "custom_venue": "SUP-1"} for n in names]}
        return {"data": [{"name": n, "supplier_name": "An Lâm"} for n in names]}

    client = MagicMock()
    client._get.side_effect = fake_get
    result = venue_names(client, ids)

    so_calls = [c for c in client._get.call_args_list if "Sales Order" in c.args[0]]
    assert len(so_calls) == 3  # 100 + 100 + 50
    assert all(len(json.loads(c.kwargs["params"]["filters"])[0][2]) <= VENUE_BATCH for c in so_calls)
    assert len(result) == 250 and set(result.values()) == {"An Lâm"}


def test_no_sales_orders_makes_no_request():
    client = MagicMock()
    assert venue_names(client, set()) == {}
    client._get.assert_not_called()
