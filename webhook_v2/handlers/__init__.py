"""Email handlers."""

from .base import BaseHandler
from .registry import register_handler, get_handler

# Import handlers to trigger registration via @register_handler decorator
from .lead import LeadHandler
from .expense import ExpenseHandler

__all__ = ["BaseHandler", "register_handler", "get_handler", "LeadHandler", "ExpenseHandler"]
