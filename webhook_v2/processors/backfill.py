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

    Uses two-pass processing by default:
    1. First pass: Process new_lead emails (creates leads)
    2. Second pass: Process follow-up emails (links to existing leads)

    This ensures leads exist before follow-ups try to link to them.

    Separation of concerns:
    - /fetch: IMAP → PostgreSQL (fetch new emails)
    - /backfill: PostgreSQL → ERPNext (process stored emails with date filter)
    - /process: PostgreSQL → ERPNext (process all pending)
    """

    # Classifications that create new leads
    LEAD_CLASSIFICATIONS = {Classification.NEW_LEAD}

    # Classifications that follow up on existing leads
    FOLLOWUP_CLASSIFICATIONS = {
        Classification.QUOTE_SENT,
        Classification.CLIENT_MESSAGE,
        Classification.STAFF_MESSAGE,
        Classification.MEETING_CONFIRMED,
    }

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
        stats = {"processed": 0, "errors": 0, "skipped": 0, "retried": 0}

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

        # Also fetch previously skipped follow-ups (they already have classification)
        skipped_followups: list[Email] = []
        if since_date:
            skipped_followups = self.db.get_skipped_followups(
                since_date=since_date,
                until_date=until_date,
                limit=self.limit,
            )

        log.info("backfill_processing", count=len(emails), skipped_followups=len(skipped_followups))

        return self._process_emails(emails, skipped_followups, doctype, stats)

    def _process_emails(
        self,
        emails: list[Email],
        skipped_followups: list[Email],
        doctype: DocType,
        stats: dict,
    ) -> dict:
        """Process emails in two passes: new_leads first, then follow-ups.

        This ensures leads exist before follow-up emails try to link to them.
        Each email is classified once and the result is reused in the second pass.

        Args:
            emails: Unprocessed emails to classify and process
            skipped_followups: Previously skipped follow-ups to retry (already classified)
            doctype: Document type for processing
            stats: Statistics dict to update
        """
        # First pass: classify all and process new_leads immediately
        deferred_followups: list[tuple[Email, ClassificationResult]] = []

        log.info("pass_1_new_leads", total_emails=len(emails))
        print(f"\n[Pass 1] Processing new_lead emails from {len(emails)} unprocessed...")

        for email in emails:
            try:
                bind_context(email_id=email.id)

                # Classify once - reuse result in second pass
                classification = self.classifier.classify(email)

                if classification.classification == Classification.IRRELEVANT:
                    self.db.mark_processed(
                        email.id,
                        classification.classification,
                        classification.to_dict(),
                    )
                    stats["skipped"] += 1
                    continue

                # Check if this is a new_lead or follow-up
                if classification.classification in self.LEAD_CLASSIFICATIONS:
                    # Process immediately
                    self._handle_email(email, classification, doctype, stats)
                elif classification.classification in self.FOLLOWUP_CLASSIFICATIONS:
                    # Defer to second pass (don't re-classify)
                    deferred_followups.append((email, classification))
                else:
                    # Other classifications (e.g., supplier_invoice) - process immediately
                    self._handle_email(email, classification, doctype, stats)

            except Exception as e:
                log.error("backfill_process_error", error=str(e))
                self.db.mark_error(email.id, str(e))
                stats["errors"] += 1

            finally:
                clear_context()

        # Add previously skipped follow-ups (already have classification from before)
        for email in skipped_followups:
            if email.classification and email.classification in self.FOLLOWUP_CLASSIFICATIONS:
                # Use existing classification from classification_data
                classification = ClassificationResult.from_dict(email.classification_data)
                deferred_followups.append((email, classification))

        # Second pass: process all follow-ups (new + previously skipped)
        if deferred_followups:
            new_count = len(deferred_followups) - len(skipped_followups)
            retry_count = len([e for e in skipped_followups if e.classification in self.FOLLOWUP_CLASSIFICATIONS])
            log.info("pass_2_followups", new=new_count, retry=retry_count)
            print(f"[Pass 2] Processing {new_count} new + {retry_count} previously skipped follow-ups...")

            for email, classification in deferred_followups:
                try:
                    bind_context(email_id=email.id)
                    was_skipped = email.processed  # If already processed, it was a retry
                    self._handle_email(email, classification, doctype, stats)
                    if was_skipped:
                        stats["retried"] += 1
                except Exception as e:
                    log.error("backfill_process_error", error=str(e))
                    self.db.mark_error(email.id, str(e))
                    stats["errors"] += 1
                finally:
                    clear_context()

        return stats

    def _handle_email(
        self,
        email: Email,
        classification: ClassificationResult,
        doctype: DocType,
        stats: dict,
    ) -> None:
        """Handle a single classified email."""
        handler = get_handler(classification.classification)
        if not handler:
            stats["skipped"] += 1
            return

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

    def preview_pending(
        self,
        doctype: DocType = DocType.LEAD,
        since_date: datetime | None = None,
        until_date: datetime | None = None,
    ) -> dict:
        """Preview what would be created without actually processing.

        Classifies emails and prints lead/communication details.

        NOTE: Dry-run is FULLY READ-ONLY. It does not modify any database state.
        - With --force or date range: fetches ALL emails (ignores processed flag)
        - Without --force: fetches only unprocessed emails

        This ensures you never need to reset processed flags before previewing,
        avoiding race conditions with the background scheduler.
        """
        stats = {"total": 0, "new_leads": 0, "client_messages": 0, "irrelevant": 0, "errors": 0}

        if since_date:
            # Date range specified: ALWAYS fetch ALL emails in range, ignoring processed flag
            # This makes dry-run fully read-only - no need to reset processed flags first
            emails = self.db.get_emails_by_date(
                since_date=since_date,
                until_date=until_date,
                limit=self.limit,
                order=self.order,
            )
        elif self.force:
            # Force mode without date: not supported, need date range
            log.warning("force_requires_since_date")
            emails = []
        else:
            # No date range: show only unprocessed emails
            emails = self.db.get_unprocessed_emails(
                doctype=doctype,
                limit=self.limit,
                since_date=since_date,
                order=self.order,
            )

        if since_date:
            mode = "all emails in date range"
        elif self.force:
            mode = "FORCE MODE (requires --since)"
        else:
            mode = "unprocessed only"
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
        help="Classify and preview leads without creating in ERPNext. "
             "With --since, previews ALL emails in range (ignoring processed flag). "
             "Without --since, previews only unprocessed emails. "
             "Fully read-only - does not modify database.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="For actual processing (not dry-run): ignore processed flag and "
             "reprocess ALL emails in date range (requires --since)",
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
    processor = BackfillProcessor(
        dry_run=args.dry_run,
        force=args.force,
        limit=args.limit,
        order=args.order,
    )

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
        print(f"  Retried (skipped_no_lead): {stats.get('retried', 0)}")
        print(f"  Skipped: {stats['skipped']}")
        print(f"  Errors: {stats['errors']}")


if __name__ == "__main__":
    main()
