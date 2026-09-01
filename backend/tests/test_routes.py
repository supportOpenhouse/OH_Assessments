"""Route-level tests with the database and storage stubbed out.

The invariant these exist to protect: no candidate-facing route can ever return
a score. That is enforced at the serializer, and this is what proves it.
"""

import os
from datetime import datetime, timezone

import pytest

os.environ.setdefault("JWT_SECRET", "t" * 32)  # >= MIN_SECRET_LEN
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
    monkeypatch.setattr(db, "live_submission", lambda e, t="sales_insight": (
        {"id": SUB_ID, "status": "scored", "created_at": ROW["created_at"]}
        if e == CANDIDATE else None
    ))
    monkeypatch.setattr(db, "candidate_profile", lambda e: (
        {"id": CAND_ID, "email": e, "name": "Stored Name", "name_set_by_user": True,
         "first_seen_at": ROW["created_at"], "last_seen_at": ROW["created_at"],
         "login_count": 3, "submission_count": 1 if e == CANDIDATE else 0}
    ))
    monkeypatch.setattr(db, "update_candidate_name",
                        lambda e, n: {"id": CAND_ID, "previous": "Stored Name"})
    monkeypatch.setattr(db, "my_submissions", lambda e: ([
        {"id": SUB_ID, "assessment_type": "sales_insight", "status": "scored",
         "created_at": ROW["created_at"]},
        {"id": "other", "assessment_type": "sales_insight", "status": "failed",
         "created_at": ROW["created_at"]},
    ] if e == CANDIDATE else []))
    monkeypatch.setattr(db, "list_candidates", lambda *a, **k: (1, [{
        "id": CAND_ID, "email": CANDIDATE, "name": "Cand",
        "first_seen_at": ROW["created_at"], "last_seen_at": ROW["created_at"],
        "last_submission_at": ROW["created_at"], "login_count": 3,
        "attempts": 2, "scored": 1, "voided": 0, "assessments": ["sales_insight"],
    }]))
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


def test_me_reports_submission_count_for_routing(client):
    # The client routes on this: >0 lands on history, 0 on the assessment list.
    assert client.get("/api/me", headers=CAND()).json()["submission_count"] == 1
    assert client.get("/api/me", headers=hdr("nobody@example.com", "user")
                      ).json()["submission_count"] == 0


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
    monkeypatch.setattr(db, "log_filter_options",
                        lambda: {"actions": [], "categories": [], "actors": []})
    assert client.get("/api/logs", headers=CAND()).status_code == 403
    assert client.get("/api/logs", headers=ADM()).status_code == 200


def test_log_filters_reach_the_query_in_order(client, monkeypatch):
    seen = {}
    monkeypatch.setattr(db, "list_logs", lambda *a: (seen.update(args=a) or (0, [])))
    monkeypatch.setattr(db, "log_filter_options",
                        lambda: {"actions": [], "categories": [], "actors": []})
    client.get("/api/logs?action=auth.login&actor=a@b.com&category=auth"
               "&q=powai&date_from=2026-08-01&date_to=2026-08-31", headers=ADM())
    a = seen["args"]
    assert a[2] == "auth.login"      # action
    assert a[3] == "a@b.com"         # actor
    assert a[5] == "auth"            # category
    assert a[6] == "powai"           # q
    assert a[7] == "2026-08-01"      # date_from
    assert a[8] == "2026-08-31"      # date_to


def test_filter_options_come_from_the_data(client, monkeypatch):
    monkeypatch.setattr(db, "list_logs", lambda *a: (0, []))
    monkeypatch.setattr(db, "log_filter_options", lambda: {
        "actions": ["auth.login", "submission.created"],
        "categories": ["auth", "submission"],
        "actors": ["a@b.com"],
    })
    r = client.get("/api/logs", headers=ADM()).json()
    # Read from the table, never hard-coded, so the bar cannot offer a verb that
    # has never been recorded or miss one that has.
    assert r["categories"] == ["auth", "submission"]
    assert r["actors"] == ["a@b.com"]


# ── assessments and history ───────────────────────────────────────────────

def test_assessment_list_reports_state_never_a_score(client):
    body = client.get("/api/assessments", headers=CAND())
    assert body.status_code == 200
    item = body.json()["items"][0]
    assert item["key"] == "sales_insight"
    assert item["state"] == "submitted"
    for leak in ("star", "score", "overall", "reasoning"):
        assert leak not in body.text.lower()


def test_a_candidate_with_no_attempt_sees_the_assessment_as_available(client):
    r = client.get("/api/assessments", headers=hdr("nobody@example.com", "user")).json()
    assert r["items"][0]["state"] == "available"
    assert r["items"][0]["submission_id"] is None


def test_history_collapses_failed_into_submitted(client):
    """The candidate never learns a run errored. Both fixtures — one scored, one
    failed — must read identically."""
    items = client.get("/api/my/submissions", headers=CAND()).json()["items"]
    assert [i["state"] for i in items] == ["submitted", "submitted"]


