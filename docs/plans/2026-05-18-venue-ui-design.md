# Venue Listing + Detail UI Design

**Date:** 2026-05-18
**Author:** Hieu (with Claude)
**Status:** Approved — ready for implementation
**Tracks:** MWP-44 (this work) · MWP-43 (separate SO re-pointing cleanup)
**Depends on:** MWP-42 (venue import) — Done

## Purpose

After MWP-42 imported 99 wedding venues from the source Google Sheet into ERPNext (`Supplier` with `supplier_group="Wedding Venues"`), the React admin frontend's existing `/venues` pages only display a small subset of pre-import custom fields (`custom_location`, `custom_capacity_min`, etc.). The rich `custom_venue_*` fields from the v078 migration phase — type, price range, insights, accommodation, F&B, AV policy, facility, after-party, contact, plus the child table of wedding areas with capacity / setup / photos — are invisible.

This design defines the rewrite of `/venues` and `/venues/:name` to expose all imported data, mirror the source spreadsheet's layout for the listing, and provide a heavy-use gallery for staff.

## Non-goals

- Re-pointing 70 historical Sales Orders that link to the 30 disabled pre-import venue stubs. Tracked separately in **MWP-43**.
- Migrating the existing 30 disabled stubs into the new schema. They remain disabled and excluded from the UI via `disabled=0` filter; their fields stay untouched in the DB.
- AI-parsing the raw contact text for venues without a linked Contact. Surfaced in the UI as a disabled placeholder for a future iteration.
- Photo reorder (drag-drop) and any photo metadata beyond caption + area-tag.
- Sales Order venue picker autocomplete improvements.

## Data sources (verified 2026-05-18 against production)

- 99 active imported venues — all have `custom_venue_external_key`, `disabled=0`.
- 30 disabled pre-import stubs — no external key, sparse data, excluded from UI.
- 13 of the 30 fuzzy-match a new venue by name (likely duplicates).
- 70 of 89 historical Sales Orders link to the disabled stubs; 19 link to the new venues.

All UI work consumes the new `custom_venue_*` fields on `Supplier` + the `Venue Wedding Area` child table. The old custom fields stay on the doctype but are no longer read by the venue pages. They remain in use by the unrelated Vendors page (different `supplier_group`).

---

## Section 1 — Architecture

**Routes (unchanged URLs, rewritten components):**
- `/venues` — listing page
- `/venues/:name` — detail page

Both implemented as default-exported React components under `refinefrontend/src/pages/venues/`.

**Page topology:**

```
/venues
├── Tab bar: [All cities · 99] [HCM · 19] [Phú Quốc · 12] ... (13 tabs, 12 cities + All)
├── Toolbar: search · type filter · price filter · "+ Add Venue"
└── Wide table (sticky header, sticky left cols, horizontal scroll)
    └── Sheet-style row-spanning: parent venue cell spans across its area child-rows

/venues/:name
├── Header: back · name · city·subarea · type badge · price badge · Edit · Delete
├── Hero strip: cover photo (or gradient initials if none) + 3 summary chips
└── Tabs:
    ├── Overview  — Insights + Wedding Package + source row link
    ├── Areas     — card grid (one per child row), with external Drive link per area
    ├── Amenities — Accommodation / F&B / AV / Facility / After Party
    ├── Contact   — linked Contact + raw text + address
    ├── Gallery   — bulk upload, delete, set cover, area-tag, captions
    ├── Weddings  — existing SO table filtered by custom_venue
    └── Notes     — existing InternalNotesSection
```

**New components** under `refinefrontend/src/components/venues/`:

- `VenueForm.tsx` — shared by Add sheet and Edit sheet
- `VenueAreasEditor.tsx` — child-table editor used inside `VenueForm`
- `VenueListingTable.tsx` — TanStack Table with row-spanning + sticky cols
- `VenueDetailHero.tsx` — header + hero strip + summary chips
- `VenueAreasTab.tsx`, `VenueAmenitiesTab.tsx`, `VenueContactTab.tsx`, `VenueOverviewTab.tsx`, `VenueGalleryTab.tsx` — tab content panels

