"""
MinIO client for storing email attachments.
"""

from io import BytesIO

from minio import Minio
from minio.error import S3Error

from webhook_v2.config import settings
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)


class MinIOClient:
    """Client for MinIO object storage."""

    def __init__(
        self,
        endpoint: str | None = None,
        access_key: str | None = None,
        secret_key: str | None = None,
        bucket: str | None = None,
        secure: bool | None = None,
    ):
        self.endpoint = endpoint or settings.minio_endpoint
        self.access_key = access_key or settings.minio_access_key
        self.secret_key = secret_key or settings.minio_secret_key
        self.bucket = bucket or settings.minio_bucket
        self.secure = secure if secure is not None else settings.minio_secure
        self._client: Minio | None = None

    @property
    def enabled(self) -> bool:
        """Check if MinIO is configured."""
        return bool(self.endpoint and self.access_key and self.secret_key)

    def _get_client(self) -> Minio:
        """Get or create MinIO client."""
        if not self._client:
            if not self.enabled:
                raise RuntimeError("MinIO not configured")
            self._client = Minio(
                self.endpoint,
                access_key=self.access_key,
                secret_key=self.secret_key,
                secure=self.secure,
            )
        return self._client

    def ensure_bucket(self) -> None:
        """Create bucket if it doesn't exist."""
        client = self._get_client()
        if not client.bucket_exists(self.bucket):
            client.make_bucket(self.bucket)
            log.info("minio_bucket_created", bucket=self.bucket)

    def upload_attachment(
        self,
        email_id: int,
        filename: str,
        data: bytes,
        content_type: str,
    ) -> str:
        """
        Upload an attachment to MinIO.

        Args:
            email_id: Email ID for path organization
            filename: Original filename
            data: File content bytes
            content_type: MIME type

        Returns:
            Full URL to the uploaded object.
        """
        client = self._get_client()
        self.ensure_bucket()

        # Create path: attachments/<email_id>/<filename>
        object_name = f"attachments/{email_id}/{filename}"

        client.put_object(
            self.bucket,
            object_name,
            BytesIO(data),
            length=len(data),
            content_type=content_type,
        )

        # Build URL
        protocol = "https" if self.secure else "http"
        url = f"{protocol}://{self.endpoint}/{self.bucket}/{object_name}"

        log.info(
            "attachment_uploaded",
            email_id=email_id,
            filename=filename,
            size=len(data),
        )
        return url

    def get_attachment(self, object_name: str) -> bytes | None:
        """Download an attachment from MinIO."""
        try:
            client = self._get_client()
            response = client.get_object(self.bucket, object_name)
            return response.read()
        except S3Error as e:
            log.error("attachment_download_error", object_name=object_name, error=str(e))
            return None
        finally:
            if "response" in locals():
                response.close()
                response.release_conn()

    def delete_attachment(self, object_name: str) -> bool:
        """Delete an attachment from MinIO."""
        try:
            client = self._get_client()
            client.remove_object(self.bucket, object_name)
            log.info("attachment_deleted", object_name=object_name)
            return True
        except S3Error as e:
            log.error("attachment_delete_error", object_name=object_name, error=str(e))
            return False
