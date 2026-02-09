"""
Classifier Agent - FastAPI application with Gemini AI classification.

A standalone microservice that provides email classification using Google's
Gemini AI. Uses direct Gemini calls (Custom Agent pattern) for deterministic
classification without LLM tool-selection overhead.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from google import genai

from agent import __version__
from agent.config import settings
from agent.models import (
    ClassifyEmailRequest,
    ClassificationResult,
    ClassifyExpenseRequest,
    ExpenseClassificationResult,
    ExtractMessageRequest,
    ExtractMessageResult,
    ExtractInvoiceRequest,
    ExtractInvoiceResult,
    HealthResponse,
)
from agent.tools import (
    classify_lead_email,
    classify_expense_email,
    extract_new_message,
    extract_invoice_from_pdf,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
log = logging.getLogger(__name__)

# Global Gemini client
_client: genai.Client | None = None


def get_client() -> genai.Client:
    """Get or create Gemini client."""
    global _client
    if _client is None:
        if not settings.gemini_api_key:
            raise ValueError("GEMINI_API_KEY is required")
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - initialize and cleanup."""
    # Startup
    log.info(
        "Starting Classifier Agent v%s with model %s",
        __version__,
        settings.gemini_model,
    )

    # Verify Gemini API key
    if not settings.gemini_api_key:
        log.warning("GEMINI_API_KEY not set - classification will fail")
    else:
        try:
            client = get_client()
            log.info("Gemini client initialized successfully")
        except Exception as e:
            log.error("Failed to initialize Gemini client: %s", e)

    yield

    # Shutdown
    log.info("Shutting down Classifier Agent")


app = FastAPI(
    title="Classifier Agent",
    description="AI-powered email classification service for Meraki Wedding Planner",
    version=__version__,
    lifespan=lifespan,
)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy",
        version=__version__,
        model=settings.gemini_model,
    )


@app.post("/classify", response_model=ClassificationResult)
async def classify_email(request: ClassifyEmailRequest):
    """
    Classify a lead/client email.

    This endpoint classifies emails for the lead pipeline:
    - new_lead: First inquiry from potential client
    - client_message: Follow-up from existing/potential client
    - staff_message: Sent by Meraki staff
    - meeting_confirmed: Meeting date confirmed
    - quote_sent: Quotation/pricing sent
    - irrelevant: Spam, newsletters, etc.
    """
    try:
        client = get_client()
        return classify_lead_email(request, client)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/classify-expense", response_model=ExpenseClassificationResult)
async def classify_expense(request: ClassifyExpenseRequest):
    """
    Classify an expense/invoice email.

    This endpoint determines if an email is a supplier invoice.
    """
    try:
        client = get_client()
        return classify_expense_email(request, client)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/extract-message", response_model=ExtractMessageResult)
async def extract_message(request: ExtractMessageRequest):
    """
    Extract new message content from an email reply.

    Removes quoted previous emails (auto-appended when replying).
    """
    try:
        client = get_client()
        return extract_new_message(request, client)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/extract-invoice", response_model=ExtractInvoiceResult)
async def extract_invoice(request: ExtractInvoiceRequest):
    """
    Extract invoice data from a PDF document.

    Expects base64-encoded PDF content.
    """
    try:
        client = get_client()
        return extract_invoice_from_pdf(request, client)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8002)
