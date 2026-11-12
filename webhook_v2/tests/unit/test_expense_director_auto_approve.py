"""The Director's expenses skip Pending: created, submitted and paid in one go (MWP-132)."""

from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from webhook_v2.routers import expenses as ex


def _client():
    client = MagicMock()
    client._post.return_value = {"data": {"name": "PI-1"}}
    client._get.return_value = {"data": {"name": "PI-1", "docstatus": 0}}
    return client


def _req():
    return ex.WeddingExpenseRequest(date="2026-11-12", description="vệ sinh vp", amount=200000, category="Taxi")


def _create(client, auto_approve, pay_error=None):
    with patch.object(ex, "ERPNextClient", return_value=client), \
         patch.object(ex, "_mark_pi_paid", side_effect=pay_error) as paid, \
         patch.object(ex, "_notify_finance_managers") as notify:
        return ex._create_wedding_expense_core(_req(), auto_approve=auto_approve), paid, notify


def _submits(client):
    return [c for c in client._post.call_args_list if c.args[0] == "/api/method/frappe.client.submit"]


def test_director_expense_is_approved_and_paid_without_notifying_finance():
    client = _client()
    result, paid, notify = _create(client, auto_approve=True)
    assert result == {"name": "PI-1", "status": "Approved"}
    assert len(_submits(client)) == 1
    paid.assert_called_once_with(client, "PI-1")
    notify.assert_not_called()


def test_other_staff_expense_stays_pending_and_notifies_finance():
    client = _client()
    result, paid, notify = _create(client, auto_approve=False)
    assert result == {"name": "PI-1", "status": "Pending"}
    assert _submits(client) == []
    paid.assert_not_called()
    notify.assert_called_once()


def test_failed_submit_falls_back_to_pending():
    client = _client()
    client._post.side_effect = [{"data": {"name": "PI-1"}}, RuntimeError("period closed")]
    result, paid, notify = _create(client, auto_approve=True)
    assert result == {"name": "PI-1", "status": "Pending"}
    paid.assert_not_called()
    notify.assert_called_once()


def test_failed_payment_leaves_it_approved_not_pending():
    """Submitted but unpaid is still Approved (Finance marks it paid from Expenses), so no pending-approval notice."""
    client = _client()
    result, paid, notify = _create(client, auto_approve=True, pay_error=HTTPException(status_code=400, detail="no cash account"))
    assert result == {"name": "PI-1", "status": "Approved"}
    paid.assert_called_once_with(client, "PI-1")
    notify.assert_not_called()