**Data flow:**
- Listing reads via one backend endpoint that returns parents + child areas in one shot (avoids N child-table queries from the frontend).
- Detail page reads via `useOne` (Supplier + inline child rows) + separate `useList` queries for Contact, File, Sales Order.
- Add / Edit save via one backend endpoint that orchestrates Supplier + Contact + child table in a single request.
- Per-photo operations (caption, area-tag, delete, set cover) are direct ERPNext calls via `useUpdate` / `useDelete`.

**Aesthetic:** consistent with the rest of the app — Shadcn + Tailwind, existing colour tokens, existing fonts. No spreadsheet-style grid lines; the sheet feel comes from density + row-spanning + sticky columns.

---

## Section 2 — Listing page

### Tab bar
- 13 tabs: `All cities · N` + one per city (HCM, Phú Quốc, Đà Nẵng, Hội An, Đà Lạt, Vũng Tàu, Nha Trang, Huế, Hà Nội, Hạ Long, Ninh Bình, Sapa).
- Count badge per tab from `Supplier` rollup.
- Active tab persists in URL via `nuqs` (`?tab=hcm`).
- "All cities" view shows City as an additional leftmost sticky column.

### Toolbar
- Search input (filters across `supplier_name`, `custom_venue_location_subarea`, `custom_venue_insights`).
- Type multi-select (Resort/Retreat, City Hotel, Event Hall, Restaurant, Cruise, etc., derived from existing data).
- Price multi-select (LOW / MID / HIGH / LUXURY / UNKNOWN).
- "+ Add Venue" button → opens shared `VenueForm` in create mode.

Filter state lives in URL via `nuqs`.

### Table mechanics
- TanStack Table, custom row-rendering layer.
- Each venue's child-area rows are siblings in the data array; the table computes `rowSpan` on first occurrence and skips the `<td>` entirely on spanned cells so CSS row-spanning works.
- Sticky header (`position: sticky; top: 0`).
- Three sticky left columns (Subarea, Venue Name, Area Name) via Tailwind `sticky left-*` with backdrop colour.
- Right of the third sticky column scrolls horizontally.
- Long-text cells use a shared `<LongText>` component (truncate to 2 lines + "show more" inline expansion).
- Clicking the Venue Name cell opens `/venues/:name`. "View photos" link opens Drive in a new tab.

### Columns (left to right)

| # | Column | Source field | Notes |
|---|---|---|---|
| 1 | Subarea (sticky) | `custom_venue_location_subarea` | |
| 2 | Type | `custom_venue_type` | Badge |
| 3 | Venue (sticky) | `supplier_name` | Clickable, opens detail |
| 4 | Price | `custom_venue_price_range` | Badge |
| 5 | Package | `custom_venue_wedding_package_text` + `_url` | LongText + external-link icon |
| 6 | Insights | `custom_venue_insights` | LongText |
| 7 | Area (sticky) | child.area_name | |
| 8 | Area Type | child.area_type | Badge |
| 9 | Function | child.function | LongText |
| 10 | Capacity | child.capacity_min/max + capacity_notes | "120 – 160" + notes tooltip |
| 11 | Policy | child.policy_min_spend | LongText |
| 12 | Setup | child.setup_notes | LongText |
| 13 | Meraki Weddings | child.meraki_weddings | LongText |
| 14 | Photos | child.photos_url | "View" link |
| 15 | Accommodation | `custom_venue_accommodation` | LongText |
| 16 | F&B | `custom_venue_fnb` | LongText |
| 17 | AV | `custom_venue_av_policy` | LongText |
| 18 | Facility | `custom_venue_facility` | LongText |
| 19 | After Party | `custom_venue_after_party` | LongText |
| 20 | Address & Contact | `custom_venue_contact_raw` | LongText |

