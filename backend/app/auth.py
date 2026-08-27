"""Google identity in, our own session token out.

Google ID tokens expire in an hour, which would sign a candidate out mid-upload.
We verify Google's token once at sign-in and mint our own 7-day JWT.
"""

import os
import time

import jwt
from fastapi import Header, HTTPException
from google.auth.transport import requests as g_requests
from google.oauth2 import id_token as g_id_token

SECRET = os.environ.get("JWT_SECRET", "")
CLIENT_ID = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "")
ALG = "HS256"
TTL_S = 7 * 24 * 3600


class AuthError(Exception):
    pass


def verify_google(token: str) -> dict:
    """Verify a Google ID token's signature and audience.

    Never decode this unverified — the whole security model rests on Google
    having signed it for *our* client id.
    """
    if not CLIENT_ID:
        raise AuthError("GOOGLE_OAUTH_CLIENT_ID is not configured")
    try:
        info = g_id_token.verify_oauth2_token(token, g_requests.Request(), CLIENT_ID)
    except Exception as e:  # google-auth raises a variety of ValueError subclasses
        raise AuthError(f"invalid google token: {e}")
    if not info.get("email_verified"):
        raise AuthError("google account has no verified email")
    return {"email": info["email"].lower(), "name": info.get("name") or ""}


def mint(email: str, name: str, role: str, ttl_s: int = TTL_S) -> str:
    now = int(time.time())
    return jwt.encode(
        {"email": email, "name": name, "role": role, "iat": now, "exp": now + ttl_s},
        SECRET,
        algorithm=ALG,
    )


def verify(token: str) -> dict:
    try:
        # algorithms is a whitelist, which is what blocks the alg=none bypass.
        return jwt.decode(token, SECRET, algorithms=[ALG])
    except jwt.PyJWTError as e:
        raise AuthError(str(e))


def _user_from_header(authorization: str) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "missing bearer token")
    try:
        c = verify(authorization[7:])
    except AuthError as e:
        raise HTTPException(401, str(e))
    return {"email": c["email"], "name": c.get("name", ""), "role": c["role"]}


async def current_user(authorization: str = Header(default="")) -> dict:
    return _user_from_header(authorization)


async def require_admin(authorization: str = Header(default="")) -> dict:
    u = _user_from_header(authorization)
    if u["role"] != "admin":
        raise HTTPException(403, "admin only")
    return u
