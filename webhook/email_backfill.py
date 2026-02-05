#!/usr/bin/env python3
"""
Email history backfill for Meraki CRM using PostgreSQL staging database.

Reads emails from the staging database (populated by email_staging.py),
groups them by contact, and creates leads with proper historical timestamps.

Key differences from email_processor.py:
- Groups emails by contact (external email address)
- Processes oldest-first within each contact group
- Only creates lead if first contact email is found
- Preserves historical timestamps for leads and communications

Usage:
    python email_backfill.py [--days 90] [--dry-run] [--reset]
"""

import argparse
import logging
import os
from collections import defaultdict
from datetime import datetime, timedelta

import httpx
import psycopg2
from psycopg2.extras import Json

from email_utils import (
    get_db_connection,
    extract_email_address,
    is_meraki_email,
    classify_email,
    get_body_from_dict,
    format_html_content,
    determine_sent_or_received,
    call_conversation_webhook,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

WEBHOOK_URL = os.environ.get('WEBHOOK_URL', 'http://webhook:8000')

# System email that sends auto-replies (indicates first contact)
SYSTEM_EMAIL = 'contact@merakiweddingplanner.com'

# ERPNext API credentials (from webhook service)
ERPNEXT_URL = os.environ.get('ERPNEXT_URL', 'http://frontend:8080')
ERPNEXT_API_KEY = os.environ.get('ERPNEXT_API_KEY', '')
ERPNEXT_API_SECRET = os.environ.get('ERPNEXT_API_SECRET', '')


# =============================================================================
# Database Functions
# =============================================================================

def get_emails_for_backfill(conn, days: int) -> list[dict]:
    """
    Fetch unprocessed emails from staging database for the given date range.
    Returns emails ordered by date (oldest first).
    """
    since_date = datetime.now() - timedelta(days=days)

    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, message_id, folder, subject, sender, recipient,
                   body_plain, body_html, email_date, has_attachments
            FROM staged_emails
            WHERE processed = FALSE
              AND email_date >= %s
            ORDER BY email_date ASC
        """, (since_date,))

        columns = [desc[0] for desc in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]


def mark_email_processed(conn, email_id: int, classification: str, data: dict):
    """Mark an email as processed in the staging database."""
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE staged_emails
            SET processed = TRUE,
                processed_at = NOW(),
                classification = %s,
                classification_data = %s
            WHERE id = %s
        """, (classification, Json(data), email_id))
        conn.commit()


def reset_processed_emails(conn, days: int):
    """Reset processed flag for emails within the date range (for re-backfilling)."""
    since_date = datetime.now() - timedelta(days=days)

    with conn.cursor() as cur:
        cur.execute("""
            UPDATE staged_emails
            SET processed = FALSE,
                processed_at = NULL,
                classification = NULL,
                classification_data = NULL
            WHERE email_date >= %s
        """, (since_date,))
        affected = cur.rowcount
        conn.commit()

    logger.info(f"Reset {affected} emails to unprocessed state")
    return affected


# =============================================================================
# Email Grouping Functions
# =============================================================================

def get_external_email(sender: str, recipient: str) -> str | None:
    """Get the external (non-Meraki) email address from sender/recipient."""
    sender_email = extract_email_address(sender)
    recipient_email = extract_email_address(recipient)

    if not is_meraki_email(sender_email):
        return sender_email
    if not is_meraki_email(recipient_email):
        return recipient_email
    return None


def group_emails_by_contact(emails: list[dict]) -> dict[str, list[dict]]:
    """
    Group emails by external contact email.
    Each group is already sorted oldest-first (from the database query).
    """
    groups = defaultdict(list)

    for email in emails:
        sender = email.get('sender') or ''
        recipient = email.get('recipient') or ''
        external_email = get_external_email(sender, recipient)

        if external_email:
            email['external_email'] = external_email
            groups[external_email].append(email)

    logger.info(f"Grouped {len(emails)} emails into {len(groups)} unique contacts")
    return dict(groups)


def is_first_contact_email(classification: str, sender: str) -> bool:
    """
    Determine if this email represents the first contact in a conversation.

    First contact is either:
    - A new_lead classification (client's first inquiry)
    - System auto-reply from contact@merakiweddingplanner.com
    """
    sender_email = extract_email_address(sender)

    # New lead inquiry from client
    if classification == 'new_lead':
        return True

    # System auto-reply (indicates response to first contact)
    if sender_email == SYSTEM_EMAIL:
        return True

    return False


# =============================================================================
# ERPNext API Functions
# =============================================================================

