import json
import os
import re
import sqlite3
from datetime import datetime
from pathlib import Path

import secrets

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.templating import Jinja2Templates

app = FastAPI(title="Meraki Lead Webhook")
templates = Jinja2Templates(directory="templates")

DB_PATH = Path("/app/data/webhook.db")
ERPNEXT_URL = os.environ.get("ERPNEXT_URL", "http://frontend:8080")
ERPNEXT_API_KEY = os.environ.get("ERPNEXT_API_KEY", "")
ERPNEXT_API_SECRET = os.environ.get("ERPNEXT_API_SECRET", "")

ANALYTICS_USER = os.environ.get("ANALYTICS_USER", "meraki")
ANALYTICS_PASS = os.environ.get("ANALYTICS_PASS", "meraki123")

VALID_LEAD_SOURCES = {"google", "facebook", "instagram", "referral", "other"}

security = HTTPBasic()


def verify_auth(credentials: HTTPBasicCredentials = Depends(security)):
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
        return {"success": False, "error": "Invalid JSON body"}

    firstname = (body.get("firstname") or "").strip()
    lastname = (body.get("lastname") or "").strip()
    email = (body.get("email") or "").strip()

    if not email:
        log_call(False, None, "Missing required field: email", body, None, ip)
        return {"success": False, "error": "Missing required field: email"}

    if not firstname:
        log_call(False, None, "Missing required field: firstname", body, None, ip)
        return {"success": False, "error": "Missing required field: firstname"}

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
        "custom_guest_count": parse_guest_count(body.get("approximate", "")),
        "custom_estimated_budget": parse_budget(body.get("budget", "")),
    }

    wedding_date = parse_date(body.get("weddingDate", ""))
    if wedding_date:
        lead_data["custom_wedding_date"] = wedding_date

    relationship = (body.get("position") or "").strip()
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
        return {"success": False, "error": f"ERPNext connection error: {e}"}

    if resp.status_code in (200, 201):
        result = resp.json()
        lead_name = result.get("data", {}).get("name", "")
        log_call(True, lead_name, None, body, resp.status_code, ip)
        return {"success": True, "lead": lead_name}
    else:
        error_text = resp.text[:500]
        log_call(False, None, error_text, body, resp.status_code, ip)
        return {"success": False, "error": error_text}


@app.post("/api/webhook/conversation")
async def create_conversation(request: Request):
    ip = request.client.host if request.client else "unknown"
    try:
        body = await request.json()
    except Exception:
        log_call(False, None, "Invalid JSON body", {}, None, ip)
        return {"success": False, "error": "Invalid JSON body"}

    email = (body.get("email") or "").strip()
    content = (body.get("content") or "").strip()
    sent_or_received = (body.get("sent_or_received") or "").strip()

    if not email:
        log_call(False, None, "Missing required field: email", body, None, ip)
        return {"success": False, "error": "Missing required field: email"}
    if not content:
        log_call(False, None, "Missing required field: content", body, None, ip)
        return {"success": False, "error": "Missing required field: content"}
    if sent_or_received not in ("Sent", "Received"):
        log_call(False, None, "sent_or_received must be 'Sent' or 'Received'", body, None, ip)
        return {"success": False, "error": "sent_or_received must be 'Sent' or 'Received'"}

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
            return {"success": False, "error": f"No Lead found with email: {email}"}

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

        # 3. Create Communication
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

        async with httpx.AsyncClient(timeout=30.0) as client:
            comm_resp = await client.post(
                f"{ERPNEXT_URL}/api/resource/Communication",
                json=comm_data,
                headers=headers,
            )

        if comm_resp.status_code in (200, 201):
            comm_name = comm_resp.json().get("data", {}).get("name", "")
            log_call(True, comm_name, None, body, comm_resp.status_code, ip)
            return {
                "success": True,
                "communication": comm_name,
                "attached_to": f"{attached_doctype}/{attached_name}",
            }
        else:
            error_text = comm_resp.text[:500]
            log_call(False, None, error_text, body, comm_resp.status_code, ip)
            return {"success": False, "error": error_text}

    except httpx.RequestError as e:
        log_call(False, None, f"ERPNext connection error: {e}", body, None, ip)
        return {"success": False, "error": f"ERPNext connection error: {e}"}


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
