"""
Gemini AI classifier implementation.
"""

import json

import google.generativeai as genai

from webhook_v2.config import settings
from webhook_v2.core.logging import get_logger
from webhook_v2.core.models import Email, Classification, ClassificationResult
from webhook_v2.classifiers.base import BaseClassifier
from webhook_v2.classifiers.prompts import lead as lead_prompts

log = get_logger(__name__)


class GeminiClassifier(BaseClassifier):
    """Gemini AI-based email classifier."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
    ):
        self.api_key = api_key or settings.gemini_api_key
        self.model_name = model or settings.gemini_model

        if not self.api_key:
            raise ValueError("GEMINI_API_KEY is required")

        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel(self.model_name)

    def classify(self, email: Email) -> ClassificationResult:
        """
        Classify an email using Gemini AI.

        Args:
            email: Email to classify

        Returns:
            ClassificationResult with classification and extracted data
        """
        # Determine email direction
        is_outgoing = settings.is_meraki_email(email.sender_email)
        direction = "SENT BY Meraki staff TO client" if is_outgoing else "RECEIVED FROM potential client"

        # Format prompt
        prompt = lead_prompts.PROMPT.format(
            direction=direction,
            sender=email.sender,
            recipient=email.recipient,
            subject=email.subject,
            body=email.body[:3000],
        )

        try:
            response = self.model.generate_content(prompt)
            data = self._parse_response(response.text)

            log.info(
                "email_classified",
                email_id=email.id,
                classification=data.get("classification"),
            )
            return ClassificationResult.from_dict(data)

        except genai.types.BlockedPromptException as e:
            log.warning("gemini_blocked", error=str(e), email_id=email.id)
            return self._irrelevant_result()

        except genai.types.StopCandidateException as e:
            log.warning("gemini_stopped", error=str(e), email_id=email.id)
            return self._irrelevant_result()

        except Exception as e:
            error_str = str(e).lower()

            # Rate limit - re-raise for retry logic
            if any(x in error_str for x in ["rate", "429", "quota"]):
                log.error("gemini_rate_limit", error=str(e))
                raise

            # Auth error - re-raise
            if any(x in error_str for x in ["api key", "auth", "401", "403"]):
                log.error("gemini_auth_error", error=str(e))
                raise RuntimeError(f"Gemini API authentication failed: {e}")

            log.error("gemini_error", error=str(e), email_id=email.id)
            return self._irrelevant_result()

    def extract_new_message(self, body: str) -> str:
        """
        Extract only the new message content from an email reply.

        Args:
            body: Full email body

        Returns:
            Extracted new message, or original body on failure
        """
        if not body or not body.strip():
            return body

        prompt = lead_prompts.EXTRACT_NEW_MESSAGE_PROMPT.format(body=body[:4000])

        try:
            response = self.model.generate_content(prompt)
            extracted = response.text.strip()

            # Sanity check
            if not extracted or len(extracted) < 10:
                log.warning("gemini_extraction_empty")
                return body[:3000]

            return extracted

        except genai.types.BlockedPromptException:
            log.warning("gemini_extraction_blocked")
            return body[:3000]

        except Exception as e:
            error_str = str(e).lower()
            if any(x in error_str for x in ["rate", "429", "quota"]):
                log.warning("gemini_extraction_rate_limit")
            else:
                log.error("gemini_extraction_error", error=str(e))
            return body[:3000]

    def _parse_response(self, response_text: str) -> dict:
        """Parse JSON from Gemini response."""
        text = response_text.strip()

        # Remove markdown code blocks if present
        if text.startswith("```"):
            lines = text.split("\n")
            lines = lines[1:]  # Remove opening ```
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]  # Remove closing ```
            text = "\n".join(lines)

        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            log.error("gemini_parse_error", error=str(e), response=text[:500])
            return {"classification": "irrelevant", "is_client_related": False}

    def _irrelevant_result(self) -> ClassificationResult:
        """Return a safe irrelevant classification."""
        return ClassificationResult(
            classification=Classification.IRRELEVANT,
            is_client_related=False,
        )
