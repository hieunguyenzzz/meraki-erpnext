"""Home "My tasks": which tasks count as the caller's, and the order they come back in (MWP-98)."""

from datetime import date

from webhook_v2.routers import home


def test_is_mine_matches_assignee_owner_and_shared_exactly():
    me, emp = "a@x.com", "HR-EMP-00001"
    assert home._is_mine({"_assign": '["a@x.com"]'}, me, emp)
    assert home._is_mine({"owner": "a@x.com"}, me, emp)
    assert home._is_mine({"custom_shared_with": "HR-EMP-00009, HR-EMP-00001"}, me, emp)
    # The SQL `like` pre-filter also matches these; the exact check must reject them.
    assert not home._is_mine({"_assign": '["aa@x.com"]'}, me, emp)
    assert not home._is_mine({"custom_shared_with": "HR-EMP-000010"}, me, emp)
    assert not home._is_mine({"_assign": "not json"}, me, emp)


class FakeClient:
    def __init__(self, tasks):
        self.tasks = tasks

    def _get(self, endpoint, params=None):
        if endpoint == "/api/resource/Task":
            return {"data": self.tasks}
        return {"data": [{"name": "P1", "project_name": "Lan & Minh"}]}


def test_open_tasks_sorted_soonest_first_undated_last_and_capped():
    base = {"owner": "a@x.com", "project": "P1"}
    tasks = [{**base, "name": f"T{i}", "subject": f"s{i}", "exp_end_date": d} for i, d in
             enumerate([None, "2026-11-09", "2026-11-01", "2026-11-05", "2026-11-07", "2026-11-03", "2026-11-02"])]
    out = home._my_open_tasks(FakeClient(tasks), "a@x.com", None, date(2026, 11, 4))
    assert out["open_count"] == 7
    assert [t["exp_end_date"] for t in out["items"]] == ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-05", "2026-11-07"]
    assert out["items"][0]["due_in_days"] == -3
    assert out["items"][0]["project_name"] == "Lan & Minh"
