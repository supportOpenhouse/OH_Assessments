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
from fastapi import Cookie, Header, HTTPException
from google.auth.transport import requests as g_requests
from google.oauth2 import id_token as g_id_token

from . import db

CLIENT_ID = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "")
ALG = "HS256"

# Candidates submit once and are done; a week means they are not signed out
# mid-flow. Admin privilege does NOT ride on this window — see current_user.
TTL_S = 7 * 24 * 3600

# The session cookie. httpOnly so no script can read it — that is the whole
# reason for moving off localStorage, where any XSS could exfiltrate the token.
COOKIE_NAME = "oha_session"
# Off only for local http. Anything reachable over the network must keep it on.
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").lower() != "false"

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


def set_session_cookie(response, token: str) -> None:
    """Hand the browser the session as an httpOnly cookie.

    samesite='lax' is the CSRF defence: the browser will not attach this cookie
    to a cross-site POST, and every mutation here is a POST or PATCH.
    """
    response.set_cookie(
        COOKIE_NAME, token,
        max_age=TTL_S,          # 7 days — matches the token's own exp
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/", samesite="lax", secure=COOKIE_SECURE)


def _claims(authorization: str, cookie: str | None) -> dict:
    """Cookie first; the Authorization header stays as a fallback so curl and
    the test suite can still drive the API without a browser."""
    token = cookie
    if not token and authorization.startswith("Bearer "):
        token = authorization[7:]
    if not token:
        raise HTTPException(401, "not signed in")
    try:
        return verify(token)
    except AuthError as e:
        raise HTTPException(401, str(e))


async def current_user(
    authorization: str = Header(default=""),
    oha_session: str | None = Cookie(default=None),
) -> dict:
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
    c = _claims(authorization, oha_session)
    oh = db.get_oh_user(c["email"])
    return {
        "email": c["email"],
        "name": c.get("name", ""),
        "role": oh["role"] if oh else "user",
        "jti": c.get("jti"),
    }


async def require_admin(
    authorization: str = Header(default=""),
    oha_session: str | None = Cookie(default=None),
) -> dict:
    u = await current_user(authorization, oha_session)
    if u["role"] != "admin":
        raise HTTPException(403, "admin only")
    return u
