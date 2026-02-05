"""Core modules for email processing."""

from .logging import configure_logging, get_logger
from .models import (
    Email,
    Attachment,
    Classification,
    ClassificationResult,
    ProcessingResult,
    EmailDirection,
)
from .database import Database

__all__ = [
    "configure_logging",
    "get_logger",
    "Email",
    "Attachment",
    "Classification",
    "ClassificationResult",
    "ProcessingResult",
    "EmailDirection",
    "Database",
]
