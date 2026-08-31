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

from app import auth, db, logs, main, storage  # noqa: E402

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

CAND_ID = "11111111-0000-4000-8000-000000000001"

ROW = {
    "id": SUB_ID,
    "assessment_type": "sales_insight",
    "overall_stars": 3,
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
    monkeypatch.setattr(db, "get_oh_user", lambda e: (
        {"id": "22222222-0000-4000-8000-000000000001", "email": ADMIN,
         "name": "Admin", "role": "admin"} if e == ADMIN else None
    ))
    monkeypatch.setattr(db, "upsert_candidate", lambda e, n, is_login=False: (CAND_ID, False))
    monkeypatch.setattr(db, "live_submission", lambda e: (
        {"id": SUB_ID, "status": "scored", "created_at": ROW["created_at"]}
        if e == CANDIDATE else None
    ))
    monkeypatch.setattr(db, "get_status", lambda i: (
        {"id": SUB_ID, "email": CANDIDATE, "status": "scored"} if i == SUB_ID else None
    ))
    monkeypatch.setattr(db, "get_submission", lambda i: dict(ROW) if i == SUB_ID else None)
    monkeypatch.setattr(db, "list_submissions", lambda *a: (1, [dict(ROW)]))
    monkeypatch.setattr(db, "void_submission", lambda i: True)
    monkeypatch.setattr(db, "fail_stale", lambda *a: 0)
    monkeypatch.setattr(storage, "presign", lambda k, ttl_s=3600: "https://signed.example/x")
    AUDIT.clear()
    monkeypatch.setattr(db, "insert_log", lambda **kw: AUDIT.append(kw))
    with TestClient(main.app) as c:
        yield c


AUDIT: list[dict] = []


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


def test_detail_hides_internal_join_keys(client):
    r = client.get(f"/api/submissions/{SUB_ID}", headers=ADM()).json()
    assert "candidate_id" not in r, "internal join key, not an admin-facing field"
    assert "voided_by" not in r, "the raw oh_users id is replaced by voided_by_email"
    assert r["email"] == CANDIDATE, "the candidates join must supply the identity"


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


# ── audit trail ───────────────────────────────────────────────────────────

def test_voiding_writes_an_audit_row_naming_the_actor(client):
    client.post(f"/api/submissions/{SUB_ID}/void", headers=ADM())
    rows = [r for r in AUDIT if r["action"] == logs.SUBMISSION_VOIDED]
    assert len(rows) == 1
    # The submissions table has no oh_users reference, so this row is the ONLY
    # record of who voided it.
    assert rows[0]["actor_email"] == ADMIN
    assert rows[0]["actor_role"] == "admin"
    assert rows[0]["entity_id"] == SUB_ID


def test_a_rejected_upload_is_audited(client):
    client.post("/api/submissions", headers=CAND(),
                files={"file": ("x.pdf", b"%PDF-1.4", "application/pdf")})
    rows = [r for r in AUDIT if r["action"] == logs.SUBMISSION_REJECTED]
    assert len(rows) == 1
    assert rows[0]["data"]["reason"] == "unsupported_type"
    assert rows[0]["data"]["status"] == 415


def test_a_failed_audit_write_does_not_fail_the_action(client, monkeypatch):
    def boom(**kw):
        raise RuntimeError("audit table is on fire")

    monkeypatch.setattr(db, "insert_log", boom)
    # Losing an audit row is bad. Losing the user's action because of it is worse.
    r = client.post(f"/api/submissions/{SUB_ID}/void", headers=ADM())
    assert r.status_code == 200


def test_audit_rows_never_carry_a_score_or_a_transcript(client):
    client.post(f"/api/submissions/{SUB_ID}/void", headers=ADM())
    client.post("/api/submissions", headers=CAND(),
                files={"file": ("x.pdf", b"%PDF-1.4", "application/pdf")})
    blob = repr(AUDIT).lower()
    for leak in ("reasoning", "stars", "transcript"):
        assert leak not in blob, f"audit data must not duplicate a result ({leak})"


def test_read_only_requests_write_no_audit_rows(client):
    client.get("/api/me", headers=CAND())
    client.get("/api/submissions", headers=ADM())
    client.get(f"/api/submissions/{SUB_ID}", headers=ADM())
    assert AUDIT == [], "only mutations are audited"


def test_logs_endpoint_is_admin_only(client, monkeypatch):
    monkeypatch.setattr(db, "list_logs", lambda *a: (0, []))
    monkeypatch.setattr(db, "distinct_log_actions", lambda: [])
    assert client.get("/api/logs", headers=CAND()).status_code == 403
    assert client.get("/api/logs", headers=ADM()).status_code == 200
