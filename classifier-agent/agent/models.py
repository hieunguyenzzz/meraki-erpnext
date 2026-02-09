"""
Request and response models for the classifier API.
"""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class Classification(str, Enum):
    """Email classification types."""

    NEW_LEAD = "new_lead"
    CLIENT_MESSAGE = "client_message"
    STAFF_MESSAGE = "staff_message"
    MEETING_CONFIRMED = "meeting_confirmed"
    QUOTE_SENT = "quote_sent"
    IRRELEVANT = "irrelevant"
    SUPPLIER_INVOICE = "supplier_invoice"


# Request Models


class ClassifyEmailRequest(BaseModel):
    """Request to classify a lead/client email."""

    subject: str = ""
    body: str = ""
    sender: str = ""
    recipient: str = ""
    is_contact_form: bool = False


class ClassifyExpenseRequest(BaseModel):
    """Request to classify an expense/invoice email."""

    subject: str = ""
    body: str = ""
    sender: str = ""
    recipient: str = ""
    has_pdf: bool = False


class ExtractMessageRequest(BaseModel):
    """Request to extract new message from email reply."""

    body: str = ""


class ExtractInvoiceRequest(BaseModel):
    """Request to extract invoice data from PDF."""

    pdf_base64: str = Field(..., description="Base64 encoded PDF content")


# Response Models


class ClassificationResult(BaseModel):
    """Result from email classification."""

    classification: str
    is_client_related: bool = False

    # Lead data
    firstname: str | None = None
    lastname: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    coupleName: str | None = None
    weddingVenue: str | None = None
    approximate: str | None = None
    budget: str | None = None
    weddingDate: str | None = None
    position: str | None = None
    ref: str | None = None
    moreDetails: str | None = None
    message_summary: str | None = None
    meeting_date: str | None = None

    # Invoice fields
    supplier_name: str | None = None
    invoice_number: str | None = None
    invoice_date: str | None = None
    invoice_total: float | None = None
    invoice_currency: str | None = None
    items: list[dict[str, Any]] | None = None

    # Error handling
    error: str | None = None


class ExpenseClassificationResult(BaseModel):
    """Result from expense email classification."""

    classification: str
    is_supplier_email: bool = False
    supplier_name: str | None = None
    invoice_mentioned: bool = False
    reason: str | None = None
    error: str | None = None


class ExtractMessageResult(BaseModel):
    """Result from message extraction."""

    extracted_message: str
    error: str | None = None


class InvoiceItem(BaseModel):
    """Single line item from invoice."""

    description: str
    amount: float
    expense_account: str | None = None


class ExtractInvoiceResult(BaseModel):
    """Result from invoice PDF extraction."""

    supplier_name: str | None = None
    invoice_number: str | None = None
    invoice_date: str | None = None
    invoice_total: float | None = None
    invoice_currency: str | None = None
    items: list[InvoiceItem] = []
    error: str | None = None


class HealthResponse(BaseModel):
    """Health check response."""

    status: str = "healthy"
    version: str = "1.0.0"
    model: str = ""
