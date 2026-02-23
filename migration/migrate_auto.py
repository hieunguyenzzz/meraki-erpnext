#!/usr/bin/env python3
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from core.config import get_config
from core.erpnext_client import ERPNextClient
from runner import run_pending


def main():
    config = get_config()
    client = ERPNextClient(config['erpnext'])
    count = run_pending(client)
    print(f"Done — {count} phase(s) applied.")


if __name__ == "__main__":
    main()
