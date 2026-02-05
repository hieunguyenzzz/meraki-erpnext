"""
Data models for email processing.

Uses dataclasses for clean, typed data structures.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


class EmailDirection(str, Enum):
    """Direction of email relative to Meraki."""

    SENT = "Sent"  # Meraki sent to client
    RECEIVED = "Received"  # Client sent to Meraki


class Classification(str, Enum):
    """Email classification types."""

    NEW_LEAD = "new_lead"
    CLIENT_MESSAGE = "client_message"
    STAFF_MESSAGE = "staff_message"
    MEETING_CONFIRMED = "meeting_confirmed"
    QUOTE_SENT = "quote_sent"
    IRRELEVANT = "irrelevant"


class DocType(str, Enum):
    """Target doctype for email processing."""

    LEAD = "lead"
    EXPENSE = "expense"
    HR = "hr"


@dataclass
class Attachment:
    """Email attachment metadata."""

    filename: str
    content_type: str
    size_bytes: int
    storage_url: str | None = None
    email_id: int | None = None


@dataclass
class Email:
    """Email data structure."""

    id: int | None = None
    message_id: str = ""
    mailbox: str = ""
    folder: str = ""
    subject: str = ""
    sender: str = ""
    recipient: str = ""
    cc: str = ""
    email_date: datetime | None = None
    body_plain: str = ""
    body_html: str = ""
    has_attachments: bool = False
    raw_headers: dict[str, Any] = field(default_factory=dict)
    attachments: list[Attachment] = field(default_factory=list)

    # Processing state
    doctype: DocType = DocType.LEAD
    processed: bool = False
    processed_at: datetime | None = None
    classification: Classification | None = None
    classification_data: dict[str, Any] = field(default_factory=dict)
    error_message: str | None = None
    retry_count: int = 0

    @property
    def body(self) -> str:
        """Get email body, preferring plain text."""
        return self.body_plain or self._strip_html(self.body_html)

    @property
    def sender_email(self) -> str:
        """Extract email address from sender header."""
        return self._extract_email(self.sender)

    @property
    def recipient_email(self) -> str:
        """Extract email address from recipient header."""
        return self._extract_email(self.recipient)

    @property
    def is_contact_form(self) -> bool:
        """Check if this is a contact form submission."""
        return (self.subject or "").strip() == "Meraki Contact Form"

    @staticmethod
    def _extract_email(header: str) -> str:
        """Extract email address from header like 'Name <email@example.com>'."""
        if not header:
            return ""
        from email.utils import parseaddr
        _, email = parseaddr(header)
        return email.lower() if email else ""

    @staticmethod
    def _strip_html(html: str) -> str:
        """Strip HTML tags from text."""
        import re
        if not html:
            return ""
        text = re.sub(r"<[^>]+>", " ", html)
        return re.sub(r"\s+", " ", text).strip()


@dataclass
class ClassificationResult:
    """Result from email classification."""

    classification: Classification
    is_client_related: bool = False

    # Extracted lead data
    firstname: str | None = None
    lastname: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    couple_name: str | None = None
    wedding_venue: str | None = None
    guest_count: str | None = None
    budget: str | None = None
    wedding_date: str | None = None
    position: str | None = None
    referral_source: str | None = None
    message_details: str | None = None
    message_summary: str | None = None
    meeting_date: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ClassificationResult":
        """Create ClassificationResult from classifier response dict."""
        classification_str = data.get("classification", "irrelevant")
        try:
            classification = Classification(classification_str)
        except ValueError:
            classification = Classification.IRRELEVANT

        return cls(
            classification=classification,
            is_client_related=data.get("is_client_related", False),
            firstname=data.get("firstname"),
            lastname=data.get("lastname"),
            email=data.get("email"),
            phone=data.get("phone"),
            address=data.get("address"),
            couple_name=data.get("coupleName"),
            wedding_venue=data.get("weddingVenue"),
            guest_count=data.get("approximate"),
            budget=data.get("budget"),
            wedding_date=data.get("weddingDate"),
            position=data.get("position"),
            referral_source=data.get("ref"),
            message_details=data.get("moreDetails"),
            message_summary=data.get("message_summary"),
            meeting_date=data.get("meeting_date"),
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to dict for JSON storage."""
        return {
            "classification": self.classification.value,
            "is_client_related": self.is_client_related,
            "firstname": self.firstname,
            "lastname": self.lastname,
            "email": self.email,
            "phone": self.phone,
            "address": self.address,
            "coupleName": self.couple_name,
            "weddingVenue": self.wedding_venue,
            "approximate": self.guest_count,
            "budget": self.budget,
            "weddingDate": self.wedding_date,
            "position": self.position,
            "ref": self.referral_source,
            "moreDetails": self.message_details,
            "message_summary": self.message_summary,
            "meeting_date": self.meeting_date,
        }


@dataclass
class ProcessingResult:
    """Result from processing an email."""

    success: bool
    email_id: int
    classification: Classification
    action: str  # e.g., "lead_created", "communication_added", "skipped"
    result_id: str | None = None  # e.g., "CRM-LEAD-2026-00123"
    error: str | None = None
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class ProcessingLog:
    """Audit log entry for email processing."""

    email_id: int
    action: str
    doctype: DocType
    result_id: str | None = None
    details: dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.now)
