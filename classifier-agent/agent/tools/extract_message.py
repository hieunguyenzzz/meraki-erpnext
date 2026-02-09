"""
Message extraction tool - removes quoted replies from emails.
"""

import logging

from google import genai

from agent.config import settings
from agent.models import ExtractMessageRequest, ExtractMessageResult
from agent.prompts import EXTRACT_NEW_MESSAGE_PROMPT

log = logging.getLogger(__name__)


def extract_new_message(
    request: ExtractMessageRequest,
    client: genai.Client,
) -> ExtractMessageResult:
    """
    Extract only the new message content from an email reply.

    Args:
        request: Extraction request with email body
        client: Gemini client

    Returns:
        ExtractMessageResult with extracted message
    """
    body = request.body

    if not body or not body.strip():
        return ExtractMessageResult(extracted_message=body)

    prompt = EXTRACT_NEW_MESSAGE_PROMPT.format(body=body[:4000])

    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
        )
        extracted = response.text.strip()

        # Sanity check
        if not extracted or len(extracted) < 10:
            log.warning("gemini_extraction_empty")
            return ExtractMessageResult(extracted_message=body[:3000])

        return ExtractMessageResult(extracted_message=extracted)

    except Exception as e:
        error_str = str(e).lower()

        if any(x in error_str for x in ["rate", "429", "quota"]):
            log.warning("gemini_extraction_rate_limit")
            return ExtractMessageResult(
                extracted_message=body[:3000],
                error="rate_limit",
            )

        log.error("gemini_extraction_error: %s", str(e))
        return ExtractMessageResult(
            extracted_message=body[:3000],
            error=str(e),
        )
