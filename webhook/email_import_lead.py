#!/usr/bin/env python3
"""
Single Lead Email Import for Meraki CRM.

Imports ALL emails for a specific email address from the PostgreSQL staging database,
creates a Lead, logs all Communications, and determines the correct
CRM stage based on conversation history.

Usage:
    python email_import_lead.py <email_address>
    python email_import_lead.py hdkw2027@gmail.com
    python email_import_lead.py hdkw2027@gmail.com --dry-run
"""

import argparse
import logging

import httpx

from email_utils import (
    get_db_connection,
    extract_email_address,
    is_meraki_email,
    classify_email,
    get_body_from_dict,
    format_html_content,
    format_initial_communication,
    determine_sent_or_received,
    call_conversation_webhook,
    extract_new_message,
    WEBHOOK_URL,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Stage progression order (for tracking highest stage reached)
STAGE_ORDER = ['new', 'engaged', 'meeting', 'quoted', 'won']


# =============================================================================
# Database Functions
# =============================================================================

def get_emails_for_address(target_email: str) -> list[dict]:
    """Fetch all emails to/from a specific email address from staging DB."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Find emails where target is sender OR recipient OR mentioned in body
            cur.execute("""
                SELECT id, message_id, folder, subject, sender, recipient,
                       body_plain, body_html, email_date
                FROM staged_emails
                WHERE LOWER(sender) LIKE %s
                   OR LOWER(recipient) LIKE %s
                   OR LOWER(body_plain) LIKE %s
                ORDER BY email_date ASC
            """, (f'%{target_email.lower()}%',) * 3)

            columns = [desc[0] for desc in cur.description]
            emails = []
            for row in cur.fetchall():
                email_dict = dict(zip(columns, row))
                # Contact form emails have subject "Meraki Contact Form"
                is_contact_form = (email_dict.get('subject') or '').strip() == 'Meraki Contact Form'
                email_dict['is_contact_form'] = is_contact_form
                emails.append(email_dict)

            return emails
    finally:
        conn.close()


# =============================================================================
# Webhook Functions
# =============================================================================

def call_lead_webhook(data: dict, timestamp: str, target_email: str) -> str | None:
    """Create a new lead via the lead webhook.

    Returns the lead name on success, None on failure.
    """
    payload = {
        "firstname": data.get("firstname") or "Unknown",
        "email": data.get("email") or target_email,
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

    details = data.get("moreDetails") or ""
    if details:
        payload["moreDetails"] = f"[Email Import] {details}"

    try:
        url = f"{WEBHOOK_URL}/api/webhook/lead"
        logger.info(f"Creating lead via {url}: {payload.get('firstname')} <{payload.get('email')}> @ {timestamp}")

        response = httpx.post(url, json=payload, timeout=30)
        if response.status_code in (200, 201):
            result = response.json()
            lead_name = result.get('lead')
            logger.info(f"Lead created: {lead_name or 'unknown'}")
            return lead_name
        else:
            logger.error(f"Lead webhook failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        logger.error(f"Lead webhook error: {e}")
        return None


def call_crm_contact_webhook(email: str, stage: str, message: str,
                             message_type: str, timestamp: str = None,
                             meeting_date: str = None) -> bool:
    """Update CRM contact stage via the CRM webhook."""
    payload = {
        "email": email,
        "stage": stage,
        "payload": {
            "message": message,
            "message_type": message_type,
        }
    }

    if timestamp:
        payload["payload"]["timestamp"] = timestamp

    if meeting_date:
        payload["payload"]["meeting_date"] = meeting_date

    try:
        url = f"{WEBHOOK_URL}/api/crm/contact"
        logger.info(f"Updating CRM contact: {email} -> stage={stage}")

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
# Stage Determination
# =============================================================================

def get_stage_from_classification(classification: str) -> str | None:
    """Map email classification to CRM stage."""
    mapping = {
        "new_lead": "new",
        "client_message": "engaged",
        "staff_message": "engaged",
        "meeting_confirmed": "meeting",
        "quote_sent": "quoted",
    }
    return mapping.get(classification)


def get_message_type(classification: str) -> str:
    """Get message type (client/staff) from classification."""
    staff_classifications = ["staff_message", "meeting_confirmed", "quote_sent"]
    return "staff" if classification in staff_classifications else "client"


def is_higher_stage(new_stage: str, current_stage: str) -> bool:
    """Check if new_stage is higher in the funnel than current_stage."""
    try:
        new_idx = STAGE_ORDER.index(new_stage)
        current_idx = STAGE_ORDER.index(current_stage)
        return new_idx > current_idx
    except ValueError:
        return False


# =============================================================================
# Main Import Function
# =============================================================================

def import_lead_emails(target_email: str, dry_run: bool = False):
    """Import all emails for a specific email address."""
    logger.info(f"{'='*60}")
    logger.info(f"IMPORTING LEAD: {target_email}")
    logger.info(f"Dry run: {dry_run}")
    logger.info(f"{'='*60}")

    # 1. Fetch all emails from PostgreSQL
    emails = get_emails_for_address(target_email)
    if not emails:
        logger.error("No emails found for this address in staging database")
        return

    logger.info(f"\nFound {len(emails)} emails:")
    for i, email in enumerate(emails):
        email_date = email.get('email_date')
        date_str = email_date.strftime('%Y-%m-%d %H:%M') if email_date else 'Unknown'
        sender_email = extract_email_address(email['sender'] or '')
        direction = "->" if is_meraki_email(sender_email) else "<-"
        internal_flag = " [contact form]" if email.get('is_contact_form') else ""
        subject = email.get('subject') or '(No Subject)'
        logger.info(f"  {i+1}. [{date_str}] {direction} {subject[:50]}{internal_flag}")

    if not emails[0].get('email_date'):
        logger.error("First email has no date, cannot proceed")
        return

    # 2. Classify first email and create Lead
    first_email = emails[0]
    logger.info(f"\n{'='*60}")
    logger.info(f"PROCESSING FIRST EMAIL (creating Lead)")
    logger.info(f"Subject: {first_email.get('subject')}")
    logger.info(f"Date: {first_email.get('email_date')}")

    # Get body text
    first_body = get_body_from_dict(first_email)

    # Use Gemini to classify and extract data
    first_result = classify_email(
        first_email.get('subject') or '',
        first_body,
        first_email.get('sender') or '',
        first_email.get('recipient') or ''
    )

    # Ensure email field is set
    first_result['email'] = first_result.get('email') or target_email

    # Use coupleName for firstname when available (better than individual name)
    if first_result.get('coupleName'):
        first_result['firstname'] = first_result['coupleName']

    logger.info(f"Classification: {first_result.get('classification')}")
    logger.info(f"Extracted name: {first_result.get('firstname')} {first_result.get('lastname')}")

    timestamp = first_email['email_date'].isoformat()

    if not dry_run:
        lead_name = call_lead_webhook(first_result, timestamp, target_email)
        if not lead_name:
            logger.error("Failed to create lead, aborting")
            return
        logger.info(f"Created Lead: {lead_name}")

        # Create initial Communication with ALL extracted info for staff visibility
        initial_message = format_initial_communication(first_result, first_body[:2000], first_email.get('is_contact_form', False))
        sent_or_received = determine_sent_or_received(first_email)

        call_conversation_webhook(
            target_email,
            content=initial_message,
            sent_or_received=sent_or_received,
            subject=first_email.get('subject') or '',
            timestamp=timestamp
        )
        logger.info(f"Created initial Communication ({sent_or_received}) with full context")
    else:
        logger.info("[DRY RUN] Would create lead and initial communication")

    # 3. Process remaining emails - track stage progression
    current_stage = "new"
    emails_processed = 1
    stage_transitions = []

    for email in emails[1:]:
        if not email.get('email_date'):
            logger.warning(f"Skipping email without date: {(email.get('subject') or '')[:40]}")
            continue

        logger.info(f"\n{'-'*40}")
        logger.info(f"Processing: {(email.get('subject') or '')[:50]}")

        email_body = get_body_from_dict(email)

        result = classify_email(
            email.get('subject') or '',
            email_body,
            email.get('sender') or '',
            email.get('recipient') or ''
        )

        classification = result.get('classification', 'irrelevant')
        logger.info(f"Classification: {classification}")

        if classification == 'irrelevant':
            logger.info("Skipping irrelevant email")
            continue

        timestamp = email['email_date'].isoformat()
        sent_or_received = determine_sent_or_received(email)

        # Determine stage from classification
        email_stage = get_stage_from_classification(classification)
        message_type = get_message_type(classification)

        # Use actual email body for Communication content (not Gemini summary)
        # Extract only new message, stripping quoted replies
        extracted_body = extract_new_message(email_body)
        formatted_content = format_html_content(extracted_body[:3000] if extracted_body else (email.get('subject') or ''))

        # Gemini summary still used for stage transition messages
        stage_message = result.get('message_summary') or email.get('subject') or ''

        if not dry_run:
            # Create Communication record with actual email body
            call_conversation_webhook(
                target_email,
                content=formatted_content,
                sent_or_received=sent_or_received,
                subject=email.get('subject') or '',
                timestamp=timestamp
            )

            # Update stage if this classification represents a higher stage
            if email_stage and is_higher_stage(email_stage, current_stage):
                meeting_date = result.get('meeting_date') if classification == 'meeting_confirmed' else None

                call_crm_contact_webhook(
                    email=target_email,
                    stage=email_stage,
                    message=stage_message,
                    message_type=message_type,
                    timestamp=timestamp,
                    meeting_date=meeting_date
                )

                stage_transitions.append({
                    'from': current_stage,
                    'to': email_stage,
                    'date': timestamp,
                    'email_subject': (email.get('subject') or '')[:40]
                })
                current_stage = email_stage
                logger.info(f"Stage transition: {stage_transitions[-1]['from']} -> {email_stage}")

        else:
            logger.info(f"[DRY RUN] Would create conversation ({sent_or_received}) and potentially update stage to {email_stage}")
            if email_stage and is_higher_stage(email_stage, current_stage):
                current_stage = email_stage

        emails_processed += 1

    # 4. Summary
    logger.info(f"\n{'='*60}")
    logger.info("IMPORT COMPLETE")
    logger.info(f"{'='*60}")
    logger.info(f"Emails processed: {emails_processed}")
    logger.info(f"Final stage: {current_stage}")

    if stage_transitions:
        logger.info(f"\nStage transitions:")
        for t in stage_transitions:
            logger.info(f"  {t['from']} -> {t['to']} ({t['date'][:10]})")

    if dry_run:
        logger.info("\n[DRY RUN] No actual changes were made")


# =============================================================================
# Main
# =============================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Import all emails for a specific lead into the CRM",
        epilog="Example: python email_import_lead.py hdkw2027@gmail.com"
    )
    parser.add_argument("email", help="The email address to import")
    parser.add_argument("--dry-run", action="store_true",
                       help="Run without making any changes")
    args = parser.parse_args()

    import_lead_emails(args.email, dry_run=args.dry_run)
