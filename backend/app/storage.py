"""Cloudflare R2 (S3-compatible) object storage.

Objects are never public. Admin playback goes through a short-lived presigned
GET; the key itself never leaves the server.
"""

import os

import boto3
from botocore.config import Config

_client = None

# Which bucket, by the env var that names it. Audio is the default so every
# existing call site reads exactly as it did; resumes pass RESUME explicitly.
AUDIO = "R2_AUDIO_BUCKET"
RESUME = "R2_RESUME_BUCKET"


def _bucket(which: str) -> str:
    return os.environ[which]


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


def put(key: str, data: bytes, content_type: str, bucket: str = AUDIO) -> None:
    client().put_object(Bucket=_bucket(bucket), Key=key, Body=data, ContentType=content_type)


def get(key: str, bucket: str = AUDIO) -> bytes:
    return client().get_object(Bucket=_bucket(bucket), Key=key)["Body"].read()


def delete(key: str, bucket: str = AUDIO) -> None:
    client().delete_object(Bucket=_bucket(bucket), Key=key)


def presign(key: str, ttl_s: int = 3600, bucket: str = AUDIO) -> str:
    """Short-lived read URL. Admin responses only — never candidate-facing."""
    return client().generate_presigned_url(
        "get_object", Params={"Bucket": _bucket(bucket), "Key": key}, ExpiresIn=ttl_s
    )
