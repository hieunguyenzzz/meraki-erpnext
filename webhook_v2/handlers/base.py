"""
Abstract base class for email handlers.
"""

from abc import ABC, abstractmethod

from webhook_v2.core.models import Email, Classification, ClassificationResult, ProcessingResult


class BaseHandler(ABC):
    """Abstract handler interface for processing classified emails."""

    @abstractmethod
    def can_handle(self, classification: Classification) -> bool:
        """
        Check if this handler can process the given classification.

        Args:
            classification: Email classification type

        Returns:
            True if this handler can process this classification
        """
        pass

    @abstractmethod
    def handle(
        self,
        email: Email,
        classification: ClassificationResult,
        timestamp: str | None = None,
        skip_summary: bool = False,
    ) -> ProcessingResult:
        """
        Process the email based on its classification.

        Args:
            email: Email object to process
            classification: Classification result with extracted data
            timestamp: Optional timestamp for backfill
            skip_summary: Skip AI summary generation (for batch processing)

        Returns:
            ProcessingResult with success status and details
        """
        pass
