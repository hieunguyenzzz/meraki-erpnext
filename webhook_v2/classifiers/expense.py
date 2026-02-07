"""
Expense classifier for supplier invoice emails.
"""

import json
from io import BytesIO

import google.generativeai as genai
from PIL import Image
import fitz  # PyMuPDF

from webhook_v2.config import settings
from webhook_v2.core.logging import get_logger
from webhook_v2.core.models import Email, Classification, ClassificationResult
from webhook_v2.classifiers.base import BaseClassifier
from webhook_v2.classifiers.prompts import expense as expense_prompts
from webhook_v2.services.minio import MinIOClient

log = get_logger(__name__)


class ExpenseClassifier(BaseClassifier):
    """Gemini AI-based expense/invoice email classifier."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
    ):
        self.api_key = api_key or settings.gemini_api_key
        self.model_name = model or settings.gemini_model

        if not self.api_key:
            raise ValueError("GEMINI_API_KEY is required")

        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel(self.model_name)
        self.minio = MinIOClient()

    def classify(self, email: Email) -> ClassificationResult:
        """
        Classify an email to check if it's a supplier invoice.

        Args:
            email: Email to classify

        Returns:
            ClassificationResult with classification and extracted data
        """
        # Determine email direction
        is_outgoing = settings.is_meraki_email(email.sender_email)
        direction = "SENT BY Meraki staff" if is_outgoing else "RECEIVED FROM external sender"

        # Check for PDF attachments
        has_pdf = any(
            att.content_type == "application/pdf" or att.filename.lower().endswith(".pdf")
            for att in email.attachments
        )

        # Format prompt
        prompt = expense_prompts.CLASSIFY_PROMPT.format(
            direction=direction,
            sender=email.sender,
            recipient=email.recipient,
            subject=email.subject,
            has_pdf=has_pdf,
            body=email.body[:2000],
        )

        try:
            response = self.model.generate_content(prompt)
            data = self._parse_response(response.text)

            classification_str = data.get("classification", "irrelevant")
            try:
                classification = Classification(classification_str)
            except ValueError:
                classification = Classification.IRRELEVANT

            log.info(
                "expense_email_classified",
                email_id=email.id,
                classification=classification.value,
                supplier=data.get("supplier_name"),
            )

            return ClassificationResult(
                classification=classification,
                is_client_related=False,
                supplier_name=data.get("supplier_name"),
            )

        except Exception as e:
            error_str = str(e).lower()
            if any(x in error_str for x in ["rate", "429", "quota"]):
                log.error("gemini_rate_limit", error=str(e))
                raise
            if any(x in error_str for x in ["api key", "auth", "401", "403"]):
                log.error("gemini_auth_error", error=str(e))
                raise RuntimeError(f"Gemini API authentication failed: {e}")

            log.error("expense_classify_error", error=str(e), email_id=email.id)
            return self._irrelevant_result()

    def extract_invoice_from_pdf(self, pdf_data: bytes) -> dict:
        """
        Extract invoice data from PDF using Gemini Vision.

        Args:
            pdf_data: Raw PDF file bytes

        Returns:
            Dict with extracted invoice fields
        """
        try:
            # Convert PDF to images for Gemini Vision
            images = self._pdf_to_images(pdf_data)
            if not images:
                log.warning("pdf_conversion_failed")
                return {}

            # Use first page (usually contains invoice details)
            image = images[0]

            # Call Gemini with image
            response = self.model.generate_content([
                expense_prompts.PDF_EXTRACTION_PROMPT,
                image,
            ])

            data = self._parse_response(response.text)
            log.info(
                "invoice_extracted",
                supplier=data.get("supplier_name"),
                total=data.get("invoice_total"),
            )
            return data

        except Exception as e:
            log.error("pdf_extraction_error", error=str(e))
            return {}

    def extract_invoice_from_url(self, storage_url: str) -> dict:
        """
        Extract invoice data from a PDF stored in MinIO.

        Args:
            storage_url: MinIO storage URL

        Returns:
            Dict with extracted invoice fields
        """
        if not self.minio.enabled:
            log.warning("minio_not_configured")
            return {}

        # Parse object name from URL
        # URL format: https://endpoint/bucket/attachments/email_id/filename.pdf
        try:
            parts = storage_url.split(f"/{self.minio.bucket}/")
            if len(parts) != 2:
                log.error("invalid_minio_url", url=storage_url)
                return {}
            object_name = parts[1]

            pdf_data = self.minio.get_attachment(object_name)
            if not pdf_data:
                log.error("pdf_download_failed", object_name=object_name)
                return {}

            return self.extract_invoice_from_pdf(pdf_data)

        except Exception as e:
            log.error("invoice_url_extraction_error", error=str(e), url=storage_url)
            return {}

    def _pdf_to_images(self, pdf_data: bytes) -> list[Image.Image]:
        """Convert PDF pages to PIL Images for Gemini Vision."""
        images = []
        try:
            doc = fitz.open(stream=pdf_data, filetype="pdf")
            for page_num in range(min(len(doc), 3)):  # Max 3 pages
                page = doc[page_num]
                # Render at 150 DPI for good quality
                pix = page.get_pixmap(dpi=150)
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                images.append(img)
            doc.close()
        except Exception as e:
            log.error("pdf_to_image_error", error=str(e))
        return images

    def _parse_response(self, response_text: str) -> dict:
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
            log.error("gemini_parse_error", error=str(e), response=text[:500])
            return {}

    def _irrelevant_result(self) -> ClassificationResult:
        """Return a safe irrelevant classification."""
        return ClassificationResult(
            classification=Classification.IRRELEVANT,
            is_client_related=False,
        )
