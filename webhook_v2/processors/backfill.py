"""
Historical backfill processor.

Fetches historical emails and processes them with original timestamps.
"""

import argparse
from datetime import datetime, timedelta

from webhook_v2.config import settings
from webhook_v2.core.logging import get_logger, configure_logging, bind_context, clear_context
from webhook_v2.core.database import Database
from webhook_v2.core.models import (
    Email,
    Classification,
    DocType,
    ProcessingLog,
)
from webhook_v2.classifiers import GeminiClassifier
from webhook_v2.handlers import get_handler
from webhook_v2.services.imap import IMAPClient
from webhook_v2.processors.base import BaseProcessor

log = get_logger(__name__)


class BackfillProcessor(BaseProcessor):
    """
    Historical backfill processor.

    Fetches emails from a date range and processes them with original timestamps.
    """

    def __init__(
        self,
        db: Database | None = None,
        imap: IMAPClient | None = None,
        classifier: GeminiClassifier | None = None,
        dry_run: bool = False,
    ):
        self.db = db or Database()
        self.imap = imap or IMAPClient()
        self.classifier = classifier or GeminiClassifier()
        self.dry_run = dry_run

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
        Backfill emails from a date range.

        Args:
            since_date: Start date (inclusive)
            until_date: End date (optional, defaults to now)
            doctype: Document type for processing

        Returns:
            Statistics dict
        """
        stats = {
            "fetched": 0,
            "stored": 0,
            "processed": 0,
            "errors": 0,
            "skipped": 0,
        }

        log.info(
            "backfill_starting",
            since=since_date.isoformat(),
            until=until_date.isoformat() if until_date else "now",
            dry_run=self.dry_run,
        )

        # Step 1: Fetch and store
        with self.imap:
            for folder in ["INBOX", "Sent"]:
                try:
                    for email in self.imap.fetch_emails(folder=folder, since_date=since_date):
                        # Filter by until_date if specified
                        if until_date and email.email_date and email.email_date > until_date:
                            continue

                        stats["fetched"] += 1

                        if self.dry_run:
                            log.info(
                                "dry_run_would_store",
                                subject=email.subject[:50] if email.subject else "(no subject)",
                                date=email.email_date.isoformat() if email.email_date else None,
                            )
                            continue

                        if self.db.email_exists(email.message_id):
                            stats["skipped"] += 1
                            continue

                        email.doctype = doctype
                        email_id = self.db.insert_email(email)
                        if email_id:
                            stats["stored"] += 1

                except Exception as e:
                    log.error("backfill_fetch_error", folder=folder, error=str(e))
                    stats["errors"] += 1

        # Step 2: Process stored emails (not in dry run)
        if not self.dry_run:
            process_stats = self.process_pending(doctype)
            stats["processed"] = process_stats["processed"]
            stats["errors"] += process_stats["errors"]

        log.info("backfill_complete", **stats)
        return stats

    def process_pending(self, doctype: DocType = DocType.LEAD) -> dict:
        """Process pending emails from database."""
        stats = {"processed": 0, "errors": 0, "skipped": 0}

        if self.dry_run:
            return stats

        emails = self.db.get_unprocessed_emails(
            doctype=doctype,
            limit=settings.processing_batch_size,
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


def main():
    """CLI entry point for backfill."""
    parser = argparse.ArgumentParser(description="Backfill historical emails")
    parser.add_argument(
        "--days",
        type=int,
        default=30,
        help="Number of days to backfill (default: 30)",
    )
    parser.add_argument(
        "--since",
        type=str,
        help="Start date (YYYY-MM-DD), overrides --days",
    )
    parser.add_argument(
        "--until",
        type=str,
        help="End date (YYYY-MM-DD), defaults to now",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Don't actually store or process emails",
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
    if args.since:
        since_date = datetime.strptime(args.since, "%Y-%m-%d")
    else:
        since_date = datetime.now() - timedelta(days=args.days)

    until_date = None
    if args.until:
        until_date = datetime.strptime(args.until, "%Y-%m-%d")

    # Run backfill
    processor = BackfillProcessor(dry_run=args.dry_run)
    stats = processor.backfill(since_date, until_date)

    print(f"\nBackfill complete:")
    print(f"  Fetched: {stats['fetched']}")
    print(f"  Stored: {stats['stored']}")
    print(f"  Processed: {stats['processed']}")
    print(f"  Skipped: {stats['skipped']}")
    print(f"  Errors: {stats['errors']}")


if __name__ == "__main__":
    main()
