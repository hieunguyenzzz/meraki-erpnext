"""
Handler registry for routing emails to appropriate handlers.
"""

from typing import Type

from webhook_v2.core.logging import get_logger
from webhook_v2.core.models import Classification
from webhook_v2.handlers.base import BaseHandler

log = get_logger(__name__)

# Global handler registry
_handlers: list[BaseHandler] = []


def register_handler(handler_class: Type[BaseHandler]) -> Type[BaseHandler]:
    """
    Decorator to register a handler class.

    Usage:
        @register_handler
        class LeadHandler(BaseHandler):
            ...
    """
    _handlers.append(handler_class())
    log.info("handler_registered", handler=handler_class.__name__)
    return handler_class


def get_handler(classification: Classification) -> BaseHandler | None:
    """
    Get the appropriate handler for a classification.

    Args:
        classification: Email classification type

    Returns:
        Handler that can process this classification, or None
    """
    for handler in _handlers:
        if handler.can_handle(classification):
            return handler
    return None


def get_all_handlers() -> list[BaseHandler]:
    """Get all registered handlers."""
    return _handlers.copy()


def clear_handlers() -> None:
    """Clear all registered handlers (for testing)."""
    _handlers.clear()
