"""Google identity in, our own session token out.

Google ID tokens expire in an hour, which would sign a candidate out mid-upload.
We verify Google's token once at sign-in and mint our own session token.

**One secret, not one per user.** JWT_SECRET is a single server-side signing key.
Its job is to prove *this server* issued a token; a per-user secret would mean
storing N keys to answer the same question. What IS per-user is the token itself:
one minted per person per sign-in, carrying their claims and its own `jti`.
"""

import os
import time
import uuid

import jwt
from fastapi import Header, HTTPException
from google.auth.transport import requests as g_requests
from google.oauth2 import id_token as g_id_token

from . import db

CLIENT_ID = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "")
ALG = "HS256"

# Candidates submit once and are done; a week means they are not signed out
# mid-flow. Admin privilege does NOT ride on this window — see current_user.
TTL_S = 7 * 24 * 3600

MIN_SECRET_LEN = 32

# Fail at import, not at first request. PyJWT will happily sign with an empty
# key, so a missing JWT_SECRET does not error — it silently produces tokens
# anyone can forge. A service that cannot authenticate must not start.
SECRET = os.environ.get("JWT_SECRET", "")
if len(SECRET) < MIN_SECRET_LEN:
    raise RuntimeError(
        f"JWT_SECRET must be at least {MIN_SECRET_LEN} characters "
        f"(got {len(SECRET)}). Generate one with: openssl rand -hex 32"
    )


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
    """One token per person per sign-in.

    `jti` identifies this specific session so a sign-in can be traced through
    activity_logs. `role` is a convenience for the client's own routing — the
    server re-checks it, see current_user.
    """
    now = int(time.time())
    return jwt.encode(
        {
            "email": email,
            "name": name,
            "role": role,
            "jti": uuid.uuid4().hex,
            "iat": now,
            "exp": now + ttl_s,
        },
        SECRET,
        algorithm=ALG,
    )


def verify(token: str) -> dict:
    try:
        # algorithms is a whitelist, which is what blocks the alg=none bypass.
        return jwt.decode(token, SECRET, algorithms=[ALG])
    except jwt.PyJWTError as e:
        raise AuthError(str(e))


def _claims(authorization: str) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "missing bearer token")
    try:
        return verify(authorization[7:])
    except AuthError as e:
        raise HTTPException(401, str(e))


async def current_user(authorization: str = Header(default="")) -> dict:
    """Identity from the token; **privilege from the database**.

    The role claim inside a 7-day token is a snapshot of who someone was when
    they signed in. Trusting it means that removing an admin from oh_users, or
    setting is_active = false, does not take effect for up to a week — they keep
    full access to every candidate's results with a token already in their
    browser.

    So the claim is used only for the client's own routing, and the server
    re-derives the role on every request. One indexed lookup on a tiny table,
    against a revocation that is otherwise a week late.
    """
    c = _claims(authorization)
    oh = db.get_oh_user(c["email"])
    return {
        "email": c["email"],
        "name": c.get("name", ""),
        "role": oh["role"] if oh else "user",
        "jti": c.get("jti"),
    }


async def require_admin(authorization: str = Header(default="")) -> dict:
    u = await current_user(authorization)
    if u["role"] != "admin":
        raise HTTPException(403, "admin only")
    return u
