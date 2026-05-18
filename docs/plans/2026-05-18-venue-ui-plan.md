# Venue Listing + Detail UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite `/venues` and `/venues/:name` in `refinefrontend/` to expose all 99 venue records imported by MWP-42, with a spreadsheet-style listing (city tabs + row-spanning + sticky columns) and a rebuilt detail page with a heavy-use gallery.

**Architecture:** Three layers. (1) Migration phase v079 adds gallery custom fields. (2) New `webhook_v2/routers/venues.py` orchestrates Supplier + Contact + child-table multi-doc writes and serves the listing query. (3) New React components under `refinefrontend/src/components/venues/` — `VenueForm`, `VenueAreasEditor`, `VenueListingTable`, and tab panels — stitched together by rewritten `VenuesPage.tsx` and `VenueDetailPage.tsx`.

**Tech Stack:** Refine v5 + Shadcn (React 19, TanStack Table for the listing, nuqs for URL state), FastAPI (`webhook_v2`), ERPNext v15 / Frappe REST API, Playwright for e2e verification. Project deployment is direct-to-main on the meraki-erp Dokploy compose app.

**Reference design doc:** `docs/plans/2026-05-18-venue-ui-design.md`. Read it first.

**Plane ticket:** MWP-44 (to be created — see Task 0).

---

## Phase 0 — Setup

### Task 0: Create Plane ticket MWP-44

**Step 1: Create the ticket**

Use the Plane MCP tool:

```
mcp__plane-remote__plane_create_issue:
  project: MWP
  name: "Venue listing + detail UI — rich exposure of MWP-42 import"
  priority: medium
  description_html: <link to design doc + summary>
```

Description must reference `docs/plans/2026-05-18-venue-ui-design.md` and the related ticket MWP-43.

**Step 2: Move to "In Progress" and note in ticket**

Add a comment with: `"Implementation kicked off. Tracking design: docs/plans/2026-05-18-venue-ui-design.md and plan: docs/plans/2026-05-18-venue-ui-plan.md."`

**Step 3: Commit nothing yet** — the work starts in Task 1.

---

## Phase 1 — Foundation: migration + types + picker filter

### Task 1: Migration phase v079 — gallery custom fields

**Files:**
- Create: `migration/phases/v079_venue_gallery_fields.py`
- Modify: `migration/runner.py` — add `v079_venue_gallery_fields` to `ORDERED_PHASES`, both import blocks, and `phase_fns` dict

**Step 1: Read v078 to match the pattern**

Read `migration/phases/v078_venue_extended_model.py` lines 30-100 — copy the `client.create("Custom Field", {...})` pattern.

**Step 2: Write v079**

Create `migration/phases/v079_venue_gallery_fields.py`:

```python
"""
v079: Gallery metadata fields for venues.

Adds three custom fields enabling the heavy-use venue gallery:
- File.custom_caption          — per-photo caption text
- File.custom_venue_area       — tag photo with one of the venue's wedding areas
- Supplier.custom_cover_photo  — pointer to the venue's hero/cover photo

See docs/plans/2026-05-18-venue-ui-design.md (Section 4).
"""

WEDDING_VENUE_DEPENDS_ON = 'eval:doc.supplier_group=="Wedding Venues"'


def run(client):
    fields = [
        {
            "dt": "File",
            "fieldname": "custom_caption",
            "fieldtype": "Small Text",
            "label": "Caption",
            "insert_after": "file_name",
        },
        {
            "dt": "File",
            "fieldname": "custom_venue_area",
            "fieldtype": "Data",
            "label": "Venue Area",
            "insert_after": "custom_caption",
            "description": "Name of the venue wedding area this photo belongs to (e.g. 'Lawn', 'Main Ballroom').",
        },
        {
            "dt": "Supplier",
            "fieldname": "custom_cover_photo",
            "fieldtype": "Link",
            "options": "File",
            "label": "Cover Photo",
            "insert_after": "custom_venue_external_key",
            "depends_on": WEDDING_VENUE_DEPENDS_ON,
        },
    ]

    for spec in fields:
        existing = client.get_list(
            "Custom Field",
            filters=[["dt", "=", spec["dt"]], ["fieldname", "=", spec["fieldname"]]],
            fields=["name"],
            limit_page_length=1,
        )
        if existing:
            continue
        client.create("Custom Field", spec)
```

**Step 3: Register in runner.py**

In `migration/runner.py`, find `ORDERED_PHASES` and add `"v079_venue_gallery_fields"` immediately after `"v078_venue_extended_model"`. Add the import line in both import blocks. Add to the `phase_fns` dict.

**Step 4: Run migration locally**

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml --profile migrate up migration --build
```

Expected: log shows `Running phase: v079_venue_gallery_fields`, no errors. Run again — phase should be a no-op (idempotent).

**Step 5: Verify the fields exist**

```bash
curl -s -G "http://merakierp.loc/api/resource/Custom Field" \
  -H "Authorization: token <local-key>:<local-secret>" \
  --data-urlencode 'filters=[["fieldname","in",["custom_caption","custom_venue_area","custom_cover_photo"]]]' \
  --data-urlencode 'fields=["name","dt","fieldname","fieldtype"]' | jq .
