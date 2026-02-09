"""
Message extraction tool - removes quoted replies from emails.
"""

from google import genai

from agent.config import settings
from agent.logging import get_logger
from agent.models import ExtractMessageRequest, ExtractMessageResult
from agent.prompts import EXTRACT_NEW_MESSAGE_PROMPT

log = get_logger(__name__)


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
        log.debug("extract_message_empty_body")
        return ExtractMessageResult(extracted_message=body)

    prompt = EXTRACT_NEW_MESSAGE_PROMPT.format(body=body[:4000])

    log.debug("extract_message_request", body_length=len(body))

    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
        )
        extracted = response.text.strip()

        # Sanity check
        if not extracted or len(extracted) < 10:
            log.warning("gemini_extraction_empty", extracted_length=len(extracted) if extracted else 0)
            return ExtractMessageResult(extracted_message=body[:3000])

        log.info(
            "message_extracted",
            original_length=len(body),
            extracted_length=len(extracted),
        )

        return ExtractMessageResult(extracted_message=extracted)

    except Exception as e:
        error_str = str(e).lower()

        if any(x in error_str for x in ["rate", "429", "quota"]):
            log.warning("gemini_extraction_rate_limit", error=str(e))
            return ExtractMessageResult(
                extracted_message=body[:3000],
                error="rate_limit",
            )

        log.error("gemini_extraction_error", error=str(e))
        return ExtractMessageResult(
            extracted_message=body[:3000],
            error=str(e),
        )
