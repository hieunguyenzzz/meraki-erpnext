"""
Import venues from the MERAKI - VENUE Google Spreadsheet into ERPNext.

Usage:
    python -m scripts.import_venues_from_sheet [--dry-run] [--tabs HCM,Phú Quốc] [--refresh-cache] [--concurrency N]

Run from inside the migration/ directory with the venv activated.
"""

import argparse
import asyncio
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Ensure migration/ is on the path when running as -m scripts.import_venues_from_sheet
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.config import get_config
from core.erpnext_client import ERPNextClient
from scripts.venue_import import cache as cache_module
from scripts.venue_import import gemini_extractor
from scripts.venue_import.row_parser import TAB_TO_CITY, parse_tab
from scripts.venue_import.sheets_reader import read_tab


logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

SPREADSHEET_ID = "1gCtyxQldoYIg_juRbuaPgmGNtiHPTfYyr5S-rxgFQBc"
SERVICE_ACCOUNT_FILE = Path.home() / ".config" / "gcloud" / "service-accounts" / "sheets-api-service.json"

ALL_TABS = list(TAB_TO_CITY.keys())


def _preflight(client: ERPNextClient) -> None:
    if not SERVICE_ACCOUNT_FILE.exists():
        raise RuntimeError(f"Service account file not found: {SERVICE_ACCOUNT_FILE}")

    if not os.environ.get("GEMINI_API_KEY"):
        raise RuntimeError("GEMINI_API_KEY environment variable is not set")

    schema_ok = client.exists("DocType", {"name": "Venue Wedding Area"})
    if not schema_ok:
        raise RuntimeError(
            "Schema phase v078 must be deployed before running this script. "
            "Run: docker compose --profile migrate up migration --build"
        )


def _resolve_tabs(tab_arg: str | None) -> list[str]:
    if not tab_arg:
        return ALL_TABS

    requested = [t.strip() for t in tab_arg.split(",")]
    resolved = []
    for req in requested:
        req_lower = req.lower()
        matches = [t for t in ALL_TABS if req_lower in t.lower().strip()]
        if not matches:
            print(f"WARNING: No tab matching '{req}'. Available: {ALL_TABS}")
        else:
            resolved.extend(matches)
    return resolved


async def _extract_all(
    venues: list[dict],
    semaphore: asyncio.Semaphore,
    refresh_cache: bool,
) -> list[dict | None]:
    """Run Gemini extraction concurrently with semaphore throttle."""
    async def _extract_one(venue: dict) -> dict | None:
        async with semaphore:
            return await gemini_extractor.extract_cached(venue, refresh=refresh_cache)

    tasks = [_extract_one(v) for v in venues]
    results = []
    for coro in asyncio.as_completed(tasks):
        try:
            results.append(await coro)
        except Exception as exc:
            results.append(None)
            logger.error("Gemini extraction failed: %s", exc)
    return results


