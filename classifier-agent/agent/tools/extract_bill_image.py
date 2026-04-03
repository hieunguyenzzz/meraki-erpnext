"""
Bill image extraction tool - extracts expense data from bill/receipt photos.
"""

import base64
import json

from google import genai

from agent.config import settings
from agent.logging import get_logger
from agent.models import ExtractBillImageRequest, ExtractBillImageResult
from agent.prompts import BILL_IMAGE_PROMPT

log = get_logger(__name__)


def extract_bill_from_image(
    request: ExtractBillImageRequest,
    client: genai.Client,
) -> ExtractBillImageResult:
    """
    Extract expense data from a bill/receipt photo using Gemini Vision.

    Args:
        request: Request with base64 encoded image
        client: Gemini client

    Returns:
        ExtractBillImageResult with extracted expense fields
    """
    log.debug("extract_bill_image_request", image_size=len(request.image_base64))

    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=[
                BILL_IMAGE_PROMPT,
                {
                    "inline_data": {
                        "mime_type": request.mime_type,
                        "data": request.image_base64,
                    }
                },
            ],
        )

        data = _parse_response(response.text)

        log.info(
            "bill_image_extracted",
            amount=data.get("amount"),
            currency=data.get("currency"),
            category=data.get("category"),
        )

        return ExtractBillImageResult(
            amount=data.get("amount"),
            date=data.get("date"),
            description=data.get("description"),
            currency=data.get("currency"),
            category=data.get("category"),
        )

    except Exception as e:
        log.error("bill_image_extraction_error", error=str(e))
        return ExtractBillImageResult(error=str(e))


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
        return {}
