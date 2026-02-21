"""
Backfill processor for stored emails.

Processes emails already in PostgreSQL with date filtering.
Does NOT fetch from IMAP - use /fetch endpoint for that.
"""

import argparse
import time
from datetime import datetime

from webhook_v2.core.logging import get_logger, configure_logging, bind_context, clear_context
from webhook_v2.core.database import Database
from webhook_v2.core.models import Classification, DocType, Email, ProcessingLog
from webhook_v2.classifiers import get_classifier
from webhook_v2.handlers import get_handler
from webhook_v2.handlers.lead.handler import LeadHandler
from webhook_v2.processors.base import BaseProcessor

log = get_logger(__name__)


class BackfillProcessor(BaseProcessor):
    """
    Process stored emails with date filtering.

    Processes emails in chronological order (oldest first) so leads
    are created before their follow-ups naturally.
    """

    def __init__(
        self,
        db: Database | None = None,
        classifier=None,
        dry_run: bool = False,
        force: bool = False,
        limit: int | None = None,
    ):
        self.db = db or Database()
        self.classifier = classifier or get_classifier()
        self.dry_run = dry_run
        self.force = force
        self.limit = limit

    def _classify_with_retry(self, email: Email) -> Classification:
        """Classify email with retry for rate limits."""
        for attempt in range(3):
            try:
                result = self.classifier.classify(email)
                time.sleep(30)  # Rate limit delay
                return result
            except Exception as e:
                if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                    wait = 60 * (attempt + 1)
                    log.warning("rate_limited_retrying", email_id=email.id, attempt=attempt + 1, wait=wait)
                    time.sleep(wait)
                else:
                    raise
        raise Exception(f"Classification failed after 3 retries for email {email.id}")

    def process(self, doctype: DocType = DocType.LEAD) -> dict:
        return self.process_pending(doctype)

    def backfill(self, since_date: datetime, until_date: datetime | None = None) -> dict:
        """Process stored emails from a date range."""
        log.info("backfill_starting", since=since_date.isoformat(), until=until_date.isoformat() if until_date else "now")

        if self.dry_run:
            return self._preview(since_date, until_date)

        stats = self.process_pending(since_date=since_date, until_date=until_date)
        log.info("backfill_complete", **stats)
        return stats

    def process_pending(self, doctype: DocType = DocType.LEAD, since_date: datetime | None = None, until_date: datetime | None = None) -> dict:
        """Process pending emails from database."""
        stats = {"processed": 0, "errors": 0, "skipped": 0}

        if self.dry_run:
            return stats

        # Get emails oldest-first (ensures leads exist before follow-ups)
        if self.force and since_date:
            emails = self.db.get_emails_by_date(since_date, until_date, self.limit, order="asc")
        else:
            emails = self.db.get_unprocessed_emails(doctype, self.limit, since_date, order="asc")

        log.info("processing_emails", count=len(emails))

        # Enable batch mode - skip per-email summaries
        LeadHandler.batch_mode = True
        affected_leads: set[str] = set()

        try:
            for email in emails:
                try:
                    bind_context(email_id=email.id)
                    classification = self._classify_with_retry(email)

                    if classification.classification == Classification.IRRELEVANT:
                        self.db.mark_processed(email.id, classification.classification, classification.to_dict())
                        stats["skipped"] += 1
                        continue

                    handler = get_handler(classification.classification)
                    if not handler:
                        stats["skipped"] += 1
                        continue

                    timestamp = email.email_date.isoformat() if email.email_date else None
                    result = handler.handle(email, classification, timestamp)

                    self.db.mark_processed(email.id, classification.classification, classification.to_dict())
                    self.db.add_processing_log(ProcessingLog(
                        email_id=email.id,
                        action=result.action,
                        doctype=doctype,
                        result_id=result.result_id,
                        details=result.details,
                    ))

                    if result.success:
                        stats["processed"] += 1
                        if result.result_id:
                            affected_leads.add(result.result_id)
                    else:
                        stats["errors"] += 1

                except Exception as e:
                    log.error("process_error", email_id=email.id, error=str(e))
                    self.db.mark_error(email.id, str(e))
                    stats["errors"] += 1
                finally:
                    clear_context()

            # Batch generate summaries for all affected leads
            if affected_leads:
                log.info("generating_summaries", count=len(affected_leads))
                lead_handler = LeadHandler()
                summary_stats = lead_handler.generate_summaries_for_leads(list(affected_leads))
                stats["summaries"] = summary_stats
                log.info("summaries_complete", **summary_stats)

        finally:
            LeadHandler.batch_mode = False

        return stats

    def _preview(self, since_date: datetime | None = None, until_date: datetime | None = None) -> dict:
        """Preview what would be created (dry-run)."""
        stats = {"total": 0, "new_leads": 0, "follow_ups": 0, "irrelevant": 0, "errors": 0}

        if since_date:
            emails = self.db.get_emails_by_date(since_date, until_date, self.limit, order="asc")
        else:
            emails = self.db.get_unprocessed_emails(DocType.LEAD, self.limit, order="asc")

        log.info("dry_run_preview", count=len(emails))

        for email in emails:
            stats["total"] += 1
            try:
                classification = self.classifier.classify(email)
                if classification.classification == Classification.NEW_LEAD:
                    stats["new_leads"] += 1
                elif classification.classification == Classification.IRRELEVANT:
                    stats["irrelevant"] += 1
                else:
                    stats["follow_ups"] += 1
            except Exception as e:
                stats["errors"] += 1
                log.error("dry_run_error", email_id=email.id, error=str(e))

        return stats


def main():
    parser = argparse.ArgumentParser(description="Process stored emails from PostgreSQL")
    parser.add_argument("--since", type=str, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--until", type=str, help="End date (YYYY-MM-DD)")
    parser.add_argument("--dry-run", action="store_true", help="Preview without processing")
    parser.add_argument("--force", action="store_true", help="Reprocess all emails in date range (requires --since)")
    parser.add_argument("--limit", type=int, help="Max emails to process")
    parser.add_argument("--log-level", default="INFO", choices=["DEBUG", "INFO", "WARNING", "ERROR"])

    args = parser.parse_args()
    configure_logging(log_level=args.log_level)

    since_date = datetime.strptime(args.since, "%Y-%m-%d") if args.since else None
    until_date = datetime.strptime(args.until, "%Y-%m-%d") if args.until else None

    if args.force and not since_date:
        log.error("force_requires_since")
        return

    processor = BackfillProcessor(dry_run=args.dry_run, force=args.force, limit=args.limit)

    if since_date:
        stats = processor.backfill(since_date, until_date)
    else:
        stats = processor.process_pending()

    log.info("summary", **stats)


if __name__ == "__main__":
    main()
