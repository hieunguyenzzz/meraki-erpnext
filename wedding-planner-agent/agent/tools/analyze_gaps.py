"""
Analyze lead gaps tool - identifies missing information to generate follow-up questions.
"""

from agent.logging import get_logger

log = get_logger(__name__)


# Required fields with their question prompts
REQUIRED_FIELDS = {
    "wedding_date": {
        "question_en": "When is your wedding date?",
        "question_vi": "Ngay cuoi cua ban la khi nao?",
        "priority": 1,
    },
    "venue": {
        "question_en": "Have you chosen a venue yet?",
        "question_vi": "Ban da chon dia diem to chuc chua?",
        "priority": 2,
    },
    "guest_count": {
        "question_en": "How many guests are you expecting?",
        "question_vi": "Ban du kien moi bao nhieu khach?",
        "priority": 3,
    },
    "budget": {
        "question_en": "What's your approximate budget?",
        "question_vi": "Ngan sach du kien cua ban la bao nhieu?",
        "priority": 4,
    },
}

# Optional but helpful fields
OPTIONAL_FIELDS = {
    "style": {
        "question_en": "What style or theme are you envisioning for your wedding?",
        "question_vi": "Ban muon to chuc dam cuoi theo phong cach nao?",
        "priority": 5,
    },
    "services_needed": {
        "question_en": "Which services do you need help with (planning, decoration, catering, photography)?",
        "question_vi": "Ban can ho tro nhung dich vu nao (len ke hoach, trang tri, tiep tan, chup anh)?",
        "priority": 6,
    },
}


def analyze_lead_gaps(
    wedding_date: str | None = None,
    venue: str | None = None,
    guest_count: str | None = None,
    budget: str | None = None,
    conversation_history: str | None = None,
) -> dict:
    """
    Analyze what information is missing from the lead profile
    to generate intelligent follow-up questions.

    Args:
        wedding_date: Wedding date if known
        venue: Venue if chosen
        guest_count: Expected number of guests
        budget: Budget if provided
        conversation_history: Full conversation to check if info was mentioned

    Returns:
        dict with missing_fields, suggested_questions (English and Vietnamese), priority
    """
    log.info("analyze_gaps_start")

    lead_context = {
        "wedding_date": wedding_date,
        "venue": venue,
        "guest_count": guest_count,
        "budget": budget,
    }

    missing = []
    questions_en = []
    questions_vi = []

    # Check required fields
    for field, info in REQUIRED_FIELDS.items():
        value = lead_context.get(field)
        if not value or value == "":
            missing.append(field)
            questions_en.append(info["question_en"])
            questions_vi.append(info["question_vi"])

    # If we have most required fields, suggest optional ones
    if len(missing) <= 1:
        for field, info in OPTIONAL_FIELDS.items():
            if field not in lead_context or not lead_context.get(field):
                missing.append(field)
                questions_en.append(info["question_en"])
                questions_vi.append(info["question_vi"])
                # Only add one optional question
                break

    log.info("analyze_gaps_complete", missing_count=len(missing))

    return {
        "missing_fields": missing,
        "suggested_questions_en": questions_en[:3],  # Top 3 most important
        "suggested_questions_vi": questions_vi[:3],
        "completeness": f"{4 - min(len(missing), 4)}/4 required fields",
    }
