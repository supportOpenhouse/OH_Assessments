"""Route-level tests with the database and storage stubbed out.

The invariant these exist to protect: no candidate-facing route can ever return
a score. That is enforced at the serializer, and this is what proves it.
"""

import os
from datetime import datetime, timezone

import pytest

os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("GOOGLE_OAUTH_CLIENT_ID", "test-client")
os.environ.setdefault("ELEVENLABS_API_KEY", "test")
os.environ.setdefault("ANTHROPIC_API_KEY", "test")
os.environ.setdefault("R2_BUCKET", "test")

from fastapi.testclient import TestClient  # noqa: E402

from app import auth, db, main, storage  # noqa: E402

CANDIDATE = "cand@example.com"
ADMIN = "admin@openhouse.in"
SUB_ID = "9f1c0a3e-0000-4000-8000-000000000001"

SCORES = {
    "pitch": {"stars": 4, "reasoning": "x" * 50},
    "tone": {"stars": 3, "reasoning": "x" * 50},
    "company": {"stars": 2, "reasoning": "x" * 50},
    "sales": {"stars": 4, "reasoning": "x" * 50},
    "overall": {"stars": 3, "reasoning": "x" * 50},
    "flags": [],
    "summary": "y" * 30,
}

ROW = {
    "id": SUB_ID,
    "email": CANDIDATE,
    "name": "Cand",
    "audio_key": f"audio/{SUB_ID}.mp3",
    "audio_bytes": 1000,
    "status": "scored",
    "transcript": "hello",
    "metrics": {"wpm": 150},
    "scores": SCORES,
    "created_at": datetime(2026, 8, 27, tzinfo=timezone.utc),
}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(db, "is_admin", lambda e: e == ADMIN)
    monkeypatch.setattr(db, "live_submission", lambda e: (
        {"id": SUB_ID, "status": "scored", "created_at": ROW["created_at"]}
        if e == CANDIDATE else None
    ))
    monkeypatch.setattr(db, "get_status", lambda i: (
        {"id": SUB_ID, "email": CANDIDATE, "status": "scored"} if i == SUB_ID else None
    ))
    monkeypatch.setattr(db, "get_submission", lambda i: dict(ROW) if i == SUB_ID else None)
    monkeypatch.setattr(db, "list_submissions", lambda *a: (1, [dict(ROW)]))
    monkeypatch.setattr(db, "void_submission", lambda i, by: True)
    monkeypatch.setattr(db, "fail_stale", lambda *a: 0)
    monkeypatch.setattr(storage, "presign", lambda k, ttl_s=3600: "https://signed.example/x")
    with TestClient(main.app) as c:
        yield c


def hdr(email, role):
    return {"Authorization": f"Bearer {auth.mint(email, 'N', role)}"}


CAND = lambda: hdr(CANDIDATE, "user")       # noqa: E731
ADM = lambda: hdr(ADMIN, "admin")           # noqa: E731


# ── the invariant ─────────────────────────────────────────────────────────

def test_me_never_leaks_a_score(client):
    body = client.get("/api/me", headers=CAND()).text.lower()
    assert "star" not in body
    assert "score" not in body
    assert "reasoning" not in body


def test_status_never_leaks_a_score(client):
    body = client.get(f"/api/submissions/{SUB_ID}/status", headers=CAND()).text.lower()
    assert "star" not in body and "reasoning" not in body


def test_me_reports_submitted_for_any_live_row(client):
    r = client.get("/api/me", headers=CAND()).json()
    assert r["submission_status"] == "submitted"
    assert r["submission_id"] == SUB_ID


def test_me_reports_pending_when_no_live_row(client):
    r = client.get("/api/me", headers=hdr("nobody@example.com", "user")).json()
    assert r["submission_status"] == "pending"


# ── authorisation ─────────────────────────────────────────────────────────

def test_admin_routes_reject_candidates(client):
    assert client.get("/api/submissions", headers=CAND()).status_code == 403
    assert client.get(f"/api/submissions/{SUB_ID}", headers=CAND()).status_code == 403
    assert client.post(f"/api/submissions/{SUB_ID}/void", headers=CAND()).status_code == 403


def test_admin_routes_accept_admins(client):
    assert client.get("/api/submissions", headers=ADM()).status_code == 200
    assert client.get(f"/api/submissions/{SUB_ID}", headers=ADM()).status_code == 200


def test_everything_needs_a_token(client):
    for path in ("/api/me", "/api/submissions", f"/api/submissions/{SUB_ID}/status"):
        assert client.get(path).status_code == 401, path


def test_a_stranger_gets_404_not_403_on_someone_elses_status(client):
    # A 403 would confirm the id exists.
    r = client.get(f"/api/submissions/{SUB_ID}/status", headers=hdr("other@example.com", "user"))
    assert r.status_code == 404


def test_owner_can_read_their_own_status(client):
    r = client.get(f"/api/submissions/{SUB_ID}/status", headers=CAND())
    assert r.status_code == 200 and r.json()["status"] == "scored"


# ── admin detail ──────────────────────────────────────────────────────────

def test_detail_swaps_the_audio_key_for_a_presigned_url(client):
    r = client.get(f"/api/submissions/{SUB_ID}", headers=ADM()).json()
    assert "audio_key" not in r, "the R2 key must never leave the server"
    assert r["audio_url"].startswith("https://signed.example/")


def test_detail_carries_the_full_scores(client):
    r = client.get(f"/api/submissions/{SUB_ID}", headers=ADM()).json()
    assert r["scores"]["overall"]["stars"] == 3


def test_unknown_id_is_404_for_an_admin(client):
    assert client.get("/api/submissions/does-not-exist", headers=ADM()).status_code == 404


# ── upload validation ─────────────────────────────────────────────────────

def test_upload_rejects_a_non_audio_content_type(client):
    r = client.post(
        "/api/submissions",
        headers=CAND(),
        files={"file": ("x.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert r.status_code == 415


def test_upload_rejects_unreadable_audio(client, monkeypatch):
    # Right content type, garbage bytes: must fail at the probe, before storage.
    calls = []
    monkeypatch.setattr(storage, "put", lambda *a: calls.append(a))
    r = client.post(
        "/api/submissions",
        headers=CAND(),
        files={"file": ("x.mp3", b"not really an mp3", "audio/mpeg")},
    )
    assert r.status_code == 422
    assert calls == [], "nothing may be written to storage before validation passes"
