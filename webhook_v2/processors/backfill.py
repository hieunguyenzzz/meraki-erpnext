"""
Backfill processor for stored emails.

Processes emails already in PostgreSQL with date filtering.
Does NOT fetch from IMAP - use /fetch endpoint for that.
"""

import argparse
from datetime import datetime

from webhook_v2.config import settings
from webhook_v2.core.logging import get_logger, configure_logging, bind_context, clear_context
from webhook_v2.core.database import Database
from webhook_v2.core.models import (
    Classification,
    ClassificationResult,
    DocType,
    Email,
    ProcessingLog,
)
from webhook_v2.classifiers import GeminiClassifier
from webhook_v2.handlers import get_handler
from webhook_v2.processors.base import BaseProcessor

log = get_logger(__name__)


class BackfillProcessor(BaseProcessor):
    """
    Process stored emails with date filtering.

    Unlike RealtimeProcessor which handles new emails, this processes
    historical emails already stored in PostgreSQL.

    Separation of concerns:
    - /fetch: IMAP → PostgreSQL (fetch new emails)
    - /backfill: PostgreSQL → ERPNext (process stored emails with date filter)
    - /process: PostgreSQL → ERPNext (process all pending)
    """

    def __init__(
        self,
        db: Database | None = None,
        classifier: GeminiClassifier | None = None,
        dry_run: bool = False,
        force: bool = False,
        limit: int | None = None,
        order: str = "asc",
    ):
        self.db = db or Database()
        self.classifier = classifier or GeminiClassifier()
        self.dry_run = dry_run
        self.force = force
        self.limit = limit or settings.processing_batch_size
        self.order = order

    def process(self, doctype: DocType = DocType.LEAD) -> dict:
        """Process pending backfill emails."""
        return self.process_pending(doctype)

    def backfill(
        self,
        since_date: datetime,
        until_date: datetime | None = None,
        doctype: DocType = DocType.LEAD,
    ) -> dict:
        """
        Process stored emails from a date range.

        Args:
            since_date: Start date (inclusive)
            until_date: End date (optional, defaults to now)
            doctype: Document type for processing

        Returns:
            Statistics dict
        """
        log.info(
            "backfill_starting",
            since=since_date.isoformat(),
            until=until_date.isoformat() if until_date else "now",
            dry_run=self.dry_run,
            force=self.force,
        )

        if self.dry_run:
            # Preview mode - classify and print, don't create
            return self.preview_pending(doctype, since_date=since_date, until_date=until_date)

        # Process stored emails with date filter
        stats = self.process_pending(doctype, since_date=since_date, until_date=until_date)

        log.info("backfill_complete", **stats)
        return stats

    def process_pending(
        self,
        doctype: DocType = DocType.LEAD,
        since_date: datetime | None = None,
        until_date: datetime | None = None,
    ) -> dict:
        """Process pending emails from database.

        Args:
            doctype: Document type to process
            since_date: Only process emails from this date onwards (for backfill)
            until_date: Only process emails before this date (for backfill)
        """
        stats = {"processed": 0, "errors": 0, "skipped": 0}

        if self.dry_run:
            return stats

        if self.force and since_date:
            # Force mode: fetch ALL emails in date range, ignoring processed flag
            emails = self.db.get_emails_by_date(
                since_date=since_date,
                until_date=until_date,
                limit=self.limit,
                order=self.order,
            )
        else:
            emails = self.db.get_unprocessed_emails(
                doctype=doctype,
                limit=self.limit,
                since_date=since_date,
                order=self.order,
            )

        log.info("backfill_processing", count=len(emails))

        for email in emails:
            try:
                bind_context(email_id=email.id)

                # Classify
                classification = self.classifier.classify(email)

                if classification.classification == Classification.IRRELEVANT:
                    self.db.mark_processed(
                        email.id,
                        classification.classification,
                        classification.to_dict(),
                    )
                    stats["skipped"] += 1
                    continue

                # Get handler
                handler = get_handler(classification.classification)
                if not handler:
                    stats["skipped"] += 1
                    continue

                # Handle with original timestamp
                timestamp = email.email_date.isoformat() if email.email_date else None
                result = handler.handle(email, classification, timestamp)

                self.db.mark_processed(
                    email.id,
                    classification.classification,
                    classification.to_dict(),
                )

                self.db.add_processing_log(ProcessingLog(
                    email_id=email.id,
                    action=result.action,
                    doctype=doctype,
                    result_id=result.result_id,
                    details=result.details,
                ))

                if result.success:
                    stats["processed"] += 1
                else:
                    stats["errors"] += 1

            except Exception as e:
                log.error("backfill_process_error", error=str(e))
                self.db.mark_error(email.id, str(e))
                stats["errors"] += 1

            finally:
                clear_context()

        return stats

    def preview_pending(
        self,
        doctype: DocType = DocType.LEAD,
        since_date: datetime | None = None,
        until_date: datetime | None = None,
    ) -> dict:
        """Preview what would be created without actually processing.

        Classifies emails and prints lead/communication details.
        """
        stats = {"total": 0, "new_leads": 0, "client_messages": 0, "irrelevant": 0, "errors": 0}

        if self.force and since_date:
            # Force mode: fetch ALL emails in date range, ignoring processed flag
            emails = self.db.get_emails_by_date(
                since_date=since_date,
                until_date=until_date,
                limit=self.limit,
                order=self.order,
            )
        else:
            emails = self.db.get_unprocessed_emails(
                doctype=doctype,
                limit=self.limit,
                since_date=since_date,
                order=self.order,
            )

        mode = "FORCE MODE (all emails)" if self.force else "unprocessed only"
        print(f"\n{'='*60}")
        print(f"DRY RUN PREVIEW - {len(emails)} emails ({mode})")
        print(f"{'='*60}\n")

        for email in emails:
            stats["total"] += 1
            try:
                classification = self.classifier.classify(email)

                if classification.classification == Classification.NEW_LEAD:
                    stats["new_leads"] += 1
                    self._print_lead_preview(email, classification)
                elif classification.classification == Classification.CLIENT_MESSAGE:
                    stats["client_messages"] += 1
                    self._print_client_message_preview(email, classification)
                else:
                    stats["irrelevant"] += 1

            except Exception as e:
                stats["errors"] += 1
                print(f"[ERROR] Email {email.id}: {e}\n")

        return stats

    def _print_lead_preview(self, email: Email, classification: ClassificationResult):
        """Print formatted preview of a lead that would be created."""
        print(f"{'─'*60}")
        print(f"NEW LEAD #{email.id}")
        print(f"{'─'*60}")
        print(f"Email Date: {email.email_date}")
        print(f"Subject: {email.subject[:80] if email.subject else '(no subject)'}")
        print()
        print("LEAD DETAILS:")
        name = classification.couple_name or f"{classification.firstname or ''} {classification.lastname or ''}".strip()
        print(f"  Name: {name or 'N/A'}")
        print(f"  Email: {classification.email or 'N/A'}")
        print(f"  Phone: {classification.phone or 'N/A'}")
        print(f"  Position: {classification.position or 'N/A'}")
        print(f"  Source: {classification.referral_source or 'N/A'}")
        print()
        print("WEDDING DETAILS:")
        print(f"  Date: {classification.wedding_date or 'N/A'}")
        print(f"  Venue: {classification.wedding_venue or 'N/A'}")
        print(f"  Guests: {classification.guest_count or 'N/A'}")
        print(f"  Budget: {classification.budget or 'N/A'}")
        print()
        print("COMMUNICATION:")
        print(f"  Summary: {classification.message_summary or 'N/A'}")
        if classification.message_details:
            msg = classification.message_details[:300]
            if len(classification.message_details) > 300:
                msg += "..."
            print(f"  Message: {msg}")
        print()

    def _print_client_message_preview(self, email: Email, classification: ClassificationResult):
        """Print preview of a client message (follow-up)."""
        print(f"{'─'*60}")
        print(f"CLIENT MESSAGE #{email.id}")
        print(f"{'─'*60}")
        print(f"Email Date: {email.email_date}")
        print(f"From: {classification.email or email.sender_email}")
        print(f"Summary: {classification.message_summary or 'N/A'}")
        print()


