"""
ERPNext API client for CRM operations.
"""

import json
import time
from datetime import datetime, timedelta
from urllib.parse import urlparse
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
    def _site_name(self) -> str:
        """Extract site name from URL or use configured default."""
        if hasattr(settings, 'erpnext_site_name') and settings.erpnext_site_name:
            return settings.erpnext_site_name
        # Extract hostname from URL (e.g., "http://backend:8000" -> use default)
        parsed = urlparse(self.url)
        hostname = parsed.hostname or ""
        # If connecting to internal service name, use the actual site name
        if hostname in ("backend", "meraki-backend", "localhost", "127.0.0.1"):
            return "erp.merakiwp.com"  # Default for internal connections
        return hostname or "erp.merakiwp.com"

    @property
    def _auth_headers(self) -> dict[str, str]:
        """Headers for all requests.

        Includes auth and site name headers required when connecting
        directly to backend (bypassing nginx).
        """
        site_name = self._site_name
        return {
            "Authorization": f"token {self.api_key}:{self.api_secret}",
            "X-Frappe-Site-Name": site_name,
            "Host": site_name,
        }

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
                    "filters": json.dumps([["email_id", "=", email]]),
                    "fields": json.dumps(["name"]),
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
        message_id: str | None = None,
    ) -> str | None:
        """
        Create a Communication record linked to a Lead.

        Args:
            lead_name: Lead docname (e.g., 'CRM-LEAD-2026-00013')
            subject: Email subject
            content: HTML content
            sent_or_received: "Sent" or "Received"
            timestamp: Optional timestamp for backfill
            message_id: Email message_id for deduplication (stored in custom_email_message_id)

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

        if message_id:
            data["custom_email_message_id"] = self._normalize_message_id(message_id)

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
        """Check if a communication already exists (for deduplication by subject)."""
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
                    "fields": json.dumps(["name"]),
                    "limit_page_length": 1,
                },
            )
            return bool(result.get("data"))
        except Exception:
            return False

    def _normalize_message_id(self, message_id: str) -> str:
        """Normalize message_id by stripping angle brackets.

        ERPNext HTML-encodes < and > to &lt; and &gt;, breaking exact matches.
        Stripping brackets ensures consistent storage and lookup.
        """
        if not message_id:
            return ""
        return message_id.strip().strip("<>")

    def communication_exists_by_message_id(self, message_id: str) -> bool | None:
        """Check if a communication with this message_id already exists.

        This is the primary deduplication method using the unique email message_id.
        Uses retry logic to handle intermittent 401 errors.

        Returns:
            True: Communication exists (skip to avoid duplicate)
            False: Communication doesn't exist (safe to create)
            None: Check failed after retries (caller should handle as error)
        """
        if not message_id:
            return False
        normalized = self._normalize_message_id(message_id)
        if not normalized:
            return False

        # Retry logic for intermittent 401 errors
        for attempt in range(MAX_RETRIES):
            try:
                # Use exact match for efficiency and correctness
                result = self._get(
                    "/api/resource/Communication",
                    params={
                        "filters": json.dumps([["custom_email_message_id", "=", normalized]]),
                        "fields": json.dumps(["name"]),
                        "limit_page_length": 1,
                    },
                )
                return bool(result.get("data"))
            except Exception as e:
                if attempt < MAX_RETRIES - 1:
                    log.warning("communication_exists_check_retry", attempt=attempt + 1, error=str(e))
                    time.sleep(RETRY_DELAY)
                    continue
                log.error("communication_exists_check_failed", error=str(e), message_id=normalized)
                # Return None to signal error - caller should mark for retry
                return None
        return None  # All retries failed

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

    # Supplier Operations

    def find_supplier_by_name(self, name: str) -> str | None:
        """
        Find a Supplier by name (case-insensitive partial match).

        Returns:
            Supplier name if found, None otherwise.
        """
        try:
            result = self._get(
                "/api/resource/Supplier",
                params={
                    "filters": json.dumps([["supplier_name", "like", f"%{name}%"]]),
                    "fields": json.dumps(["name", "supplier_name"]),
                    "limit_page_length": 1,
                },
            )
            data = result.get("data", [])
            if data:
                return data[0].get("name")
        except Exception as e:
            log.error("find_supplier_error", name=name, error=str(e))
        return None

    def create_supplier(
        self,
        name: str,
        supplier_group: str = "Services",
    ) -> str | None:
        """
        Create a new Supplier in ERPNext.

        Args:
            name: Supplier name
            supplier_group: Supplier group (default: Services)

        Returns:
            Supplier name on success, None on failure.
        """
        data = {
            "doctype": "Supplier",
            "supplier_name": name,
            "supplier_group": supplier_group,
            "supplier_type": "Company",
        }

        try:
            result = self._post("/api/resource/Supplier", data)
            supplier_name = result.get("data", {}).get("name")
            log.info("supplier_created", supplier_name=supplier_name)
            return supplier_name
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code == 409:
                log.info("supplier_exists", name=name)
                return self.find_supplier_by_name(name)
            log.error("create_supplier_error", error=str(e), name=name)
        except Exception as e:
            log.error("create_supplier_error", error=str(e), name=name)
        return None

    def get_or_create_supplier(self, name: str) -> str | None:
        """Find existing supplier or create new one."""
        supplier = self.find_supplier_by_name(name)
        if supplier:
            return supplier
        return self.create_supplier(name)

    # Purchase Invoice Operations

    def create_purchase_invoice(
        self,
        supplier: str,
        items: list[dict],
        posting_date: str | None = None,
        bill_no: str | None = None,
        currency: str = "VND",
    ) -> str | None:
        """
        Create a Purchase Invoice in ERPNext.

        Args:
            supplier: Supplier name (docname)
            items: List of item dicts with keys:
                   - description: Item description
                   - amount: Item amount
                   - expense_account: Expense account name
            posting_date: Invoice date (YYYY-MM-DD format)
            bill_no: External invoice/bill number
            currency: Currency code (default VND)

        Returns:
            Purchase Invoice name on success, None on failure.
        """
        # Format items for ERPNext
        invoice_items = []
        for item in items:
            invoice_items.append({
                "item_name": item.get("description", "Invoice Item")[:140],
                "description": item.get("description", "Invoice Item"),
                "qty": 1,
                "rate": item.get("amount", 0),
                "expense_account": item.get("expense_account", "Miscellaneous Expenses - MWP"),
            })

        data = {
            "doctype": "Purchase Invoice",
            "supplier": supplier,
            "currency": currency,
            "items": invoice_items,
            "update_stock": 0,  # Service invoice, no stock
            "is_paid": 0,  # Not paid yet
        }

        if posting_date:
            data["posting_date"] = posting_date
            data["bill_date"] = posting_date

        if bill_no:
            data["bill_no"] = bill_no

        try:
            result = self._post("/api/resource/Purchase Invoice", data)
            invoice_name = result.get("data", {}).get("name")
            log.info(
                "purchase_invoice_created",
                invoice_name=invoice_name,
                supplier=supplier,
                total=sum(item.get("amount", 0) for item in items),
            )
            return invoice_name
        except requests.HTTPError as e:
            if e.response is not None:
                log.error(
                    "create_purchase_invoice_error",
                    error=str(e),
                    response=e.response.text[:500],
                    supplier=supplier,
                )
            else:
                log.error("create_purchase_invoice_error", error=str(e), supplier=supplier)
        except Exception as e:
            log.error("create_purchase_invoice_error", error=str(e), supplier=supplier)
        return None

    def submit_document(self, doctype: str, name: str) -> bool:
        """
        Submit a document in ERPNext.

        Args:
            doctype: Document type (e.g., "Purchase Invoice")
            name: Document name

        Returns:
            True on success, False on failure.
        """
        try:
            self._post(
                "/api/method/frappe.client.submit",
                {"doc": {"doctype": doctype, "name": name}},
            )
            log.info("document_submitted", doctype=doctype, name=name)
            return True
        except Exception as e:
            log.error(
                "submit_document_error",
                doctype=doctype,
                name=name,
                error=str(e),
            )
            return False

    def get_stale_awaiting_client_leads(self, days: int = 3) -> list[dict]:
        """
        Find leads where:
        - Status is active (not in terminal states)
        - Last communication was sent by staff (awaiting client response)
        - Last communication is older than `days` days

        Returns:
            List of lead dicts with 'name' and 'status' fields.
        """
        # Terminal statuses to exclude
        terminal = ["Do Not Contact", "Lost Quotation", "Converted"]

        # Get active leads
        try:
            leads = self._get(
                "/api/resource/Lead",
                params={
                    "filters": json.dumps([["status", "not in", terminal]]),
                    "fields": json.dumps(["name", "status"]),
                    "limit_page_length": 0,
                },
            ).get("data", [])
        except Exception as e:
            log.error("get_active_leads_error", error=str(e))
            return []

        stale_leads = []
        cutoff = datetime.now() - timedelta(days=days)

        for lead in leads:
            try:
                # Get latest communication for this lead
                comms = self._get(
                    "/api/resource/Communication",
                    params={
                        "filters": json.dumps([
                            ["reference_doctype", "=", "Lead"],
                            ["reference_name", "=", lead["name"]],
                        ]),
                        "fields": json.dumps(["sent_or_received", "communication_date"]),
                        "order_by": "communication_date desc",
                        "limit_page_length": 1,
                    },
                ).get("data", [])

                if comms and comms[0]["sent_or_received"] == "Sent":
                    # Parse communication date
                    comm_date_str = comms[0]["communication_date"]
                    comm_date = datetime.fromisoformat(
                        comm_date_str.replace(" ", "T")
                    )
                    if comm_date < cutoff:
                        stale_leads.append(lead)
            except Exception as e:
                log.warning(
                    "check_lead_staleness_error",
                    lead=lead["name"],
                    error=str(e),
                )
                continue

        return stale_leads