Columns 1, 2, 3, 4, 5, 6, 15–20 row-span across the venue's area rows. Columns 7–14 are per-area, no spanning.

### Data fetching

One backend endpoint `GET /inquiry-api/venues/listing?tab=<tab>` returns:

```json
{
  "venues": [
    {
      "name": "An Lâm Retreat",
      "supplier_name": "...",
      "custom_venue_city": "Nha Trang",
      "custom_venue_location_subarea": "...",
      "custom_venue_type": "Resort/Retreat",
      "custom_venue_price_range": "MID",
      "custom_venue_wedding_package_text": "...",
      "custom_venue_wedding_package_url": "...",
      "custom_venue_insights": "...",
      "custom_venue_accommodation": "...",
      "custom_venue_fnb": "...",
      "custom_venue_av_policy": "...",
      "custom_venue_facility": "...",
      "custom_venue_after_party": "...",
      "custom_venue_contact_raw": "...",
      "custom_cover_photo": "...",
      "areas": [
        {
          "name": "row-uuid",
          "area_name": "Lawn",
          "area_type": "Lawn",
          "function": "...",
          "capacity_min": 120,
          "capacity_max": 160,
          "capacity_notes": "...",
          "policy_min_spend": "...",
          "setup_notes": "...",
          "meraki_weddings": "...",
          "photos_url": "..."
        }
      ]
    }
  ]
}
```

Server-side filtering by city; client-side filtering by search/type/price (small dataset, no need to round-trip).

---

## Section 3 — Detail page

### Header bar
Back arrow · venue name (`<h1>`) · city badge · subarea pill · type badge · price tier badge · Edit · Delete (red).

### Hero strip
- ~280px tall, full width.
- Background: `Supplier.custom_cover_photo` if set, else gradient `#C9A9A6 → #C4A962` with large venue initials.
- Bottom-left overlay: 3 stat pills — `N areas` · `Capacity X–Y pax` (min of mins, max of maxes across child rows) · `N past weddings`.
- Bottom-right: `View on Drive ↗` link if any area has `photos_url` (links the first one).

### Tabs

**Overview** (default):
- Two-column layout. Left = `custom_venue_insights` (whitespace preserved). Right = Wedding Package card with `custom_venue_wedding_package_text` + `[Open package ↗]` button to `_url`.
- Bottom: `Source · row {{custom_venue_source_row}} in tab {{custom_venue_source_tab}}` as a subtle traceability line.

**Areas:**
- 2-column card grid on desktop, 1-column mobile.
- One card per child row of `custom_venue_wedding_areas`.
- Card content: area name + type badge · capacity range + notes · function (truncated 3 lines) · policy · setup · `Photos ↗` button to Drive.
- Pencil icon → opens Edit sheet pre-scrolled to that row.

**Amenities:**
- Vertical stack of 5 cards: Accommodation · F&B · AV / Policy · Facility · After Party.
- Each card = section header with icon + the long-text body.
- Empty fields hidden entirely.

**Contact:**
- Two columns. Left = parsed Contact: name, title, email (`mailto:`), phone (`tel:`), alt phone.
- Right = `custom_venue_contact_raw` collapsed by default with "Show original" toggle.
- Below: address line + notes if present.
- Empty state: raw text + disabled "Parse with AI" placeholder.

**Gallery:** see Section 4.

**Weddings:**
- Existing Sales Order table filtered by `custom_venue == name`.
- Columns unchanged: Couple (→ project link) · Date · Status (badge) · Amount.

**Notes:**
- `<InternalNotesSection references={[{ doctype:"Supplier", docName:name }]} />` — unchanged.

### Empty states
- Zero child areas → Areas tab shows "No areas defined yet. Open Edit to add some." with CTA.
- No linked Contact → Contact tab shows raw text only + disabled "Parse with AI".

---

## Section 4 — Gallery (heavy-use)

