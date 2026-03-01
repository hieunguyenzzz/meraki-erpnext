"""
FastAPI application for email processing webhooks.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from webhook_v2.config import settings
from webhook_v2.core.logging import configure_logging, get_logger
from webhook_v2.core.database import Database
from webhook_v2.core.models import DocType
from webhook_v2.processors.realtime import RealtimeProcessor
from webhook_v2.processors.backfill import BackfillProcessor
from webhook_v2.processors.expense import ExpenseProcessor
from webhook_v2.scheduler import start_scheduler, start_fetch_scheduler, stop_scheduler
from webhook_v2.routers.inquiry import router as inquiry_router
from webhook_v2.routers.wedding import router as wedding_router
from webhook_v2.routers.employee import router as employee_router
from webhook_v2.routers.review import router as review_router
from webhook_v2.routers.allowance import router as allowance_router
from webhook_v2.routers.employee_order import router as employee_order_router
from webhook_v2.routers.employee_status import router as employee_status_router
from webhook_v2.routers.payroll import router as payroll_router
from webhook_v2.routers.user_roles import router as user_roles_router
from webhook_v2.routers.notification_test import router as notification_test_router

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
    # Priority: full scheduler > fetch-only scheduler
    # Warn if both are enabled (configuration mistake)
    if settings.scheduler_enabled and settings.scheduler_fetch_enabled:
        log.warning(
            "both_schedulers_enabled",
            reason="Both SCHEDULER_ENABLED and SCHEDULER_FETCH_ENABLED are true. "
                   "Using full scheduler. Set SCHEDULER_FETCH_ENABLED=false to silence this warning."
        )

    if settings.scheduler_enabled:
        start_scheduler()
        log.info("full_scheduler_enabled")
    elif settings.scheduler_fetch_enabled:
        start_fetch_scheduler()
        log.info("fetch_scheduler_enabled", reason="IMAP fetch only, run backfill manually to process")
    else:
        log.info("scheduler_disabled", reason="use backfill for controlled processing")

    yield

    # Shutdown
    if settings.scheduler_enabled or settings.scheduler_fetch_enabled:
        stop_scheduler()
    log.info("application_stopped")


app = FastAPI(
    title="Email Processing System v2",
    description="Email processing pipeline for Meraki Wedding Planner",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(inquiry_router)
app.include_router(wedding_router)
app.include_router(employee_router)
app.include_router(review_router)
app.include_router(allowance_router)
app.include_router(employee_order_router)
app.include_router(employee_status_router)
app.include_router(payroll_router)
app.include_router(user_roles_router)
app.include_router(notification_test_router)


# Request/Response Models

class ProcessRequest(BaseModel):
    doctype: str = "lead"
    limit: int = 50


class FetchRequest(BaseModel):
    days: int = 7


class BackfillRequest(BaseModel):
    since: str | None = None  # YYYY-MM-DD format, defaults to all pending
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
    Process stored emails to ERPNext.

    Unlike /fetch which pulls from IMAP, this only processes
    emails already in PostgreSQL.

    Args:
        since: Optional start date in YYYY-MM-DD format (filters by email date)
        doctype: Document type to process (default "lead")
        dry_run: If true, count emails without processing
    """
    try:
        doctype = DocType(request.doctype)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid doctype: {request.doctype}")

    from datetime import datetime

    since_date = None
    if request.since:
        try:
            since_date = datetime.strptime(request.since, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid date format: {request.since}. Use YYYY-MM-DD.")

    def run_backfill():
        processor = BackfillProcessor(dry_run=request.dry_run)
        if since_date:
            processor.backfill(since_date, doctype=doctype)
        else:
            processor.process_pending(doctype)

    background_tasks.add_task(run_backfill)

    return {
        "status": "backfill_started",
        "since": request.since or "all pending",
        "doctype": request.doctype,
        "dry_run": request.dry_run,
    }


@app.post("/fetch")
async def trigger_fetch(
    request: FetchRequest,
    background_tasks: BackgroundTasks,
):
    """
    Trigger email fetch from IMAP (without processing).

    Useful for manually pulling new emails into the database.
    Args:
        days: Number of days to fetch (default 7, max 365)
    """
    days = min(request.days, 365)  # Cap at 1 year

    def run_fetch():
        processor = RealtimeProcessor()
        processor.fetch_and_store(since_days=days)

    background_tasks.add_task(run_fetch)

    return {"status": "fetch_started", "days": days}


class ExpenseProcessRequest(BaseModel):
    days: int = 30  # How far back to look for emails


@app.post("/process/expenses")
async def trigger_expense_processing(
    request: ExpenseProcessRequest,
    background_tasks: BackgroundTasks,
):
    """
    Process supplier invoice emails.

    Identifies emails with PDF invoices and creates Purchase Invoices in ERPNext.

    1. Fetches emails from INBOX (last N days)
    2. Classifies emails using expense classifier
    3. Extracts invoice data from PDF attachments using Gemini Vision
    4. Creates Purchase Invoices in ERPNext
    """
    days = min(request.days, 365)

    def run_expense_processor():
        processor = ExpenseProcessor()
        processor.fetch_and_store(since_days=days)
        processor.process(DocType.EXPENSE)

    background_tasks.add_task(run_expense_processor)

    return {"status": "expense_processing_started", "days": days}


# Run with: uvicorn webhook_v2.main:app --host 0.0.0.0 --port 8001
