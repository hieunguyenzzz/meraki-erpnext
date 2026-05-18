# Venue Import from Google Sheet — Design

**Date:** 2026-05-17
**Source:** [MERAKI - VENUE](https://docs.google.com/spreadsheets/d/1gCtyxQldoYIg_juRbuaPgmGNtiHPTfYyr5S-rxgFQBc/edit) — 12 tabs by region, ~2,000 venue+area rows

## Goal

One-time import of the Meraki venue playbook (Google Sheet) into ERPNext as `Supplier` records in the `Wedding Venues` group, with a new child table capturing each venue's bookable areas.

## Decisions Locked

| Question | Answer |
|---|---|
| Where importer lives | Schema as migration phase; bulk import as standalone script |
| Hyperlinks | Full extraction via `includeGridData` pass; URLs merged into structured output |
| Contact parsing | Proper ERPNext `Contact` + `Address` records, parsed by Gemini |
| Gemini scope | Contact + soft-field normalization (price range, venue type, capacity ranges) |
| Batching | One Gemini call per venue, structured output, cached on disk by row hash |
| Unique key | `slugify(city + "-" + venue_name)` with Vietnamese diacritics stripped → `custom_venue_external_key` |
| Areas | Child table on Supplier (`Venue Wedding Area`) |
| Run cadence | One-time. Re-runs are idempotent but not scheduled. |

## Data Model

### New child doctype: `Venue Wedding Area`

| Field | Type | Notes |
|---|---|---|
| `area_name` | Data | e.g. "Saigon River House" |
| `area_type` | Select | `Ballroom/Indoor \| Lawn \| Beach \| Restaurant/Café/Bar \| Pool \| Other` |
| `function` | Small Text | Comma-separated: "Vow ceremony, Dinner reception" |
| `capacity_min` | Int | Nullable — Gemini-extracted |
| `capacity_max` | Int | Nullable — Gemini-extracted |
| `capacity_notes` | Small Text | Raw text (e.g. "120 pax with stage") |
| `policy_min_spend` | Small Text | Preserves VND/year formatting |
| `setup_notes` | Small Text | |
| `meraki_weddings` | Small Text | Past Meraki weddings at this area |
| `photos_url` | Data | Extracted hyperlink (Drive folder) |

### New custom fields on `Supplier`

| Field | Type | Notes |
|---|---|---|
| `custom_venue_external_key` | Data, Unique | Slug — primary import key |
| `custom_venue_type` | Data | Gemini-normalized (Resort/Retreat, City Hotel, …) |
| `custom_venue_price_range` | Select | `LOW \| MID \| HIGH \| LUXURY \| UNKNOWN` |
| `custom_venue_wedding_package_text` | Long Text | |
| `custom_venue_wedding_package_url` | Data | Extracted hyperlink |
| `custom_venue_insights` | Long Text | |
| `custom_venue_accommodation` | Long Text | |
| `custom_venue_fnb` | Long Text | |
| `custom_venue_av_policy` | Long Text | |
| `custom_venue_facility` | Long Text | |
| `custom_venue_after_party` | Long Text, nullable | |
| `custom_venue_location_subarea` | Data | Column-A value for non-HCM tabs |
| `custom_venue_source` | Data | `google-sheet:MERAKI-VENUE:<tab>:<row>` |
| `custom_venue_contact_raw` | Long Text | Full unparsed "Address & Contact" blob (fallback) |
| `custom_venue_wedding_areas` | Table | Link → `Venue Wedding Area` |

Existing `custom_venue_city` and `custom_meraki_venue_id` reused. `custom_meraki_venue_id` stays nullable for sheet-sourced venues without a PostgreSQL ID.

## Pipeline

### Phase (auto-runs on deploy)
`migration/phases/v078_venue_extended_model.py` — schema only (doctype + custom fields). Idempotent.

### Standalone script (manual one-shot)
```
migration/scripts/import_venues_from_sheet.py            # entrypoint
migration/scripts/venue_import/sheets_reader.py          # 2-pass fetch
migration/scripts/venue_import/row_parser.py             # merge-cell carry-forward
migration/scripts/venue_import/gemini_extractor.py       # structured output, cached
migration/scripts/venue_import/cache.py                  # SHA-256 row → JSON file
migration/scripts/venue_import/erpnext_writer.py         # idempotent upsert
```

### Execution flow

1. **Read each tab** — two Sheets API calls per tab:
   - `values.batchGet` with `valueRenderOption=FORMATTED_VALUE` → display text
   - `spreadsheets.get` with `includeGridData=true&fields=sheets(data(rowData(values(hyperlink))))` → per-cell URLs
2. **Parse rows** — carry-forward empty parent cells, split parent-venue vs child-area rows, produce `{venue_dict, areas[], source_ref}` per venue
3. **Gemini extraction** — one call per venue, structured output schema, cached on disk by `sha256(sorted-json(raw_row))`
4. **ERPNext upsert** — sequential writes:
   - Upsert `Supplier` by `custom_venue_external_key`
   - Replace child `wedding_areas` wholesale (delete + re-insert)
   - Upsert `Contact` by `(supplier, email)` → `(supplier, phone)` → `(supplier, name)`
   - Upsert `Address` if address text present
5. **Summary** — per-tab counts + failed list at `migration/scripts/.cache/failed_venues_<ts>.json`

### Concurrency
`asyncio.Semaphore(10)` on Gemini calls. ERPNext writes sequential (Frappe REST doesn't tolerate parallel writes on the same parent doc).

## Gemini Schema

```json
{
  "venue_name": "string",
  "venue_type": "string",
  "price_range": "LOW | MID | HIGH | LUXURY | UNKNOWN",
  "wedding_package_text": "string",
  "insights": "string",
  "accommodation": "string",
  "fnb": "string",
  "av_policy": "string",
  "facility": "string",
  "after_party": "string | null",
  "contact": {
    "name": "string | null",
    "title": "string | null",
    "email": "string | null",
    "phone": "string | null",
    "alt_phone": "string | null"
  },
  "address": {
    "line": "string | null",
    "notes": "string | null"
  },
  "areas": [
    {
      "area_name": "string",
      "area_type": "Ballroom/Indoor | Lawn | Beach | Restaurant/Café/Bar | Pool | Other",
      "function": "string",
      "capacity_min": "integer | null",
      "capacity_max": "integer | null",
      "capacity_notes": "string"
    }
  ]
}
```

URLs (`wedding_package_url`, `photos_url` per area) are NOT in the Gemini prompt — merged from the `includeGridData` pass in Python. Eliminates URL-hallucination risk.

## Idempotency Rules

- **Supplier**: upsert by `custom_venue_external_key` (slug)
- **Child areas**: replace wholesale on update (delete-all + re-insert)
- **Contact/Address**: upsert by best identifier available, in order: email → phone → name
- **Slug collisions**: log both rows in summary, skip both, continue
- **Gemini cache**: row-hash keyed; re-runs replay from disk (zero API cost)
- **Mid-run crash**: re-run is safe — cached extractions + upserts converge to final state

## CLI

```
python -m migration.scripts.import_venues_from_sheet [options]

  --dry-run              Parse + Gemini + cache, no ERPNext writes
  --tabs HCM,Phú Quốc    Limit to specific tabs
  --refresh-cache        Ignore Gemini cache, re-extract
```

## Rollout

1. Deploy phase v078 to local → `tester` agent verifies schema
2. `--tabs "HCM\n" --dry-run` locally → review output for HCM venues
3. `--tabs "HCM\n"` locally → spot-check 5 venues in ERPNext UI
4. All tabs locally → review summary
5. Push to main → schema deploys to prod
6. `--dry-run` against prod → review
7. Run against prod → done
8. Archive `failed_venues_<ts>.json` for triage

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Sheet column layout differs per tab | Per-tab column-map config; fail loudly on missing header |
| Gemini hallucinates venue name | Venue name is taken from the sheet, not Gemini |
| Slug collisions | Logged in summary, both skipped, manual rename in sheet then re-run |
| Hyperlink extraction misses some | Unmatched "click here" text logged for spot-fix |
| Mid-run crash | Idempotent + cached — re-run resumes |
| Gemini API hiccup | Per-call retry (3×, exponential backoff); failed venue added to summary, run continues |

## Required Skills / Resources

- `soundboxstore-google-cloud` skill — Gemini API key + service account
- `meraki-erp` skill — local ERPNext access
- `erpnext-developer` agent — schema phase implementation
- `erpnext-tester` agent — verification

## Out of Scope

- React frontend venue browser (separate ticket if requested)
- Ongoing sheet → ERPNext sync (one-time only by design)
- Reverse sync (ERPNext → sheet)
- Per-area photo gallery doctype (single URL per area is enough for now)
