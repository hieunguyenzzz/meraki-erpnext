"""
Expense handler for supplier invoice emails.
"""

from webhook_v2.core.logging import get_logger
from webhook_v2.core.models import (
    Email,
    Classification,
    ClassificationResult,
    ProcessingResult,
)
from webhook_v2.handlers.base import BaseHandler
from webhook_v2.handlers.registry import register_handler
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.classifiers import get_expense_classifier

log = get_logger(__name__)

# Default expense account for unmapped categories
DEFAULT_EXPENSE_ACCOUNT = "Miscellaneous Expenses - MWP"


@register_handler
class ExpenseHandler(BaseHandler):
    """Handler for supplier invoice emails."""

    HANDLED_CLASSIFICATIONS = {Classification.SUPPLIER_INVOICE}

    def __init__(self):
        self._classifier = None

    @property
    def erpnext(self) -> ERPNextClient:
        """Create fresh ERPNext client for each use."""
        return ERPNextClient()

    @property
    def classifier(self):
        """Lazy-load classifier (needs API key)."""
        if self._classifier is None:
            self._classifier = get_expense_classifier()
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
        Process supplier invoice email.

        1. Find PDF attachment
        2. Extract invoice data using the classifier-agent service
        3. Find or create Supplier in ERPNext
        4. Create Purchase Invoice
        """
        email_id = email.id or 0

        # Find PDF attachment
        pdf_attachment = self._find_pdf_attachment(email)
        if not pdf_attachment:
            log.warning("no_pdf_attachment", email_id=email_id)
            return ProcessingResult(
                success=False,
                email_id=email_id,
                classification=classification.classification,
                action="skipped",
                error="No PDF attachment found",
            )

        # Extract invoice data from PDF
        if not pdf_attachment.storage_url:
            log.warning("pdf_not_stored", email_id=email_id)
            return ProcessingResult(
                success=False,
                email_id=email_id,
                classification=classification.classification,
                action="skipped",
                error="PDF attachment not stored in MinIO",
            )

        invoice_data = self.classifier.extract_invoice_from_url(pdf_attachment.storage_url)
        if not invoice_data:
            log.warning("invoice_extraction_failed", email_id=email_id)
            return ProcessingResult(
                success=False,
                email_id=email_id,
                classification=classification.classification,
                action="extraction_failed",
                error="Failed to extract invoice data from PDF",
            )

        # Use extracted supplier name or fall back to classification
        supplier_name = (
            invoice_data.get("supplier_name")
            or classification.supplier_name
            or self._extract_supplier_from_email(email)
        )

        if not supplier_name:
            log.warning("no_supplier_name", email_id=email_id)
            return ProcessingResult(
                success=False,
                email_id=email_id,
                classification=classification.classification,
                action="skipped",
                error="Could not determine supplier name",
            )

        # Get or create supplier in ERPNext
        supplier = self.erpnext.get_or_create_supplier(supplier_name)
        if not supplier:
            log.error("supplier_creation_failed", supplier_name=supplier_name)
            return ProcessingResult(
                success=False,
                email_id=email_id,
                classification=classification.classification,
                action="supplier_failed",
                error=f"Failed to create supplier: {supplier_name}",
            )

        # Prepare invoice items
        items = invoice_data.get("items", [])
        if not items:
            # Create single item from total
            total = invoice_data.get("invoice_total", 0)
            items = [{
                "description": f"Invoice from {supplier_name}",
                "amount": total,
                "expense_account": DEFAULT_EXPENSE_ACCOUNT,
            }]

        # Create Purchase Invoice
        invoice_name = self.erpnext.create_purchase_invoice(
            supplier=supplier,
            items=items,
            posting_date=invoice_data.get("invoice_date"),
            bill_no=invoice_data.get("invoice_number"),
            currency=invoice_data.get("invoice_currency", "VND"),
        )

        if not invoice_name:
            log.error("invoice_creation_failed", email_id=email_id, supplier=supplier)
            return ProcessingResult(
                success=False,
                email_id=email_id,
                classification=classification.classification,
                action="invoice_failed",
                error="Failed to create Purchase Invoice in ERPNext",
            )

        log.info(
            "expense_processed",
            email_id=email_id,
            invoice_name=invoice_name,
            supplier=supplier,
            total=invoice_data.get("invoice_total"),
        )

        return ProcessingResult(
            success=True,
            email_id=email_id,
            classification=classification.classification,
            action="purchase_invoice_created",
            result_id=invoice_name,
            details={
                "supplier": supplier,
                "total": invoice_data.get("invoice_total"),
                "currency": invoice_data.get("invoice_currency"),
                "bill_no": invoice_data.get("invoice_number"),
                "items_count": len(items),
            },
        )

    def _find_pdf_attachment(self, email: Email):
        """Find the first PDF attachment in the email."""
        for attachment in email.attachments:
            if (
                attachment.content_type == "application/pdf"
                or attachment.filename.lower().endswith(".pdf")
            ):
                return attachment
        return None

    def _extract_supplier_from_email(self, email: Email) -> str | None:
        """
        Try to extract supplier name from email sender.

        Examples:
        - "ABC Company <billing@abc.com>" -> "ABC Company"
        - "billing@abc.com" -> "abc.com"
        """
        sender = email.sender
        if not sender:
            return None

        # Check for "Name <email>" format
        if "<" in sender:
            name = sender.split("<")[0].strip()
            if name and name.lower() not in ["billing", "invoice", "accounts"]:
                return name

        # Fall back to domain name
        email_addr = email.sender_email
        if email_addr and "@" in email_addr:
            domain = email_addr.split("@")[1]
            # Remove common TLDs
            name = domain.split(".")[0]
            return name.title()

        return None
