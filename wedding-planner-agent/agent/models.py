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
    tone: str = "warm"  # professional, warm, concise, detailed
    feedback: str | None = None  # User's instruction for regeneration


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


class GenerateRequest(BaseModel):
    """Request for generic text generation."""

    system_prompt: str
    content: str
    temperature: float | None = 0.7


class GenerateResult(BaseModel):
    """Result of generic text generation."""

    result: str
    model: str
