"""
Abstract base class for email classifiers.
"""

from abc import ABC, abstractmethod

from webhook_v2.core.models import Email, ClassificationResult


class BaseClassifier(ABC):
    """Abstract classifier interface."""

    @abstractmethod
    def classify(self, email: Email) -> ClassificationResult:
        """
        Classify an email and extract relevant data.

        Args:
            email: Email object to classify

        Returns:
            ClassificationResult with classification and extracted data
        """
        pass

    @abstractmethod
    def extract_new_message(self, body: str) -> str:
        """
        Extract only the new message content from an email reply.

        Removes quoted previous emails (auto-appended when replying).

        Args:
            body: Full email body

        Returns:
            Extracted new message content
        """
        pass
