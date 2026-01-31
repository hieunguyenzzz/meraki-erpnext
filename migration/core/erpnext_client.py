"""
ERPNext API client for Meraki migration.

Provides a clean interface for interacting with ERPNext REST API.
"""

import json
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from urllib.parse import quote
from typing import Optional


class ERPNextClient:
    """Client for interacting with ERPNext REST API."""

    def __init__(self, config: dict):
        """Initialize the ERPNext client.

        Args:
            config: Dictionary with 'url', 'api_key', and 'api_secret' keys.
        """
        self.url = config['url'].rstrip('/')
        self.api_key = config['api_key']
        self.api_secret = config['api_secret']
        self.session = self._create_session()

    def _create_session(self) -> requests.Session:
        """Create a session with retry logic.

        Reduced retries to avoid hammering the API during rate limiting.
        Only retry 429 (rate limit) and 503 (service unavailable).
        """
        session = requests.Session()
        retry_strategy = Retry(
            total=2,
            backoff_factor=2,
            status_forcelist=[429, 503],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        return session

    def _get_headers(self) -> dict:
        """Get authorization headers."""
        return {
            'Authorization': f'token {self.api_key}:{self.api_secret}',
            'Content-Type': 'application/json',
        }

    def get(self, doctype: str, name: str) -> Optional[dict]:
        """Get a single document by name.

        Args:
            doctype: ERPNext doctype name.
            name: Document name/ID.

        Returns:
            Document data if found, None otherwise.
        """
        try:
            encoded_name = quote(name, safe='')
            response = self.session.get(
                f"{self.url}/api/resource/{doctype}/{encoded_name}",
                headers=self._get_headers(),
                timeout=30,
            )
            if response.status_code == 200:
                return response.json().get('data')
            return None
        except Exception as e:
            print(f"Error getting {doctype}/{name}: {e}")
            return None

    def get_list(self, doctype: str, filters: Optional[dict] = None,
                 fields: Optional[list] = None, limit: int = 0) -> list:
        """Get a list of documents.

        Args:
            doctype: ERPNext doctype name.
            filters: Filter criteria.
            fields: Fields to return.
            limit: Maximum number of records (0 for all).

        Returns:
            List of document dictionaries.
        """
        params = {'limit_page_length': limit or 0}
        if filters:
            params['filters'] = json.dumps(filters)
        if fields:
            params['fields'] = json.dumps(fields)

        try:
            response = self.session.get(
                f"{self.url}/api/resource/{doctype}",
                headers=self._get_headers(),
                params=params,
                timeout=30,
            )
            if response.status_code == 200:
                return response.json().get('data', [])
            return []
        except Exception as e:
            print(f"Error listing {doctype}: {e}")
            return []

    def create(self, doctype: str, data: dict) -> Optional[dict]:
        """Create a new document.

        Args:
            doctype: ERPNext doctype name.
            data: Document data.

        Returns:
            Created document data if successful, None otherwise.
        """
        try:
            response = self.session.post(
                f"{self.url}/api/resource/{doctype}",
                headers=self._get_headers(),
                json=data,
                timeout=30,
            )
            if response.status_code in [200, 201]:
                return response.json().get('data')
            else:
                print(f"Error creating {doctype}: {response.status_code} - {response.text}")
                return None
        except Exception as e:
            print(f"Error creating {doctype}: {e}")
            return None

    def update(self, doctype: str, name: str, data: dict) -> Optional[dict]:
        """Update an existing document.

        Args:
            doctype: ERPNext doctype name.
            name: Document name/ID.
            data: Fields to update.

        Returns:
            Updated document data if successful, None otherwise.
        """
        try:
            encoded_name = quote(name, safe='')
            response = self.session.put(
                f"{self.url}/api/resource/{doctype}/{encoded_name}",
                headers=self._get_headers(),
                json=data,
                timeout=30,
            )
            if response.status_code == 200:
                return response.json().get('data')
            else:
                print(f"Error updating {doctype}/{name}: {response.status_code} - {response.text}")
                return None
        except Exception as e:
            print(f"Error updating {doctype}/{name}: {e}")
            return None

    def delete(self, doctype: str, name: str) -> bool:
        """Delete a document.

        Args:
            doctype: ERPNext doctype name.
            name: Document name/ID.

        Returns:
            True if deleted successfully, False otherwise.
        """
        try:
            encoded_name = quote(name, safe='')
            response = self.session.delete(
                f"{self.url}/api/resource/{doctype}/{encoded_name}",
                headers=self._get_headers(),
                timeout=30,
            )
            return response.status_code == 200
        except Exception as e:
            print(f"Error deleting {doctype}/{name}: {e}")
            return False

    def exists(self, doctype: str, filters: dict) -> bool:
        """Check if a document exists matching filters.

        Args:
            doctype: ERPNext doctype name.
            filters: Filter criteria.

        Returns:
            True if document exists, False otherwise.
        """
        docs = self.get_list(doctype, filters=filters, limit=1)
        return len(docs) > 0

    def find_one(self, doctype: str, filters: dict) -> Optional[dict]:
        """Find a single document matching filters.

        Args:
            doctype: ERPNext doctype name.
            filters: Filter criteria.

        Returns:
            First matching document or None.
        """
        docs = self.get_list(doctype, filters=filters, limit=1)
        return docs[0] if docs else None

    def count(self, doctype: str, filters: Optional[dict] = None) -> int:
        """Count documents matching filters.

        Args:
            doctype: ERPNext doctype name.
            filters: Filter criteria.

        Returns:
            Number of matching documents.
        """
        try:
            params = {}
            if filters:
                params['filters'] = json.dumps(filters)
            response = self.session.get(
                f"{self.url}/api/resource/{doctype}",
                headers=self._get_headers(),
                params={'limit_page_length': 0, **params},
                timeout=30,
            )
            if response.status_code == 200:
                return len(response.json().get('data', []))
            return 0
        except Exception as e:
            print(f"Error counting {doctype}: {e}")
            return 0

    def submit_document(self, doctype: str, name: str) -> Optional[dict]:
        """Submit a document (change docstatus from 0 to 1).

        Args:
            doctype: ERPNext doctype name.
            name: Document name/ID.

        Returns:
            Submitted document data if successful, None otherwise.
        """
        try:
            response = self.session.post(
                f"{self.url}/api/method/frappe.client.submit",
                headers=self._get_headers(),
                json={
                    'doc': {
                        'doctype': doctype,
                        'name': name,
                    }
                },
                timeout=30,
            )
            if response.status_code == 200:
                return response.json().get('message')
            else:
                print(f"Error submitting {doctype}/{name}: {response.status_code} - {response.text}")
                return None
        except Exception as e:
            print(f"Error submitting {doctype}/{name}: {e}")
            return None

    # Convenience methods for common doctypes

    def create_customer(self, data: dict) -> Optional[dict]:
        """Create a Customer."""
        return self.create('Customer', data)

    def create_supplier(self, data: dict) -> Optional[dict]:
        """Create a Supplier."""
        return self.create('Supplier', data)

    def create_employee(self, data: dict) -> Optional[dict]:
        """Create an Employee."""
        return self.create('Employee', data)

    def create_item(self, data: dict) -> Optional[dict]:
        """Create an Item."""
        return self.create('Item', data)

    def create_sales_order(self, data: dict) -> Optional[dict]:
        """Create a Sales Order."""
        return self.create('Sales Order', data)

    def create_project(self, data: dict) -> Optional[dict]:
        """Create a Project."""
        return self.create('Project', data)

    def create_task(self, data: dict) -> Optional[dict]:
        """Create a Task."""
        return self.create('Task', data)

    def create_journal_entry(self, data: dict) -> Optional[dict]:
        """Create a Journal Entry."""
        return self.create('Journal Entry', data)

    def create_sales_invoice(self, data: dict) -> Optional[dict]:
        """Create a Sales Invoice."""
        return self.create('Sales Invoice', data)

    def create_custom_field(self, data: dict) -> Optional[dict]:
        """Create a Custom Field."""
        return self.create('Custom Field', data)

    def create_customer_group(self, data: dict) -> Optional[dict]:
        """Create a Customer Group."""
        return self.create('Customer Group', data)

    def create_supplier_group(self, data: dict) -> Optional[dict]:
        """Create a Supplier Group."""
        return self.create('Supplier Group', data)

    def create_item_group(self, data: dict) -> Optional[dict]:
        """Create an Item Group."""
        return self.create('Item Group', data)

    def create_department(self, data: dict) -> Optional[dict]:
        """Create a Department."""
        return self.create('Department', data)

    def create_designation(self, data: dict) -> Optional[dict]:
        """Create a Designation."""
        return self.create('Designation', data)

    def create_account(self, data: dict) -> Optional[dict]:
        """Create an Account."""
        return self.create('Account', data)
