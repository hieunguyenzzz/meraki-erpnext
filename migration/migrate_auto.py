#!/usr/bin/env python3
import sys
import time
import requests
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from core.config import get_config
from core.erpnext_client import ERPNextClient
from runner import run_pending


def wait_for_erpnext(config: dict, max_wait: int = 120) -> None:
    """Poll ERPNext until it responds with a valid auth (200 or 404), not 401/503."""
    url = config['url'].rstrip('/')
    headers = {'Authorization': f"token {config['api_key']}:{config['api_secret']}"}
    deadline = time.time() + max_wait
    attempt = 0
    while time.time() < deadline:
        attempt += 1
        try:
            r = requests.get(f"{url}/api/resource/Item", headers=headers, timeout=10)
            if r.status_code in (200, 404):
                print(f"ERPNext ready (attempt {attempt}, status {r.status_code})")
                return
            print(f"Waiting for ERPNext... attempt {attempt}, status {r.status_code}")
        except Exception as e:
            print(f"Waiting for ERPNext... attempt {attempt}, error: {e}")
        time.sleep(5)
    raise RuntimeError(f"ERPNext not ready after {max_wait}s")


def main():
    config = get_config()
    wait_for_erpnext(config['erpnext'])
    client = ERPNextClient(config['erpnext'])
    count = run_pending(client)
    print(f"Done — {count} phase(s) applied.")


if __name__ == "__main__":
    main()
