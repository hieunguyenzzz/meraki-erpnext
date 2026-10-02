"""Unit tests for the flight bookings Postgres state schema (MWP-72)."""

from contextlib import contextmanager
from unittest.mock import MagicMock

import pytest

from webhook_v2.core.database import Database


def _database_with_fake_connection():
    conn = MagicMock()

    db = Database(connection_string="postgresql://unused")

    @contextmanager
    def fake_connection():
        yield conn

    db.get_connection = fake_connection
    return db, conn


def test_init_schema_creates_flight_tables():
    db, conn = _database_with_fake_connection()

    db.init_schema()

    schema_sql = conn.execute.call_args[0][0]
    assert "CREATE TABLE IF NOT EXISTS flight_emails" in schema_sql
    assert "CREATE TABLE IF NOT EXISTS flight_sync_runs" in schema_sql


def test_upsert_flight_email_rejects_unknown_column():
    db, _ = _database_with_fake_connection()

    with pytest.raises(ValueError):
        db.upsert_flight_email("<id@x>", status="done", message_id_typo="x")


def test_upsert_flight_email_counts_attempts_only_for_failures():
    db, conn = _database_with_fake_connection()

    db.upsert_flight_email("<id@x>", status="failed", error="boom")
    db.upsert_flight_email("<id@x>", status="done")
    db.upsert_flight_email("<id@x>", status="skipped")

    calls = conn.execute.call_args_list
    for sql, _ in (call[0] for call in calls):
        assert "attempts = flight_emails.attempts + %(initial_attempts)s" in sql
    assert [call[0][1]["initial_attempts"] for call in calls] == [1, 0, 0]
