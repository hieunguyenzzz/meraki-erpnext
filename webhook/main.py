import json
import os
import re
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

import secrets

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.templating import Jinja2Templates

app = FastAPI(title="Meraki Lead Webhook")

# CRM Stage Configuration
# Maps webhook stage names to ERPNext Lead status
# Simplified: All stages use Lead doctype (no Opportunity conversion)
STAGE_CONFIG = {
    "new": {"status": "Open"},
    "engaged": {"status": "Replied"},
    "meeting": {"status": "Interested"},
    "quoted": {"status": "Quotation"},
    "won": {"status": "Converted"},
    "lost": {"status": "Do Not Contact"},
}

# Reverse mapping: ERPNext Lead status → stage name (for logging transitions)
LEAD_STATUS_TO_STAGE = {
    "Lead": "new",
    "Open": "new",
    "Replied": "engaged",
    "Interested": "meeting",
    "Quotation": "quoted",
    "Converted": "won",
    "Do Not Contact": "lost",
}
templates = Jinja2Templates(directory="templates")

DB_PATH = Path("/app/data/webhook.db")
ERPNEXT_URL = os.environ.get("ERPNEXT_URL", "http://frontend:8080")
ERPNEXT_API_KEY = os.environ.get("ERPNEXT_API_KEY", "")
ERPNEXT_API_SECRET = os.environ.get("ERPNEXT_API_SECRET", "")

# Analytics dashboard credentials - must be set via environment variables
ANALYTICS_USER = os.environ.get("ANALYTICS_USER")
ANALYTICS_PASS = os.environ.get("ANALYTICS_PASS")

if not ANALYTICS_USER or not ANALYTICS_PASS:
    import logging
    logging.warning("ANALYTICS_USER/ANALYTICS_PASS not set - analytics dashboard will be inaccessible")

VALID_LEAD_SOURCES = {"google", "facebook", "instagram", "referral", "other"}

# ERPNext valid relationship values for Lead.custom_relationship
VALID_RELATIONSHIPS = {
    "": "",
    "bride/groom": "Bride/Groom",
    "bride": "Bride/Groom",
    "groom": "Bride/Groom",
    "mother": "Mother of Bride/Groom",
    "mother of bride": "Mother of Bride/Groom",
    "mother of groom": "Mother of Bride/Groom",
    "father": "Mother of Bride/Groom",  # Using same category
    "parent": "Mother of Bride/Groom",
    "family": "Mother of Bride/Groom",
    "friend": "Friend of Bride/Groom",
    "friend of bride": "Friend of Bride/Groom",
    "friend of groom": "Friend of Bride/Groom",
    "other": "Other",
}

security = HTTPBasic()


