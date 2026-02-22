"""
Public wedding inquiry form endpoint.

Receives form submissions from the public-facing inquiry page,
verifies reCAPTCHA, and creates a Lead in ERPNext.
"""

import httpx
from fastapi import APIRouter, HTTPException
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


def _map_referral(source: str) -> str:
    """Map referral source string to ERPNext Lead Source."""
    mapping = {
        "facebook": "Facebook",
        "instagram": "Instagram",
        "a dear friend": "Referral",
        "website": "Website",
    }
    return mapping.get(source.lower(), "Other")
