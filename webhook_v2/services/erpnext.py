"""
ERPNext API client for CRM operations.
"""

import json
import time
from datetime import datetime
from zoneinfo import ZoneInfo

import requests
from typing import Any

from webhook_v2.config import settings
from webhook_v2.core.logging import get_logger
from webhook_v2.core.models import ClassificationResult

log = get_logger(__name__)

# Retry settings for intermittent 401 errors
MAX_RETRIES = 3
RETRY_DELAY = 0.5  # seconds


def to_erpnext_datetime(iso_timestamp: str) -> str:
    """Convert ISO timestamp to ERPNext datetime format in Vietnam timezone.

    ERPNext expects 'YYYY-MM-DD HH:MM:SS' without timezone.
    Input can be ISO format like '2026-02-01T08:13:31+00:00'.
    """
    try:
        dt = datetime.fromisoformat(iso_timestamp.replace('Z', '+00:00'))
        # Convert to Vietnam timezone (ICT, UTC+7)
        vietnam_tz = ZoneInfo('Asia/Ho_Chi_Minh')
        dt_vietnam = dt.astimezone(vietnam_tz)
        return dt_vietnam.strftime('%Y-%m-%d %H:%M:%S')
    except Exception:
        return iso_timestamp  # Return as-is if parsing fails


