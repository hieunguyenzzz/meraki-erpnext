"""
Configuration loader for Meraki ERPNext migration.
"""

import os
from pathlib import Path
from dotenv import load_dotenv


def get_config() -> dict:
    """Load configuration from environment variables."""
    # Load .env file from project root
    env_path = Path(__file__).parent.parent / '.env'
    load_dotenv(env_path)

    return {
        'erpnext': {
            'url': os.environ.get('ERPNEXT_URL', 'http://100.65.0.28:8082'),
            'api_key': os.environ.get('ERPNEXT_API_KEY', ''),
            'api_secret': os.environ.get('ERPNEXT_API_SECRET', ''),
        },
        'postgres': {
            'host': os.environ.get('MERAKI_PG_HOST', '14.225.210.164'),
            'port': int(os.environ.get('MERAKI_PG_PORT', 5432)),
            'user': os.environ.get('MERAKI_PG_USER', 'meraki_noco_usr'),
            'password': os.environ.get('MERAKI_PG_PASSWORD', ''),
            'database': os.environ.get('MERAKI_PG_DATABASE', 'meraki_nocodb'),
        }
    }


def validate_config(config: dict) -> bool:
    """Validate that all required config values are present."""
    errors = []

    # Check ERPNext config
    if not config['erpnext']['api_key']:
        errors.append('ERPNEXT_API_KEY is required')
    if not config['erpnext']['api_secret']:
        errors.append('ERPNEXT_API_SECRET is required')

    # Check PostgreSQL config
    if not config['postgres']['password']:
        errors.append('MERAKI_PG_PASSWORD is required')

    if errors:
        for error in errors:
            print(f"Config Error: {error}")
        return False

    return True
