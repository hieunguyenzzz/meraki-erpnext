"""
Public wedding inquiry form endpoint.

Receives form submissions from the public-facing inquiry page,
verifies reCAPTCHA, and creates a Lead in ERPNext.
"""

import re

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from webhook_v2.config import settings
from webhook_v2.core.logging import get_logger
from webhook_v2.services.erpnext import ERPNextClient

log = get_logger(__name__)

router = APIRouter()


class InquiryForm(BaseModel):
    couple_names: str
    preferred_name: str
    nationalities: str
    bride_email: str
    groom_email: str
    phone: str
    wedding_date: str
    location: str
    location_reason: str
    guest_count: str = ""
    out_of_town_guests: str = ""
    three_words: str
    must_haves: str = ""
    pinterest: str = ""
    budget: str
    referral_source: str
    personal_story: str = ""
    recaptcha_token: str


async def verify_recaptcha(token: str) -> bool:
    """Verify reCAPTCHA v3 token with Google (score >= 0.5)."""
    if not settings.recaptcha_secret_key:
        log.warning("recaptcha_skip", reason="RECAPTCHA_SECRET_KEY not configured")
        return True  # Allow in development when key not set
    async with httpx.AsyncClient() as client:
        r = await client.post(
            "https://www.google.com/recaptcha/api/siteverify",
            data={"secret": settings.recaptcha_secret_key, "response": token},
        )
        result = r.json()
        score = result.get("score", 0)
        success = result.get("success", False) and score >= 0.5
        log.info("recaptcha_result", success=success, score=score, action=result.get("action"))
        return success


@router.post("/inquiry")
async def create_inquiry(form: InquiryForm):
    """
    Create an ERPNext Lead from a public wedding inquiry form submission.

    Verifies reCAPTCHA before processing.
    """
    if not await verify_recaptcha(form.recaptcha_token):
        raise HTTPException(status_code=400, detail="reCAPTCHA verification failed")

    notes_text = f"""Preferred name: {form.preferred_name}
Nationalities: {form.nationalities}
Groom email: {form.groom_email}
Wedding date: {form.wedding_date}
Location: {form.location}
Why this location: {form.location_reason}
Guest count: {form.guest_count}
Out of town guests: {form.out_of_town_guests}
3 words: {form.three_words}
Must-haves: {form.must_haves}
Pinterest: {form.pinterest}
Budget: {form.budget}
Personal story: {form.personal_story}"""

    lead_data: dict = {
        "doctype": "Lead",
        "first_name": form.couple_names,
        "last_name": "",
        "email_id": form.bride_email,
        "mobile_no": form.phone,
        "source": _map_referral(form.referral_source),
        "status": "Lead",
        "notes": [{"note": notes_text}],
        "custom_couple_name": form.couple_names,
        "custom_wedding_date_text": form.wedding_date,
        "custom_budget": form.budget,
    }
    # Only include optional fields if they have values
    if form.guest_count:
        lead_data["custom_guest_count"] = form.guest_count

    try:
        client = ERPNextClient()
        result = client._post("/api/resource/Lead", lead_data)
        lead_name = result.get("data", {}).get("name")
        log.info("inquiry_lead_created", lead_name=lead_name, couple=form.couple_names)
        return {"success": True, "lead": lead_name}
    except Exception as e:
        log.error("inquiry_lead_error", error=str(e), couple=form.couple_names)
        raise HTTPException(status_code=500, detail="Failed to create inquiry")


class WebsiteInquiryForm(BaseModel):
    """Payload from the public website contact form (/lets-connect)."""

    firstName: str
    lastName: str
    email: str
    lang: str = ""
    role: str = ""
    partnerName: str = ""
    phone: str = ""
    location: str = ""
    weddingDate: str = ""
    venue: str = ""
    guestCount: str | int | None = None
    budget: str = ""
    extraEvents: list[str] = []
    referralSource: list[str] = []
    otherNotes: str = ""


