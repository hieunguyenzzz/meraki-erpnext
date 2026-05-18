"""
Disk-based cache for Gemini extraction results.

Key: SHA-256 of the sorted JSON representation of the raw venue dict.
Storage: one JSON file per key in migration/scripts/.cache/venue_extractions/.
Writes are atomic (write to temp, rename).
"""

import hashlib
import json
import os
import tempfile
from pathlib import Path


def cache_dir() -> Path:
    base = Path(__file__).parent.parent / ".cache" / "venue_extractions"
    base.mkdir(parents=True, exist_ok=True)
    return base


def cache_key(venue_dict: dict) -> str:
    serialised = json.dumps(venue_dict, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(serialised).hexdigest()


def get(key: str) -> dict | None:
    path = cache_dir() / f"{key}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def put(key: str, value: dict) -> None:
    path = cache_dir() / f"{key}.json"
    dir_path = path.parent
    # Atomic write: write to temp file in same directory, then rename
    fd, tmp_path = tempfile.mkstemp(dir=dir_path, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(value, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
