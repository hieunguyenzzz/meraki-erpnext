"""
Remote classifier client for the classifier-agent service.

Provides the same interface as the local classifiers but calls
the remote classifier-agent service via HTTP.
"""

import base64

import httpx

from webhook_v2.config import settings
from webhook_v2.core.logging import get_logger
from webhook_v2.core.models import Email, Classification, ClassificationResult

log = get_logger(__name__)


class RemoteClassifierClient:
    """HTTP client for the remote classifier-agent service."""

    def __init__(
        self,
        base_url: str | None = None,
        timeout: float = 60.0,
    ):
        self.base_url = base_url or settings.classifier_service_url
        self.timeout = timeout
        self._client = httpx.Client(timeout=timeout)

    def classify(self, email: Email) -> ClassificationResult:
        """
        Classify an email using the remote classifier service.

        Args:
            email: Email to classify

        Returns:
            ClassificationResult with classification and extracted data
        """
        payload = {
            "subject": email.subject,
            "body": email.body[:3000],
            "sender": email.sender,
            "recipient": email.recipient,
            "is_contact_form": email.is_contact_form,
        }

        try:
            response = self._client.post(
                f"{self.base_url}/classify",
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

            # Check for error in response
            if data.get("error"):
                error = data["error"]
                if "rate_limit" in error:
                    raise RuntimeError(f"Classifier rate limited: {error}")
                if "auth_error" in error:
                    raise RuntimeError(f"Classifier auth error: {error}")
                log.warning("classifier_returned_error", error=error)

            log.info(
                "remote_classification_success",
                email_id=email.id,
                classification=data.get("classification"),
            )

            return ClassificationResult.from_dict(data)

        except httpx.HTTPStatusError as e:
            log.error(
                "classifier_http_error",
                status=e.response.status_code,
                error=str(e),
            )
            raise RuntimeError(f"Classifier service error: {e}")

        except httpx.RequestError as e:
            log.error("classifier_request_error", error=str(e))
            raise RuntimeError(f"Failed to reach classifier service: {e}")

    def classify_expense(self, email: Email) -> ClassificationResult:
        """
        Classify an expense/invoice email.

        Args:
            email: Email to classify

        Returns:
            ClassificationResult with classification
        """
        has_pdf = any(
            att.content_type == "application/pdf"
            or att.filename.lower().endswith(".pdf")
            for att in email.attachments
        )

        payload = {
            "subject": email.subject,
            "body": email.body[:2000],
            "sender": email.sender,
            "recipient": email.recipient,
            "has_pdf": has_pdf,
        }

        try:
            response = self._client.post(
                f"{self.base_url}/classify-expense",
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

            if data.get("error"):
                error = data["error"]
                if "rate_limit" in error:
                    raise RuntimeError(f"Classifier rate limited: {error}")
                if "auth_error" in error:
                    raise RuntimeError(f"Classifier auth error: {error}")
                log.warning("classifier_returned_error", error=error)

            # Convert expense response to ClassificationResult
            classification_str = data.get("classification", "irrelevant")
            try:
                classification = Classification(classification_str)
            except ValueError:
                classification = Classification.IRRELEVANT

            log.info(
                "remote_expense_classification",
                email_id=email.id,
                classification=classification.value,
            )

            return ClassificationResult(
                classification=classification,
                is_client_related=False,
                supplier_name=data.get("supplier_name"),
            )

        except httpx.HTTPStatusError as e:
            log.error(
                "classifier_http_error",
                status=e.response.status_code,
                error=str(e),
            )
            raise RuntimeError(f"Classifier service error: {e}")

        except httpx.RequestError as e:
            log.error("classifier_request_error", error=str(e))
            raise RuntimeError(f"Failed to reach classifier service: {e}")

    def extract_new_message(self, body: str) -> str:
        """
        Extract only the new message content from an email reply.

        Args:
            body: Full email body

        Returns:
            Extracted new message, or original body on failure
        """
        if not body or not body.strip():
            return body

        payload = {"body": body[:4000]}

        try:
            response = self._client.post(
                f"{self.base_url}/extract-message",
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

            if data.get("error"):
                log.warning("extract_message_error", error=data["error"])
                return body[:3000]

            return data.get("extracted_message", body[:3000])

        except Exception as e:
            log.error("extract_message_request_error", error=str(e))
            return body[:3000]

    def extract_invoice_from_pdf(self, pdf_data: bytes) -> dict:
        """
        Extract invoice data from PDF.

        Args:
            pdf_data: Raw PDF file bytes

        Returns:
            Dict with extracted invoice fields
        """
        payload = {"pdf_base64": base64.b64encode(pdf_data).decode("utf-8")}

        try:
            response = self._client.post(
                f"{self.base_url}/extract-invoice",
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

            if data.get("error"):
                log.warning("extract_invoice_error", error=data["error"])
                return {}

            # Convert items back to dict format
            items = []
            for item in data.get("items", []):
                items.append({
                    "description": item.get("description"),
                    "amount": item.get("amount"),
                    "expense_account": item.get("expense_account"),
                })

            return {
                "supplier_name": data.get("supplier_name"),
                "invoice_number": data.get("invoice_number"),
                "invoice_date": data.get("invoice_date"),
                "invoice_total": data.get("invoice_total"),
                "invoice_currency": data.get("invoice_currency"),
                "items": items,
            }

        except Exception as e:
            log.error("extract_invoice_request_error", error=str(e))
            return {}

    def health_check(self) -> bool:
        """Check if the classifier service is healthy."""
        try:
            response = self._client.get(f"{self.base_url}/health")
            response.raise_for_status()
            return response.json().get("status") == "healthy"
        except Exception as e:
            log.warning("classifier_health_check_failed", error=str(e))
            return False

    def close(self):
        """Close the HTTP client."""
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
