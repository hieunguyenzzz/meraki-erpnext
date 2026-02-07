"""
Expense email processor.

Processes emails to identify supplier invoices and create Purchase Invoices in ERPNext.
"""

from datetime import datetime, timedelta

from webhook_v2.config import settings
from webhook_v2.core.logging import get_logger, bind_context, clear_context
from webhook_v2.core.database import Database
from webhook_v2.core.models import (
    Email,
    Classification,
    DocType,
    ProcessingLog,
    ProcessingResult,
)
from webhook_v2.classifiers import ExpenseClassifier
from webhook_v2.handlers import get_handler
from webhook_v2.services.imap import IMAPClient
from webhook_v2.processors.base import BaseProcessor

log = get_logger(__name__)


class ExpenseProcessor(BaseProcessor):
    """
    Expense email processor.

    Processes emails from INBOX to identify supplier invoices and
    create Purchase Invoices in ERPNext.
    """

    def __init__(
        self,
        db: Database | None = None,
        imap: IMAPClient | None = None,
        classifier: ExpenseClassifier | None = None,
    ):
        self.db = db or Database()
        self.imap = imap or IMAPClient()
        self.classifier = classifier or ExpenseClassifier()

    def process(self, doctype: DocType = DocType.EXPENSE) -> dict:
        """
        Run the expense processing pipeline.

        Returns:
            Statistics dict with counts
        """
        stats = {
            "fetched": 0,
            "stored": 0,
            "processed": 0,
            "invoices_created": 0,
            "errors": 0,
            "skipped": 0,
        }

        try:
            # Step 1: Fetch and store new emails with PDF attachments
            fetch_stats = self.fetch_and_store()
            stats["fetched"] = fetch_stats["fetched"]
            stats["stored"] = fetch_stats["stored"]

            # Step 2: Process unprocessed emails for expense classification
            process_stats = self.process_pending(doctype)
            stats["processed"] = process_stats["processed"]
            stats["invoices_created"] = process_stats["invoices_created"]
            stats["errors"] = process_stats["errors"]
            stats["skipped"] = process_stats["skipped"]

        except Exception as e:
            log.error("expense_processor_error", error=str(e))
            stats["errors"] += 1

        log.info("expense_processing_complete", **stats)
        return stats

    def fetch_and_store(self, since_days: int = 30) -> dict:
        """
        Fetch emails from IMAP and store in database.

        Only fetches from INBOX (supplier invoices come in, not sent).

        Args:
            since_days: Only fetch emails from last N days

        Returns:
            Statistics dict
        """
        stats = {"fetched": 0, "stored": 0}
        since_date = datetime.now() - timedelta(days=since_days)

        with self.imap:
            # Only fetch from INBOX for expenses (invoices are received)
            try:
                for email in self.imap.fetch_emails(folder="INBOX", since_date=since_date):
                    stats["fetched"] += 1

                    # Skip if already exists
                    if self.db.email_exists(email.message_id):
                        continue

                    # Tag as expense doctype
                    email.doctype = DocType.EXPENSE

                    # Store in database
                    email_id = self.db.insert_email(email)
                    if email_id:
                        stats["stored"] += 1

            except Exception as e:
                log.error("expense_fetch_error", error=str(e))

        log.info("expense_fetch_complete", **stats)
        return stats

    def process_pending(self, doctype: DocType = DocType.EXPENSE) -> dict:
        """
        Process pending expense emails from database.

        Returns:
            Statistics dict
        """
        stats = {"processed": 0, "invoices_created": 0, "errors": 0, "skipped": 0}

        emails = self.db.get_unprocessed_emails(
            doctype=doctype,
            limit=settings.processing_batch_size,
        )

        log.info("processing_expense_emails", count=len(emails))

        for email in emails:
            try:
                bind_context(email_id=email.id, message_id=email.message_id)
                result = self._process_single(email)

                if result.success:
                    if result.action == "purchase_invoice_created":
                        stats["invoices_created"] += 1
                        stats["processed"] += 1
                    elif "skipped" in result.action:
                        stats["skipped"] += 1
                    else:
                        stats["processed"] += 1
                else:
                    stats["errors"] += 1

            except Exception as e:
                log.error("process_expense_error", error=str(e))
                self.db.mark_error(email.id, str(e))
                stats["errors"] += 1

            finally:
                clear_context()

        return stats

    def _process_single(self, email: Email) -> ProcessingResult:
        """Process a single email for expense classification."""
        # Classify using expense classifier
        classification = self.classifier.classify(email)

        log.info(
            "expense_classified",
            classification=classification.classification.value,
            supplier=classification.supplier_name,
        )

        # Skip if not a supplier invoice
        if classification.classification != Classification.SUPPLIER_INVOICE:
            self.db.mark_processed(
                email.id,
                classification.classification,
                classification.to_dict(),
            )
            self.db.add_processing_log(ProcessingLog(
                email_id=email.id,
                action="skipped_not_invoice",
                doctype=email.doctype,
                details={"classification": classification.classification.value},
            ))
            return ProcessingResult(
                success=True,
                email_id=email.id,
                classification=classification.classification,
                action="skipped_not_invoice",
            )

        # Get expense handler
        handler = get_handler(classification.classification)
        if not handler:
            log.warning("no_expense_handler", classification=classification.classification.value)
            self.db.mark_processed(
                email.id,
                classification.classification,
                classification.to_dict(),
            )
            return ProcessingResult(
                success=False,
                email_id=email.id,
                classification=classification.classification,
                action="no_handler",
                error=f"No handler for {classification.classification.value}",
            )

        # Load attachments from database
        email.attachments = self.db.get_attachments(email.id)
        timestamp = email.email_date.isoformat() if email.email_date else None
        result = handler.handle(email, classification, timestamp)

        # Mark processed
        self.db.mark_processed(
            email.id,
            classification.classification,
            classification.to_dict(),
        )

        # Log result
        self.db.add_processing_log(ProcessingLog(
            email_id=email.id,
            action=result.action,
            doctype=email.doctype,
            result_id=result.result_id,
            details=result.details,
        ))

        return result


def run():
    """Entry point for running the expense processor."""
    from webhook_v2.core.logging import configure_logging
    configure_logging()

    processor = ExpenseProcessor()
    stats = processor.process()
    print(f"Expense processing complete: {stats}")


if __name__ == "__main__":
    run()