```

Expected: 3 entries returned.

**Step 6: Commit**

```bash
git add migration/phases/v079_venue_gallery_fields.py migration/runner.py
git commit -m "migration: v079 add venue gallery custom fields"
```

---

### Task 2: Update Supplier type definitions

**Files:**
- Modify: `refinefrontend/src/lib/types.ts`

**Step 1: Read current Supplier type**

Read `refinefrontend/src/lib/types.ts:35-50` (the `Supplier` interface).

**Step 2: Extend the interface**

Add the new venue fields to `Supplier`. Keep the old fields as-is (vendor pages still reference them):

```ts
export interface Supplier {
  name: string;
  supplier_name: string;
  supplier_group: string;
  disabled?: 0 | 1;
  // Old fields (vendor pages still use them):
  custom_venue_city?: string;
  custom_location?: string;
  custom_capacity_min?: number;
  custom_capacity_max?: number;
  custom_price_range?: string;
  custom_features?: string;
  custom_contact_person?: string;
  custom_notes?: string;
  // New (v078 + v079):
  custom_venue_external_key?: string;
  custom_venue_location_subarea?: string;
  custom_venue_type?: string;
  custom_venue_price_range?: "" | "LOW" | "MID" | "HIGH" | "LUXURY" | "UNKNOWN";
  custom_venue_wedding_package_text?: string;
  custom_venue_wedding_package_url?: string;
  custom_venue_insights?: string;
  custom_venue_accommodation?: string;
  custom_venue_fnb?: string;
  custom_venue_av_policy?: string;
  custom_venue_facility?: string;
  custom_venue_after_party?: string;
  custom_venue_contact_raw?: string;
  custom_venue_source?: string;
  custom_cover_photo?: string;
  custom_venue_wedding_areas?: VenueWeddingArea[];
}

export interface VenueWeddingArea {
  name: string;             // synthetic row name from ERPNext
  area_name: string;
  area_type?: "Ballroom/Indoor" | "Lawn" | "Beach" | "Restaurant/Café/Bar" | "Pool" | "Other";
  function?: string;
  capacity_min?: number;
  capacity_max?: number;
  capacity_notes?: string;
  policy_min_spend?: string;
  setup_notes?: string;
  meraki_weddings?: string;
  photos_url?: string;
  idx?: number;
}
```

**Step 3: Typecheck**

```bash
cd refinefrontend && npx tsc -b --noEmit
```

Expected: zero errors.

**Step 4: Commit**

```bash
git add refinefrontend/src/lib/types.ts
git commit -m "types: add venue + wedding-area Supplier fields"
```

---

### Task 3: Hide disabled stubs from ProjectDetailPage venue picker

**Files:**
- Modify: `refinefrontend/src/pages/projects/ProjectDetailPage.tsx` around line 200 (the venue `useList`)

**Step 1: Find the existing venue list query**

```bash
grep -n "Wedding Venues" refinefrontend/src/pages/projects/ProjectDetailPage.tsx
```

**Step 2: Add the disabled filter**

Edit the `useList` call to add `{ field: "disabled", operator: "eq", value: 0 }` to the existing `filters` array.

**Step 3: Typecheck**

```bash
cd refinefrontend && npx tsc -b --noEmit
```

Expected: zero errors.

**Step 4: Manual verify**

Browser-load `http://frontend.merakierp.loc/projects/<any-project>` and open the venue picker. Expected: only 99 active venues; no "An Lâm" / "Mai House" / etc. short-name stubs.

**Step 5: Commit**

```bash
git add refinefrontend/src/pages/projects/ProjectDetailPage.tsx
git commit -m "projects: hide disabled venue stubs from picker"
```

---

## Phase 2 — Backend orchestration

### Task 4: `webhook_v2/routers/venues.py` — listing endpoint

**Files:**
- Create: `webhook_v2/routers/venues.py`
- Create: `webhook_v2/tests/unit/test_venues_router.py`

**Step 1: Read sibling router for patterns**

Read `webhook_v2/routers/expenses.py:1-80` and `webhook_v2/routers/wedding_ops.py` to match imports, logger, error handling.

**Step 2: Write the failing test**

Create `webhook_v2/tests/unit/test_venues_router.py`:

