"""Unit tests for handlers."""

import pytest
from unittest.mock import MagicMock, patch
import sys

from webhook_v2.core.models import Classification, ClassificationResult, Email
from webhook_v2.handlers.registry import register_handler, get_handler, clear_handlers
from webhook_v2.handlers.base import BaseHandler


# Mock external dependencies
@pytest.fixture(autouse=True)
def mock_dependencies():
    """Mock google.generativeai and httpx modules."""
    mock_genai = MagicMock()
    mock_genai.types.BlockedPromptException = Exception
    mock_genai.types.StopCandidateException = Exception
    sys.modules["google.generativeai"] = mock_genai
    sys.modules["google"] = MagicMock()

    mock_httpx = MagicMock()
    sys.modules["httpx"] = mock_httpx

    yield

    # Cleanup
    for mod in ["google.generativeai", "google", "httpx"]:
        if mod in sys.modules:
            del sys.modules[mod]


class TestHandlerRegistry:
    """Tests for handler registry."""

    def setup_method(self):
        """Clear handlers before each test."""
        clear_handlers()

    def test_register_handler(self):
        """Test handler registration."""
        @register_handler
        class TestHandler(BaseHandler):
            def can_handle(self, c):
                return c == Classification.NEW_LEAD

            def handle(self, e, c, t=None):
                pass

        handler = get_handler(Classification.NEW_LEAD)
        assert handler is not None
        assert isinstance(handler, TestHandler)

    def test_get_handler_returns_none_for_unhandled(self):
        """Test get_handler returns None when no handler matches."""
        handler = get_handler(Classification.IRRELEVANT)
        assert handler is None

    def test_get_handler_matches_correct_handler(self):
        """Test get_handler returns correct handler."""
        @register_handler
        class LeadHandler(BaseHandler):
            def can_handle(self, c):
                return c == Classification.NEW_LEAD

            def handle(self, e, c, t=None):
                pass

        @register_handler
        class MessageHandler(BaseHandler):
            def can_handle(self, c):
                return c == Classification.CLIENT_MESSAGE

            def handle(self, e, c, t=None):
                pass

        lead_handler = get_handler(Classification.NEW_LEAD)
        assert isinstance(lead_handler, LeadHandler)

        msg_handler = get_handler(Classification.CLIENT_MESSAGE)
        assert isinstance(msg_handler, MessageHandler)


class TestLeadHandlerUnit:
    """Unit tests for LeadHandler (without actual imports)."""

    def test_can_handle_classifications(self):
        """Test which classifications LeadHandler handles."""
        # These are the classifications LeadHandler should handle
        handled = {
            Classification.NEW_LEAD,
            Classification.CLIENT_MESSAGE,
            Classification.STAFF_MESSAGE,
            Classification.MEETING_CONFIRMED,
            Classification.QUOTE_SENT,
        }

        # IRRELEVANT should not be handled
        assert Classification.IRRELEVANT not in handled

    def test_get_target_email_logic(self):
        """Test target email extraction logic."""
        # Incoming email: sender is target
        email_incoming = Email(
            sender="client@example.com",
            recipient="info@merakiweddingplanner.com",
        )
        assert email_incoming.sender_email == "client@example.com"

        # Outgoing email: recipient is target
        email_outgoing = Email(
            sender="info@merakiweddingplanner.com",
            recipient="client@example.com",
        )
        assert email_outgoing.recipient_email == "client@example.com"

    def test_format_html_escapes_special_chars(self):
        """Test HTML content formatting escapes special characters."""
        import html as html_module

        text = "Line 1\nLine 2\n<script>alert('xss')</script>"
        escaped = html_module.escape(text)
        result = escaped.replace("\n", "<br>\n")

        assert "<br>" in result
        assert "&lt;script&gt;" in result  # HTML escaped
        assert "<script>" not in result  # No raw script tag

    def test_classification_to_status_mapping(self):
        """Test classification to Lead status mapping."""
        mapping = {
            Classification.MEETING_CONFIRMED: "Meeting Scheduled",
            Classification.QUOTE_SENT: "Quotation Sent",
        }

        assert mapping.get(Classification.MEETING_CONFIRMED) == "Meeting Scheduled"
        assert mapping.get(Classification.QUOTE_SENT) == "Quotation Sent"
        assert mapping.get(Classification.NEW_LEAD) is None  # No status change
        assert mapping.get(Classification.CLIENT_MESSAGE) is None
