"""
Configuration for classifier agent.
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

    # Logging
    log_level: str = "INFO"
    json_logs: bool = True  # False for colored dev output

    # Meraki domains (for detecting outgoing emails)
    meraki_domains: list[str] = ["merakiweddingplanner.com", "merakiwp.com"]

    def is_meraki_email(self, email: str) -> bool:
        """Check if email is from a Meraki domain."""
        email_lower = email.lower()
        return any(domain in email_lower for domain in self.meraki_domains)


settings = Settings()
