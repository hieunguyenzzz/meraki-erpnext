"""year=all of /financial-overview: per-year rows, all-time totals equal the sum of the per-year totals (MWP-120)."""

import pytest
from fastapi import HTTPException

from webhook_v2.routers import financial


def _year(y, rev, exp, col):
    months = [{"month": f"{y}-{m:02d}", "weddings": 1} for m in range(1, 13)]
    return {
        "year": y, "available_years": [2025, 2024], "months": months,
        "totals": {"revenue": rev, "expenses": exp, "net": rev - exp, "collected": col,
                   "outstanding_receivables": 50, "outstanding_invoices_count": 2,
                   "active_pipeline": 70, "active_weddings_count": 3},
    }


def test_all_years_totals_equal_sum_of_per_year_totals(monkeypatch):
    data = {2024: _year(2024, 1000, 400, 900), 2025: _year(2025, 2000, 2500, 1500)}
    monkeypatch.setattr(financial, "_year_overview", lambda client, y: data.get(y, data[2025]))
    out = financial._all_years_overview(object())
    assert [r["month"] for r in out["months"]] == ["2024", "2025"]
    assert out["year"] == "all"
    for k in ("revenue", "expenses", "net", "collected"):
        assert out["totals"][k] == sum(d["totals"][k] for d in data.values())
        assert out["totals"][k] == sum(r[k] for r in out["months"])
    assert out["totals"]["outstanding_receivables"] == 50
    assert out["months"][0]["weddings"] == 12


def test_junk_year_is_rejected():
    with pytest.raises(HTTPException) as e:
        financial.get_financial_overview(year="abc")
    assert e.value.status_code == 422
