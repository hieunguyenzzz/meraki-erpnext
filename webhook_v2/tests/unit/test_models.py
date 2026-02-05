"""Unit tests for core models."""

import pytest
from datetime import datetime

from webhook_v2.core.models import (
    Email,
    Classification,
    ClassificationResult,
    DocType,
    EmailDirection,
)


class TestEmail:
    """Tests for Email model."""

    def test_sender_email_extraction(self, sample_email):
        """Test email extraction from sender header."""
        assert sample_email.sender_email == "sarah.smith@gmail.com"

    def test_sender_email_with_name(self):
        """Test email extraction from 'Name <email>' format."""
        email = Email(sender="Sarah Smith <sarah@example.com>")
        assert email.sender_email == "sarah@example.com"

    def test_sender_email_empty(self):
        """Test empty sender returns empty string."""
        email = Email(sender="")
        assert email.sender_email == ""

    def test_body_prefers_plain_text(self, sample_email):
        """Test that body property prefers plain text."""
        assert "planning our wedding" in sample_email.body

    def test_body_strips_html_when_no_plain(self):
        """Test HTML stripping when no plain text available."""
        email = Email(body_plain="", body_html="<p>Hello <b>World</b></p>")
        assert email.body == "Hello World"

    def test_is_contact_form(self):
        """Test contact form detection."""
        email = Email(subject="Meraki Contact Form")
        assert email.is_contact_form is True

        email = Email(subject="Wedding Inquiry")
        assert email.is_contact_form is False


class TestClassificationResult:
    """Tests for ClassificationResult model."""

    def test_from_dict_valid(self):
        """Test creating ClassificationResult from valid dict."""
        data = {
            "classification": "new_lead",
            "is_client_related": True,
            "firstname": "Sarah",
            "email": "sarah@example.com",
            "coupleName": "Sarah & John",
        }
        result = ClassificationResult.from_dict(data)

        assert result.classification == Classification.NEW_LEAD
        assert result.is_client_related is True
        assert result.firstname == "Sarah"
        assert result.couple_name == "Sarah & John"

    def test_from_dict_invalid_classification(self):
        """Test invalid classification defaults to IRRELEVANT."""
        data = {"classification": "unknown_type"}
        result = ClassificationResult.from_dict(data)
        assert result.classification == Classification.IRRELEVANT

    def test_to_dict(self, sample_classification_result):
        """Test converting to dict."""
        data = sample_classification_result.to_dict()

        assert data["classification"] == "new_lead"
        assert data["firstname"] == "Sarah"
        assert data["coupleName"] == "Sarah & John"


class TestClassification:
    """Tests for Classification enum."""

    def test_all_values(self):
        """Test all classification values exist."""
        assert Classification.NEW_LEAD.value == "new_lead"
        assert Classification.CLIENT_MESSAGE.value == "client_message"
        assert Classification.STAFF_MESSAGE.value == "staff_message"
        assert Classification.MEETING_CONFIRMED.value == "meeting_confirmed"
        assert Classification.QUOTE_SENT.value == "quote_sent"
        assert Classification.IRRELEVANT.value == "irrelevant"


class TestDocType:
    """Tests for DocType enum."""

    def test_all_values(self):
        """Test all doctype values exist."""
        assert DocType.LEAD.value == "lead"
        assert DocType.EXPENSE.value == "expense"
        assert DocType.HR.value == "hr"