def test_history_never_leaks_a_score(client):
    body = client.get("/api/my/submissions", headers=CAND()).text.lower()
    for leak in ("star", "score", "reasoning", "transcript", "failed"):
        assert leak not in body


# ── admin: candidates ─────────────────────────────────────────────────────

def test_candidates_is_admin_only(client):
    assert client.get("/api/candidates", headers=CAND()).status_code == 403
    assert client.get("/api/candidates", headers=ADM()).status_code == 200


def test_candidates_reports_attempts_and_which_assessments(client):
    item = client.get("/api/candidates", headers=ADM()).json()["items"][0]
    assert item["attempts"] == 2
    assert item["login_count"] == 3
    assert item["assessments"] == [{"key": "sales_insight", "name": "Sales (Insight)"}]


def test_submission_filters_are_all_optional(client, monkeypatch):
    seen = {}
    monkeypatch.setattr(db, "list_submissions",
                        lambda *a: (seen.update(args=a) or (0, [])))
    client.get("/api/submissions?status=scored&q=asha&stars=3", headers=ADM())
    assert seen["args"][2] == "scored"
    assert seen["args"][4] == "asha"
    assert seen["args"][5] == 3


# ── privilege comes from the database, not the token ──────────────────────

def test_a_stale_admin_token_does_not_grant_admin(client):
    """Removing someone from oh_users (or is_active = false) must take effect
    immediately, not whenever their 7-day token happens to expire."""
    stale = hdr("ex-admin@openhouse.in", "admin")   # claim says admin
    assert client.get("/api/submissions", headers=stale).status_code == 403
    assert client.get("/api/candidates", headers=stale).status_code == 403
    assert client.get("/api/logs", headers=stale).status_code == 403


def test_a_promoted_user_gets_admin_without_signing_in_again(client):
    """The mirror case: adding someone to oh_users takes effect on their next
    request, not on their next sign-in."""
    downgraded = hdr(ADMIN, "user")                 # claim says user
    assert client.get("/api/submissions", headers=downgraded).status_code == 200


def test_me_reports_the_live_role_not_the_claim(client):
    assert client.get("/api/me", headers=hdr(ADMIN, "user")).json()["role"] == "admin"
    assert client.get("/api/me", headers=hdr(CANDIDATE, "admin")).json()["role"] == "user"


# ── staff are not candidates ──────────────────────────────────────────────

def test_me_prefers_the_stored_name_over_the_token_claim(client):
    """The claim is a snapshot of the Google profile at sign-in. A rename has to
    show immediately, not after the next login."""
    r = client.get("/api/me", headers=hdr(CANDIDATE, "user")).json()
    assert r["name"] == "Stored Name"
    assert r["name_set_by_user"] is True


def test_a_name_can_be_changed(client):
    r = client.patch("/api/me", headers=CAND(), json={"name": "Asha R"})
    assert r.status_code == 200


def test_a_rename_is_audited_with_both_values(client):
    client.patch("/api/me", headers=CAND(), json={"name": "Asha R"})
    rows = [x for x in AUDIT if x["action"] == logs.CANDIDATE_RENAMED]
    assert len(rows) == 1
    assert rows[0]["data"] == {"from": "Stored Name", "to": "Asha R"}


def test_renaming_to_the_same_value_is_not_audited(client):
    client.patch("/api/me", headers=CAND(), json={"name": "Stored Name"})
    assert [x for x in AUDIT if x["action"] == logs.CANDIDATE_RENAMED] == []


def test_blank_and_whitespace_only_names_are_refused(client):
    for bad in ("", "   ", "\t\n  "):
        assert client.patch("/api/me", headers=CAND(), json={"name": bad}).status_code == 422


def test_a_missing_or_non_string_name_is_refused(client):
    assert client.patch("/api/me", headers=CAND(), json={}).status_code == 422
    assert client.patch("/api/me", headers=CAND(), json={"name": 42}).status_code == 422


def test_an_overlong_name_is_refused(client):
    assert client.patch("/api/me", headers=CAND(),
                        json={"name": "x" * 81}).status_code == 422


def test_control_characters_and_whitespace_runs_are_stripped(client, monkeypatch):
    """A name is rendered into an admin table cell. Newlines and bidi overrides
    are invisible in the form and wreck the row they land in."""
    seen = {}
    monkeypatch.setattr(db, "update_candidate_name",
                        lambda e, n: (seen.update(name=n) or {"id": CAND_ID, "previous": "x"}))
    client.patch("/api/me", headers=CAND(),
                 json={"name": "  Asha\n\tRamesh\u202e  "})
    assert seen["name"] == "Asha Ramesh"


def test_renaming_needs_authentication(client):
    assert client.patch("/api/me", json={"name": "Nobody"}).status_code == 401


# ── staff and applicants are separate populations ─────────────────────────

def _google(monkeypatch, email, name="Someone"):
    monkeypatch.setattr(auth, "verify_google", lambda t: {"email": email, "name": name})