```python
"""Unit tests for venues router."""

import pytest
from unittest.mock import MagicMock, patch


def test_listing_returns_venues_with_areas():
    """GET /venues/listing returns parents + child areas grouped."""
    from webhook_v2.routers.venues import list_venues

    fake_client = MagicMock()
    fake_client.get_list.return_value = [
        {
            "name": "An Lâm Retreat",
            "supplier_name": "An Lâm Retreat",
            "custom_venue_city": "Nha Trang",
            "custom_venue_type": "Resort/Retreat",
            "custom_venue_price_range": "MID",
            "custom_venue_wedding_areas": [
                {"area_name": "Lawn", "area_type": "Lawn", "capacity_min": 120, "capacity_max": 160},
                {"area_name": "Beach", "area_type": "Beach", "capacity_min": 80, "capacity_max": 120},
            ],
        }
    ]

    result = list_venues(city=None, _client=fake_client)
    assert "venues" in result
    assert len(result["venues"]) == 1
    assert result["venues"][0]["name"] == "An Lâm Retreat"
    assert len(result["venues"][0]["areas"]) == 2
    assert result["venues"][0]["areas"][0]["area_name"] == "Lawn"


def test_listing_filters_by_city():
    """GET /venues/listing?city=HCM only returns HCM venues."""
    from webhook_v2.routers.venues import list_venues

    fake_client = MagicMock()
    fake_client.get_list.return_value = []

    list_venues(city="HCM", _client=fake_client)
    args, kwargs = fake_client.get_list.call_args
    filters = kwargs.get("filters") or args[1]
    assert any(f == ["custom_venue_city", "=", "HCM"] for f in filters)
```

**Step 3: Run test, confirm fail**

```bash
docker compose exec email-processor-v2 pytest webhook_v2/tests/unit/test_venues_router.py -v
```

Expected: `ImportError: cannot import 'list_venues' from 'webhook_v2.routers.venues'`.

**Step 4: Implement the router**

Create `webhook_v2/routers/venues.py`:

```python
"""
Venue endpoints — listing, create, update.

The frontend stays dumb: this router fetches Supplier + child wedding-areas
in one call (avoiding N child-table queries), and handles multi-doc writes
(Supplier + Contact + child rows) atomically for create / update.
"""

from typing import Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter(prefix="/venues", tags=["venues"])


_SUPPLIER_FIELDS = [
    "name", "supplier_name", "disabled",
    "custom_venue_external_key", "custom_venue_city",
    "custom_venue_location_subarea", "custom_venue_type",
    "custom_venue_price_range", "custom_venue_wedding_package_text",
    "custom_venue_wedding_package_url", "custom_venue_insights",
    "custom_venue_accommodation", "custom_venue_fnb",
    "custom_venue_av_policy", "custom_venue_facility",
    "custom_venue_after_party", "custom_venue_contact_raw",
    "custom_venue_source", "custom_cover_photo",
]


def list_venues(city: str | None = None, _client: ERPNextClient | None = None) -> dict[str, Any]:
    """Return active wedding venues + their child wedding-areas."""
    client = _client or ERPNextClient()
    filters: list[list[Any]] = [
        ["supplier_group", "=", "Wedding Venues"],
        ["disabled", "=", 0],
    ]
    if city:
        filters.append(["custom_venue_city", "=", city])

    venues = client.get_list(
        "Supplier",
        filters=filters,
        fields=_SUPPLIER_FIELDS,
        limit_page_length=0,
    )

    # Fetch child areas in bulk
    venue_names = [v["name"] for v in venues]
    if venue_names:
        areas = client.get_list(
            "Venue Wedding Area",
            filters=[["parent", "in", venue_names], ["parenttype", "=", "Supplier"]],
            fields=[
                "name", "parent", "area_name", "area_type", "function",
                "capacity_min", "capacity_max", "capacity_notes",
                "policy_min_spend", "setup_notes", "meraki_weddings",
                "photos_url", "idx",
            ],
            order_by="parent asc, idx asc",
            limit_page_length=0,
        )
        areas_by_parent: dict[str, list[dict]] = {}
        for a in areas:
            areas_by_parent.setdefault(a["parent"], []).append(a)
    else:
        areas_by_parent = {}

    for v in venues:
        v["areas"] = areas_by_parent.get(v["name"], [])

    return {"venues": venues}


@router.get("/listing")
def get_listing(city: str | None = None) -> dict[str, Any]:
    """HTTP wrapper around list_venues."""
    try:
        return list_venues(city=city)
    except Exception as exc:
        log.exception("Failed to list venues")
        raise HTTPException(status_code=500, detail=str(exc))
```

**Step 5: Run test, confirm pass**

```bash
docker compose exec email-processor-v2 pytest webhook_v2/tests/unit/test_venues_router.py -v
```

Expected: 2 passed.

**Step 6: Commit**

```bash
git add webhook_v2/routers/venues.py webhook_v2/tests/unit/test_venues_router.py
git commit -m "venues router: listing endpoint with parent+children grouping"
```

---

### Task 5: `webhook_v2/routers/venues.py` — create + update endpoints

**Files:**
- Modify: `webhook_v2/routers/venues.py` (append models + endpoints)
- Modify: `webhook_v2/tests/unit/test_venues_router.py` (append tests)

**Step 1: Read `erpnext_writer.py` for the existing upsert logic**

Read `migration/scripts/venue_import/erpnext_writer.py` — note the Supplier + Contact + child-row create/update logic. We will not import it directly (different package boundary); instead, port the pattern.

