"""
Expense email classification tool.
"""

import json
import logging

from google import genai

from agent.config import settings
from agent.models import ClassifyExpenseRequest, ExpenseClassificationResult
from agent.prompts import EXPENSE_CLASSIFY_PROMPT

log = logging.getLogger(__name__)


def classify_expense_email(
    request: ClassifyExpenseRequest,
    client: genai.Client,
) -> ExpenseClassificationResult:
    """
    Classify an email to check if it's a supplier invoice.

    Args:
        request: Expense classification request
        client: Gemini client

    Returns:
        ExpenseClassificationResult with classification
    """
    # Determine email direction
    is_outgoing = settings.is_meraki_email(request.sender)
    direction = "SENT BY Meraki staff" if is_outgoing else "RECEIVED FROM external sender"

    # Format prompt
    prompt = EXPENSE_CLASSIFY_PROMPT.format(
        direction=direction,
        sender=request.sender,
        recipient=request.recipient,
        subject=request.subject,
        has_pdf=request.has_pdf,
        body=request.body[:2000],
    )

    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
        )
        data = _parse_response(response.text)

        log.info(
            "expense_email_classified",
            extra={
                "classification": data.get("classification"),
                "supplier": data.get("supplier_name"),
            },
        )

        return ExpenseClassificationResult(
            classification=data.get("classification", "irrelevant"),
            is_supplier_email=data.get("is_supplier_email", False),
            supplier_name=data.get("supplier_name"),
            invoice_mentioned=data.get("invoice_mentioned", False),
            reason=data.get("reason"),
        )

    except Exception as e:
        error_str = str(e).lower()

        if any(x in error_str for x in ["rate", "429", "quota"]):
            log.error("gemini_rate_limit: %s", str(e))
            return ExpenseClassificationResult(
                classification="irrelevant",
                error=f"rate_limit: {e}",
            )

        if any(x in error_str for x in ["api key", "auth", "401", "403"]):
            log.error("gemini_auth_error: %s", str(e))
            return ExpenseClassificationResult(
                classification="irrelevant",
                error=f"auth_error: {e}",
            )

        log.error("expense_classify_error: %s", str(e))
        return ExpenseClassificationResult(
            classification="irrelevant",
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
        return {"classification": "irrelevant", "is_supplier_email": False}
