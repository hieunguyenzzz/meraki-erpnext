"""
Lead handler for wedding inquiry emails.
"""

import html

from webhook_v2.config import settings
from webhook_v2.core.logging import get_logger
from webhook_v2.core.models import (
    Email,
    Classification,
    ClassificationResult,
    ProcessingResult,
    EmailDirection,
)
from webhook_v2.handlers.base import BaseHandler
from webhook_v2.handlers.registry import register_handler
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.classifiers import GeminiClassifier

log = get_logger(__name__)


@register_handler
class LeadHandler(BaseHandler):
    """Handler for lead-related email classifications."""

    HANDLED_CLASSIFICATIONS = {
        Classification.NEW_LEAD,
        Classification.CLIENT_MESSAGE,
        Classification.STAFF_MESSAGE,
        Classification.MEETING_CONFIRMED,
        Classification.QUOTE_SENT,
    }

    def __init__(self):
        self._classifier: GeminiClassifier | None = None

    @property
    def erpnext(self) -> ERPNextClient:
        """Create fresh ERPNext client for each use."""
        return ERPNextClient()

    @property
    def classifier(self) -> GeminiClassifier:
        """Lazy-load classifier (needs API key)."""
        if self._classifier is None:
            self._classifier = GeminiClassifier()
        return self._classifier

    def can_handle(self, classification: Classification) -> bool:
        return classification in self.HANDLED_CLASSIFICATIONS

    def handle(
        self,
        email: Email,
        classification: ClassificationResult,
        timestamp: str | None = None,
    ) -> ProcessingResult:
        """
        Process the email based on classification.

        For new_lead: Create Lead + Communication
        For follow-ups: Find Lead + Create Communication + Update Stage
        """
        # Get target email (client, not Meraki)
        target_email = self._get_target_email(email, classification)
        if not target_email:
            return ProcessingResult(
                success=False,
                email_id=email.id or 0,
                classification=classification.classification,
                action="skipped",
                error="No valid target email found",
            )

        # Use email timestamp for backfill
        email_timestamp = timestamp
        if not email_timestamp and email.email_date:
            email_timestamp = email.email_date.isoformat()

        if classification.classification == Classification.NEW_LEAD:
            return self._handle_new_lead(email, classification, email_timestamp)
        else:
            return self._handle_follow_up(email, classification, email_timestamp)

    def _handle_new_lead(
        self,
        email: Email,
        classification: ClassificationResult,
        timestamp: str | None,
    ) -> ProcessingResult:
        """Handle new lead classification."""
        # Create lead
        lead_name = self.erpnext.create_lead(classification, timestamp)

        if not lead_name:
            return ProcessingResult(
                success=False,
                email_id=email.id or 0,
                classification=classification.classification,
                action="lead_creation_failed",
                error="Failed to create lead in ERPNext",
            )

        # Create initial communication
        content = self._format_initial_communication(email, classification)
        comm_name = self.erpnext.create_communication(
            lead_name=lead_name,
            subject=email.subject or "(No Subject)",
            content=content,
            sent_or_received=self._get_direction(email).value,
            timestamp=timestamp,
        )

        log.info(
            "new_lead_processed",
            email_id=email.id,
            lead_name=lead_name,
            communication=comm_name,
        )

        return ProcessingResult(
            success=True,
            email_id=email.id or 0,
            classification=classification.classification,
            action="lead_created",
            result_id=lead_name,
            details={"communication": comm_name},
        )

    def _handle_follow_up(
        self,
        email: Email,
        classification: ClassificationResult,
        timestamp: str | None,
    ) -> ProcessingResult:
        """Handle follow-up email classifications."""
        target_email = classification.email or self._get_target_email(email, classification)

        # Find existing lead
        lead_name = self.erpnext.find_lead_by_email(target_email)

        if not lead_name:
            # Create lead if not found (edge case: reply to untracked inquiry)
            log.info("lead_not_found_creating", email=target_email)
            return self._handle_new_lead(email, classification, timestamp)

        # Extract new message content (remove quoted replies)
        body = email.body
        if classification.classification in (
            Classification.CLIENT_MESSAGE,
            Classification.STAFF_MESSAGE,
            Classification.MEETING_CONFIRMED,
            Classification.QUOTE_SENT,
        ):
            body = self.classifier.extract_new_message(body)

        # Check for duplicate communication
        if self.erpnext.communication_exists(lead_name, email.subject, timestamp):
            log.info("communication_duplicate_skipped", lead=lead_name)
            return ProcessingResult(
                success=True,
                email_id=email.id or 0,
                classification=classification.classification,
                action="skipped_duplicate",
                result_id=lead_name,
            )

        # Create communication
        content = self._format_html_content(body[:3000] if body else email.subject)
        comm_name = self.erpnext.create_communication(
            lead_name=lead_name,
            subject=email.subject or "(No Subject)",
            content=content,
            sent_or_received=self._get_direction(email).value,
            timestamp=timestamp,
        )

        # Update lead status based on classification
        new_status = self._get_status_for_classification(classification.classification)
        if new_status:
            self.erpnext.update_lead_status(lead_name, new_status)

        log.info(
            "follow_up_processed",
            email_id=email.id,
            lead_name=lead_name,
            classification=classification.classification.value,
        )

        return ProcessingResult(
            success=True,
            email_id=email.id or 0,
            classification=classification.classification,
            action="communication_added",
            result_id=lead_name,
            details={"communication": comm_name, "status_updated": new_status},
        )

    def _get_target_email(self, email: Email, classification: ClassificationResult) -> str:
        """Get client email (not Meraki's email)."""
        # Use classified email if available
        if classification.email:
            return classification.email

        # Determine based on direction
        if settings.is_meraki_email(email.sender_email):
            return email.recipient_email
        return email.sender_email

    def _get_direction(self, email: Email) -> EmailDirection:
        """Determine email direction (Sent or Received)."""
        if email.is_contact_form:
            return EmailDirection.RECEIVED
        if settings.is_meraki_email(email.sender_email):
            return EmailDirection.SENT
        return EmailDirection.RECEIVED

    def _get_status_for_classification(self, classification: Classification) -> str | None:
        """Map classification to Lead status.

        ERPNext valid Lead statuses:
        - Lead, Open, Replied, Opportunity, Quotation, Lost Quotation,
          Interested, Converted, Do Not Contact
        """
        mapping = {
            Classification.MEETING_CONFIRMED: "Interested",
            Classification.QUOTE_SENT: "Quotation",
        }
        return mapping.get(classification)

    def _format_initial_communication(
        self,
        email: Email,
        classification: ClassificationResult,
    ) -> str:
        """Format initial communication content with all extracted info."""
        lines = ["--- Email Inquiry ---" if not email.is_contact_form else "--- Contact Form Submission ---"]

        if classification.firstname or classification.lastname:
            name = " ".join(filter(None, [classification.firstname, classification.lastname]))
            lines.append(f"Name: {name}")

        if classification.email:
            lines.append(f"Email: {classification.email}")
        if classification.phone:
            lines.append(f"Phone: {classification.phone}")
        if classification.position:
            lines.append(f"Position: {classification.position}")
        if classification.couple_name:
            lines.append(f"Couple: {classification.couple_name}")
        if classification.address:
            lines.append(f"Address: {classification.address}")
        if classification.wedding_date:
            lines.append(f"Wedding Date: {classification.wedding_date}")
        if classification.wedding_venue:
            lines.append(f"Wedding Venue: {classification.wedding_venue}")
        if classification.guest_count:
            lines.append(f"Guest Count: {classification.guest_count}")
        if classification.budget:
            lines.append(f"Budget: {classification.budget}")
        if classification.referral_source:
            lines.append(f"Source: {classification.referral_source}")

        # Add full message
        message = classification.message_details or email.body
        if message:
            lines.extend(["", "--- Message ---", message])

        return self._format_html_content("\n".join(lines))

    def _format_html_content(self, text: str) -> str:
        """Convert plain text to HTML."""
        escaped = html.escape(text)
        return escaped.replace("\n", "<br>\n")