**Step 2: Write the failing tests**

Append to `webhook_v2/tests/unit/test_venues_router.py`:

```python
def test_create_venue_requires_supplier_name():
    """POST /venues with empty name returns 400."""
    from webhook_v2.routers.venues import VenuePayload

    with pytest.raises(Exception):
        VenuePayload(supplier_name="", areas=[])


def test_create_venue_requires_at_least_one_area():
    """POST /venues with zero areas returns 400."""
    from webhook_v2.routers.venues import create_venue, VenuePayload

    payload = VenuePayload(supplier_name="Test", areas=[])
    fake_client = MagicMock()
    with pytest.raises(Exception) as exc:
        create_venue(payload, _client=fake_client)
    assert "at least one area" in str(exc.value).lower()


def test_create_venue_creates_supplier_and_child_rows():
    """POST /venues creates a Supplier and links child wedding-areas."""
    from webhook_v2.routers.venues import create_venue, VenuePayload, AreaPayload

    payload = VenuePayload(
        supplier_name="Test Venue",
        custom_venue_city="HCM",
        areas=[AreaPayload(area_name="Main Hall", area_type="Ballroom/Indoor", capacity_min=100, capacity_max=200)],
    )
    fake_client = MagicMock()
    fake_client.create.return_value = {"name": "Test Venue"}

    result = create_venue(payload, _client=fake_client)
    assert result["name"] == "Test Venue"
    args, kwargs = fake_client.create.call_args_list[0]
    created_doc = args[1]
    assert created_doc["supplier_name"] == "Test Venue"
    assert created_doc["supplier_group"] == "Wedding Venues"
    assert len(created_doc["custom_venue_wedding_areas"]) == 1
```

**Step 3: Run, confirm fail**

```bash
docker compose exec email-processor-v2 pytest webhook_v2/tests/unit/test_venues_router.py -v
```

Expected: 3 new tests fail with import errors.

**Step 4: Implement payload models + endpoints**

Append to `webhook_v2/routers/venues.py`:

```python
class AreaPayload(BaseModel):
    name: str | None = None  # present for updates, omitted for new rows
    area_name: str
    area_type: str | None = None
    function: str | None = None
    capacity_min: int | None = None
    capacity_max: int | None = None
    capacity_notes: str | None = None
    policy_min_spend: str | None = None
    setup_notes: str | None = None
    meraki_weddings: str | None = None
    photos_url: str | None = None


class ContactPayload(BaseModel):
    name: str | None = None
    title: str | None = None
    email: str | None = None
    phone: str | None = None
    alt_phone: str | None = None


class VenuePayload(BaseModel):
    supplier_name: str
    custom_venue_city: str | None = None
    custom_venue_location_subarea: str | None = None
    custom_venue_type: str | None = None
    custom_venue_price_range: str | None = None
    custom_venue_wedding_package_text: str | None = None
    custom_venue_wedding_package_url: str | None = None
    custom_venue_insights: str | None = None
    custom_venue_accommodation: str | None = None
    custom_venue_fnb: str | None = None
    custom_venue_av_policy: str | None = None
    custom_venue_facility: str | None = None
    custom_venue_after_party: str | None = None
    custom_venue_contact_raw: str | None = None
    areas: list[AreaPayload]
    contact: ContactPayload | None = None


def _build_supplier_doc(payload: VenuePayload) -> dict[str, Any]:
    doc: dict[str, Any] = {
        "doctype": "Supplier",
        "supplier_name": payload.supplier_name.strip(),
        "supplier_group": "Wedding Venues",
        "supplier_type": "Company",
        "country": "Vietnam",
    }
    for field in (
        "custom_venue_city", "custom_venue_location_subarea",
        "custom_venue_type", "custom_venue_price_range",
        "custom_venue_wedding_package_text", "custom_venue_wedding_package_url",
        "custom_venue_insights", "custom_venue_accommodation",
        "custom_venue_fnb", "custom_venue_av_policy",
        "custom_venue_facility", "custom_venue_after_party",
        "custom_venue_contact_raw",
    ):
        val = getattr(payload, field, None)
        if val is not None:
            doc[field] = val
    doc["custom_venue_wedding_areas"] = [
        {k: v for k, v in a.model_dump().items() if v is not None}
        for a in payload.areas
    ]
    return doc


def _upsert_contact(client: ERPNextClient, supplier_name: str, contact: ContactPayload | None) -> None:
    if not contact or not (contact.name or contact.email or contact.phone):
        return
    existing = client.get_list(
        "Contact",
        filters=[["link_doctype", "=", "Supplier"], ["link_name", "=", supplier_name]],
        fields=["name"],
        limit_page_length=1,
    )
    contact_doc: dict[str, Any] = {
        "doctype": "Contact",
        "first_name": contact.name or supplier_name,
        "designation": contact.title,
        "links": [{"link_doctype": "Supplier", "link_name": supplier_name}],
    }
    if contact.email:
        contact_doc["email_ids"] = [{"email_id": contact.email, "is_primary": 1}]
    phones = []
    if contact.phone:
        phones.append({"phone": contact.phone, "is_primary_phone": 1})
    if contact.alt_phone:
        phones.append({"phone": contact.alt_phone})
    if phones:
        contact_doc["phone_nos"] = phones

    if existing:
        client.update("Contact", existing[0]["name"], contact_doc)
    else:
        client.create("Contact", contact_doc)


def create_venue(payload: VenuePayload, _client: ERPNextClient | None = None) -> dict[str, Any]:
    if not payload.areas:
        raise HTTPException(status_code=400, detail="Venue requires at least one area.")
    client = _client or ERPNextClient()
    doc = _build_supplier_doc(payload)
    created = client.create("Supplier", doc)
    _upsert_contact(client, created["name"], payload.contact)
    return {"name": created["name"]}


def update_venue(name: str, payload: VenuePayload, _client: ERPNextClient | None = None) -> dict[str, Any]:
    if not payload.areas:
        raise HTTPException(status_code=400, detail="Venue requires at least one area.")
    client = _client or ERPNextClient()
    doc = _build_supplier_doc(payload)
    client.update("Supplier", name, doc)
    _upsert_contact(client, name, payload.contact)
    return {"name": name}


@router.post("/")
def post_venue(payload: VenuePayload) -> dict[str, Any]:
    try:
        return create_venue(payload)
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Failed to create venue")
        raise HTTPException(status_code=500, detail=str(exc))


@router.put("/{name}")
def put_venue(name: str, payload: VenuePayload) -> dict[str, Any]:
    try:
        return update_venue(name, payload)
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Failed to update venue")
        raise HTTPException(status_code=500, detail=str(exc))
```

