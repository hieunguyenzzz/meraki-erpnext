"""Wedding expense report: constant ERPNext calls, approved-only totals and categories (MWP-121)."""

from webhook_v2.routers import reports


class FakeClient:
    def __init__(self, n: int):
        self.calls: list[str] = []
        self.invoices = []
        for i in range(n):
            status = ("Approved", "Pending", "Rejected")[i % 3]
            base = {"name": f"PI-{i}", "supplier_name": "S", "posting_date": "2026-01-01", "project": "PROJ-1",
                    "grand_total": 100.0, "docstatus": 1 if status == "Approved" else 0,
                    "custom_rejected": 1 if status == "Rejected" else 0, "custom_expense_staff": "EMP-1"}
            # two items per invoice: the lowest idx must win
            self.invoices.append({**base, "idx": 2, "item_name": "late", "expense_account": "Other - MWP"})
            self.invoices.append({**base, "idx": 1, "item_name": f"Item {i}",
                                  "expense_account": "Decor - MWP" if i % 2 == 0 else "Meals - MWP"})

    def _get(self, endpoint, params=None):
        self.calls.append(endpoint)
        if endpoint == "/api/resource/Project":
            return {"data": [{"name": "PROJ-1", "project_name": "Lan & Minh"}]}
        raise AssertionError(f"unexpected GET {endpoint}")

    def _post(self, endpoint, body=None):
        self.calls.append(f"{endpoint}:{body['doctype']}")
        assert endpoint == "/api/method/frappe.client.get_list"
        if body["doctype"] == "Purchase Invoice":
            return {"message": self.invoices}
        if body["doctype"] == "File":
            return {"message": [{"attached_to_name": "PI-0", "file_url": "/files/a.png"}]}
        if body["doctype"] == "Employee":
            return {"message": [{"name": "EMP-1", "employee_name": "Thu"}]}
        raise AssertionError(body["doctype"])


def run(client, monkeypatch, **kw):
    monkeypatch.setattr(reports, "ERPNextClient", lambda: client)
    return reports.wedding_expense_report(**{"project": "", "year": "2026", "month": "", **kw})


def test_calls_are_constant(monkeypatch):
    counts = []
    for n in (3, 30, 300):
        c = FakeClient(n)
        out = run(c, monkeypatch)
        counts.append(len(c.calls))
        assert len(out["data"]) == n
    assert counts == [4, 4, 4]  # projects, invoices, files, employees


def test_totals_and_categories_are_approved_only(monkeypatch):
    out = run(FakeClient(6), monkeypatch)  # i=0,3 approved; 1,4 pending; 2,5 rejected
    s = out["summary"]
    assert (s["total"], s["approved"], s["pending"], s["count"], s["counted"]) == (200.0, 200.0, 200.0, 6, 2)
    # PI-0 (i even) Decor, PI-3 (odd) Meals; categories come from the lowest-idx item
    assert {c["label"]: c["amount"] for c in out["categories"]} == {"Decor": 100.0, "Meals": 100.0}
    assert sum(c["amount"] for c in out["categories"]) == s["total"]
    first = {r["name"]: r for r in out["data"]}
    assert first["PI-0"]["description"] == "Item 0" and first["PI-0"]["receipt_url"] == "/files/a.png"
    assert first["PI-2"]["status"] == "Rejected" and first["PI-1"]["status"] == "Pending"
    assert first["PI-0"]["project_name"] == "Lan & Minh" and first["PI-0"]["staff_name"] == "Thu"


def test_receipt_failure_keeps_the_report(monkeypatch):
    c = FakeClient(3)
    orig = c._post

    def flaky(endpoint, body=None):
        if body["doctype"] == "File":
            raise RuntimeError("boom")
        return orig(endpoint, body)

    c._post = flaky
    out = run(c, monkeypatch)
    assert len(out["data"]) == 3 and out["data"][0]["receipt_url"] is None