### New custom fields (migration phase v079)
- `File.custom_caption` — Small Text. Up to ~200 chars.
- `File.custom_venue_area` — Data. Stores the area name string (e.g. `"Lawn"`).
- `Supplier.custom_cover_photo` — Link → File.

### Layout

```
┌──────────────────────────────────────────────────────────┐
│ Filter: [All areas ▼]   24 photos        [+ Upload (bulk)] │
├──────────────────────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                     │
│ │ ★ ✕  │ │   ✕  │ │   ✕  │ │   ✕  │  ← thumbnail        │
│ │  IMG │ │  IMG │ │  IMG │ │  IMG │                      │
│ │      │ │      │ │      │ │      │                      │
│ │[Lawn]│ │[Hall]│ │[Pool]│ │[Hall]│  ← area-tag chip     │
│ └──────┘ └──────┘ └──────┘ └──────┘                     │
│ "Setup 200"  ""    ""    ""        ← caption            │
└──────────────────────────────────────────────────────────┘
```

### Per-photo controls
- ★ top-left — filled gold if current cover; tap to promote. Promoting auto-demotes previous cover.
- ✕ top-right — opens confirm dialog.
- Area-tag chip bottom-left — popover lists the venue's areas + "(unset)". Saves to `File.custom_venue_area`.
- Caption text below — click to inline edit (`<Input>`), blur/Enter to save to `File.custom_caption`.

### Bulk upload
- `+ Upload` button with `multiple` attribute.
- Drag-drop zone on empty area.
- Sequential uploads with per-file progress chips. Failed uploads show retry. Successful files appear immediately.

### Filter
- "All areas" dropdown filters by `custom_venue_area`. Options derived from venue's child areas + "(untagged)".

### Lightbox
- Existing modal extended with caption display, area badge, and "Set as cover" + "Delete" buttons.
- Keyboard nav preserved (←/→/Esc).

### Edge case: stale area tags
When an area is renamed in the Edit sheet, photos tagged with the old `area_name` become stale. Gallery tab surfaces a banner: "N photos reference areas that no longer exist — re-tag them?" with a quick fix flow.

### Backend
All gallery operations are direct ERPNext API calls — no webhook_v2 endpoint needed:
- Upload — existing `uploadFile()` helper (proxied).
- Caption / area-tag — `useUpdate({ resource:"File", id, values:{ custom_caption, custom_venue_area } })`.
- Set cover — `useUpdate({ resource:"Supplier", id:venueName, values:{ custom_cover_photo: fileName } })`.
- Delete — `useDelete({ resource:"File", id })`.

---

## Section 5 — Add / Edit VenueForm

`VenueForm` is shared by Add sheet and Edit sheet. One mode prop `mode: "create" | "edit"` toggles title, button label, save endpoint.

### Layout
Sheet width `sm:max-w-3xl`. Left rail of sticky section nav (scroll-spy highlights current). Right side: scrollable form.

### Sections

| Section | Fields |
|---|---|
| Identity | `supplier_name` *required*, `custom_venue_city` (combobox seeded from existing cities), `custom_venue_location_subarea` |
| Pricing | `custom_venue_type` (Select), `custom_venue_price_range` (Select: LOW / MID / HIGH / LUXURY / UNKNOWN) |
| Package | `custom_venue_wedding_package_text` (textarea), `custom_venue_wedding_package_url` (input + URL validation) |
| Insights | `custom_venue_insights` (auto-grow textarea) |
| Amenities | 5 textareas: Accommodation · F&B · AV / Policy · Facility · After Party |
| Contact | Contact name, title, email (validation), phone, alt phone. Plus `custom_venue_contact_raw` |
| Areas | Child-table editor — see below |

### Areas sub-table editor

