"""
FastAPI application for email processing webhooks.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel

from webhook_v2.config import settings
from webhook_v2.core.logging import configure_logging, get_logger
from webhook_v2.core.database import Database
from webhook_v2.core.models import DocType
from webhook_v2.processors.realtime import RealtimeProcessor
from webhook_v2.processors.backfill import BackfillProcessor
from webhook_v2.scheduler import start_scheduler, stop_scheduler

log = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Startup
    configure_logging()
    log.info("application_starting")

    # Initialize database schema
    db = Database()
    db.init_schema()

    # Start scheduler
    start_scheduler()

    yield

    # Shutdown
    stop_scheduler()
    log.info("application_stopped")


app = FastAPI(
    title="Email Processing System v2",
    description="Email processing pipeline for Meraki Wedding Planner",
    version="2.0.0",
    lifespan=lifespan,
)


# Request/Response Models

class ProcessRequest(BaseModel):
    doctype: str = "lead"
    limit: int = 50


class BackfillRequest(BaseModel):
    days: int = 30
    doctype: str = "lead"
    dry_run: bool = False


class StatsResponse(BaseModel):
    total: int = 0
    processed: int = 0
    pending: int = 0
    errors: int = 0
    new_leads: int = 0
    client_messages: int = 0
    staff_messages: int = 0
    irrelevant: int = 0


# Endpoints

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy", "version": "2.0.0"}


@app.get("/stats", response_model=StatsResponse)
async def get_stats():
    """Get processing statistics."""
    db = Database()
    stats = db.get_stats()
    return StatsResponse(**stats)


@app.post("/process")
async def trigger_processing(
    request: ProcessRequest,
    background_tasks: BackgroundTasks,
):
    """
    Trigger email processing.

    Runs in background to avoid timeout.
    """
    try:
        doctype = DocType(request.doctype)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid doctype: {request.doctype}")

    def run_processor():
        processor = RealtimeProcessor()
        processor.process(doctype)

    background_tasks.add_task(run_processor)

    return {"status": "processing_started", "doctype": request.doctype}


@app.post("/backfill")
async def trigger_backfill(
    request: BackfillRequest,
    background_tasks: BackgroundTasks,
):
    """
    Trigger historical backfill.

    Runs in background to avoid timeout.
    """
    try:
        doctype = DocType(request.doctype)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid doctype: {request.doctype}")

    from datetime import datetime, timedelta
    since_date = datetime.now() - timedelta(days=request.days)

    def run_backfill():
        processor = BackfillProcessor(dry_run=request.dry_run)
        processor.backfill(since_date, doctype=doctype)

    background_tasks.add_task(run_backfill)

    return {
        "status": "backfill_started",
        "days": request.days,
        "doctype": request.doctype,
        "dry_run": request.dry_run,
    }


@app.post("/fetch")
async def trigger_fetch(background_tasks: BackgroundTasks):
    """
    Trigger email fetch from IMAP (without processing).

    Useful for manually pulling new emails into the database.
    """
    def run_fetch():
        processor = RealtimeProcessor()
        processor.fetch_and_store()

    background_tasks.add_task(run_fetch)

    return {"status": "fetch_started"}


# Run with: uvicorn webhook_v2.main:app --host 0.0.0.0 --port 8001
