import io
import json
import logging
import os
from typing import Any, BinaryIO, Optional, Union

from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("docverify.storage")

try:
    from google.cloud import storage
    from google.oauth2 import service_account
    GCS_AVAILABLE = True
except ImportError:
    GCS_AVAILABLE = False


class GCSStorageService:
    """Google Cloud Storage (GCS) backend for streaming file uploads and forensic artifacts."""

    def __init__(self):
        self.bucket_name = os.getenv("GCP_BUCKET_NAME", "docverify-forensics-vault").strip()
        self.client: Optional[Any] = None
        self._init_client()

    def _init_client(self):
        """Authenticate using GOOGLE_APPLICATION_CREDENTIALS_JSON or Cloud Run ADC."""
        if not GCS_AVAILABLE:
            logger.warning("google-cloud-storage package not available.")
            return

        creds_json = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON", "").strip()
        if creds_json:
            try:
                info = json.loads(creds_json)
                credentials = service_account.Credentials.from_service_account_info(info)
                project_id = info.get("project_id") or os.getenv("GCP_PROJECT_ID")
                self.client = storage.Client(credentials=credentials, project=project_id)
                logger.info(f"Authenticated GCS client via service account info for project '{project_id}'.")
            except Exception as e:
                logger.error(f"Failed to authenticate GCS client with GOOGLE_APPLICATION_CREDENTIALS_JSON: {e}")
                self.client = None
        else:
            try:
                # Fallback to Application Default Credentials (e.g. inside Cloud Run container)
                self.client = storage.Client()
                logger.info("Authenticated GCS client via Application Default Credentials (ADC).")
            except Exception as e:
                logger.info(f"Notice: GCS ADC initialization skipped (local dev mode): {e}")
                self.client = None

    def get_public_url(self, blob_name: str) -> str:
        """Returns the public HTTPS URL for a blob in the GCS bucket."""
        clean_blob = blob_name.lstrip("/")
        return f"https://storage.googleapis.com/{self.bucket_name}/{clean_blob}"

    def upload_stream(
        self,
        file_obj: BinaryIO,
        blob_name: str,
        content_type: Optional[str] = "application/octet-stream",
    ) -> str:
        """Stream an uploaded file directly into the GCS bucket without writing to local disk.

        Returns the public GCS URL.
        """
        clean_blob = blob_name.lstrip("/")
        public_url = self.get_public_url(clean_blob)

        if self.client is not None:
            try:
                bucket = self.client.bucket(self.bucket_name)
                blob = bucket.blob(clean_blob)
                file_obj.seek(0)
                blob.upload_from_file(file_obj, content_type=content_type, rewind=True)
                logger.info(f"Streamed file directly to GCS: {clean_blob}")
                return public_url
            except Exception as e:
                logger.error(f"Failed to stream upload to GCS bucket '{self.bucket_name}': {e}")

        # In-memory / mocked buffer fallback if GCS bucket is not currently reachable
        return public_url

    def upload_bytes(
        self,
        data: bytes,
        blob_name: str,
        content_type: str = "image/jpeg",
    ) -> str:
        """Upload in-memory bytes directly to GCS (e.g., ELA preview & annotated images).

        Returns the public GCS URL.
        """
        clean_blob = blob_name.lstrip("/")
        public_url = self.get_public_url(clean_blob)

        if self.client is not None:
            try:
                bucket = self.client.bucket(self.bucket_name)
                blob = bucket.blob(clean_blob)
                blob.upload_from_string(data, content_type=content_type)
                logger.info(f"Uploaded bytes directly to GCS: {clean_blob}")
                return public_url
            except Exception as e:
                logger.error(f"Failed to upload bytes to GCS: {e}")

        return public_url

    def download_bytes(self, blob_name_or_url: str) -> Optional[bytes]:
        """Download bytes of an object from GCS directly into memory."""
        blob_name = blob_name_or_url
        prefix = f"https://storage.googleapis.com/{self.bucket_name}/"
        if blob_name.startswith(prefix):
            blob_name = blob_name[len(prefix):]

        clean_blob = blob_name.lstrip("/")
        if self.client is not None:
            try:
                bucket = self.client.bucket(self.bucket_name)
                blob = bucket.blob(clean_blob)
                return blob.download_as_bytes()
            except Exception as e:
                logger.error(f"Failed to download blob '{clean_blob}' from GCS: {e}")
                return None
        return None


# Global singleton instance
storage_service = GCSStorageService()