class ERPNextClient:
    """Client for ERPNext API operations."""

    def __init__(
        self,
        url: str | None = None,
        api_key: str | None = None,
        api_secret: str | None = None,
    ):
        self.url = (url or settings.erpnext_url).rstrip("/")
        self.api_key = api_key or settings.erpnext_api_key
        self.api_secret = api_secret or settings.erpnext_api_secret
        self.timeout = 30

    @property
    def _auth_headers(self) -> dict[str, str]:
        """Headers for all requests (auth only)."""
        return {"Authorization": f"token {self.api_key}:{self.api_secret}"}

    def _get(self, endpoint: str, params: dict | None = None) -> dict[str, Any]:
        """Make GET request to ERPNext API with retry for 401 errors."""
        last_error = None
        for attempt in range(MAX_RETRIES):
            try:
                response = requests.get(
                    f"{self.url}{endpoint}",
                    params=params,
                    headers=self._auth_headers,
                    timeout=self.timeout,
                )
                response.raise_for_status()
                return response.json()
            except requests.HTTPError as e:
                if e.response is not None and e.response.status_code == 401:
                    last_error = e
                    if attempt < MAX_RETRIES - 1:
                        time.sleep(RETRY_DELAY)
                        continue
                raise
        raise last_error

    def _post(self, endpoint: str, data: dict) -> dict[str, Any]:
        """Make POST request to ERPNext API with retry for 401 errors."""
        last_error = None
        for attempt in range(MAX_RETRIES):
            try:
                response = requests.post(
                    f"{self.url}{endpoint}",
                    json=data,
                    headers=self._auth_headers,
                    timeout=self.timeout,
                )
                response.raise_for_status()
                return response.json()
            except requests.HTTPError as e:
                # Log detailed error for 500s
                if e.response is not None and e.response.status_code == 500:
                    log.error(
                        "erpnext_500_error",
                        endpoint=endpoint,
                        response_body=e.response.text[:500],
                    )
                if e.response is not None and e.response.status_code == 401:
                    last_error = e
                    if attempt < MAX_RETRIES - 1:
                        time.sleep(RETRY_DELAY)
                        continue
                raise
        raise last_error

    def _put(self, endpoint: str, data: dict) -> dict[str, Any]:
        """Make PUT request to ERPNext API with retry for 401 errors."""
        last_error = None
        for attempt in range(MAX_RETRIES):
            try:
                response = requests.put(
                    f"{self.url}{endpoint}",
                    json=data,
                    headers=self._auth_headers,
                    timeout=self.timeout,
                )
                response.raise_for_status()
                return response.json()
            except requests.HTTPError as e:
                if e.response is not None and e.response.status_code == 401:
                    last_error = e
                    if attempt < MAX_RETRIES - 1:
                        time.sleep(RETRY_DELAY)
                        continue
                raise
        raise last_error

    # Lead Operations

    def find_lead_by_email(self, email: str) -> str | None:
        """
        Find a Lead by email address.

        Returns:
            Lead name (e.g., 'CRM-LEAD-2026-00013') or None if not found.
        """
        try:
            result = self._get(
                "/api/resource/Lead",
                params={
                    "filters": f'[["email_id", "=", "{email}"]]',
                    "fields": '["name"]',
                    "limit_page_length": 1,
                },
            )
            data = result.get("data", [])
            if data:
                return data[0].get("name")
        except Exception as e:
            log.error("find_lead_error", email=email, error=str(e))
        return None

    def create_lead(
        self,
        classification: ClassificationResult,
        timestamp: str | None = None,
    ) -> str | None:
        """
        Create a new Lead in ERPNext.

        Args:
            classification: ClassificationResult with lead data
            timestamp: Optional creation timestamp for backfill

        Returns:
            Lead name on success, None on failure.
        """
        # Build lead title combining firstname and couple_name when both exist
        # Example: firstname="Michele", couple_name="Trevor" -> "Michele & Trevor"
        if classification.couple_name and classification.firstname:
            lead_name = f"{classification.firstname} & {classification.couple_name}"
        elif classification.couple_name:
            lead_name = classification.couple_name
        else:
            parts = []
            if classification.firstname:
                parts.append(classification.firstname)
            if classification.lastname:
                parts.append(classification.lastname)
            lead_name = " ".join(parts) or "Unknown"

        data = {
            "doctype": "Lead",
            "first_name": lead_name,  # Use couple/lead name as first_name for display
            "last_name": "",
            "email_id": classification.email,
            "phone": classification.phone or "",
            "source": self._map_source(classification.referral_source),
            "status": "Lead",
        }

        # Use city for address display (same as original webhook)
        if classification.address:
            data["city"] = classification.address

        # Custom fields (if exist in ERPNext)
        if classification.couple_name:
            # Store combined couple name if we have both names
            if classification.firstname:
                data["custom_couple_name"] = f"{classification.firstname} & {classification.couple_name}"
            else:
                data["custom_couple_name"] = classification.couple_name
        if classification.wedding_venue:
            data["custom_wedding_venue"] = classification.wedding_venue
        if classification.guest_count:
            data["custom_guest_count"] = classification.guest_count
        if classification.budget:
            data["custom_budget"] = classification.budget
        if classification.wedding_date:
            data["custom_wedding_date_text"] = classification.wedding_date
        if classification.message_details:
            # Notes is a child table in ERPNext, needs list format
            data["notes"] = [{"note": classification.message_details[:2000]}]

        try:
            result = self._post("/api/resource/Lead", data)
            lead_name = result.get("data", {}).get("name")
            log.info("lead_created", lead_name=lead_name, email=classification.email)
            return lead_name
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code == 409:  # Duplicate
                log.info("lead_exists", email=classification.email)
                return self.find_lead_by_email(classification.email)
            log.error("create_lead_error", error=str(e), email=classification.email)
        except Exception as e:
            log.error("create_lead_error", error=str(e), email=classification.email)
        return None

    def _map_source(self, ref: str | None) -> str:
        """Map referral source to ERPNext Lead Source."""
        mapping = {
            "google": "Google",
            "facebook": "Facebook",
            "instagram": "Instagram",
            "referral": "Referral",
        }
        if ref:
            return mapping.get(ref.lower(), "Other")
        return "Other"

    def _extract_country(self, address: str | None) -> str | None:
        """Extract country name from address string for ERPNext Country field."""
        if not address:
            return None

        # Common country names that ERPNext recognizes
        countries = [
            "Australia", "Vietnam", "United States", "USA", "United Kingdom", "UK",
            "Singapore", "Malaysia", "Thailand", "Indonesia", "Philippines",
            "China", "Japan", "South Korea", "India", "New Zealand",
            "Canada", "France", "Germany", "Italy", "Spain", "Netherlands",
            "Sweden", "Norway", "Denmark", "Switzerland", "Belgium",
            "Hong Kong", "Taiwan", "Cambodia", "Laos", "Myanmar",
        ]

        # Normalize for comparison
        address_lower = address.lower()

        for country in countries:
            if country.lower() in address_lower:
                # Map common abbreviations to full names
                if country == "USA":
                    return "United States"
                if country == "UK":
                    return "United Kingdom"
                return country

        return None

    # Communication Operations

    def create_communication(
        self,
        lead_name: str,
        subject: str,
        content: str,
        sent_or_received: str,
        timestamp: str | None = None,
    ) -> str | None:
        """
        Create a Communication record linked to a Lead.

        Args:
            lead_name: Lead docname (e.g., 'CRM-LEAD-2026-00013')
            subject: Email subject
            content: HTML content
            sent_or_received: "Sent" or "Received"
            timestamp: Optional timestamp for backfill

        Returns:
            Communication name on success, None on failure.
        """
        data = {
            "doctype": "Communication",
            "communication_type": "Communication",
            "communication_medium": "Email",
            "subject": subject[:140] if subject else "(No Subject)",
            "content": content,
            "sent_or_received": sent_or_received,
            "send_email": 0,  # Don't actually send email
            "reference_doctype": "Lead",
            "reference_name": lead_name,
        }

        if timestamp:
            data["communication_date"] = to_erpnext_datetime(timestamp)

        try:
            result = self._post("/api/resource/Communication", data)
            comm_name = result.get("data", {}).get("name")
            log.info("communication_created", name=comm_name, lead=lead_name)
            return comm_name
        except Exception as e:
            log.error("create_communication_error", error=str(e), lead=lead_name)
        return None

    def communication_exists(
        self,
        lead_name: str,
        subject: str,
        timestamp: str | None = None,
    ) -> bool:
        """Check if a communication already exists (for deduplication)."""
        try:
            filters = [
                ["reference_doctype", "=", "Lead"],
                ["reference_name", "=", lead_name],
                ["subject", "=", subject],
            ]
            if timestamp:
                filters.append(["communication_date", "like", f"{timestamp[:10]}%"])

            result = self._get(
                "/api/resource/Communication",
                params={
                    "filters": json.dumps(filters),
                    "fields": '["name"]',
                    "limit_page_length": 1,
                },
            )
            return bool(result.get("data"))
        except Exception:
            return False

    # Lead Stage Updates

    def update_lead_status(
        self,
        lead_name: str,
        status: str,
    ) -> bool:
        """Update Lead status field using frappe.client.set_value."""
        try:
            # Use set_value API like the original webhook does
            self._post(
                "/api/method/frappe.client.set_value",
                {
                    "doctype": "Lead",
                    "name": lead_name,
                    "fieldname": "status",
                    "value": status,
                },
            )
            log.info("lead_status_updated", lead=lead_name, status=status)
            return True
        except Exception as e:
            log.error("update_lead_status_error", error=str(e), lead=lead_name)
            return False
