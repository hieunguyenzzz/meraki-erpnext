"""MWP-88: convert existing .heic/.heif Purchase Invoice receipts to JPEG.

Default is a DRY RUN. Pass --apply to upload the JPEG and delete the HEIC File doc.

Env: ERPNEXT_URL, ERPNEXT_API_KEY, ERPNEXT_API_SECRET
Run from the repo root: python scripts/MWP-88-convert-heic-receipts.py [--apply]
"""

import argparse
import json
import os
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from webhook_v2.services.receipt_image import is_heif, to_browser_image  # noqa: E402

URL = os.environ["ERPNEXT_URL"].rstrip("/")
HEADERS = {
    "Authorization": f"token {os.environ['ERPNEXT_API_KEY']}:{os.environ['ERPNEXT_API_SECRET']}",
    "X-Frappe-Site-Name": os.environ.get("ERPNEXT_SITE_NAME", "erp.merakiwp.com"),
}


def list_heic_files() -> list[dict]:
    filters = [
        ["attached_to_doctype", "=", "Purchase Invoice"],
        ["file_url", "like", "%.heic"],
    ]
    out = []
    for pattern in ("%.heic", "%.heif"):  # SQL LIKE is case-insensitive on MariaDB
        filters[1][2] = pattern
        r = requests.get(
            f"{URL}/api/resource/File",
            headers=HEADERS,
            params={
                "filters": json.dumps(filters),
                "fields": json.dumps(["name", "file_name", "file_url", "attached_to_name", "is_private"]),
                "limit_page_length": 0,
            },
            timeout=60,
        )
        r.raise_for_status()
        out += r.json()["data"]
    return out


def process(f: dict, apply: bool) -> str:
    label = f"{f['name']} {f['attached_to_name']} {f['file_url']}"
    r = requests.get(URL + f["file_url"], headers=HEADERS, timeout=60)
    r.raise_for_status()
    if not is_heif(r.content):
        return f"SKIP (not HEIF content) {label}"
    jpeg, new_name = to_browser_image(r.content, f["file_name"] or Path(f["file_url"]).name)
    if jpeg is r.content:
        return f"FAIL (convert) {label}"
    if not apply:
        return f"DRY-RUN would convert {label} -> {new_name}"
    up = requests.post(
        f"{URL}/api/method/upload_file",
        headers=HEADERS,
        files={"file": (new_name, jpeg)},
        data={"doctype": "Purchase Invoice", "docname": f["attached_to_name"], "is_private": "1" if f.get("is_private") else "0"},
        timeout=60,
    )
    up.raise_for_status()
    new_url = up.json()["message"]["file_url"]
    d = requests.delete(f"{URL}/api/resource/File/{f['name']}", headers=HEADERS, timeout=60)
    d.raise_for_status()
    return f"CONVERTED {label} -> {new_url}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="perform the conversion (default: dry run)")
    args = ap.parse_args()
    files = list_heic_files()
    print(f"{len(files)} HEIC/HEIF file(s) attached to Purchase Invoices ({'APPLY' if args.apply else 'dry run'})")
    for f in files:
        try:
            print(process(f, args.apply))
        except Exception as e:
            print(f"ERROR {f['name']} {f['attached_to_name']}: {e}")


if __name__ == "__main__":
    main()