- Vertical list of area cards. Each card collapses to one-line summary (`Lawn · 120–160 pax`) when not focused; expands inline on click.
- Per-area fields: `area_name` *required*, `area_type` (Select), `function`, `capacity_min`, `capacity_max`, `capacity_notes`, `policy_min_spend`, `setup_notes`, `meraki_weddings`, `photos_url` (URL validation).
- Buttons: `+ Add area`, per-card `Duplicate`, `Delete` (with confirm if area has tagged photos).
- Drag handle to reorder (`idx` in child table).
- Per-field validation inline (red border + section-top banner).

### Save flow — backend orchestration

Because saving a venue touches Supplier + Contact + Child Table, a new `webhook_v2/routers/venues.py` handles the multi-doc transaction:

- `POST /inquiry-api/venues/` — create.
- `PUT /inquiry-api/venues/{name}` — update.

Both endpoints reuse the existing `migration/scripts/venue_import/erpnext_writer.py` upsert logic (already proven to handle Supplier + Contact + child rows correctly). Return the saved Supplier name + a `revalidate_at` timestamp.

### Validation
- `supplier_name` required, max ~140 chars.
- At least one area required (zero-area venues are a data smell).
- `wedding_package_url` and `area.photos_url` parse as URLs if non-empty.
- Email + phone client-side regex; backend authoritative.

### Error handling
Form-level error banner at the top renders backend errors verbatim. Per-field errors highlight + place a message under the input. Save button stays enabled on failure so retry works without re-typing.

---

## Section 6 — Migration, side effects, rollout

### Migration phase

`migration/phases/v079_venue_gallery_fields.py` — idempotent, runs on next deploy:
- Adds `File.custom_caption` (Small Text).
- Adds `File.custom_venue_area` (Data).
- Adds `Supplier.custom_cover_photo` (Link → File).

Registered in `migration/runner.py` → `ORDERED_PHASES`.

### Side effects in the React app

1. **`refinefrontend/src/lib/types.ts`** — add the new `custom_venue_*` fields and `custom_cover_photo` to the `Supplier` type.
2. **`refinefrontend/src/pages/projects/ProjectDetailPage.tsx`** — venue list `useList` filter: add `{ field: "disabled", operator: "eq", value: 0 }` so disabled stubs disappear from the venue picker. Display logic unchanged.
3. **`refinefrontend/src/pages/DashboardPage.tsx`** — no change.

### Backend additions

`webhook_v2/routers/venues.py` (new, ~150 lines):
- `POST /venues/` — create.
- `PUT /venues/{name}` — update.
- `GET /venues/listing?city=<x>` — list with child rows.

Registered in `webhook_v2/main.py`. Proxied at `/inquiry-api/venues/*` through React frontend nginx.

### Rollout

1. Local build & test: `docker compose -f docker-compose.yml -f docker-compose.local.yml up react-frontend email-processor-v2 --build -d`.
2. Manual verification at `http://frontend.merakierp.loc/venues` — spawn a `tester` subagent with Playwright to walk every UX path.
3. Run migration on local (auto on `docker compose --profile migrate up`). Verify 3 new custom fields exist.
4. Single commit to `main` (no PR per project rules).
5. Watch Dokploy `meraki-erp` compose deployment until `done`.
6. Production smoke-test at `https://app.merakiwp.com/venues`.

### Tickets

- This work → new ticket **MWP-44** (or next).
- MWP-43 (SO re-pointing cleanup) — independent.

### Acceptance criteria

- 99 venues render across 13 tabs; counts match.
- Row-spanning visually correct (e.g. an HCM venue with 3 wedding areas spans 3 visible rows).
- Long-text cells truncate to 2 lines and expand inline.
- Clicking a venue name navigates to its detail page.
- Detail page renders all 7 tabs without console errors.
- Gallery: bulk upload 3 photos, tag one with an area, set one as cover, delete one — page reflects state without reload.
- Edit sheet: change `custom_venue_insights`, save, see updated content immediately.
- Add Venue: create test venue with one area + linked contact, confirm it appears in listing.
- Production: identical flow on `app.merakiwp.com`.
- ProjectDetailPage venue picker excludes the 30 disabled stubs.
