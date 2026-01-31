"""
Configuration loader for Meraki ERPNext migration.

Loads configuration from environment variables with sensible defaults.
"""

import os
from pathlib import Path
from dotenv import load_dotenv


# Company constants used across all modules
COMPANY = 'Meraki Wedding Planner'
COMPANY_ABBR = 'MWP'


def get_config() -> dict:
    """Load configuration from environment variables.

    Returns:
        dict: Configuration with 'erpnext' and 'postgres' sections.
    """
    # Load .env file from project root
    env_path = Path(__file__).parent.parent.parent / '.env'
    load_dotenv(env_path)

    return {
        'erpnext': {
            'url': os.environ.get('ERPNEXT_URL', ''),
            'api_key': os.environ.get('ERPNEXT_API_KEY', ''),
            'api_secret': os.environ.get('ERPNEXT_API_SECRET', ''),
        },
        'postgres': {
            'host': os.environ.get('MERAKI_PG_HOST', ''),
            'port': int(os.environ.get('MERAKI_PG_PORT', 5432)),
            'user': os.environ.get('MERAKI_PG_USER', ''),
            'password': os.environ.get('MERAKI_PG_PASSWORD', ''),
            'database': os.environ.get('MERAKI_PG_DATABASE', ''),
        }
    }


def validate_config(config: dict) -> bool:
    """Validate that all required config values are present.

    Args:
        config: Configuration dictionary from get_config().

    Returns:
        bool: True if config is valid, False otherwise.
    """
    errors = []

    # Check ERPNext config
    if not config['erpnext']['url']:
        errors.append('ERPNEXT_URL is required')
    if not config['erpnext']['api_key']:
        errors.append('ERPNEXT_API_KEY is required')
    if not config['erpnext']['api_secret']:
        errors.append('ERPNEXT_API_SECRET is required')

    # Check PostgreSQL config
    if not config['postgres']['host']:
        errors.append('MERAKI_PG_HOST is required')
    if not config['postgres']['user']:
        errors.append('MERAKI_PG_USER is required')
    if not config['postgres']['password']:
        errors.append('MERAKI_PG_PASSWORD is required')
    if not config['postgres']['database']:
        errors.append('MERAKI_PG_DATABASE is required')

    if errors:
        for error in errors:
            print(f"Config Error: {error}")
        return False

    return True