@router.post("/website-inquiry")
async def create_website_inquiry(
    form: WebsiteInquiryForm,
    x_inquiry_secret: str = Header(default=""),
):
    """
    Create an ERPNext Lead from the public website contact form.

    Authenticated server-to-server via the X-Inquiry-Secret header. The Lead is
    created with status "Lead" so it lands in the CRM Kanban "New" column.
    """
    if settings.website_inquiry_secret:
        if x_inquiry_secret != settings.website_inquiry_secret:
            log.warning("website_inquiry_auth_failed", email=form.email)
            raise HTTPException(status_code=401, detail="Unauthorized")
    else:
        log.warning(
            "website_inquiry_secret_unset",
            reason="WEBSITE_INQUIRY_SECRET not configured; accepting request",
        )

    couple_name = f"{form.firstName} {form.lastName}".strip()
    guest_count = str(form.guestCount).strip() if form.guestCount is not None else ""
    extra_events = ", ".join(form.extraEvents) if form.extraEvents else ""
    referral = ", ".join(form.referralSource) if form.referralSource else ""

    notes_text = f"""Language: {form.lang}
Role: {form.role}
Partner name: {form.partnerName}
Current location: {form.location}
Wedding date: {form.weddingDate}
Venue: {form.venue}
Guest count: {guest_count}
Budget: {form.budget}
Extra events: {extra_events}
How they found us: {referral}
Other notes: {form.otherNotes}"""

    lead_data: dict = {
        "doctype": "Lead",
        "first_name": form.firstName,
        "last_name": form.lastName,
        "email_id": form.email,
        "mobile_no": form.phone,
        "source": _map_referral(referral),
        "status": "Lead",
        "notes": [{"note": notes_text}],
        "custom_couple_name": couple_name,
    }
    if form.role:
        lead_data["custom_relationship"] = _map_relationship(form.role)
    if form.partnerName:
        lead_data["custom_partner_name"] = form.partnerName
    if form.location:
        lead_data["custom_current_location"] = form.location
    if extra_events:
        lead_data["custom_extra_events"] = extra_events
    # Wedding date: keep the raw text for display; also set the parsed Date field
    # (used for conflict detection) when the value is a clean ISO date.
    if form.weddingDate:
        lead_data["custom_wedding_date_raw"] = form.weddingDate
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", form.weddingDate.strip()):
            lead_data["custom_wedding_date"] = form.weddingDate.strip()
    # Budget is free text (e.g. "40,000 USD"); store as raw (what the UI displays)
    # and also try to parse a numeric amount for the Currency field.
    if form.budget:
        lead_data["custom_budget_raw"] = form.budget
        budget_amount = _parse_budget_amount(form.budget)
        if budget_amount is not None:
            lead_data["custom_estimated_budget"] = budget_amount
    if guest_count:
        lead_data["custom_guest_count_raw"] = guest_count
        if guest_count.isdigit():
            lead_data["custom_guest_count"] = int(guest_count)
    if form.venue:
        lead_data["custom_wedding_venue"] = form.venue

    try:
        client = ERPNextClient()
        result = client._post("/api/resource/Lead", lead_data)
        lead_name = result.get("data", {}).get("name")
        log.info("website_inquiry_lead_created", lead_name=lead_name, couple=couple_name, email=form.email)
        return {"success": True, "lead": lead_name}
    except Exception as e:
        log.error("website_inquiry_lead_error", error=str(e), couple=couple_name, email=form.email)
        raise HTTPException(status_code=500, detail="Failed to create inquiry")


class ClientQuestionnaireForm(BaseModel):
    couple_names: str
    nationalities: str
    email: str
    phone: str
    wedding_date: str
    location: str
    guest_count: str = ""
    events: list[str] = []
    priorities: str = ""
    pinterest: str = ""
    budget: str
    referral_sources: list[str] = []
    referral_other: str = ""
    stories: str = ""


@router.post("/client-questionnaire")
async def create_client_questionnaire(form: ClientQuestionnaireForm):
    """Create an ERPNext Lead from the client questionnaire form."""
    events_str = ", ".join(form.events) if form.events else "None selected"
    referral_str = ", ".join(form.referral_sources)
    if form.referral_other:
        referral_str += f" (Other: {form.referral_other})"

    notes_text = f"""Nationalities: {form.nationalities}
Wedding date: {form.wedding_date}
Location: {form.location}
Guest count: {form.guest_count}
Events: {events_str}
What matters most: {form.priorities}
Pinterest: {form.pinterest}
Budget: {form.budget}
How they found us: {referral_str}
Stories: {form.stories}"""

    lead_data: dict = {
        "doctype": "Lead",
        "first_name": form.couple_names,
        "last_name": "",
        "email_id": form.email,
        "mobile_no": form.phone,
        "source": _map_referral(referral_str),
        "status": "Lead",
        "notes": [{"note": notes_text}],
        "custom_couple_name": form.couple_names,
        "custom_wedding_date_text": form.wedding_date,
        "custom_budget": form.budget,
    }
    if form.guest_count:
        lead_data["custom_guest_count"] = form.guest_count

    try:
        client = ERPNextClient()
        result = client._post("/api/resource/Lead", lead_data)
        lead_name = result.get("data", {}).get("name")
        log.info("client_questionnaire_lead_created", lead_name=lead_name, couple=form.couple_names)

        # Create Communication so it shows in Conversation tab
        try:
            client._post("/api/resource/Communication", {
                "doctype": "Communication",
                "communication_type": "Communication",
                "communication_medium": "Other",
                "subject": f"Client Questionnaire from {form.couple_names}",
                "content": notes_text.replace("\n", "<br>"),
                "sender": form.email,
                "reference_doctype": "Lead",
                "reference_name": lead_name,
                "sent_or_received": "Received",
                "status": "Linked",
            })
        except Exception as e:
            log.warning("client_questionnaire_comm_failed", error=str(e), lead=lead_name)

        return {"success": True, "lead": lead_name}
    except Exception as e:
        log.error("client_questionnaire_error", error=str(e), couple=form.couple_names)
        raise HTTPException(status_code=500, detail="Failed to submit questionnaire")


def _map_referral(source: str) -> str:
    """Map referral source string to ERPNext Lead Source."""
    mapping = {
        "facebook": "Facebook",
        "instagram": "Instagram",
        "a dear friend": "Referral",
        "website": "Website",
    }
    lower = source.lower()
    for key, val in mapping.items():
        if key in lower:
            return val
    return "Other"


def _map_relationship(role: str) -> str:
    """Map free-text role input to the Lead custom_relationship Select options."""
    lower = role.lower()
    if any(k in lower for k in ("bride", "groom", "cô dâu", "chú rể")):
        return "Bride/Groom"
    if any(k in lower for k in ("parent", "mother", "father", "mom", "dad", "cha", "mẹ")):
        return "Mother of Bride/Groom"
    if any(k in lower for k in ("friend", "family", "bạn")):
        return "Friend of Bride/Groom"
    return "Other" if role.strip() else ""


def _parse_budget_amount(budget: str) -> float | None:
    """Extract a numeric amount from free-text budget (e.g. "35,000 USD" -> 35000)."""
    digits = re.sub(r"[^\d.]", "", budget)
    if not digits:
        return None
    try:
        return float(digits)
    except ValueError:
        return None
