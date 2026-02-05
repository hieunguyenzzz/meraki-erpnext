"""Unit tests for classifiers."""

import pytest
from unittest.mock import MagicMock, patch
import sys

from webhook_v2.core.models import Classification, ClassificationResult


# Mock google.generativeai before importing classifier
@pytest.fixture(autouse=True)
def mock_genai():
    """Mock google.generativeai module."""
    mock_genai = MagicMock()
    mock_genai.types.BlockedPromptException = Exception
    mock_genai.types.StopCandidateException = Exception
    sys.modules["google.generativeai"] = mock_genai
    sys.modules["google"] = MagicMock()
    yield mock_genai
    # Cleanup
    if "google.generativeai" in sys.modules:
        del sys.modules["google.generativeai"]
    if "google" in sys.modules:
        del sys.modules["google"]


class TestGeminiClassifierParsing:
    """Tests for GeminiClassifier JSON parsing."""

    def test_parse_response_valid_json(self):
        """Test parsing valid JSON response."""
        # Import after mocking
        from webhook_v2.classifiers.gemini import GeminiClassifier

        classifier = GeminiClassifier.__new__(GeminiClassifier)
        response = '{"classification": "new_lead", "is_client_related": true}'
        result = classifier._parse_response(response)

        assert result["classification"] == "new_lead"
        assert result["is_client_related"] is True

    def test_parse_response_with_markdown(self):
        """Test parsing JSON wrapped in markdown code blocks."""
        from webhook_v2.classifiers.gemini import GeminiClassifier

        classifier = GeminiClassifier.__new__(GeminiClassifier)
        response = """```json
{"classification": "client_message", "is_client_related": true}
```"""
        result = classifier._parse_response(response)

        assert result["classification"] == "client_message"

    def test_parse_response_invalid_json(self):
        """Test invalid JSON returns irrelevant classification."""
        from webhook_v2.classifiers.gemini import GeminiClassifier

        classifier = GeminiClassifier.__new__(GeminiClassifier)
        result = classifier._parse_response("not valid json")

        assert result["classification"] == "irrelevant"

    def test_irrelevant_result(self):
        """Test irrelevant result factory."""
        from webhook_v2.classifiers.gemini import GeminiClassifier

        classifier = GeminiClassifier.__new__(GeminiClassifier)
        result = classifier._irrelevant_result()

        assert result.classification == Classification.IRRELEVANT
        assert result.is_client_related is False


class TestClassificationResult:
    """Tests for ClassificationResult creation."""

    def test_from_dict_maps_fields_correctly(self):
        """Test field mapping from Gemini response format."""
        data = {
            "classification": "new_lead",
            "is_client_related": True,
            "firstname": "Sarah",
            "lastname": "Smith",
            "email": "sarah@example.com",
            "phone": "+1234567890",
            "address": "Australia",
            "coupleName": "Sarah & John",
            "weddingVenue": "Phu Quoc",
            "approximate": "80-100",
            "budget": "50000 USD",
            "weddingDate": "March 2027",
            "position": "Bride",
            "ref": "google",
            "moreDetails": "Planning our dream wedding...",
            "message_summary": "Wedding inquiry for Phu Quoc",
            "meeting_date": "2026-02-15T14:00",
        }

        result = ClassificationResult.from_dict(data)

        assert result.classification == Classification.NEW_LEAD
        assert result.firstname == "Sarah"
        assert result.couple_name == "Sarah & John"
        assert result.guest_count == "80-100"
        assert result.referral_source == "google"
        assert result.message_details == "Planning our dream wedding..."