async def run(args: argparse.Namespace) -> None:
    config = get_config()
    client = ERPNextClient(config["erpnext"])

    _preflight(client)

    tabs = _resolve_tabs(args.tabs)
    print(f"Tabs selected: {tabs}")

    # Step 1: read + parse all selected tabs
    all_venues: list[dict] = []
    tab_venue_map: dict[str, list[dict]] = {}

    for tab in tabs:
        print(f"\nReading tab: {tab!r} ...")
        try:
            grid = read_tab(SPREADSHEET_ID, tab)
            venues = parse_tab(grid, tab)
            print(f"  Parsed {len(venues)} venues")
            tab_venue_map[tab] = venues
            all_venues.extend(venues)
        except Exception as exc:
            logger.error("Failed to read/parse tab '%s': %s", tab, exc)
            tab_venue_map[tab] = []

    print(f"\nTotal venues to process: {len(all_venues)}")

    # Step 2: Gemini extraction (concurrent)
    print("\nRunning Gemini extraction...")
    semaphore = asyncio.Semaphore(args.concurrency)
    extractions = await _extract_all(all_venues, semaphore, args.refresh_cache)

    # Rebuild per-tab extraction lookup by matching venue list positions
    venue_extractions: list[tuple[dict, dict | None]] = list(zip(all_venues, extractions))

    if args.dry_run:
        print("\n[DRY RUN] Skipping ERPNext writes.")
        counts: dict[str, dict[str, int]] = {}
        for tab in tabs:
            tab_venues = tab_venue_map.get(tab, [])
            counts[tab] = {
                "TOTAL": len(tab_venues),
                "EXTRACTED_OK": sum(1 for v in tab_venues if _find_extraction(venue_extractions, v) is not None),
                "EXTRACTED_FAIL": sum(1 for v in tab_venues if _find_extraction(venue_extractions, v) is None),
            }
        _print_summary(counts, dry_run=True)
        return

    # Step 3: sequential ERPNext writes
    from scripts.venue_import.erpnext_writer import upsert_venue

    slugs_seen: set[str] = set()
    failed_venues: list[dict] = []
    per_tab_counts: dict[str, dict[str, int]] = {
        tab: {"CREATED": 0, "UPDATED": 0, "SKIPPED": 0, "FAILED": 0}
        for tab in tabs
    }

    total = len(all_venues)
    for idx, (venue, extracted) in enumerate(venue_extractions, start=1):
        tab = venue["tab_name"]
        venue_name = venue["venue_name_raw"]
        city = venue["city"]

        from scripts.venue_import.erpnext_writer import build_external_key
        ext_key = build_external_key(city, venue_name)

        if ext_key in slugs_seen:
            logger.warning(
                "[%d/%d] [%s] SKIPPED %s (slug collision: %s)",
                idx, total, tab.strip(), venue_name, ext_key,
            )
            per_tab_counts[tab]["SKIPPED"] += 1
            continue

        slugs_seen.add(ext_key)

        if extracted is None:
            logger.error(
                "[%d/%d] [%s] FAILED %s (Gemini extraction failed)",
                idx, total, tab.strip(), venue_name,
            )
            per_tab_counts[tab]["FAILED"] += 1
            failed_venues.append({
                "tab": tab,
                "source_row": venue["source_row"],
                "venue_name": venue_name,
                "error": "Gemini extraction failed",
            })
            continue

        try:
            supplier_name, action = upsert_venue(client, venue, extracted)
            print(f"[{idx}/{total}] [{tab.strip()}] {action} {ext_key} ({venue_name})")
            per_tab_counts[tab][action] = per_tab_counts[tab].get(action, 0) + 1
        except Exception as exc:
            logger.error(
                "[%d/%d] [%s] FAILED %s (row %s): %s",
                idx, total, tab.strip(), venue_name, venue["source_row"], exc,
            )
            per_tab_counts[tab]["FAILED"] += 1
            failed_venues.append({
                "tab": tab,
                "source_row": venue["source_row"],
                "venue_name": venue_name,
                "error": str(exc),
            })

    _print_summary(per_tab_counts, dry_run=False)

    if failed_venues:
        ts = datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%S")
        failed_path = (
            Path(__file__).parent / ".cache" / f"failed_venues_{ts}.json"
        )
        failed_path.parent.mkdir(parents=True, exist_ok=True)
        failed_path.write_text(
            json.dumps(failed_venues, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"\nFailed venues dumped to: {failed_path}")


def _find_extraction(
    venue_extractions: list[tuple[dict, dict | None]],
    target_venue: dict,
) -> dict | None:
    for venue, extracted in venue_extractions:
        if venue is target_venue:
            return extracted
    return None


def _print_summary(counts: dict, dry_run: bool) -> None:
    mode = " [DRY RUN]" if dry_run else ""
    print(f"\n=== Import Summary{mode} ===")
    for tab, tab_counts in counts.items():
        print(f"  {tab.strip()}: {tab_counts}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Import venues from MERAKI - VENUE Google Sheet into ERPNext")
    parser.add_argument("--dry-run", action="store_true", help="Parse + Gemini + cache, no ERPNext writes")
    parser.add_argument("--tabs", default=None, help="Comma-separated tab names (substring match)")
    parser.add_argument("--refresh-cache", action="store_true", help="Ignore Gemini cache, re-extract")
    parser.add_argument("--concurrency", type=int, default=10, help="Max concurrent Gemini calls (default: 10)")
    args = parser.parse_args()

    asyncio.run(run(args))


if __name__ == "__main__":
    main()
