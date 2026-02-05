"""
Shared pytest fixtures for webhook_v2 tests.
"""

import pytest
from datetime import datetime
from unittest.mock import MagicMock

from webhook_v2.core.models import (
    Email,
    Attachment,
    Classification,
    ClassificationResult,
    DocType,
    EmailDirection,
)


@pytest.fixture
def sample_email() -> Email:
    """Sample email for testing."""
    return Email(
        id=1,
        message_id="<test-123@example.com>",
        mailbox="info@merakiweddingplanner.com",
        folder="INBOX",
        subject="Wedding Inquiry - Sarah & John",
        sender="sarah.smith@gmail.com",
        recipient="info@merakiweddingplanner.com",
        cc="",
        email_date=datetime(2026, 2, 1, 10, 30, 0),
        body_plain="""Hi Meraki,

We are planning our wedding in Vietnam for March 2027.
We're looking at Phu Quoc or Hoi An.
Guest count: 80-100 people.

Best regards,
Sarah""",
        body_html="",
        has_attachments=False,
        doctype=DocType.LEAD,
    )


@pytest.fixture
def sample_outgoing_email() -> Email:
    """Sample outgoing email from Meraki staff."""
    return Email(
        id=2,
        message_id="<test-456@merakiweddingplanner.com>",
        mailbox="info@merakiweddingplanner.com",
        folder="Sent",
        subject="Re: Wedding Inquiry - Sarah & John",
        sender="info@merakiweddingplanner.com",
        recipient="sarah.smith@gmail.com",
        cc="",
        email_date=datetime(2026, 2, 2, 14, 0, 0),
        body_plain="""Dear Sarah,

Thank you for your inquiry! We would love to help plan your special day.

Here is our quotation for a Phu Quoc wedding:
- Basic package: $15,000
- Premium package: $25,000

Best regards,
Meraki Wedding Planner""",
        body_html="",
        has_attachments=False,
        doctype=DocType.LEAD,
    )


@pytest.fixture
def sample_classification_result() -> ClassificationResult:
    """Sample classification result."""
    return ClassificationResult(
        classification=Classification.NEW_LEAD,
        is_client_related=True,
        firstname="Sarah",
        lastname="Smith",
        email="sarah.smith@gmail.com",
        phone=None,
        address="Australia",
        couple_name="Sarah & John",
        wedding_venue="Phu Quoc or Hoi An",
        guest_count="80-100",
        budget=None,
        wedding_date="March 2027",
        position="Bride",
        referral_source="google",
        message_details="Planning wedding in Vietnam...",
        message_summary="Inquiry about Phu Quoc/Hoi An wedding for March 2027",
    )


@pytest.fixture
def sample_attachment() -> Attachment:
    """Sample attachment for testing."""
    return Attachment(
        filename="wedding-mood-board.pdf",
        content_type="application/pdf",
        size_bytes=1024000,
        storage_url="https://minio.example.com/attachments/wedding-mood-board.pdf",
        email_id=1,
    )


@pytest.fixture
def mock_db():
    """Mock database for testing without real DB connection."""
    db = MagicMock()
    db.email_exists.return_value = False
    db.insert_email.return_value = 1
    db.get_unprocessed_emails.return_value = []
    return db


@pytest.fixture
def mock_settings(monkeypatch):
    """Mock settings for testing."""
    monkeypatch.setenv("ZOHO_EMAIL", "test@example.com")
    monkeypatch.setenv("ZOHO_PASSWORD", "test-password")
    monkeypatch.setenv("EMAIL_STORAGE_PASSWORD", "test-db-password")
    monkeypatch.setenv("ERPNEXT_API_KEY", "test-api-key")
    monkeypatch.setenv("ERPNEXT_API_SECRET", "test-api-secret")
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
