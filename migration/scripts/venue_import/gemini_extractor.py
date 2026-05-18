"""
Gemini-based structured extraction for venue data.

One call per venue. Uses structured output (JSON schema). Cached on disk.
Retries transient errors up to 3 times with exponential backoff.

Uses google-genai (the current SDK, not deprecated google-generativeai).
"""

import asyncio
import json
import os
from typing import Optional

from google import genai
from google.genai import types

from scripts.venue_import import cache as cache_module


_GEMINI_API_KEY: str = os.environ.get("GEMINI_API_KEY", "")
_MODEL_NAME = "models/gemini-3-flash-preview"


def _get_model_name(_client: genai.Client) -> str:
    return _MODEL_NAME


# Response schema in google.genai types format.
# venue_type and price_range are NOT in this schema — they come directly from the
# sheet's structured columns (the parser fills them in) instead of being normalised by
# Gemini, which was found to hallucinate (e.g. "Resort/Retreat" → "City Hotel").
_RESPONSE_SCHEMA = types.Schema(
    type=types.Type.OBJECT,
    properties={
        "venue_name": types.Schema(type=types.Type.STRING),
        "wedding_package_text": types.Schema(type=types.Type.STRING),
        "insights": types.Schema(type=types.Type.STRING),
        "accommodation": types.Schema(type=types.Type.STRING),
        "fnb": types.Schema(type=types.Type.STRING),
        "av_policy": types.Schema(type=types.Type.STRING),
        "facility": types.Schema(type=types.Type.STRING),
        "after_party": types.Schema(type=types.Type.STRING),
        "contact": types.Schema(
            type=types.Type.OBJECT,
            properties={
                "name": types.Schema(type=types.Type.STRING),
                "title": types.Schema(type=types.Type.STRING),
                "email": types.Schema(type=types.Type.STRING),
                "phone": types.Schema(type=types.Type.STRING),
                "alt_phone": types.Schema(type=types.Type.STRING),
            },
        ),
        "address": types.Schema(
            type=types.Type.OBJECT,
            properties={
                "line": types.Schema(type=types.Type.STRING),
                "notes": types.Schema(type=types.Type.STRING),
            },
        ),
        "areas": types.Schema(
            type=types.Type.ARRAY,
            items=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "area_name": types.Schema(type=types.Type.STRING),
                    "area_type": types.Schema(
                        type=types.Type.STRING,
                        enum=["Ballroom/Indoor", "Lawn", "Beach", "Restaurant/Café/Bar", "Pool", "Other"],
                    ),
                    "function": types.Schema(type=types.Type.STRING),
                    "capacity_min": types.Schema(type=types.Type.INTEGER),
                    "capacity_max": types.Schema(type=types.Type.INTEGER),
                    "capacity_notes": types.Schema(type=types.Type.STRING),
                },
                required=["area_name", "area_type", "function", "capacity_notes"],
            ),
        ),
    },
    required=["venue_name", "areas"],
)


def _build_prompt(venue_dict: dict) -> str:
    lines = [
        "You are a data extraction assistant for a Vietnamese wedding planning company.",
        "Extract and normalise the following venue information into the required JSON schema.",
        "",
        "Rules:",
        "- Extract conservatively. Leave a field null/empty when uncertain.",
        "- NEVER invent contacts, emails, phone numbers, or capacity numbers.",
        "- capacity_min/capacity_max: extract integer pax counts ONLY if a clear numeric range is stated (e.g. '120 - 160 pax' -> min=120,max=160; '100 pax' -> min=100,max=100). Leave null/omit when ambiguous, mixed (multiple areas in one cell), or non-numeric.",
        "- capacity_notes: the raw capacity text, verbatim.",
        "- For each area in 'areas', output one object in the same order as provided. Do NOT split or merge areas.",
        "- area_type: map to the closest match from the enum.",
        "- contact.email/phone: only if explicitly present in the address_contact field.",
        "",
        "Raw venue data:",
        "",
    ]

    text_fields = {
        "venue_name": venue_dict.get("venue_name_raw", ""),
        "city": venue_dict.get("city", ""),
        "location_subarea": venue_dict.get("location_subarea", ""),
        "type_of_venue": venue_dict.get("type_of_venue_raw", ""),
        "price_range": venue_dict.get("price_range_raw", ""),
        "wedding_package": venue_dict.get("wedding_package_text", ""),
        "insights": venue_dict.get("insights_text", ""),
        "accommodation": venue_dict.get("accommodation_text", ""),
        "fnb": venue_dict.get("fnb_text", ""),
        "av": venue_dict.get("av_text", ""),
        "facility": venue_dict.get("facility_text", ""),
        "after_party": venue_dict.get("after_party_text", ""),
        "address_contact": venue_dict.get("address_contact_raw", ""),
    }
    for key, val in text_fields.items():
        if val:
            lines.append(f"{key}: {val}")

    lines.append("")
    lines.append("Areas:")
    for i, area in enumerate(venue_dict.get("areas", [])):
        lines.append(f"  Area {i + 1}:")
        for field in ["area_name_text", "area_type_text", "area_function_text",
                      "area_capacity_text", "area_policy_text", "area_setup_text",
                      "area_meraki_weddings_text"]:
            val = area.get(field, "")
            if val:
                label = field.replace("_text", "").replace("area_", "")
                lines.append(f"    {label}: {val}")

    return "\n".join(lines)


async def _call_gemini(prompt: str, client: genai.Client, model_name: str) -> dict:
    response = await asyncio.to_thread(
        client.models.generate_content,
        model=model_name,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=_RESPONSE_SCHEMA,
        ),
    )
    return json.loads(response.text)


def _get_client() -> genai.Client:
    """Return a module-level singleton Gemini client."""
    global _gemini_client
    if _gemini_client is None:
        if not _GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY environment variable is not set")
        _gemini_client = genai.Client(api_key=_GEMINI_API_KEY)
    return _gemini_client


_gemini_client: Optional[genai.Client] = None


async def extract(venue_dict: dict) -> dict:
    """Call Gemini and return the structured extraction dict.

    Retries 3 times with exponential backoff (1s, 2s, 4s).
    Raises on persistent failure.
    """
    client = _get_client()
    model_name = _get_model_name(client)
    prompt = _build_prompt(venue_dict)

    last_error: Optional[Exception] = None
    for attempt in range(3):
        try:
            return await _call_gemini(prompt, client, model_name)
        except Exception as exc:
            last_error = exc
            if attempt < 2:
                wait = 2 ** attempt  # 1s, 2s
                print(f"    Gemini attempt {attempt + 1} failed: {exc}. Retrying in {wait}s...")
                await asyncio.sleep(wait)

    raise RuntimeError(f"Gemini extraction failed after 3 attempts: {last_error}") from last_error


async def extract_cached(venue_dict: dict, refresh: bool = False) -> dict:
    """Return cached extraction if available, otherwise call Gemini and cache result."""
    key = cache_module.cache_key(venue_dict)

    if not refresh:
        cached = cache_module.get(key)
        if cached is not None:
            return cached

    result = await extract(venue_dict)
    cache_module.put(key, result)
    return result
