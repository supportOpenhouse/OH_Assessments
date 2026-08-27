"""Cloudflare R2 (S3-compatible) object storage.

Objects are never public. Admin playback goes through a short-lived presigned
GET; the key itself never leaves the server.
"""

import os

import boto3
from botocore.config import Config

_client = None


def _bucket() -> str:
    return os.environ["R2_BUCKET"]


def client():
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
            aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
            config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
            region_name="auto",
        )
    return _client


def put(key: str, data: bytes, content_type: str) -> None:
    client().put_object(Bucket=_bucket(), Key=key, Body=data, ContentType=content_type)


def get(key: str) -> bytes:
    return client().get_object(Bucket=_bucket(), Key=key)["Body"].read()


def delete(key: str) -> None:
    client().delete_object(Bucket=_bucket(), Key=key)


def presign(key: str, ttl_s: int = 3600) -> str:
    """Short-lived read URL. Admin responses only — never candidate-facing."""
    return client().generate_presigned_url(
        "get_object", Params={"Bucket": _bucket(), "Key": key}, ExpiresIn=ttl_s
    )