**Step 5: Run all tests**

```bash
docker compose exec email-processor-v2 pytest webhook_v2/tests/unit/test_venues_router.py -v
```

Expected: 5 passed.

**Step 6: Commit**

```bash
git add webhook_v2/routers/venues.py webhook_v2/tests/unit/test_venues_router.py
git commit -m "venues router: create + update endpoints"
```

---

### Task 6: Register venues router

**Files:**
- Modify: `webhook_v2/main.py`

**Step 1: Add import + include_router**

Find the block in `webhook_v2/main.py` where other routers are imported (around line 30) and registered (around line 98). Add:

```python
from webhook_v2.routers.venues import router as venues_router
# ...
app.include_router(venues_router)
```

Place both alphabetically near `wedding_ops_router`.

**Step 2: Rebuild + verify**

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up email-processor-v2 --build -d
```

Wait for healthy, then:

```bash
curl -s "http://merakierp.loc/inquiry-api/venues/listing?city=HCM" | jq '.venues | length'
```

Expected: a number > 0 (likely 19 for HCM).

**Step 3: Commit**

```bash
git add webhook_v2/main.py
git commit -m "register venues router"
```

---

## Phase 3 — Shared components

### Task 7: VenueAreasEditor component

**Files:**
- Create: `refinefrontend/src/components/venues/VenueAreasEditor.tsx`

**Step 1: Read existing child-table editor patterns**

Read any existing inline child-table editor in the app — try `grep -rn "child table" refinefrontend/src` and pick the closest match. If none exist, the design doc Section 5 has the spec.

**Step 2: Implement the editor**

Create `refinefrontend/src/components/venues/VenueAreasEditor.tsx`. The component takes `areas: VenueWeddingArea[]` and `onChange: (next: VenueWeddingArea[]) => void`. It renders a vertical list of cards. Each card has a collapsed one-line summary that expands to a form when clicked. Buttons: `+ Add area`, `Duplicate`, `Delete`. Per-area fields per the design doc Section 5.

Key requirements:
- Each card's expanded form has: `area_name` (required), `area_type` (Select), `function`, `capacity_min`, `capacity_max`, `capacity_notes`, `policy_min_spend`, `setup_notes`, `meraki_weddings`, `photos_url`.
- Validation errors shown inline (red border + small text under the field).
- Deleting prompts confirm only if the area has `name` (i.e. exists in the DB) — new unsaved rows delete silently.
- No drag-drop reorder (out of scope per the design doc non-goals).

**Step 3: Typecheck**

```bash
cd refinefrontend && npx tsc -b --noEmit
```

Expected: zero errors.

**Step 4: Commit**

```bash
git add refinefrontend/src/components/venues/VenueAreasEditor.tsx
git commit -m "venues: VenueAreasEditor child-table component"
```

---

### Task 8: VenueForm — shared by Add + Edit sheets

**Files:**
- Create: `refinefrontend/src/components/venues/VenueForm.tsx`

**Step 1: Implement the form**

Create `refinefrontend/src/components/venues/VenueForm.tsx`. Component shape:

```tsx
type Mode = "create" | "edit";
interface Props {
  mode: Mode;
  initialValue?: Partial<VenueWithAreas>;  // edit mode
  contactInitialValue?: ContactValue;
  onSaved: (savedName: string) => void;
  onCancel: () => void;
}
```

Layout per design doc Section 5: left rail of section nav + right scrollable form. Sections in order: Identity, Pricing, Package, Insights, Amenities, Contact, Areas (uses `VenueAreasEditor`).

Save flow:
- `POST /inquiry-api/venues/` for create.
- `PUT /inquiry-api/venues/{name}` for edit.
- On success: `onSaved(name)` (parent invalidates list query + closes sheet + navigates if needed).
- On error: show banner at the top of the sheet with the backend's error message.

Validation rules per design doc:
- `supplier_name` required.
- At least one area.
- URL fields parsed if non-empty (use `new URL(...)` try/catch).
- Email regex `/^[^@\s]+@[^@\s]+\.[^@\s]+$/` if non-empty.

**Step 2: Typecheck**

```bash
cd refinefrontend && npx tsc -b --noEmit
```

Expected: zero errors.

**Step 3: Commit**

```bash
git add refinefrontend/src/components/venues/VenueForm.tsx
git commit -m "venues: VenueForm shared add+edit sheet"
```

---

## Phase 4 — Listing page

### Task 9: VenueListingTable — TanStack Table with row-spanning

**Files:**
- Create: `refinefrontend/src/components/venues/VenueListingTable.tsx`

**Step 1: Install TanStack Table if not present**

```bash
cd refinefrontend && npm ls @tanstack/react-table
```

If missing, install: `npm install @tanstack/react-table`.

**Step 2: Implement the table**

Create the component per design doc Section 2. Key implementation notes:

- Input: `data: { venue: VenueRow; areas: VenueWeddingArea[] }[]` already shaped by the caller.
- Flatten to row array: for each venue with `N` areas, emit `N` rows (or 1 row if no areas). On each row, attach `_venueRowIndex` (0-based position within the venue's group) and `_venueRowCount` (N).
- Use `getRowModel` from TanStack but build a custom render layer for the body. For each row:
  - For venue-level columns (1–6, 15–20): if `_venueRowIndex === 0`, render the cell with `rowSpan={_venueRowCount}`. Otherwise render nothing (skip the `<td>` entirely).
  - For area-level columns (7–14): always render.
- Sticky columns via Tailwind `sticky left-0 z-10 bg-background` (and `left-32`, `left-64` for cols 2 and 3, with `z` decreasing).
- Sticky header via `sticky top-0 z-20 bg-background`.
- LongText component imported from shadcn-admin pattern; if not present, implement a tiny inline version.
- Click handler on the Venue Name cell: `onClick: () => navigate(`/venues/${row.venue.name}`)`.

**Step 3: Typecheck**

```bash
cd refinefrontend && npx tsc -b --noEmit
```

Expected: zero errors.

**Step 4: Commit**

```bash
git add refinefrontend/src/components/venues/VenueListingTable.tsx refinefrontend/package.json refinefrontend/package-lock.json
git commit -m "venues: VenueListingTable with row-spanning + sticky cols"
```

---

### Task 10: Rewrite VenuesPage with tabs + filters

**Files:**
- Modify: `refinefrontend/src/pages/venues/VenuesPage.tsx` (full rewrite)

**Step 1: Read existing page**

The current page uses `useList` directly. We're replacing it with a fetch to `/inquiry-api/venues/listing` so we get child rows in one shot.

**Step 2: Implement the new page**

Replace `refinefrontend/src/pages/venues/VenuesPage.tsx` entirely:

```tsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { useNavigate } from "react-router";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import VenueListingTable from "@/components/venues/VenueListingTable";
import VenueForm from "@/components/venues/VenueForm";

