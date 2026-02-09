"""
Email classification tool for lead/client emails.
"""

import json

from google import genai

from agent.config import settings
from agent.logging import get_logger
from agent.models import ClassifyEmailRequest, ClassificationResult
from agent.prompts import LEAD_PROMPT

log = get_logger(__name__)


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

    log.debug(
        "classify_lead_request",
        sender=request.sender,
        subject=request.subject[:50] if request.subject else None,
        is_outgoing=is_outgoing,
    )

    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
        )
        data = _parse_response(response.text)

        log.info(
            "email_classified",
            classification=data.get("classification"),
            is_client_related=data.get("is_client_related"),
            subject=request.subject[:50] if request.subject else None,
        )

        return ClassificationResult(**data)

    except Exception as e:
        error_str = str(e).lower()

        # Rate limit - include in response
        if any(x in error_str for x in ["rate", "429", "quota"]):
            log.error("gemini_rate_limit", error=str(e))
            return ClassificationResult(
                classification="irrelevant",
                is_client_related=False,
                error=f"rate_limit: {e}",
            )

        # Auth error
        if any(x in error_str for x in ["api key", "auth", "401", "403"]):
            log.error("gemini_auth_error", error=str(e))
            return ClassificationResult(
                classification="irrelevant",
                is_client_related=False,
                error=f"auth_error: {e}",
            )

        log.error("gemini_error", error=str(e))
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
        log.error("gemini_parse_error", error=str(e), response_preview=text[:200])
        return {"classification": "irrelevant", "is_client_related": False}
