"""
Email classification tool for lead/client emails.
"""

import json
import logging

from google import genai

from agent.config import settings
from agent.models import ClassifyEmailRequest, ClassificationResult
from agent.prompts import LEAD_PROMPT

log = logging.getLogger(__name__)


def classify_lead_email(
    request: ClassifyEmailRequest,
    client: genai.Client,
) -> ClassificationResult:
    """
    Classify an email using Gemini AI.

    Args:
        request: Email classification request
        client: Gemini client

    Returns:
        ClassificationResult with classification and extracted data
    """
    # Determine email direction
    is_outgoing = settings.is_meraki_email(request.sender)
    direction = "SENT BY Meraki staff TO client" if is_outgoing else "RECEIVED FROM potential client"

    # Format prompt
    prompt = LEAD_PROMPT.format(
        direction=direction,
        sender=request.sender,
        recipient=request.recipient,
        subject=request.subject,
        body=request.body[:3000],
    )

    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
        )
        data = _parse_response(response.text)

        log.info(
            "email_classified",
            extra={
                "classification": data.get("classification"),
                "subject": request.subject[:50],
            },
        )

        return ClassificationResult(**data)

    except Exception as e:
        error_str = str(e).lower()

        # Rate limit - include in response
        if any(x in error_str for x in ["rate", "429", "quota"]):
            log.error("gemini_rate_limit: %s", str(e))
            return ClassificationResult(
                classification="irrelevant",
                is_client_related=False,
                error=f"rate_limit: {e}",
            )

        # Auth error
        if any(x in error_str for x in ["api key", "auth", "401", "403"]):
            log.error("gemini_auth_error: %s", str(e))
            return ClassificationResult(
                classification="irrelevant",
                is_client_related=False,
                error=f"auth_error: {e}",
            )

        log.error("gemini_error: %s", str(e))
        return ClassificationResult(
            classification="irrelevant",
            is_client_related=False,
            error=str(e),
        )


def _parse_response(response_text: str) -> dict:
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
        log.error("gemini_parse_error: %s, response: %s", str(e), text[:500])
        return {"classification": "irrelevant", "is_client_related": False}