def main():
    """CLI entry point for backfill."""
    parser = argparse.ArgumentParser(
        description="Process stored emails from PostgreSQL (use /fetch to pull from IMAP first)"
    )
    parser.add_argument(
        "--since",
        type=str,
        help="Start date (YYYY-MM-DD), required for date filtering",
    )
    parser.add_argument(
        "--until",
        type=str,
        help="End date (YYYY-MM-DD), defaults to now",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Classify and preview leads without creating in ERPNext",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Ignore processed flag - process/preview ALL emails in date range (requires --since)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of emails to process (default: settings.processing_batch_size)",
    )
    parser.add_argument(
        "--order",
        choices=["asc", "desc"],
        default="asc",
        help="Sort order by email date: 'asc' (oldest first) or 'desc' (newest first). Default: asc",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level",
    )

    args = parser.parse_args()

    configure_logging(log_level=args.log_level)

    # Parse dates
    since_date = None
    if args.since:
        since_date = datetime.strptime(args.since, "%Y-%m-%d")

    until_date = None
    if args.until:
        until_date = datetime.strptime(args.until, "%Y-%m-%d")

    # Validate --force requires --since
    if args.force and not args.since:
        print("Error: --force requires --since date to be specified")
        return

    # Run backfill
    processor = BackfillProcessor(dry_run=args.dry_run, force=args.force, limit=args.limit, order=args.order)

    if since_date:
        stats = processor.backfill(since_date, until_date)
    else:
        # Process all pending without date filter
        stats = processor.process_pending()

    if args.dry_run:
        print(f"\nDry Run Summary:")
        print(f"  Total emails: {stats['total']}")
        print(f"  New leads: {stats['new_leads']}")
        print(f"  Client messages: {stats['client_messages']}")
        print(f"  Irrelevant: {stats['irrelevant']}")
        print(f"  Errors: {stats['errors']}")
    else:
        print(f"\nBackfill complete:")
        print(f"  Processed: {stats['processed']}")
        print(f"  Skipped: {stats['skipped']}")
        print(f"  Errors: {stats['errors']}")


if __name__ == "__main__":
    main()