def test_openhouse_email_not_in_oh_users_is_refused(client, monkeypatch):
    """A colleague signing in by accident is told so, not quietly turned into a
    candidate in the hiring team's own list."""
    _google(monkeypatch, "nobody@openhouse.in")
    r = client.post("/api/auth/google", json={"id_token": "x"})
    assert r.status_code == 403
    assert r.json()["detail"] == (
        "credentials not created, use non openhouse email and log in as candidate"
    )


def test_a_refused_openhouse_login_creates_no_candidate_row(client, monkeypatch):
    seen = []
    monkeypatch.setattr(db, "upsert_candidate",
                        lambda *a, **k: seen.append(a) or (CAND_ID, False))
    _google(monkeypatch, "nobody@openhouse.in")
    client.post("/api/auth/google", json={"id_token": "x"})
    assert seen == [], "a refused sign-in must not touch candidates"


def test_a_refusal_is_audited(client, monkeypatch):
    _google(monkeypatch, "nobody@openhouse.in")
    client.post("/api/auth/google", json={"id_token": "x"})
    rows = [r for r in AUDIT if r["action"] == logs.LOGIN_REFUSED]
    assert len(rows) == 1
    assert rows[0]["actor_email"] == "nobody@openhouse.in"


def test_staff_sign_in_and_get_no_candidate_row(client, monkeypatch):
    seen = []
    monkeypatch.setattr(db, "upsert_candidate",
                        lambda *a, **k: seen.append(a) or (CAND_ID, False))
    _google(monkeypatch, ADMIN, "Admin")
    r = client.post("/api/auth/google", json={"id_token": "x"})
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "admin"
    assert seen == [], "staff are not applicants and get no candidates row"


def test_a_non_openhouse_email_still_becomes_a_candidate(client, monkeypatch):
    seen = []
    monkeypatch.setattr(db, "upsert_candidate",
                        lambda *a, **k: seen.append(a) or (CAND_ID, True))
    _google(monkeypatch, "someone@gmail.com", "Someone")
    r = client.post("/api/auth/google", json={"id_token": "x"})
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "user"
    assert len(seen) == 1


def test_a_non_openhouse_email_in_oh_users_is_still_staff(client, monkeypatch):
    """Membership decides, not the domain — a contractor on a personal address
    can be staff."""
    monkeypatch.setattr(db, "get_oh_user", lambda e: (
        {"id": "x", "email": e, "name": "Contractor", "role": "admin"}
        if e == "contractor@gmail.com" else None))
    _google(monkeypatch, "contractor@gmail.com")
    assert client.post("/api/auth/google", json={"id_token": "x"}).json()["user"]["role"] == "admin"


def test_staff_cannot_submit_an_assessment(client):
    r = client.post("/api/submissions", headers=ADM(),
                    files={"file": ("x.mp3", b"\x00" * 32, "audio/mpeg")})
    assert r.status_code == 403
    assert "cannot take assessments" in r.json()["detail"]


# ── the session is a cookie, not a body token ─────────────────────────────

def test_login_sets_an_httponly_session_cookie(client, monkeypatch):
    _google(monkeypatch, "someone@gmail.com")
    monkeypatch.setattr(db, "upsert_candidate", lambda *a, **k: (CAND_ID, False))
    r = client.post("/api/auth/google", json={"id_token": "x"})
    assert r.status_code == 200
    raw = r.headers.get("set-cookie", "")
    assert auth.COOKIE_NAME in raw
    assert "HttpOnly" in raw, "a readable session cookie is the thing we moved away from"
    assert "SameSite=lax" in raw or "samesite=lax" in raw.lower(), "CSRF defence"
    assert f"Max-Age={auth.TTL_S}" in raw, "must outlive the tab — 7 days"


def test_login_does_not_return_the_token_in_the_body(client, monkeypatch):
    """If the body carried it, the client would store it and we would be back to
    a token any script can read."""
    _google(monkeypatch, "someone@gmail.com")
    monkeypatch.setattr(db, "upsert_candidate", lambda *a, **k: (CAND_ID, False))
    body = client.post("/api/auth/google", json={"id_token": "x"}).json()
    assert "token" not in body
    assert body["user"]["email"] == "someone@gmail.com"


def test_the_cookie_alone_authenticates(client):
    client.cookies.set(auth.COOKIE_NAME, auth.mint(CANDIDATE, "C", "user"))
    try:
        r = client.get("/api/me")
        assert r.status_code == 200
        assert r.json()["email"] == CANDIDATE
    finally:
        client.cookies.clear()


def test_logout_clears_the_cookie(client):
    r = client.post("/api/auth/logout")
    assert r.status_code == 200
    raw = r.headers.get("set-cookie", "")
    assert auth.COOKIE_NAME in raw
    assert 'Max-Age=0' in raw or 'expires=Thu, 01 Jan 1970' in raw.lower()


def test_a_tampered_cookie_is_refused(client):
    tok = auth.mint(CANDIDATE, "C", "user")
    client.cookies.set(auth.COOKIE_NAME, tok[:-4] + "AAAA")
    try:
        assert client.get("/api/me").status_code == 401
    finally:
        client.cookies.clear()


def test_no_cookie_and_no_header_is_401(client):
    assert client.get("/api/me").status_code == 401
