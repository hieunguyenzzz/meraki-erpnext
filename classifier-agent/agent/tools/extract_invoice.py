"""
Invoice extraction tool - extracts data from PDF invoices.
"""

import base64
import json
from io import BytesIO

import fitz  # PyMuPDF
from google import genai
from PIL import Image

from agent.config import settings
from agent.logging import get_logger
from agent.models import ExtractInvoiceRequest, ExtractInvoiceResult, InvoiceItem
from agent.prompts import PDF_EXTRACTION_PROMPT

log = get_logger(__name__)


def extract_invoice_from_pdf(
    request: ExtractInvoiceRequest,
    client: genai.Client,
) -> ExtractInvoiceResult:
    """
    Extract invoice data from PDF using Gemini Vision.

    Args:
        request: Request with base64 encoded PDF
        client: Gemini client

    Returns:
        ExtractInvoiceResult with extracted invoice fields
    """
    log.debug("extract_invoice_request", pdf_size=len(request.pdf_base64))

    try:
        # Decode base64 PDF
        pdf_data = base64.b64decode(request.pdf_base64)
        log.debug("pdf_decoded", pdf_bytes=len(pdf_data))

        # Convert PDF to images for Gemini Vision
        images = _pdf_to_images(pdf_data)
        if not images:
            log.warning("pdf_conversion_failed")
            return ExtractInvoiceResult(error="pdf_conversion_failed")

        log.debug("pdf_to_images_complete", page_count=len(images))

        # Use first page (usually contains invoice details)
        image = images[0]

        # Convert PIL Image to bytes for Gemini
        img_buffer = BytesIO()
        image.save(img_buffer, format="PNG")
        img_bytes = img_buffer.getvalue()

        # Call Gemini with image
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=[
                PDF_EXTRACTION_PROMPT,
                {
                    "inline_data": {
                        "mime_type": "image/png",
                        "data": base64.b64encode(img_bytes).decode("utf-8"),
                    }
                },
            ],
        )

        data = _parse_response(response.text)

        # Convert items to InvoiceItem models
        items = []
        for item in data.get("items", []):
            items.append(
                InvoiceItem(
                    description=item.get("description", "Invoice"),
                    amount=item.get("amount", 0),
                    expense_account=item.get("expense_account"),
                )
            )

        log.info(
            "invoice_extracted",
            supplier_name=data.get("supplier_name"),
            invoice_number=data.get("invoice_number"),
            invoice_total=data.get("invoice_total"),
            items_count=len(items),
        )

        return ExtractInvoiceResult(
            supplier_name=data.get("supplier_name"),
            invoice_number=data.get("invoice_number"),
            invoice_date=data.get("invoice_date"),
            invoice_total=data.get("invoice_total"),
            invoice_currency=data.get("invoice_currency"),
            items=items,
        )

    except Exception as e:
        log.error("pdf_extraction_error", error=str(e))
        return ExtractInvoiceResult(error=str(e))


def _pdf_to_images(pdf_data: bytes) -> list[Image.Image]:
    """Convert PDF pages to PIL Images for Gemini Vision."""
    images = []
    try:
        doc = fitz.open(stream=pdf_data, filetype="pdf")
        page_count = len(doc)
        log.debug("pdf_opened", page_count=page_count)

        for page_num in range(min(page_count, 3)):  # Max 3 pages
            page = doc[page_num]
            # Render at 150 DPI for good quality
            pix = page.get_pixmap(dpi=150)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            images.append(img)

        doc.close()
        log.debug("pdf_pages_rendered", rendered_count=len(images))

    except Exception as e:
        log.error("pdf_to_image_error", error=str(e))
    return images


def _parse_response(response_text: str) -> dict:
    """Parse JSON from Gemini response."""
    text = response_text.strip()

    # Remove markdown code blocks if present
    if text.startswith("```"):
        lines = text.split("\n")
        lines = lines[1:]  # Remove opening ```
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]  # Remove closing ```
        text = "\n".join(lines)

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        log.error("gemini_parse_error", error=str(e), response_preview=text[:200])
        return {}
