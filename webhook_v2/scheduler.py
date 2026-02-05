"""
APScheduler job runner for periodic email processing.
"""

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from webhook_v2.core.logging import get_logger
from webhook_v2.core.models import DocType

log = get_logger(__name__)

# Global scheduler instance
_scheduler: BackgroundScheduler | None = None


def process_emails_job():
    """Scheduled job to process new emails."""
    from webhook_v2.processors.realtime import RealtimeProcessor

    log.info("scheduled_job_starting", job="process_emails")
    try:
        processor = RealtimeProcessor()
        stats = processor.process(DocType.LEAD)
        log.info("scheduled_job_complete", job="process_emails", **stats)
    except Exception as e:
        log.error("scheduled_job_error", job="process_emails", error=str(e))


def start_scheduler(interval_minutes: int = 5) -> BackgroundScheduler:
    """
    Start the background scheduler.

    Args:
        interval_minutes: How often to run the processing job (default: 5)

    Returns:
        The scheduler instance
    """
    global _scheduler

    if _scheduler is not None:
        log.warning("scheduler_already_running")
        return _scheduler

    _scheduler = BackgroundScheduler()

    # Add email processing job
    _scheduler.add_job(
        process_emails_job,
        trigger=IntervalTrigger(minutes=interval_minutes),
        id="process_emails",
        name="Process new emails",
        replace_existing=True,
    )

    _scheduler.start()
    log.info("scheduler_started", interval_minutes=interval_minutes)

    return _scheduler


def stop_scheduler():
    """Stop the background scheduler."""
    global _scheduler

    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        log.info("scheduler_stopped")


def get_scheduler() -> BackgroundScheduler | None:
    """Get the current scheduler instance."""
    return _scheduler


def run_now():
    """Manually trigger the processing job."""
    process_emails_job()
