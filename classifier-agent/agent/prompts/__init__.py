"""
Classification prompts for the classifier agent.
"""

from .lead import PROMPT as LEAD_PROMPT, EXTRACT_NEW_MESSAGE_PROMPT
from .expense import CLASSIFY_PROMPT as EXPENSE_CLASSIFY_PROMPT, PDF_EXTRACTION_PROMPT

__all__ = [
    "LEAD_PROMPT",
    "EXTRACT_NEW_MESSAGE_PROMPT",
    "EXPENSE_CLASSIFY_PROMPT",
    "PDF_EXTRACTION_PROMPT",
]
