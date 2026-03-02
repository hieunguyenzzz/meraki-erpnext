"""
Task creation endpoint.

POST /task/create — creates Task + optionally assigns to a user
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()


class CreateTaskRequest(BaseModel):
    project: str
    subject: str
    phase: str
    deadline: str              # YYYY-MM-DD
    priority: str = "Medium"
    shared_with: str = ""      # comma-separated employee names
    assignee_user_id: str | None = None


@router.post("/task/create")
def create_task(req: CreateTaskRequest):
    """
    Create a Task and optionally assign it to a user.
    1. Create Task doctype
    2. If assignee_user_id provided: call frappe.desk.form.assign_to.add
    """
    client = ERPNextClient()

    # 1. Create Task
    try:
        task_resp = client._post("/api/resource/Task", {
            "subject": req.subject.strip(),
            "project": req.project,
            "custom_wedding_phase": req.phase,
            "exp_end_date": req.deadline,
            "priority": req.priority or "Medium",
            "custom_shared_with": req.shared_with,
            "status": "Open",
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create task: {e}")

    task_name = task_resp.get("data", {}).get("name")
    if not task_name:
        raise HTTPException(status_code=500, detail="Task created but name not returned")

    log.info("task_created", task=task_name, project=req.project)

    # 2. Assign to user if provided
    if req.assignee_user_id and task_name:
        try:
            client._post("/api/method/frappe.desk.form.assign_to.add", {
                "doctype": "Task",
                "name": task_name,
                "assign_to": [req.assignee_user_id],
            })
            log.info("task_assigned", task=task_name, user=req.assignee_user_id)
        except Exception as e:
            log.warning("task_assignment_failed", task=task_name, user=req.assignee_user_id, error=str(e))

    return {"task_name": task_name}