def search_lead_by_email(email: str) -> str | None:
    """
    Search for a Lead in ERPNext by email address.
    Returns the lead name (e.g., 'CRM-LEAD-2026-00013') on success, None if not found.
    """
    if not ERPNEXT_API_KEY or not ERPNEXT_API_SECRET:
        logger.warning("ERPNext API credentials not configured, cannot search for lead")
        return None

    try:
        import json
        response = httpx.get(
            f"{ERPNEXT_URL}/api/resource/Lead",
            params={
                "filters": json.dumps([["email_id", "=", email]]),
                "fields": json.dumps(["name"]),
                "limit_page_length": 1,
            },
            headers={
                "Authorization": f"token {ERPNEXT_API_KEY}:{ERPNEXT_API_SECRET}",
            },
            timeout=30,
        )
        if response.status_code == 200:
            data = response.json().get("data", [])
            if data:
                lead_name = data[0].get("name")
                logger.info(f"Found existing lead by email search: {lead_name}")
                return lead_name
        return None
    except Exception as e:
        logger.error(f"Error searching for lead by email: {e}")
        return None


# =============================================================================
# Webhook Functions
# =============================================================================

def call_lead_webhook(data: dict, timestamp: str, attachments: list[dict] = None) -> str | None:
    """
    Create a new lead via the lead webhook with historical timestamp.
    Returns the lead name (e.g., 'CRM-LEAD-2026-00013') on success, None on failure.
    """
    payload = {
        "firstname": data.get("firstname") or "Unknown",
        "email": data.get("email") or "",
        "timestamp": timestamp,
    }

    optional_fields = [
        "lastname", "phone", "address", "coupleName", "weddingVenue",
        "approximate", "budget", "weddingDate", "position", "ref", "moreDetails"
    ]
    for field in optional_fields:
        if data.get(field):
            payload[field] = data[field]

    payload["ref"] = payload.get("ref") or "email"

    # Add attachment info to moreDetails
    details = data.get("moreDetails") or ""
    if attachments:
        attachment_info = ", ".join([a['filename'] for a in attachments])
        details = f"[From Email] {details}\n\nAttachments: {attachment_info}"
    elif details:
        details = f"[From Email] {details}"
    if details:
        payload["moreDetails"] = details

    try:
        url = f"{WEBHOOK_URL}/api/webhook/lead"
        email = payload.get('email')
        logger.info(f"Creating lead via {url}: {payload.get('firstname')} <{email}> @ {timestamp}")

        response = httpx.post(url, json=payload, timeout=30)
        if response.status_code in (200, 201):
            result = response.json()
            lead_name = result.get('lead')

            # Fallback: search by email if response parsing failed
            if not lead_name and email:
                logger.warning(f"Empty lead name in response, searching by email: {email}")
                lead_name = search_lead_by_email(email)

            if lead_name:
                logger.info(f"Lead created/found: {lead_name}")
                return lead_name
            else:
                logger.error(f"Failed to get lead name from response or search for {email}")
                return None
        else:
            logger.error(f"Lead webhook failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        logger.error(f"Lead webhook error: {e}")
        return None


def call_crm_contact_webhook(data: dict, classification: str, timestamp: str) -> bool:
    """Update CRM contact stage via the CRM webhook with historical timestamp."""
    email = data.get("email")
    if not email:
        logger.warning("No email address found, cannot update CRM contact")
        return False

    stage_mapping = {
        "client_message": ("engaged", "client"),
        "staff_message": ("engaged", "staff"),
        "meeting_confirmed": ("meeting", "staff"),
        "quote_sent": ("quoted", "staff"),
    }

    stage, message_type = stage_mapping.get(classification, ("engaged", "client"))

    payload = {
        "email": email,
        "stage": stage,
        "payload": {
            "message": data.get("message_summary") or "(Email content)",
            "message_type": message_type,
            "timestamp": timestamp,
        }
    }

    if classification == "meeting_confirmed" and data.get("meeting_date"):
        payload["payload"]["meeting_date"] = data["meeting_date"]

    try:
        url = f"{WEBHOOK_URL}/api/crm/contact"
        logger.info(f"Updating CRM contact via {url}: {email} -> stage={stage} @ {timestamp}")

        response = httpx.put(url, json=payload, timeout=30)
        if response.status_code in (200, 201):
            logger.info(f"CRM contact updated successfully")
            return True
        else:
            logger.error(f"CRM webhook failed: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        logger.error(f"CRM webhook error: {e}")
        return False


# =============================================================================
# Main Backfill Function
# =============================================================================

def run_backfill(days: int = 90, dry_run: bool = False, reset: bool = False):
    """Main backfill function using PostgreSQL staging database."""
    logger.info(f"Starting email backfill for last {days} days (dry_run={dry_run})")

    conn = get_db_connection()

    try:
        # Reset if requested
        if reset and not dry_run:
            reset_processed_emails(conn, days)

        # 1. Fetch unprocessed emails from staging database
        emails = get_emails_for_backfill(conn, days)
        if not emails:
            logger.warning("No unprocessed emails found in staging database")
            logger.info("Hint: Run 'python email_staging.py --days X' first to fetch emails")
            return

        logger.info(f"Found {len(emails)} unprocessed emails")

        # 2. Group by contact
        contacts = group_emails_by_contact(emails)

        # Stats
        leads_created = 0
        leads_skipped = 0
        emails_processed = 0
        lead_timestamps = []

        # 3. Process each contact
        for contact_email, contact_emails in contacts.items():
            logger.info(f"\n{'='*60}")
            logger.info(f"Processing contact: {contact_email} ({len(contact_emails)} emails)")

            if not contact_emails:
                continue

            # Get oldest email for this contact
            oldest_email = contact_emails[0]
            oldest_date = oldest_email.get('email_date')

            if not oldest_date:
                logger.warning(f"  Skipping {contact_email}: no date on oldest email")
                leads_skipped += 1
                # Still mark as processed
                if not dry_run:
                    mark_email_processed(conn, oldest_email['id'], 'irrelevant', {})
                continue

            # Classify the oldest email
            body = get_body_from_dict(oldest_email)
            logger.info(f"  Classifying oldest email: {oldest_email.get('subject', '')[:50]}...")

            oldest_result = classify_email(
                oldest_email.get('subject') or '',
                body,
                oldest_email.get('sender') or '',
                oldest_email.get('recipient') or ''
            )
            oldest_result['sender'] = oldest_email.get('sender') or ''
            oldest_result['email'] = oldest_result.get('email') or contact_email

            classification = oldest_result.get('classification', 'irrelevant')

            # Check if this is the first contact
            if not is_first_contact_email(classification, oldest_email.get('sender') or ''):
                logger.warning(f"  Skipping {contact_email}: oldest email is not first contact "
                              f"(classification={classification})")
                # Mark as processed so we don't re-process
                if not dry_run:
                    mark_email_processed(conn, oldest_email['id'], classification, oldest_result)
                leads_skipped += 1
                continue

            # This IS the first contact - create lead
            timestamp = oldest_date.isoformat()
            logger.info(f"  First contact found! Creating lead with timestamp: {timestamp}")

            if not dry_run:
                lead_name = call_lead_webhook(oldest_result, timestamp)
                if not lead_name:
                    logger.error(f"  Failed to create lead for {contact_email}")
                    mark_email_processed(conn, oldest_email['id'], classification, oldest_result)
                    leads_skipped += 1
                    continue

                # Track for post-processing timestamp update
                try:
                    dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                    mysql_ts = dt.strftime('%Y-%m-%d %H:%M:%S')
                    lead_timestamps.append((lead_name, mysql_ts))
                except Exception as e:
                    logger.warning(f"  Could not parse timestamp {timestamp}: {e}")

                # Create Communication record for the first email
                call_conversation_webhook(
                    email=contact_email,
                    content=format_html_content(body[:3000] if body else ''),
                    sent_or_received=determine_sent_or_received(oldest_email),
                    subject=oldest_email.get('subject') or '',
                    timestamp=timestamp
                )

                # Mark as processed
                mark_email_processed(conn, oldest_email['id'], classification, oldest_result)

            leads_created += 1
            emails_processed += 1

            # Process remaining emails for this contact (oldest to newest)
            for email_data in contact_emails[1:]:
                email_date = email_data.get('email_date')
                if not email_date:
                    if not dry_run:
                        mark_email_processed(conn, email_data['id'], 'irrelevant', {})
                    continue

                body = get_body_from_dict(email_data)
                logger.info(f"  Processing follow-up: {email_data.get('subject', '')[:40]}...")

                result = classify_email(
                    email_data.get('subject') or '',
                    body,
                    email_data.get('sender') or '',
                    email_data.get('recipient') or ''
                )
                result['email'] = contact_email
                classification = result.get('classification', 'irrelevant')

                if not dry_run:
                    mark_email_processed(conn, email_data['id'], classification, result)

                if classification == 'irrelevant':
                    logger.info(f"    Skipping irrelevant email")
                    continue

                timestamp = email_date.isoformat()

                if not dry_run:
                    # Update CRM stage
                    call_crm_contact_webhook(result, classification, timestamp)

                    # Create Communication record for follow-up email
                    call_conversation_webhook(
                        email=contact_email,
                        content=format_html_content(body[:3000] if body else ''),
                        sent_or_received=determine_sent_or_received(email_data),
                        subject=email_data.get('subject') or '',
                        timestamp=timestamp
                    )

                emails_processed += 1

        # Summary
        logger.info(f"\n{'='*60}")
        logger.info("BACKFILL COMPLETE")
        logger.info(f"  Leads created: {leads_created}")
        logger.info(f"  Leads skipped (incomplete history): {leads_skipped}")
        logger.info(f"  Total emails processed: {emails_processed}")
        if dry_run:
            logger.info("  (DRY RUN - no actual changes made)")

        # Generate timestamp update script if leads were created
        if lead_timestamps and not dry_run:
            _print_timestamp_update_script(lead_timestamps)

    finally:
        conn.close()


def _print_timestamp_update_script(lead_timestamps: list[tuple[str, str]]):
    """Print the script to update lead creation timestamps in ERPNext."""
    logger.info(f"\n{'='*60}")
    logger.info("POST-PROCESSING: Update Lead Creation Timestamps")
    logger.info("ERPNext doesn't allow setting 'creation' via API.")
    logger.info("Run the following command to update timestamps:")
    logger.info(f"\n{'='*60}")

    script_lines = [
        "# Update creation timestamps for backfilled leads",
        "updates = [",
    ]
    for lead_name, ts in lead_timestamps:
        script_lines.append(f"    ('{lead_name}', '{ts}'),")
    script_lines.extend([
        "]",
        "",
        "for lead_name, creation in updates:",
        "    frappe.db.set_value('Lead', lead_name, 'creation', creation)",
        "    print(f'Updated {lead_name} to {creation}')",
        "",
        "frappe.db.commit()",
        "print('All updates committed')",
    ])

    script = "\n".join(script_lines)
    logger.info("\n" + script)
    logger.info(f"\n{'='*60}")
    logger.info("To run: docker compose exec backend bash -c \"bench --site erp.merakiwp.com console << 'EOF'")
    logger.info(script)
    logger.info("EOF\"")


def get_stats(days: int = None):
    """Print backfill-relevant statistics from the staging database."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Total emails
            cur.execute("SELECT COUNT(*) FROM staged_emails")
            total = cur.fetchone()[0]

            # Processed vs unprocessed
            cur.execute("SELECT COUNT(*) FROM staged_emails WHERE processed = TRUE")
            processed = cur.fetchone()[0]

            # If days specified, show stats for that range
            if days:
                since_date = datetime.now() - timedelta(days=days)
                cur.execute("""
                    SELECT COUNT(*) FROM staged_emails
                    WHERE email_date >= %s
                """, (since_date,))
                in_range = cur.fetchone()[0]

                cur.execute("""
                    SELECT COUNT(*) FROM staged_emails
                    WHERE email_date >= %s AND processed = FALSE
                """, (since_date,))
                unprocessed_in_range = cur.fetchone()[0]

            # Classification breakdown
            cur.execute("""
                SELECT classification, COUNT(*)
                FROM staged_emails
                WHERE classification IS NOT NULL
                GROUP BY classification
                ORDER BY COUNT(*) DESC
            """)
            classifications = cur.fetchall()

        print(f"\nStaging Database Statistics:")
        print(f"  Total emails: {total}")
        print(f"  Processed: {processed}")
        print(f"  Unprocessed: {total - processed}")

        if days:
            print(f"\n  Last {days} days:")
            print(f"    Total: {in_range}")
            print(f"    Unprocessed: {unprocessed_in_range}")

        if classifications:
            print(f"\nClassification breakdown:")
            for cls, count in classifications:
                print(f"  {cls}: {count}")

    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill CRM with email history from staging database")
    parser.add_argument("--days", type=int, default=90, help="Number of days to process (default: 90)")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--reset", action="store_true", help="Reset processed flag for emails in date range before backfill")
    parser.add_argument("--stats", action="store_true", help="Show staging database statistics and exit")
    args = parser.parse_args()

    if args.stats:
        get_stats(args.days)
    else:
        run_backfill(days=args.days, dry_run=args.dry_run, reset=args.reset)