const TABS = ["All cities", "HCM", "Phú Quốc", "Đà Nẵng", "Hội An", "Đà Lạt", "Vũng Tàu", "Nha Trang", "Huế", "Hà Nội", "Hạ Long", "Ninh Bình", "Sapa"];

export default function VenuesPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useQueryState("tab", { defaultValue: "all" });
  const [search, setSearch] = useQueryState("q", { defaultValue: "" });
  const [typeFilter, setTypeFilter] = useQueryState("type", { defaultValue: "" });
  const [priceFilter, setPriceFilter] = useQueryState("price", { defaultValue: "" });
  const [addOpen, setAddOpen] = useState(false);

  // Fetch all venues for "All cities" + filter client-side per tab; or fetch per tab.
  // For simplicity start with single fetch + client-side group/filter.
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["venues-listing"],
    queryFn: async () => {
      const res = await fetch("/inquiry-api/venues/listing", { credentials: "include" });
      if (!res.ok) throw new Error(`Listing failed: ${res.status}`);
      return res.json() as Promise<{ venues: any[] }>;
    },
  });

  const all = data?.venues ?? [];

  const cityCounts = useMemo(() => {
    const map: Record<string, number> = { "All cities": all.length };
    for (const v of all) {
      const c = v.custom_venue_city || "—";
      map[c] = (map[c] ?? 0) + 1;
    }
    return map;
  }, [all]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return all.filter((v) => {
      if (tab !== "all" && v.custom_venue_city !== TABS.find((t) => t.toLowerCase().replace(/[^a-z]/g, "-") === tab)) return false;
      if (typeFilter && v.custom_venue_type !== typeFilter) return false;
      if (priceFilter && v.custom_venue_price_range !== priceFilter) return false;
      if (s) {
        const hay = [v.supplier_name, v.custom_venue_location_subarea, v.custom_venue_insights].join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [all, tab, typeFilter, priceFilter, search]);

  return (
    <div className="p-6 space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((label) => {
          const key = label === "All cities" ? "all" : label.toLowerCase().replace(/[^a-z]/g, "-");
          const count = cityCounts[label] ?? cityCounts[label === "All cities" ? "All cities" : label] ?? 0;
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-2 text-sm border-b-2 transition-colors ${active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {label} · {count}
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        {/* TODO: type + price multi-select */}
        <div className="flex-1" />
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add Venue
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading venues...</div>
      ) : (
        <VenueListingTable venues={filtered} showCityColumn={tab === "all"} />
      )}

      {/* Add Venue Sheet */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent className="sm:max-w-3xl flex flex-col p-0">
          <VenueForm
            mode="create"
            onSaved={(name) => { setAddOpen(false); refetch(); navigate(`/venues/${name}`); }}
            onCancel={() => setAddOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
```

**Step 3: Build + manual verify**

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up react-frontend --build -d
```

Open `http://frontend.merakierp.loc/venues`. Expected: tabs render, click HCM → table shows ~19 venues with row-spanning, click Venue Name → navigates to detail page (will 404 until Task 14).

**Step 4: Commit**

```bash
git add refinefrontend/src/pages/venues/VenuesPage.tsx
git commit -m "venues: rewrite listing page with city tabs + filters"
```

---

## Phase 5 — Detail page

### Task 11: VenueDetailHero

**Files:**
- Create: `refinefrontend/src/components/venues/VenueDetailHero.tsx`

**Step 1: Implement per design doc Section 3**

Props: `venue` (with computed `areaCount`, `capacityRange`, `weddingsCount`), `coverPhotoUrl`, `onEdit`, `onDelete`. Hero strip ~280px with cover image OR gradient + initials, 3 stat pills bottom-left, "View on Drive" link bottom-right if any area has `photos_url`.

**Step 2: Commit**

```bash
git add refinefrontend/src/components/venues/VenueDetailHero.tsx
git commit -m "venues: VenueDetailHero component"
```

---

### Task 12: Tab components (Overview / Areas / Amenities / Contact)

**Files:**
- Create: `refinefrontend/src/components/venues/VenueOverviewTab.tsx`
- Create: `refinefrontend/src/components/venues/VenueAreasTab.tsx`
- Create: `refinefrontend/src/components/venues/VenueAmenitiesTab.tsx`
- Create: `refinefrontend/src/components/venues/VenueContactTab.tsx`

**Step 1: Implement four read-only tab panels per design doc Section 3**

Each is a self-contained component receiving the venue object + child arrays. Style consistent with the app: cards using `<Card>` primitive, badges using `<Badge>`, icons from `lucide-react`. Empty fields hidden.

**Step 2: Commit**

```bash
git add refinefrontend/src/components/venues/Venue*Tab.tsx
git commit -m "venues: detail tab panels (overview/areas/amenities/contact)"
```

---

### Task 13: VenueGalleryTab

**Files:**
- Create: `refinefrontend/src/components/venues/VenueGalleryTab.tsx`

**Step 1: Implement per design doc Section 4**

Features: bulk upload (multi-file), per-photo delete (with confirm), set cover (star toggle), area-tag chip (popover with the venue's areas), captions (inline edit), area filter dropdown, lightbox enhanced with caption + cover-set + delete buttons.

Data shape: `File` records attached to the Supplier. Use `useList({ resource: "File", filters: [...] })` to fetch + invalidate.

Helpers:
- `uploadFile()` from `lib/fileUpload` for bulk uploads — call sequentially.
- `useUpdate({ resource: "File", id, values: { custom_caption, custom_venue_area } })` for caption / tag changes.
- `useUpdate({ resource: "Supplier", id: venueName, values: { custom_cover_photo: fileName } })` for cover.
- `useDelete({ resource: "File", id })` for delete.

Stale-tag banner: compute `staleTagged = files.filter(f => f.custom_venue_area && !venue.areas.some(a => a.area_name === f.custom_venue_area))`. If non-empty, show banner.

**Step 2: Commit**

```bash
git add refinefrontend/src/components/venues/VenueGalleryTab.tsx
git commit -m "venues: VenueGalleryTab heavy-use gallery"
```

---

### Task 14: Rewrite VenueDetailPage

**Files:**
- Modify: `refinefrontend/src/pages/venues/VenueDetailPage.tsx` (full rewrite)

**Step 1: Implement the new page stitching it all together**

Per design doc Section 3:
- Fetch venue via `useOne({ resource: "Supplier", id: name })` with all `custom_venue_*` fields in `meta.fields` + the child table will need a separate fetch through the listing endpoint OR a child `useList`.
- Fetch linked Contact via existing pattern.
- Fetch Files (gallery) + Sales Orders (weddings tab) as before.
- Wrap header, hero, and 7 Shadcn tabs.
- Edit sheet uses `VenueForm` in `"edit"` mode with `initialValue` populated.
- Delete confirm dialog unchanged from existing page.

**Step 2: Build + manual verify**

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up react-frontend --build -d
```

Open one venue from the listing. Click through all 7 tabs. Open Edit, change Insights, save, verify it persists after reload.

**Step 3: Commit**

```bash
git add refinefrontend/src/pages/venues/VenueDetailPage.tsx
git commit -m "venues: rewrite detail page with hero + 7 tabs + Edit sheet"
```

---

## Phase 6 — Verification + deployment

### Task 15: Playwright e2e tests

**Files:**
- Create: `refinefrontend/e2e/venues/listing.spec.ts`
- Create: `refinefrontend/e2e/venues/detail.spec.ts`

**Step 1: Listing test**

`refinefrontend/e2e/venues/listing.spec.ts` should:
1. Navigate to `/venues`.
2. Assert tab bar visible with "All cities" tab and at least 12 city tabs.
3. Click "HCM" tab; assert URL contains `?tab=hcm`.
4. Assert at least one row with text "Saigon" or "HCM" reference appears.
5. Click a venue name; assert URL changes to `/venues/<name>` and the detail page header is visible.

**Step 2: Detail page test**

`refinefrontend/e2e/venues/detail.spec.ts` should:
1. Navigate to `/venues` and click the first venue.
2. Assert all 7 tab triggers visible (Overview, Areas, Amenities, Contact, Gallery, Weddings, Notes).
3. Click Areas tab; assert at least one area card visible.
4. Click Edit; assert the form sheet opens with the venue name pre-filled.
5. Edit `custom_venue_insights`, save, assert the change appears.

**Step 3: Run e2e**

```bash
cd refinefrontend && npx playwright test e2e/venues/
```

Expected: 2 spec files, both passing. Fix the components if any test fails.

**Step 4: Commit**

```bash
git add refinefrontend/e2e/venues/
git commit -m "venues: e2e tests for listing + detail flows"
```

---

### Task 16: Local browser walkthrough via tester subagent

**Step 1: Spawn the tester subagent**

Dispatch a `tester` subagent with this prompt:

> "Test the venue UI at `http://frontend.merakierp.loc/venues`. Walk every UX path:
> 1. Tab nav (All cities, HCM, Phú Quốc, Đà Lạt, Sapa) — count badges match.
> 2. Search filter, type filter, price filter — combine them and verify results shrink.
> 3. Click 3 random venue names — detail page renders without console errors.
> 4. On a detail page: click each of 7 tabs.
> 5. In Areas tab: confirm child area cards render with capacity badges.
> 6. In Gallery tab: bulk-upload 3 photos, tag one with an area, set one as cover, delete one. Reload — state persists.
> 7. Click Edit: change a long-text field (e.g. Insights), save, verify the change.
> 8. Click "+ Add Venue" on listing: fill required fields + one area + save. Verify it appears in the listing.
> 9. Take screenshots at every major step. Report any console errors or visual glitches."

**Step 2: Review subagent output**

Inspect screenshots. Fix any issues surfaced. Re-run if a fix was needed.

**Step 3: No commit** (unless fixes were made).

---

### Task 17: Deploy + production smoke-test

**Step 1: Push to main**

```bash
git push origin main
```

**Step 2: Watch Dokploy deployment**

Use `mcp__dokploy__dokploy_get_compose` on the `meraki-erp` compose application. Wait until the latest deployment is `done`. If failed, read logs and debug before continuing.

**Step 3: Production smoke-test**

Open `https://app.merakiwp.com/venues` (production). Repeat the tester subagent walkthrough at a smaller scale: tab nav, one detail page, one edit, one gallery upload. Note: production credentials needed; the existing in-browser session works.

**Step 4: Update Plane ticket MWP-44**

Add comment: `"Deployed to production. Smoke-tested. Marking Done."`. Move to "Done".

---

## Risks + rollback

- **Listing query slow**: 99 venues × ~3 child areas each = ~300 rows; should be well under 200 ms. If it isn't, add a `tab=<city>` server-side filter in `list_venues`.
- **Row-spanning misalignment**: edge case if a venue has zero child areas. The plan emits 1 row with empty area columns — verify visually.
- **Edit-save race**: if a user saves while another user is editing, the latter wins (no optimistic locking). Out of scope to fix.
- **Backend endpoint fails on Pydantic validation**: errors surface to frontend banner. Acceptable.
- **Rollback**: `git revert` the relevant commits; the v079 migration's custom fields are additive and harmless if the UI reverts (no data deletion).
