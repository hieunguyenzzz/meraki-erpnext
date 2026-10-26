"""Leave Application webhooks that keep Google Calendar in sync (MWP-84).

on_submit / on_cancel / on_trash each POST {"name": <leave id>} to webhook_v2's
/leave/calendar-sync, which re-reads the leave from ERPNext and creates or
removes the OOO event. Covers HR approve, re-approve, desk approval, cancel and
delete in one place. (HR "Add Leave" uses db_insert and fires no webhook; the
/leave/apply endpoint syncs that path itself.)

URL uses the unique network alias `meraki-webhook-v2` (see the compose files),
not the generic `email-processor-v2` service name, which can also resolve to
other stacks on dokploy-network.

Idempotent: a Webhook is skipped if one with the same name exists. Fails loudly:
the client's create swallows errors and the runner records a phase as applied
once run() returns, so each webhook is verified after creation.
"""

URL = "http://meraki-webhook-v2:8001/leave/calendar-sync"
EVENTS = ["on_submit", "on_cancel", "on_trash"]


def run(client):
    for event in EVENTS:
        name = f"Leave Calendar Sync - {event}"
        if client.exists("Webhook", {"name": name}):
            print(f"  Webhook '{name}' already exists, skipping")
            continue
        created = client.create("Webhook", {
            "name": name,
            "webhook_doctype": "Leave Application",
            "webhook_docevent": event,
            "request_url": URL,
            "request_method": "POST",
            "request_structure": "JSON",
            "webhook_json": '{"name": "{{ doc.name }}"}',
            # Frappe sends the body without a Content-Type; FastAPI then won't parse it as JSON.
            "webhook_headers": [{"key": "Content-Type", "value": "application/json"}],
            "enabled": 1,
        })
        if created is None or not client.exists("Webhook", {"name": name}):
            raise RuntimeError(f"Failed to create Webhook '{name}'")
        print(f"  Created Webhook: {name}")
