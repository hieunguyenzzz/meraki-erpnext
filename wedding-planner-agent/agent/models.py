"""
Pydantic models for request/response schemas.
"""

from pydantic import BaseModel


class Communication(BaseModel):
    """A single communication in the conversation history."""

    direction: str  # "Sent" or "Received"
    content: str
    date: str | None = None
    subject: str | None = None


class SuggestResponseRequest(BaseModel):
    """Request to generate a response suggestion."""

    lead_name: str
    communications: list[Communication]
    wedding_date: str | None = None
    venue: str | None = None
    budget: str | None = None
    guest_count: str | None = None


class SuggestResponseResult(BaseModel):
    """Result of response suggestion generation."""

    suggested_response: str
    tools_used: list[str] = []
    follow_up_questions: list[str] = []


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    version: str
    model: str
