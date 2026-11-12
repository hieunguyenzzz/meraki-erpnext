"""A failed receipt upload must not lose the expense, and must be reported (MWP-100)."""

import asyncio
import io
from unittest.mock import MagicMock, patch

from fastapi import UploadFile

from webhook_v2.routers import expenses as ex


def _create(upload_side_effect=None, with_receipt=True, size=10):
    receipt = UploadFile(file=io.BytesIO(b"x" * size), filename="bill.jpg", size=size) if with_receipt else None
    client = MagicMock()
    client.upload_file.side_effect = upload_side_effect
    request = MagicMock()
    request.headers = {}
    response = MagicMock()
    response.headers = {}
    with patch.object(ex, "resolve_employee", return_value="HR-EMP-1"), \
         patch.object(ex, "require_assigned_unless_privileged"), \
         patch.object(ex, "_create_wedding_expense_core", return_value={"name": "PI-1", "status": "Pending"}), \
         patch.object(ex, "ERPNextClient", return_value=client), \
         patch.object(ex, "to_browser_image", return_value=(b"x", "bill.jpg")):
        return asyncio.run(ex.create_wedding_expense_with_receipt(
            request, response, project="PROJ-1", date="2026-11-03", description="d", amount=1000.0,
            category="Khác - MWP", supplier="Company Expense", staff="", note="", receipt=receipt))


def test_attached_receipt_is_reported():
    assert _create()["receipt_attached"] is True


def test_failed_upload_keeps_expense_and_reports_false():
    result = _create(upload_side_effect=RuntimeError("boom"))
    assert result["name"] == "PI-1"
    assert result["receipt_attached"] is False


def test_no_receipt_means_no_flag():
    assert "receipt_attached" not in _create(with_receipt=False)


def test_empty_file_is_not_attached():
    result = _create(size=0)
    assert result["receipt_attached"] is False
