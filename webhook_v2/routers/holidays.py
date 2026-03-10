from fastapi import APIRouter, HTTPException
from datetime import date
from pydantic import BaseModel

from webhook_v2.services.erpnext import ERPNextClient

router = APIRouter()


def _list_name(year: int) -> str:
    return f"Vietnam {year}"


class HolidayCreate(BaseModel):
    holiday_date: str   # YYYY-MM-DD
    description: str


@router.get("/settings/holidays")
def get_holidays(year: int = None):
    """Return all public holidays (non-weekend) for the given year."""
    client = ERPNextClient()
    target_year = year or date.today().year
    list_name = _list_name(target_year)

    try:
        data = client._get(f"/api/resource/Holiday List/{list_name}").get("data") or {}
    except Exception:
        return {"data": [], "year": target_year, "exists": False}

    result = []
    for h in (data.get("holidays") or []):
        hdate = (h.get("holiday_date") or "")[:10]
        if not hdate or not hdate.startswith(str(target_year)):
            continue
        d = date.fromisoformat(hdate)
        if d.weekday() >= 5:   # skip Sat / Sun
            continue
        result.append({
            "date": hdate,
            "description": h.get("description") or "Holiday",
            "weekday": d.strftime("%A"),
            "month": d.month,
        })

    result.sort(key=lambda x: x["date"])
    return {"data": result, "year": target_year, "exists": True}


@router.post("/settings/holidays")
def add_holiday(body: HolidayCreate):
    """Add a public holiday to the ERPNext holiday list."""
    client = ERPNextClient()
    d = date.fromisoformat(body.holiday_date)
    if d.weekday() >= 5:
        raise HTTPException(status_code=400, detail="Cannot add a weekend as a holiday")

    list_name = _list_name(d.year)
    data = client._get(f"/api/resource/Holiday List/{list_name}").get("data") or {}
    holidays = list(data.get("holidays") or [])

    existing = {(h.get("holiday_date") or "")[:10] for h in holidays}
    if body.holiday_date in existing:
        raise HTTPException(status_code=409, detail="Holiday already exists on this date")

    holidays.append({
        "holiday_date": body.holiday_date,
        "description": body.description,
        "weekly_off": 0,
    })
    client._put(f"/api/resource/Holiday List/{list_name}", {"holidays": holidays})

    return {
        "data": {
            "date": body.holiday_date,
            "description": body.description,
            "weekday": d.strftime("%A"),
            "month": d.month,
        }
    }


@router.delete("/settings/holidays/{holiday_date}")
def delete_holiday(holiday_date: str):
    """Remove a public holiday by date."""
    client = ERPNextClient()
    d = date.fromisoformat(holiday_date)
    list_name = _list_name(d.year)

    data = client._get(f"/api/resource/Holiday List/{list_name}").get("data") or {}
    holidays = list(data.get("holidays") or [])

    updated = [h for h in holidays if (h.get("holiday_date") or "")[:10] != holiday_date]
    if len(updated) == len(holidays):
        raise HTTPException(status_code=404, detail="Holiday not found")

    client._put(f"/api/resource/Holiday List/{list_name}", {"holidays": updated})
    return {"message": "deleted"}
