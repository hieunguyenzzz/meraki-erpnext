"""
Bulk employee display order endpoint.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from webhook_v2.services.erpnext import ERPNextClient

router = APIRouter()


class OrderEntry(BaseModel):
    employee: str
    order: int


class BulkOrderRequest(BaseModel):
    items: list[OrderEntry]


@router.post("/employee-order")
async def set_employee_order(request: BulkOrderRequest):
    """Set custom_display_order for a list of employees in bulk."""
    client = ERPNextClient()
    for item in request.items:
        try:
            client._post("/api/method/meraki_set_employee_fields", {
                "employee_name": item.employee,
                "custom_display_order": str(item.order),
            })
        except Exception:
            pass
    return {"status": "ok", "updated": len(request.items)}
