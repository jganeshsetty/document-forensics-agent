import io
import os
from typing import BinaryIO, Optional

try:
    from minio import Minio
    from minio.error import S3Error
    MINIO_AVAILABLE = True
except ImportError:
    MINIO_AVAILABLE = False


class StorageBackend:
    """Abstraction over MinIO cloud storage with local filesystem fallback."""

    def __init__(self, bucket: str = "forensics-uploads"):
        self.bucket = bucket
        self.minio_client: Optional[Minio] = None

        if MINIO_AVAILABLE:
            endpoint = os.getenv("MINIO_ENDPOINT", "localhost:9000")
            access_key = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
            secret_key = os.getenv("MINIO_SECRET_KEY", "minioadmin")
            use_ssl = os.getenv("MINIO_USE_SSL", "false").lower() == "true"
            try:
                self.minio_client = Minio(endpoint, access=access_key, secret=secret_key, secure=use_ssl)
                if not self.minio_client.bucket_exists(bucket):
                    self.minio_client.make_bucket(bucket)
            except Exception:
                self.minio_client = None

    def store(self, object_name: str, file_obj: BinaryIO, content_type: str = "application/octet-stream") -> str:
        if self.minio_client is not None:
            try:
                size = 0
                chunks = iter(lambda: file_obj.read(8192), b"")
                for chunk in chunks:
                    size += len(chunk)
                file_obj.seek(0)
                self.minio_client.put_object(
                    self.bucket, object_name, file_obj, length=-1,
                    content_type=content_type,
                )
                return f"minio://{self.bucket}/{object_name}"
            except S3Error:
                file_obj.seek(0)

        local_dir = os.path.join(os.getcwd(), "uploads")
        os.makedirs(local_dir, exist_ok=True)
        path = os.path.join(local_dir, object_name)
        data = file_obj.read()
        with open(path, "wb") as f:
            f.write(data)
        return f"local://{path}"

    def read(self, source_url: str) -> Optional[bytes]:
        if source_url.startswith("minio://"):
            if self.minio_client is None:
                return None
            path = source_url[len("minio://"):]
            try:
                resp = self.minio_client.get_object(self.bucket, path)
                data = resp.read()
                resp.close()
                resp.release_conn()
                return data
            except S3Error:
                return None
        elif source_url.startswith("local://"):
            path = source_url[len("local://"):]
            if os.path.exists(path):
                with open(path, "rb") as f:
                    return f.read()
        return None
