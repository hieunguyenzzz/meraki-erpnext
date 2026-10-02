"""Unit tests for the flight sync scheduler job (MWP-72)."""

from unittest.mock import patch

from webhook_v2 import scheduler
from webhook_v2.processors.flights import sync_lock


def test_fetch_scheduler_registers_daily_flight_sync_in_ho_chi_minh_time():
    try:
        sched = scheduler.start_fetch_scheduler()
        job = sched.get_job("flight_sync")
        assert job is not None and job.max_instances == 1 and job.coalesce
        assert str(job.trigger.timezone) == "Asia/Ho_Chi_Minh"
        assert (job.next_run_time.hour, job.next_run_time.minute) == (scheduler.settings.flight_sync_hour, 0)
    finally:
        scheduler.stop_scheduler()


def test_flight_sync_job_skips_while_a_run_holds_the_lock():
    with patch("webhook_v2.processors.flights.FlightProcessor") as processor:
        assert sync_lock.acquire(blocking=False)
        try:
            scheduler.flight_sync_job()
        finally:
            sync_lock.release()
        processor.assert_not_called()

        scheduler.flight_sync_job()
        processor.return_value.run.assert_called_once()
    assert not sync_lock.locked()  # released after the run


def test_flight_sync_job_releases_the_lock_when_the_run_fails():
    with patch("webhook_v2.processors.flights.FlightProcessor") as processor:
        processor.return_value.run.side_effect = RuntimeError("IMAP down")
        scheduler.flight_sync_job()
    assert not sync_lock.locked()


def test_flight_sync_job_logs_and_returns_when_another_process_is_running(capsys):
    from webhook_v2.processors.flights import SyncAlreadyRunning

    with patch("webhook_v2.processors.flights.FlightProcessor") as processor:
        processor.return_value.run.side_effect = SyncAlreadyRunning("held by another process")
        scheduler.flight_sync_job()
    out = capsys.readouterr().out
    assert "already running" in out and "scheduled_job_error" not in out
    assert not sync_lock.locked()
