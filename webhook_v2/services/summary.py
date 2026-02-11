"""
Summary generation service using the Wedding Planner Agent.
"""

import httpx

from webhook_v2.config import settings
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)

SUMMARY_PROMPT = """
Summarize this wedding lead for staff. Use simple English.

Include:
- Profile: couple name, location, wedding date, venue, guests, budget
- Conversation: main topics discussed, questions asked
- Status: current stage
- Next steps: 2-3 actions to take

Keep under 150 words. Use plain text only, no markdown or formatting.
If no conversation yet, summarize profile and note "Awaiting first contact".
"""


class SummaryService:
    """Service for generating AI summaries of leads."""

    def __init__(self, agent_url: str | None = None):
        self.agent_url = agent_url or settings.wedding_agent_url

    def generate_summary(self, lead: dict, communications: list[dict]) -> str:
        """Generate summary via wedding planner agent.

        Args:
            lead: Lead document from ERPNext
            communications: List of Communication documents

        Returns:
            Generated summary text (markdown/HTML)
        """
        content = self._format_content(lead, communications)

        log.info(
            "summary_generation_start",
            lead=lead.get("name"),
            communications_count=len(communications),
        )

        response = httpx.post(
            f"{self.agent_url}/generate",
            json={
                "system_prompt": SUMMARY_PROMPT,
                "content": content,
                "temperature": 0.5,
            },
            timeout=30,
        )
        response.raise_for_status()
        result = response.json()["result"]

        log.info(
            "summary_generation_complete",
            lead=lead.get("name"),
            result_length=len(result),
        )

        return result

    def _format_content(self, lead: dict, communications: list[dict]) -> str:
        """Format lead + communications for the prompt."""
        lines = [
            f"Lead: {lead.get('first_name', 'Unknown')}",
            f"Email: {lead.get('email_id', 'N/A')}",
            f"Status: {lead.get('status', 'N/A')}",
            f"Wedding Date: {lead.get('custom_wedding_date_text') or lead.get('custom_wedding_date') or 'Not specified'}",
            f"Venue: {lead.get('custom_wedding_venue', 'Not specified')}",
            f"Guest Count: {lead.get('custom_guest_count', 'Not specified')}",
            f"Budget: {lead.get('custom_budget', 'Not specified')}",
            "",
            f"=== Communications ({len(communications)} total) ===",
        ]

        for comm in communications:
            direction = "Client" if comm.get("sent_or_received") == "Received" else "Meraki"
            date = (comm.get("communication_date") or "")[:10]
            content = (comm.get("content") or "")[:500]  # Truncate long messages
            lines.append(f"\n[{direction}] {date}:\n{content}")

        return "\n".join(lines)
