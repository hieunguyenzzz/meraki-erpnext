"""
Configuration for wedding planner agent.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Gemini
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"

    # ERPNext
    erpnext_url: str = "http://merakierp.loc"
    erpnext_api_key: str = ""
    erpnext_api_secret: str = ""

    # Logging
    log_level: str = "INFO"
    json_logs: bool = True  # False for colored dev output


settings = Settings()
