#!/usr/bin/env python3
"""
Email Scheduler - Runs email processor every 5 minutes using APScheduler.

Why APScheduler over cron:
- Logs to stdout (Docker captures automatically)
- Handles SIGTERM gracefully
- No env var issues (cron strips them)
- Easy to test locally
- No system packages needed
"""

import logging
import signal
import sys

from apscheduler.schedulers.blocking import BlockingScheduler

from email_processor import process_inbox
from email_staging import run_staging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)

# Create scheduler
scheduler = BlockingScheduler()


def graceful_shutdown(signum, frame):
    """Handle shutdown signals gracefully."""
    logger.info(f"Received signal {signum}, shutting down...")
    scheduler.shutdown(wait=False)
    sys.exit(0)


@scheduler.scheduled_job('interval', minutes=5, id='email_processor')
def run_email_processor():
    """Run email processor job."""
    logger.info("=" * 50)
    logger.info("Starting scheduled email processing...")
    try:
        process_inbox()
        logger.info("Email processing completed successfully")
    except Exception as e:
        logger.error(f"Email processing failed: {e}", exc_info=True)
    logger.info("=" * 50)


@scheduler.scheduled_job('interval', minutes=10, id='email_staging')
def run_email_staging():
    """Run email staging job - fetch emails to PostgreSQL."""
    logger.info("=" * 50)
    logger.info("Starting scheduled email staging...")
    try:
        run_staging(days=7)  # Always fetch last 7 days to catch any missed
        logger.info("Email staging completed successfully")
    except Exception as e:
        logger.error(f"Email staging failed: {e}", exc_info=True)
    logger.info("=" * 50)


if __name__ == '__main__':
    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGTERM, graceful_shutdown)
    signal.signal(signal.SIGINT, graceful_shutdown)

    logger.info("Email scheduler starting...")
    logger.info("Schedules:")
    logger.info("  - Email processor: Every 5 minutes")
    logger.info("  - Email staging: Every 10 minutes")

    # Run email staging immediately on startup
    logger.info("Running initial email staging...")
    try:
        run_email_staging()
    except Exception as e:
        logger.error(f"Initial staging failed: {e}", exc_info=True)

    # Run email processor on startup
    logger.info("Running initial email processing...")
    try:
        run_email_processor()
    except Exception as e:
        logger.error(f"Initial processing failed: {e}", exc_info=True)

    # Start the scheduler
    logger.info("Starting scheduler loop...")
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Scheduler stopped")
