"""
Abstract base class for email processors.
"""

from abc import ABC, abstractmethod

from webhook_v2.core.models import DocType


class BaseProcessor(ABC):
    """Abstract processor interface for email processing pipelines."""

    @abstractmethod
    def process(self, doctype: DocType = DocType.LEAD) -> dict:
        """
        Process emails for the given doctype.

        Args:
            doctype: Document type to process

        Returns:
            Processing statistics dict
        """
        pass
