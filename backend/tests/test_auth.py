import os
import time

import pytest

os.environ.setdefault("JWT_SECRET", "t" * 32)  # >= MIN_SECRET_LEN
os.environ.setdefault("GOOGLE_OAUTH_CLIENT_ID", "test-client")

from app import auth  # noqa: E402


def test_mint_and_verify_round_trip():
    claims = auth.verify(auth.mint("a@b.com", "Asha", "admin"))
    assert claims["email"] == "a@b.com"
    assert claims["role"] == "admin"


def test_expired_token_is_rejected():
    with pytest.raises(auth.AuthError):
        auth.verify(auth.mint("a@b.com", "Asha", "user", ttl_s=-1))


def test_tampered_token_is_rejected():
    tok = auth.mint("a@b.com", "Asha", "user")
    with pytest.raises(auth.AuthError):
        auth.verify(tok[:-4] + "AAAA")


def test_token_signed_with_another_secret_is_rejected():
    import jwt

    forged = jwt.encode(
        {"email": "x@y.com", "role": "admin", "exp": int(time.time()) + 60},
        "w" * 32,
        algorithm="HS256",
    )
    with pytest.raises(auth.AuthError):
        auth.verify(forged)


def test_none_algorithm_is_rejected():
    # The classic JWT bypass: an unsigned token claiming alg=none.
    import base64
    import json

    def b64(d):
        return base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()

    forged = f'{b64({"alg": "none", "typ": "JWT"})}.{b64({"email": "x@y.com", "role": "admin"})}.'
    with pytest.raises(auth.AuthError):
        auth.verify(forged)


def test_every_token_carries_its_own_jti():
    a = auth.verify(auth.mint("a@b.com", "A", "user"))
    b = auth.verify(auth.mint("a@b.com", "A", "user"))
    assert a["jti"] and b["jti"]
    # Same person, two sign-ins, two distinct sessions.
    assert a["jti"] != b["jti"]


def test_an_empty_or_short_secret_is_refused_at_import():
    """PyJWT signs happily with an empty key, so a missing JWT_SECRET would
    silently produce forgeable tokens rather than erroring. Importing must fail
    instead — a service that cannot authenticate must not start."""
    import importlib
    import os as _os

    for bad in ("", "short"):
        old = _os.environ["JWT_SECRET"]
        _os.environ["JWT_SECRET"] = bad
        try:
            with pytest.raises(RuntimeError, match="JWT_SECRET"):
                importlib.reload(auth)
        finally:
            _os.environ["JWT_SECRET"] = old
            importlib.reload(auth)
