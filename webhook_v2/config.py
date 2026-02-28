"""
Centralized configuration using Pydantic Settings.

All environment variables are loaded and validated here.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # IMAP (Zoho)
    zoho_host: str = "imappro.zoho.com"
    zoho_email: str = ""
    zoho_password: str = ""

    # Email Storage Database (new container)
    email_storage_host: str = "email-storage"
    email_storage_port: int = 5432
    email_storage_db: str = "email_processing"
    email_storage_user: str = "email_processor"
    email_storage_password: str = ""

    # ERPNext
    erpnext_url: str = "http://merakierp.loc"
    erpnext_api_key: str = ""
    erpnext_api_secret: str = ""

    # Gemini
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"

    # MinIO (optional)
    minio_endpoint: str | None = None
    minio_access_key: str | None = None
    minio_secret_key: str | None = None
    minio_bucket: str = "email-attachments"
    minio_secure: bool = True

    # Webhook (for backward compatibility during transition)
    webhook_url: str = "http://webhook:8000"

    # Classifier service (remote classifier-agent)
    classifier_service_url: str = "http://classifier-agent:8002"
    use_remote_classifier: bool = True  # Feature flag for gradual rollout

    # Wedding Planner Agent (for AI summaries)
    wedding_agent_url: str = "http://wedding-planner-agent:8003"

    # Processing
    processing_batch_size: int = 50
    max_retries: int = 3

    # Scheduler settings
    # Full scheduler (fetch + process) - disabled by default
    scheduler_enabled: bool = False
    # Fetch-only scheduler (IMAP fetch without processing) - enabled by default
    scheduler_fetch_enabled: bool = True
    scheduler_fetch_interval_minutes: int = 5
    scheduler_fetch_days: int = 7  # How many days back to fetch from IMAP

    # reCAPTCHA (for public inquiry form)
    recaptcha_secret_key: str = ""

    # Meraki domains (for detecting outgoing emails)
    meraki_domains: list[str] = ["merakiweddingplanner.com", "merakiwp.com"]

    # Google Calendar integration
    google_service_account_json: str = ""  # Full JSON string of service account key
    google_organizer_email: str = ""  # Google account the SA impersonates (e.g. xuanhoang@merakiwp.com)

    @property
    def database_url(self) -> str:
        """PostgreSQL connection URL for email storage database."""
        return (
            f"postgresql://{self.email_storage_user}:{self.email_storage_password}"
            f"@{self.email_storage_host}:{self.email_storage_port}/{self.email_storage_db}"
        )

    @property
    def erpnext_auth_header(self) -> dict[str, str]:
        """ERPNext API authorization header."""
        return {"Authorization": f"token {self.erpnext_api_key}:{self.erpnext_api_secret}"}

    def is_meraki_email(self, email: str) -> bool:
        """Check if email is from a Meraki domain."""
        email_lower = email.lower()
        return any(domain in email_lower for domain in self.meraki_domains)


# Global settings instance
settings = Settings()
