#!/usr/bin/env python3
"""
Set up VAT 8% tax account and Sales Taxes and Charges Template.

Idempotent — safe to run multiple times.

Usage:
    # Against local dev
    python migration/setup_vat_tax.py

    # Against OVH production
    python migration/setup_vat_tax.py --url https://app.merakiwp.com
"""

import argparse
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "core"))
from erpnext_client import ERPNextClient

COMPANY = "Meraki Wedding Planner"
PARENT_ACCOUNT = "Duties and Taxes - MWP"
ACCOUNT_NAME = "Output Tax - MWP"
TEMPLATE_NAME = "VAT 8% Inclusive - MWP"
VAT_RATE = 8


def setup_vat_tax(client: ERPNextClient):
    # 1. Create Output Tax account
    existing = client.get("Account", ACCOUNT_NAME)
    if existing:
        print(f"  [skip] Account '{ACCOUNT_NAME}' already exists")
        # Ensure rate is correct
        if existing.get("tax_rate") != VAT_RATE:
            client.update("Account", ACCOUNT_NAME, {"tax_rate": VAT_RATE})
            print(f"  [fix]  Updated tax_rate to {VAT_RATE}%")
    else:
        result = client.create_account({
            "account_name": "Output Tax",
            "parent_account": PARENT_ACCOUNT,
            "company": COMPANY,
            "account_type": "Tax",
            "tax_rate": VAT_RATE,
        })
        if result:
            print(f"  [ok]   Created account '{result['name']}'")
        else:
            print(f"  [fail] Could not create account '{ACCOUNT_NAME}' — check parent '{PARENT_ACCOUNT}' exists")
            return False

    # 2. Create Sales Taxes and Charges Template
    existing_tmpl = client.get("Sales Taxes and Charges Template", TEMPLATE_NAME)
    if existing_tmpl:
        print(f"  [skip] Template '{TEMPLATE_NAME}' already exists")
        # Check rate on the child row and fix if wrong
        taxes = existing_tmpl.get("taxes", [])
        if taxes and taxes[0].get("rate") != VAT_RATE:
            taxes[0]["rate"] = VAT_RATE
            taxes[0]["description"] = f"VAT {VAT_RATE}%"
            client.update("Sales Taxes and Charges Template", TEMPLATE_NAME, {"taxes": taxes})
            print(f"  [fix]  Updated template tax rate to {VAT_RATE}%")
    else:
        result = client.create("Sales Taxes and Charges Template", {
            "title": "VAT 8% Inclusive",  # ERPNext appends ' - MWP' → 'VAT 8% Inclusive - MWP'
            "company": COMPANY,
            "taxes": [{
                "charge_type": "On Net Total",
                "account_head": ACCOUNT_NAME,
                "rate": VAT_RATE,
                "included_in_print_rate": 1,
                "description": f"VAT {VAT_RATE}%",
            }],
        })
        if result:
            print(f"  [ok]   Created template '{result['name']}'")
        else:
            print(f"  [fail] Could not create template '{TEMPLATE_NAME}'")
            return False

    return True


def main():
    parser = argparse.ArgumentParser(description="Set up VAT tax in ERPNext")
    parser.add_argument("--url", default="http://merakierp.loc", help="ERPNext base URL")
    parser.add_argument("--api-key", default="2c17d14ed504109", help="API key")
    parser.add_argument("--api-secret", default="eaa8dc0027a2236", help="API secret")
    args = parser.parse_args()

    # OVH production credentials
    if "app.merakiwp.com" in args.url or "139.99.9" in args.url:
        api_key = args.api_key if args.api_key != "2c17d14ed504109" else "d781723a2d87d5140af56fd73481de8a6057f83ad378c0e9c99b51e6"
        api_secret = args.api_secret if args.api_secret != "eaa8dc0027a2236" else "b8ce2d0a1dcf0ab87ed28cefbdc1e1895a89c65d3deb8fc78998c524"
    else:
        api_key = args.api_key
        api_secret = args.api_secret

    client = ERPNextClient({"url": args.url, "api_key": api_key, "api_secret": api_secret})

    print(f"\nSetting up VAT {VAT_RATE}% tax on {args.url}")
    print("-" * 50)

    success = setup_vat_tax(client)

    print("-" * 50)
    if success:
        print("Done.")
    else:
        print("Setup failed — check errors above.")
        sys.exit(1)


if __name__ == "__main__":
    main()
