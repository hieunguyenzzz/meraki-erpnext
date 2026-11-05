"""list_payments loads descriptions in batched calls, not two GETs per payment (MWP-118)."""

import json

from webhook_v2.routers import expenses


class FakeClient:
    def __init__(self, n_expense: int, n_other: int = 3):
        self.calls: list[str] = []
        self.pes = []
        self.refs = []
        self.items = []
        for i in range(n_expense):
            pe, pi = f"PE-{i}", f"PI-{i}"
            self.pes.append({"name": pe, "payment_type": "Pay", "party": "Company Expense",
                             "party_name": "Company Expense", "posting_date": "2026-01-01",
                             "paid_amount": 10, "docstatus": 1})
            # two refs and two items: the lowest idx must win; non-PI refs are filtered out by the query
            self.refs += [
                {"parent": pe, "reference_name": f"{pi}-late", "idx": 2, "reference_doctype": "Purchase Invoice"},
                {"parent": pe, "reference_name": pi, "idx": 1, "reference_doctype": "Purchase Invoice"},
            ]
            self.items += [
                {"parent": pi, "item_name": "second", "expense_account": "X - MWP", "idx": 2},
                {"parent": pi, "item_name": f"Item {i}", "expense_account": "Rent - MWP", "idx": 1},
            ]
        for i in range(n_other):
            self.pes.append({"name": f"REC-{i}", "payment_type": "Receive", "party": "Cust",
                             "party_name": "Cust", "posting_date": "2026-01-01",
                             "paid_amount": 5, "docstatus": 1})

    def _get(self, endpoint, params=None):
        self.calls.append(endpoint)
        flt = json.loads(params.get("filters", "[]"))
        if endpoint == "/api/resource/Payment Entry":
            return {"data": self.pes}
        if endpoint == "/api/resource/Payment Entry Reference":
            parents = next(f[2] for f in flt if f[0] == "parent")
            return {"data": [r for r in self.refs if r["parent"] in parents and r["reference_doctype"] == "Purchase Invoice"]}
        if endpoint == "/api/resource/Purchase Invoice Item":
            parents = next(f[2] for f in flt if f[0] == "parent")
            return {"data": [i for i in self.items if i["parent"] in parents]}
        raise AssertionError(f"unexpected call {endpoint}")


def run(client, monkeypatch):
    monkeypatch.setattr(expenses, "ERPNextClient", lambda: client)
    return expenses.list_payments()


def test_output_matches_and_calls_are_constant(monkeypatch):
    counts = []
    for n in (1, 30, 90):
        c = FakeClient(n)
        out = run(c, monkeypatch)
        counts.append(len(c.calls))
        by = {p["name"]: p for p in out}
        assert by["PE-0"]["description"] == "Item 0"
        assert by["PE-0"]["category"] == "Rent"
        assert by["PE-0"]["linked_invoice"] == "PI-0"
        assert by["REC-0"]["description"] == "" and by["REC-0"]["linked_invoice"] == ""
        assert len(out) == n + 3
    assert counts == [3, 3, 3]


def test_batches_beyond_100_payments(monkeypatch):
    c = FakeClient(250)
    out = run(c, monkeypatch)
    assert len(c.calls) == 1 + 3 * 2  # list + (refs, items) per batch of 100
    assert {p["linked_invoice"] for p in out if p["name"].startswith("PE-")} == {f"PI-{i}" for i in range(250)}


def test_failing_lookup_does_not_fail_the_list(monkeypatch):
    c = FakeClient(5)
    orig = c._get

    def flaky(endpoint, params=None):
        if endpoint == "/api/resource/Purchase Invoice Item":
            raise RuntimeError("boom")
        return orig(endpoint, params)

    c._get = flaky
    out = run(c, monkeypatch)
    assert len(out) == 8 and all(p["description"] == "" for p in out)
