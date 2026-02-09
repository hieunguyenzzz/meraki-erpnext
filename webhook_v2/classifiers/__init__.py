"""
Email classifiers module.

Uses the remote classifier-agent service for all classification tasks.
"""

from webhook_v2.services.classifier_client import RemoteClassifierClient


def get_classifier() -> RemoteClassifierClient:
    """
    Get the classifier for lead/client email classification.

    Returns a RemoteClassifierClient that connects to the classifier-agent service.
    """
    return RemoteClassifierClient()


def get_expense_classifier() -> RemoteClassifierClient:
    """
    Get the classifier for expense/invoice email classification.

    Returns a RemoteClassifierClient that connects to the classifier-agent service.
    """
    return RemoteClassifierClient()


__all__ = [
    "RemoteClassifierClient",
    "get_classifier",
    "get_expense_classifier",
]