def verify_auth(credentials: HTTPBasicCredentials = Depends(security)):
    """Verify HTTP Basic Auth credentials for analytics dashboard."""
    if not ANALYTICS_USER or not ANALYTICS_PASS:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Analytics dashboard not configured",
        )
    correct_user = secrets.compare_digest(credentials.username.encode(), ANALYTICS_USER.encode())
    correct_pass = secrets.compare_digest(credentials.password.encode(), ANALYTICS_PASS.encode())
    if not (correct_user and correct_pass):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS webhook_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT DEFAULT (datetime('now')),
            success INTEGER,
            lead_name TEXT,
            error TEXT,
            request_data TEXT,
            response_status INTEGER,
            ip_address TEXT
        )
    """)
    return conn


def log_call(success: bool, lead_name: str | None, error: str | None,
             request_data: dict, response_status: int | None, ip: str):
    conn = get_db()
    conn.execute(
        "INSERT INTO webhook_logs (success, lead_name, error, request_data, response_status, ip_address) VALUES (?, ?, ?, ?, ?, ?)",
        (1 if success else 0, lead_name, error, json.dumps(request_data), response_status, ip),
    )
    conn.commit()
    conn.close()


def parse_date(date_str: str) -> str | None:
    """Parse MM/DD/YY to YYYY-MM-DD."""
    if not date_str:
        return None
    try:
        dt = datetime.strptime(date_str.strip(), "%m/%d/%y")
        return dt.strftime("%Y-%m-%d")
    except ValueError:
        return None


def parse_budget(budget_str: str) -> float:
    """Extract numeric value from budget string like '100000usd'."""
    if not budget_str:
        return 0.0
    nums = re.findall(r"[\d.]+", str(budget_str))
    if nums:
        try:
            return float(nums[0])
        except ValueError:
            return 0.0
    return 0.0


def parse_guest_count(val: str) -> int:
    if not val:
        return 0
    nums = re.findall(r"\d+", str(val))
    return int(nums[0]) if nums else 0


def match_lead_source(ref: str) -> str | None:
    if not ref:
        return None
    normalized = ref.strip().lower()
    if normalized in VALID_LEAD_SOURCES:
        return ref.strip().title()
    return "Other"


def match_relationship(position: str) -> str | None:
    """Map position/relationship to valid ERPNext values."""
    if not position:
        return None
    normalized = position.strip().lower()
    if normalized in VALID_RELATIONSHIPS:
        return VALID_RELATIONSHIPS[normalized]
    # Default to Other for any unrecognized value
    return "Other"


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/webhook/lead")
async def create_lead(request: Request):
    ip = request.client.host if request.client else "unknown"
    try:
        body = await request.json()
    except Exception:
        log_call(False, None, "Invalid JSON body", {}, None, ip)
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    firstname = (body.get("firstname") or "").strip()
    lastname = (body.get("lastname") or "").strip()
    email = (body.get("email") or "").strip()

    if not email:
        log_call(False, None, "Missing required field: email", body, None, ip)
        raise HTTPException(status_code=400, detail="Missing required field: email")

    if not firstname:
        log_call(False, None, "Missing required field: firstname", body, None, ip)
        raise HTTPException(status_code=400, detail="Missing required field: firstname")

    # Raw values for display fidelity
    budget_raw = (body.get("budget") or "").strip()
    guest_count_raw = (body.get("approximate") or "").strip()
    wedding_date_raw = (body.get("weddingDate") or "").strip()

    lead_data = {
        "doctype": "Lead",
        "first_name": firstname,
        "last_name": lastname,
        "lead_name": f"{firstname} {lastname}".strip(),
        "email_id": email,
        "phone": (body.get("phone") or "").strip() or None,
        "city": (body.get("address") or "").strip() or None,
        "status": "Lead",
        "custom_couple_name": (body.get("coupleName") or "").strip() or None,
        "custom_wedding_venue": (body.get("weddingVenue") or "").strip() or None,
        # Parsed values (for filtering/sorting)
        "custom_guest_count": parse_guest_count(guest_count_raw),
        "custom_estimated_budget": parse_budget(budget_raw),
        # Raw values (for display)
        "custom_budget_raw": budget_raw or None,
        "custom_guest_count_raw": guest_count_raw or None,
        "custom_wedding_date_raw": wedding_date_raw or None,
    }

    wedding_date = parse_date(wedding_date_raw)
    if wedding_date:
        lead_data["custom_wedding_date"] = wedding_date

    relationship = match_relationship(body.get("position", ""))
    if relationship:
        lead_data["custom_relationship"] = relationship

    source = match_lead_source(body.get("ref", ""))
    if source:
        lead_data["source"] = source

    notes_text = (body.get("moreDetails") or "").strip()
    if notes_text:
        lead_data["notes"] = [{"note": notes_text}]

    # Remove None values
    lead_data = {k: v for k, v in lead_data.items() if v is not None}

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{ERPNEXT_URL}/api/resource/Lead",
                json=lead_data,
                headers={
                    "Authorization": f"token {ERPNEXT_API_KEY}:{ERPNEXT_API_SECRET}",
                    "Content-Type": "application/json",
                },
            )
    except httpx.RequestError as e:
        log_call(False, None, f"ERPNext connection error: {e}", body, None, ip)
        raise HTTPException(status_code=502, detail=f"ERPNext connection error: {e}")

    if resp.status_code in (200, 201):
        result = resp.json()
        lead_name = result.get("data", {}).get("name", "")

        # Validate lead_name is not empty
        if not lead_name:
            log_call(False, None, "ERPNext returned empty lead name", body, resp.status_code, ip)
            raise HTTPException(status_code=500, detail="ERPNext returned empty lead name")

        # Handle historical timestamp for backfill
        timestamp = body.get("timestamp")
        if timestamp and lead_name:
            try:
                async with httpx.AsyncClient(timeout=30.0) as ts_client:
                    await set_value(ts_client, "Lead", lead_name, "creation", timestamp)
            except Exception as e:
                # Log but don't fail - lead was created successfully
                log_call(True, lead_name, f"Warning: failed to set timestamp: {e}", body, resp.status_code, ip)
                return {"success": True, "lead": lead_name}

        log_call(True, lead_name, None, body, resp.status_code, ip)
        return {"success": True, "lead": lead_name}
    else:
        error_text = resp.text[:500]
        log_call(False, None, error_text, body, resp.status_code, ip)
        raise HTTPException(status_code=resp.status_code, detail=error_text)


@app.post("/api/webhook/conversation")
async def create_conversation(request: Request):
    ip = request.client.host if request.client else "unknown"
    try:
        body = await request.json()
    except Exception:
        log_call(False, None, "Invalid JSON body", {}, None, ip)
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    email = (body.get("email") or "").strip()
    content = (body.get("content") or "").strip()
    sent_or_received = (body.get("sent_or_received") or "").strip()

    if not email:
        log_call(False, None, "Missing required field: email", body, None, ip)
        raise HTTPException(status_code=400, detail="Missing required field: email")
    if not content:
        log_call(False, None, "Missing required field: content", body, None, ip)
        raise HTTPException(status_code=400, detail="Missing required field: content")
    if sent_or_received not in ("Sent", "Received"):
        log_call(False, None, "sent_or_received must be 'Sent' or 'Received'", body, None, ip)
        raise HTTPException(status_code=400, detail="sent_or_received must be 'Sent' or 'Received'")

    headers = {
        "Authorization": f"token {ERPNEXT_API_KEY}:{ERPNEXT_API_SECRET}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # 1. Find Lead by email_id
            lead_resp = await client.get(
                f"{ERPNEXT_URL}/api/resource/Lead",
                params={
                    "filters": json.dumps([["email_id", "=", email]]),
                    "fields": json.dumps(["name"]),
                    "limit_page_length": 1,
                },
                headers=headers,
            )

        if lead_resp.status_code != 200 or not lead_resp.json().get("data"):
            log_call(False, None, f"No Lead found with email: {email}", body, lead_resp.status_code, ip)
            raise HTTPException(status_code=404, detail=f"No Lead found with email: {email}")

        lead_name = lead_resp.json()["data"][0]["name"]

        # 2. Check if Lead has a linked Opportunity
        attached_doctype = "Lead"
        attached_name = lead_name

        async with httpx.AsyncClient(timeout=30.0) as client:
            opp_resp = await client.get(
                f"{ERPNEXT_URL}/api/resource/Opportunity",
                params={
                    "filters": json.dumps([["party_name", "=", lead_name], ["opportunity_from", "=", "Lead"]]),
                    "fields": json.dumps(["name"]),
                    "limit_page_length": 1,
                    "order_by": "creation desc",
                },
                headers=headers,
            )

        if opp_resp.status_code == 200 and opp_resp.json().get("data"):
            attached_doctype = "Opportunity"
            attached_name = opp_resp.json()["data"][0]["name"]

        # 3. Check for duplicate Communication
        timestamp = body.get("timestamp")  # Optional: ISO datetime for historical records
        subject = body.get("subject", "")

        async with httpx.AsyncClient(timeout=30.0) as client:
            # Build duplicate check filters
            dup_filters = [
                ["reference_doctype", "=", attached_doctype],
                ["reference_name", "=", attached_name],
                ["subject", "=", subject],
            ]

            # If timestamp provided, also match communication_date
            if timestamp:
                erpnext_ts = to_erpnext_datetime(timestamp)
                dup_filters.append(["communication_date", "=", erpnext_ts])

            dup_check = await client.get(
                f"{ERPNEXT_URL}/api/resource/Communication",
                params={
                    "filters": json.dumps(dup_filters),
                    "fields": json.dumps(["name"]),
                    "limit_page_length": 1,
                },
                headers=headers,
            )

            if dup_check.status_code == 200 and dup_check.json().get("data"):
                existing = dup_check.json()["data"][0]["name"]
                log_call(True, existing, "Duplicate prevented - communication already exists", body, 200, ip)
                return {
                    "success": True,
                    "communication": existing,
                    "duplicate": True,
                    "message": "Communication already exists",
                }

        # 4. Create Communication

        comm_data = {
            "doctype": "Communication",
            "communication_type": "Communication",
            "communication_medium": "Email",
            "sent_or_received": sent_or_received,
            "subject": body.get("subject", ""),
            "content": content,
            "send_email": 0,
            "reference_doctype": attached_doctype,
            "reference_name": attached_name,
        }

        # Set communication_date for historical records (convert to ERPNext format)
        if timestamp:
            comm_data["communication_date"] = to_erpnext_datetime(timestamp)

        async with httpx.AsyncClient(timeout=30.0) as client:
            comm_resp = await client.post(
                f"{ERPNEXT_URL}/api/resource/Communication",
                json=comm_data,
                headers=headers,
            )

            if comm_resp.status_code in (200, 201):
                comm_name = comm_resp.json().get("data", {}).get("name", "")

                # Update both creation and communication_date for historical records
                if timestamp and comm_name:
                    erpnext_ts = to_erpnext_datetime(timestamp)
                    await set_value(client, "Communication", comm_name, "creation", erpnext_ts)
                    await set_value(client, "Communication", comm_name, "communication_date", erpnext_ts)

                log_call(True, comm_name, None, body, comm_resp.status_code, ip)
                return {
                    "success": True,
                    "communication": comm_name,
                    "attached_to": f"{attached_doctype}/{attached_name}",
                }
            else:
                error_text = comm_resp.text[:500]
                log_call(False, None, error_text, body, comm_resp.status_code, ip)
                raise HTTPException(status_code=comm_resp.status_code, detail=error_text)

    except httpx.RequestError as e:
        log_call(False, None, f"ERPNext connection error: {e}", body, None, ip)
        raise HTTPException(status_code=502, detail=f"ERPNext connection error: {e}")


@app.get("/analytics", response_class=HTMLResponse)
async def analytics(request: Request, status: str = "all", _user: str = Depends(verify_auth)):
    conn = get_db()
    if status == "success":
        rows = conn.execute("SELECT * FROM webhook_logs WHERE success = 1 ORDER BY id DESC LIMIT 200").fetchall()
    elif status == "failed":
        rows = conn.execute("SELECT * FROM webhook_logs WHERE success = 0 ORDER BY id DESC LIMIT 200").fetchall()
    else:
        rows = conn.execute("SELECT * FROM webhook_logs ORDER BY id DESC LIMIT 200").fetchall()

    stats = conn.execute("""
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as fail_count
        FROM webhook_logs
    """).fetchone()
    conn.close()

    return templates.TemplateResponse("analytics.html", {
        "request": request,
        "logs": rows,
        "stats": dict(stats) if stats else {"total": 0, "success_count": 0, "fail_count": 0},
        "current_filter": status,
    })


# =============================================================================
# CRM Contact Webhook - Stage Movement API
# =============================================================================

def get_erpnext_headers() -> dict:
    """Return headers for ERPNext API calls."""
    return {
        "Authorization": f"token {ERPNEXT_API_KEY}:{ERPNEXT_API_SECRET}",
        "Content-Type": "application/json",
    }


async def find_lead_by_email(client: httpx.AsyncClient, email: str) -> dict | None:
    """Find Lead by email_id."""
    resp = await client.get(
        f"{ERPNEXT_URL}/api/resource/Lead",
        params={
            "filters": json.dumps([["email_id", "=", email]]),
            "fields": json.dumps(["name", "lead_name", "status"]),
            "limit_page_length": 1,
        },
        headers=get_erpnext_headers(),
    )
    if resp.status_code == 200 and resp.json().get("data"):
        return resp.json()["data"][0]
    return None


def to_erpnext_datetime(iso_timestamp: str) -> str:
    """Convert ISO timestamp to ERPNext datetime format in Vietnam timezone.

    ERPNext expects 'YYYY-MM-DD HH:MM:SS' without timezone.
    Input can be ISO format like '2026-02-01T08:13:31+00:00'.
    Converts to Vietnam timezone (UTC+7) before stripping timezone info.
    """
    from zoneinfo import ZoneInfo
    try:
        dt = datetime.fromisoformat(iso_timestamp.replace('Z', '+00:00'))
        # Convert to Vietnam timezone (ICT, UTC+7)
        vietnam_tz = ZoneInfo('Asia/Ho_Chi_Minh')
        dt_vietnam = dt.astimezone(vietnam_tz)
        return dt_vietnam.strftime('%Y-%m-%d %H:%M:%S')
    except Exception:
        return iso_timestamp  # Return as-is if parsing fails


async def set_value(client: httpx.AsyncClient, doctype: str, name: str, fieldname: str, value: str) -> dict:
    """Update a field value using frappe.client.set_value (same as frontend)."""
    resp = await client.post(
        f"{ERPNEXT_URL}/api/method/frappe.client.set_value",
        json={
            "doctype": doctype,
            "name": name,
            "fieldname": fieldname,
            "value": value,
        },
        headers=get_erpnext_headers(),
    )
    return resp.json()


async def create_meeting_event(client: httpx.AsyncClient, lead_name: str, display_name: str, meeting_date: str) -> dict:
    """Create Event for meeting stage (same as frontend).

    meeting_date format: "2026-02-10T14:00" (ISO datetime-local)
    """
    # Parse ISO datetime-local format
    try:
        dt = datetime.fromisoformat(meeting_date)
    except ValueError:
        # Fallback: try with seconds
        dt = datetime.fromisoformat(meeting_date.replace("Z", "+00:00"))

    starts_on = dt.strftime("%Y-%m-%d %H:%M:%S")
    ends_on = (dt + timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")

    event_data = {
        "subject": f"Meeting with {display_name}",
        "starts_on": starts_on,
        "ends_on": ends_on,
        "event_category": "Meeting",
        "event_type": "Private",
        "event_participants": [{
            "reference_doctype": "Lead",
            "reference_docname": lead_name,
        }],
    }

    resp = await client.post(
        f"{ERPNEXT_URL}/api/resource/Event",
        json=event_data,
        headers=get_erpnext_headers(),
    )
    if resp.status_code in (200, 201):
        return resp.json().get("data", {})
    raise Exception(f"Failed to create Event: {resp.text[:500]}")


async def create_communication(
    client: httpx.AsyncClient,
    doctype: str,
    name: str,
    content: str,
    sent_or_received: str,
    timestamp: str | None = None
) -> dict:
    """Create Communication record with optional historical timestamp."""
    comm_data = {
        "doctype": "Communication",
        "communication_type": "Communication",
        "communication_medium": "Email",
        "sent_or_received": sent_or_received,
        "content": content,
        "send_email": 0,
        "reference_doctype": doctype,
        "reference_name": name,
    }

    # Set communication_date for historical records (convert to ERPNext format)
    if timestamp:
        erpnext_ts = to_erpnext_datetime(timestamp)
        comm_data["communication_date"] = erpnext_ts

    resp = await client.post(
        f"{ERPNEXT_URL}/api/resource/Communication",
        json=comm_data,
        headers=get_erpnext_headers(),
    )
    if resp.status_code in (200, 201):
        result = resp.json().get("data", {})
        # Update creation field for historical timestamp display
        if timestamp and result.get("name"):
            erpnext_ts = to_erpnext_datetime(timestamp)
            await set_value(client, "Communication", result["name"], "creation", erpnext_ts)
        return result
    raise Exception(f"Failed to create Communication: {resp.text[:500]}")


async def create_stage_change_comment(
    client: httpx.AsyncClient,
    doctype: str,
    name: str,
    from_stage: str,
    to_stage: str,
    timestamp: str | None = None
) -> dict:
    """Log stage transition as Comment with type Info and optional historical timestamp."""
    resp = await client.post(
        f"{ERPNEXT_URL}/api/resource/Comment",
        json={
            "reference_doctype": doctype,
            "reference_name": name,
            "comment_type": "Info",
            "content": f"Stage: {from_stage} → {to_stage}",
        },
        headers=get_erpnext_headers(),
    )
    if resp.status_code in (200, 201):
        result = resp.json().get("data", {})
        # Update creation field for historical timestamp display
        if timestamp and result.get("name"):
            erpnext_ts = to_erpnext_datetime(timestamp)
            await set_value(client, "Comment", result["name"], "creation", erpnext_ts)
        return result
    raise Exception(f"Failed to create stage change comment: {resp.text[:500]}")


@app.put("/api/crm/contact")
async def update_crm_contact(request: Request):
    """Update CRM contact stage and log communication.

    Simplified Lead-only CRM: All stages use Lead doctype (no Opportunity conversion).

    Parameters:
        email: Required. Primary identifier to find Lead
        stage: Required. Target column: new, engaged, meeting, quoted, won, lost
        payload: Required. Contains:
            message: Required. Message content to log as Communication
            message_type: Required. "client" (received) or "staff" (sent)
            meeting_date: Optional. ISO datetime for meeting stage (e.g., "2026-02-10T14:00")
            timestamp: Optional. ISO datetime for historical records (backfill)
    """
    ip = request.client.host if request.client else "unknown"

    try:
        body = await request.json()
    except Exception:
        log_call(False, None, "Invalid JSON body", {}, None, ip)
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    email = (body.get("email") or "").strip()
    stage = (body.get("stage") or "").strip()
    payload = body.get("payload", {})
    message = (payload.get("message") or "").strip()
    message_type = (payload.get("message_type") or "").strip()
    meeting_date = payload.get("meeting_date")
    timestamp = payload.get("timestamp")  # Optional: ISO datetime for historical records

    # 1. Validate required inputs
    if not email:
        log_call(False, None, "Missing required field: email", body, None, ip)
        raise HTTPException(status_code=400, detail="Missing required field: email")

    if not stage or stage not in STAGE_CONFIG:
        valid_stages = ", ".join(STAGE_CONFIG.keys())
        log_call(False, None, f"Invalid stage: {stage}", body, None, ip)
        raise HTTPException(status_code=400, detail=f"Invalid stage: {stage}. Must be one of: {valid_stages}")

    if not message:
        log_call(False, None, "Missing required field: payload.message", body, None, ip)
        raise HTTPException(status_code=400, detail="Missing required field: payload.message")

    if message_type not in ("client", "staff"):
        log_call(False, None, "payload.message_type must be 'client' or 'staff'", body, None, ip)
        raise HTTPException(status_code=400, detail="payload.message_type must be 'client' or 'staff'")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # 2. Find Lead by email
            lead = await find_lead_by_email(client, email)
            if not lead:
                log_call(False, None, f"No Lead found with email: {email}", body, None, ip)
                raise HTTPException(status_code=404, detail=f"No Lead found with email: {email}")

            # 3. Determine current stage from Lead status
            current_stage = LEAD_STATUS_TO_STAGE.get(lead.get("status", ""), "new")

            # 4. Get target status from stage config
            target_status = STAGE_CONFIG[stage]["status"]

            # 5. Create Event for meeting stage (MUST happen before status update)
            if stage == "meeting" and meeting_date:
                await create_meeting_event(
                    client,
                    lead["name"],
                    lead.get("lead_name", lead["name"]),
                    meeting_date
                )

            # 6. Update Lead status
            await set_value(client, "Lead", lead["name"], "status", target_status)

            # 7. Log stage transition if stage changed
            if current_stage != stage:
                await create_stage_change_comment(
                    client,
                    doctype="Lead",
                    name=lead["name"],
                    from_stage=current_stage,
                    to_stage=stage,
                    timestamp=timestamp,
                )

            # 8. Create Communication (always, message is required)
            sent_or_received = "Sent" if message_type == "staff" else "Received"
            await create_communication(
                client,
                doctype="Lead",
                name=lead["name"],
                content=message,
                sent_or_received=sent_or_received,
                timestamp=timestamp,
            )

            log_call(True, lead["name"], None, body, 200, ip)
            return {
                "success": True,
                "doctype": "Lead",
                "name": lead["name"],
                "stage": stage,
            }

    except HTTPException:
        raise  # Re-raise HTTPException as-is
    except httpx.RequestError as e:
        log_call(False, None, f"ERPNext connection error: {e}", body, None, ip)
        raise HTTPException(status_code=502, detail=f"ERPNext connection error: {e}")
    except Exception as e:
        error_msg = str(e)[:500]
        log_call(False, None, f"Error: {error_msg}", body, None, ip)
        raise HTTPException(status_code=500, detail=error_msg)
