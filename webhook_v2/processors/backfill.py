"""
Backfill processor for stored emails.

Processes emails already in PostgreSQL with date filtering.
Does NOT fetch from IMAP - use /fetch endpoint for that.
"""

import argparse
import time
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
from webhook_v2.classifiers import get_classifier
from webhook_v2.handlers import get_handler
from webhook_v2.processors.base import BaseProcessor

log = get_logger(__name__)


class BackfillProcessor(BaseProcessor):
    """
    Process stored emails with date filtering.

    Unlike RealtimeProcessor which handles new emails, this processes
    historical emails already stored in PostgreSQL.

    Uses three-pass processing by default:
    1. First pass: Process new_lead emails (creates leads, skips summary)
    2. Second pass: Process follow-up emails (links to existing leads, skips summary)
    3. Third pass: Batch generate AI summaries for all affected leads

    This ensures leads exist before follow-ups try to link to them,
    and generates only one summary per lead at the end (reducing API calls
    from ~900 to ~50 for typical backfill operations).

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
        classifier=None,
        dry_run: bool = False,
        force: bool = False,
        limit: int | None = None,
        order: str = "asc",
    ):
        self.db = db or Database()
        self.classifier = classifier or get_classifier()
        self.dry_run = dry_run
        self.force = force
        self.limit = limit  # None means no limit (process all)
        self.order = order

    def _classify_with_retry(self, email: Email, max_retries: int = 3) -> ClassificationResult:
        """Classify email with retry logic for rate limits.

        Uses exponential backoff: 30s, 60s, 120s between retries.
        Always waits 30s after successful classification to avoid hitting limits.

        Args:
            email: Email to classify
            max_retries: Maximum retry attempts (default 3)

        Returns:
            ClassificationResult

        Raises:
            Exception: If all retries fail
        """
        base_delay = 30  # Base delay in seconds

        for attempt in range(max_retries + 1):
            try:
                result = self.classifier.classify(email)
                # Wait after successful classification to avoid rate limits
                time.sleep(base_delay)
                return result
            except Exception as e:
                error_str = str(e)
                is_rate_limit = "429" in error_str or "RESOURCE_EXHAUSTED" in error_str

                if is_rate_limit and attempt < max_retries:
                    # Exponential backoff: 60s, 120s, 240s
                    wait_time = base_delay * (2 ** (attempt + 1))
                    log.warning(
                        "classifier_rate_limited_retrying",
                        email_id=email.id,
                        attempt=attempt + 1,
                        max_retries=max_retries,
                        wait_seconds=wait_time,
                    )
                    time.sleep(wait_time)
                else:
                    # Not a rate limit error, or max retries reached
                    raise

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
        """Process emails in three passes: new_leads first, then follow-ups, then batch summaries.

        This ensures leads exist before follow-up emails try to link to them.
        Each email is classified once and the result is reused in the second pass.
        AI summaries are generated once per lead at the end for efficiency.

        Args:
            emails: Unprocessed emails to classify and process
            skipped_followups: Previously skipped follow-ups to retry (already classified)
            doctype: Document type for processing
            stats: Statistics dict to update
        """
        # Track all leads that had communications added (for batch summary generation)
        affected_leads: set[str] = set()

        # First pass: classify all and process new_leads immediately
        deferred_followups: list[tuple[Email, ClassificationResult]] = []

        log.info("pass_1_new_leads", total_emails=len(emails))

        for email in emails:
            try:
                bind_context(email_id=email.id)

                # Classify with retry logic for rate limits
                classification = self._classify_with_retry(email)

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
                    # Process immediately (skip summary for batch generation later)
                    result_id = self._handle_email(email, classification, doctype, stats, skip_summary=True)
                    if result_id:
                        affected_leads.add(result_id)
                elif classification.classification in self.FOLLOWUP_CLASSIFICATIONS:
                    # Defer to second pass (don't re-classify)
                    deferred_followups.append((email, classification))
                else:
                    # Other classifications (e.g., supplier_invoice) - process immediately
                    self._handle_email(email, classification, doctype, stats, skip_summary=True)

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

            for email, classification in deferred_followups:
                try:
                    bind_context(email_id=email.id)
                    was_skipped = email.processed  # If already processed, it was a retry
                    result_id = self._handle_email(email, classification, doctype, stats, skip_summary=True)
                    if result_id:
                        affected_leads.add(result_id)
                    if was_skipped:
                        stats["retried"] += 1
                except Exception as e:
                    log.error("backfill_process_error", error=str(e))
                    self.db.mark_error(email.id, str(e))
                    stats["errors"] += 1
                finally:
                    clear_context()

        # Pass 3: Batch generate summaries for all affected leads
        if affected_leads:
            log.info("pass_3_summaries", count=len(affected_leads))
            from webhook_v2.handlers.lead.handler import LeadHandler

            lead_handler = LeadHandler()
            summary_stats = lead_handler.regenerate_summaries_batch(list(affected_leads))
            log.info("batch_summary_complete", **summary_stats)
            stats["summaries"] = summary_stats

        return stats

    def _handle_email(
        self,
        email: Email,
        classification: ClassificationResult,
        doctype: DocType,
        stats: dict,
        skip_summary: bool = False,
    ) -> str | None:
        """Handle a single classified email.

        Args:
            skip_summary: Skip AI summary generation (for batch processing)

        Returns:
            Lead name if successful, None otherwise
        """
        handler = get_handler(classification.classification)
        if not handler:
            stats["skipped"] += 1
            return None

        # Handle with original timestamp
        timestamp = email.email_date.isoformat() if email.email_date else None
        result = handler.handle(email, classification, timestamp, skip_summary=skip_summary)

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

        return result.result_id if result.success else None

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
        log.info("dry_run_preview", count=len(emails), mode=mode)

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
                log.error("dry_run_error", email_id=email.id, error=str(e))

        return stats

    def _print_lead_preview(self, email: Email, classification: ClassificationResult):
        """Log preview of a lead that would be created."""
        name = classification.couple_name or f"{classification.firstname or ''} {classification.lastname or ''}".strip()
        log.info(
            "dry_run_new_lead",
            email_id=email.id,
            email_date=email.email_date.isoformat() if email.email_date else None,
            subject=email.subject[:80] if email.subject else "(no subject)",
            name=name or "N/A",
            email=classification.email or "N/A",
            phone=classification.phone or "N/A",
            position=classification.position or "N/A",
            source=classification.referral_source or "N/A",
            wedding_date=classification.wedding_date or "N/A",
            venue=classification.wedding_venue or "N/A",
            guests=classification.guest_count or "N/A",
            budget=classification.budget or "N/A",
            summary=classification.message_summary or "N/A",
        )

    def _print_client_message_preview(self, email: Email, classification: ClassificationResult):
        """Log preview of a client message (follow-up)."""
        log.info(
            "dry_run_client_message",
            email_id=email.id,
            email_date=email.email_date.isoformat() if email.email_date else None,
            from_email=classification.email or email.sender_email,
            summary=classification.message_summary or "N/A",
        )


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
        help="Maximum number of emails to process (default: no limit, process all)",
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
        log.error("force_requires_since", error="--force requires --since date to be specified")
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
        log.info(
            "dry_run_summary",
            total=stats["total"],
            new_leads=stats["new_leads"],
            client_messages=stats["client_messages"],
            irrelevant=stats["irrelevant"],
            errors=stats["errors"],
        )
    else:
        log.info(
            "backfill_summary",
            processed=stats["processed"],
            retried=stats.get("retried", 0),
            skipped=stats["skipped"],
            errors=stats["errors"],
        )


if __name__ == "__main__":
    main()
