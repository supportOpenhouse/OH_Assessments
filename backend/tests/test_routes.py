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
os.environ.setdefault("R2_AUDIO_BUCKET", "test")

from fastapi.testclient import TestClient  # noqa: E402

from app import auth, db, logs, main, storage, tasks  # noqa: E402

CANDIDATE = "cand@example.com"
ADMIN = "admin@openhouse.in"
INTERNAL = "internal@openhouse.in"
SUB_ID = "9f1c0a3e-0000-4000-8000-000000000001"

SCORES = {
    "energy": {"stars": 4, "reasoning": "x" * 50},
    "vocabulary": {"stars": 3, "reasoning": "x" * 50},
    "rebuttals": {"stars": 2, "reasoning": "x" * 50},
    "clarity": {"stars": 4, "reasoning": "x" * 50},
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
    staff = {
        ADMIN: {"id": "22222222-0000-4000-8000-000000000001", "email": ADMIN,
                "name": "Admin", "role": "admin"},
        INTERNAL: {"id": "22222222-0000-4000-8000-000000000002", "email": INTERNAL,
                   "name": "Internal", "role": "internal"},
    }
    monkeypatch.setattr(db, "get_oh_user", lambda e: staff.get(e))
    monkeypatch.setattr(db, "upsert_candidate", lambda e, n, is_login=False: (CAND_ID, False))
    monkeypatch.setattr(db, "live_submission", lambda e, t="sales_insight": (
        {"id": SUB_ID, "status": "scored", "created_at": ROW["created_at"]}
        if e == CANDIDATE else None
    ))
    monkeypatch.setattr(db, "candidate_profile", lambda e: (
        {"id": CAND_ID, "email": e, "name": "Stored Name", "name_set_by_user": True,
         "first_seen_at": ROW["created_at"], "last_seen_at": ROW["created_at"],
         "login_count": 3, "submission_count": 1 if e == CANDIDATE else 0,
         # Complete details, so every existing upload test passes the gate.
         "phone": "+919876543210", "resume_key": "resumes/c/r.pdf",
         "resume_uploaded_at": ROW["created_at"]}
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
    # Nothing in this suite may reach the real scoring pipeline or the real DB.
    SCHEDULED.clear(); PROCESSED.clear()
    monkeypatch.setattr(db, "set_processing", lambda i: PROCESSED.append(i))
    monkeypatch.setattr(tasks, "score_submission", lambda i: SCHEDULED.append(i))
    monkeypatch.setattr(storage, "presign", lambda k, ttl_s=3600: "https://signed.example/x")
    AUDIT.clear()
    monkeypatch.setattr(db, "insert_log", lambda **kw: AUDIT.append(kw))
    with TestClient(main.app) as c:
        yield c


AUDIT: list[dict] = []
SCHEDULED: list[str] = []
PROCESSED: list[str] = []


def hdr(email, role):
    return {"Authorization": f"Bearer {auth.mint(email, 'N', role)}"}


CAND = lambda: hdr(CANDIDATE, "user")       # noqa: E731
ADM = lambda: hdr(ADMIN, "admin")           # noqa: E731
INT = lambda: hdr(INTERNAL, "internal")     # noqa: E731


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



def _upload_of(client, monkeypatch, seconds):
    """An upload whose probed length is `seconds`, with storage and the DB stubbed
    so a file that passes validation runs all the way to the 202."""
    class Info:
        length = seconds
    class Probe:
        info = Info()
    monkeypatch.setattr(main, "MutagenFile", lambda f: Probe())
    monkeypatch.setattr(storage, "put", lambda *a: None)
    monkeypatch.setattr(db, "create_submission", lambda *a, **k: None)
    return client.post("/api/submissions", headers=CAND(),
                       files={"file": ("call.mp3", b"ID3fake", "audio/mpeg")})


def test_a_call_over_the_advertised_5_minutes_is_still_accepted(client, monkeypatch):
    """Told 5 minutes, allowed 7: a call that ran a little over is not worth
    rejecting after the candidate has already made it."""
    r = _upload_of(client, monkeypatch, 6 * 60 + 30)
    assert r.status_code == 202, r.text


def test_the_hard_limit_is_7_minutes(client, monkeypatch):
    assert _upload_of(client, monkeypatch, 7 * 60).status_code == 202
    r = _upload_of(client, monkeypatch, 7 * 60 + 1)
    assert r.status_code == 422


def test_the_rejection_states_the_advertised_limit_not_the_real_one(client, monkeypatch):
    """The message is shown to the candidate. It must say 5, never 7 — the
    buffer is not something to advertise."""
    detail = _upload_of(client, monkeypatch, 9 * 60).json()["detail"]
    assert "5 minutes" in detail
    assert "7" not in detail

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
    client.post(f"/api/submissions/{SUB_ID}/rescore", headers=ADM())
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
    assert item["assessments"] == [{"key": "sales_insight", "name": "Sales (Inside)"}]


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
    # 401, not 403: an @openhouse.in address with no active oh_users row has NO
    # account, so the session is refused outright — a 403 meant it was still
    # accepted as a candidate's, able to upload a resume and grow a candidates row.
    for path in ("/api/submissions", "/api/candidates", "/api/logs", "/api/me"):
        assert client.get(path, headers=stale).status_code == 401, path
    r = client.post("/api/me/resume", headers=stale,
                    files={"file": ("cv.pdf", b"%PDF-1.4", "application/pdf")})
    assert r.status_code == 401


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


# ── re-score ──────────────────────────────────────────────────────────────

def _row(status="scored", **over):
    return {**ROW, "status": status, **over}


def test_rescore_is_admin_only(client):
    r = client.post(f"/api/submissions/{SUB_ID}/rescore", headers=CAND())
    assert r.status_code == 403
    assert SCHEDULED == [], "a candidate must not be able to spend a scoring run"


def test_rescore_404s_on_an_unknown_id(client):
    r = client.post("/api/submissions/does-not-exist/rescore", headers=ADM())
    assert r.status_code == 404


def test_rescore_reruns_the_same_pipeline_and_marks_it_processing(client):
    r = client.post(f"/api/submissions/{SUB_ID}/rescore", headers=ADM())
    assert r.status_code == 202
    assert r.json()["status"] == "processing"
    # The status flips before the response, so the dashboard's next poll already
    # shows the re-run rather than the stale score.
    assert PROCESSED == [SUB_ID]
    # Scheduled through the SAME background task the upload uses — one scoring
    # path, so a re-run cannot drift from an original run.
    assert SCHEDULED == [SUB_ID]


def test_rescore_refuses_a_voided_submission(client, monkeypatch):
    monkeypatch.setattr(db, "get_submission", lambda i: _row("voided"))
    r = client.post(f"/api/submissions/{SUB_ID}/rescore", headers=ADM())
    assert r.status_code == 409
    assert SCHEDULED == []


def test_rescore_refuses_a_run_already_in_flight(client, monkeypatch):
    for status in ("queued", "processing"):
        monkeypatch.setattr(db, "get_submission", lambda i, s=status: _row(s))
        r = client.post(f"/api/submissions/{SUB_ID}/rescore", headers=ADM())
        # Two concurrent runs would race on the same child row.
        assert r.status_code == 409, status
    assert SCHEDULED == []


def test_rescore_refuses_when_there_is_no_audio(client, monkeypatch):
    monkeypatch.setattr(db, "get_submission", lambda i: _row(audio_key=None))
    r = client.post(f"/api/submissions/{SUB_ID}/rescore", headers=ADM())
    assert r.status_code == 422
    assert SCHEDULED == []


def test_rescore_writes_an_audit_row_naming_the_actor(client):
    client.post(f"/api/submissions/{SUB_ID}/rescore", headers=ADM())
    rows = [r for r in AUDIT if r["action"] == logs.SUBMISSION_RESCORED]
    assert len(rows) == 1
    # A re-run overwrites the previous result in place, so this row is the only
    # evidence that an earlier score ever existed, or who discarded it.
    assert rows[0]["actor_email"] == ADMIN
    assert rows[0]["actor_role"] == "admin"
    assert rows[0]["entity_id"] == SUB_ID
    assert rows[0]["data"]["previous_status"] == "scored"


def test_a_refused_rescore_is_not_audited_as_one(client, monkeypatch):
    monkeypatch.setattr(db, "get_submission", lambda i: _row("voided"))
    client.post(f"/api/submissions/{SUB_ID}/rescore", headers=ADM())
    assert [r for r in AUDIT if r["action"] == logs.SUBMISSION_RESCORED] == []


# ── call notes ────────────────────────────────────────────────────────────
# The candidate logs the seller's details and what they took away, and submits
# that with the audio. It is stored and shown to admins; it never reaches the
# scoring model.

def _wav() -> bytes:
    """A real 0.1s silent WAV. The upload route runs mutagen over the bytes, so
    a fake payload is rejected at validation and never reaches the DB layer —
    which is the layer these tests are about."""
    import io
    import wave
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(8000)
        w.writeframes(b"\x00\x00" * 800)
    return buf.getvalue()


def _upload(client, monkeypatch, notes=None):
    monkeypatch.setattr(storage, "put", lambda *a, **k: None)
    monkeypatch.setattr(storage, "delete", lambda *a, **k: None)
    data = {"notes": notes} if notes is not None else None
    return client.post("/api/submissions", headers=CAND(),
                       files={"file": ("call.wav", _wav(), "audio/wav")},
                       data=data)


def test_notes_are_stored_with_the_submission(client, monkeypatch):
    seen = {}

    def fake_create(sub_id, cand, key, ctype, size, notes=None):
        seen["notes"] = notes
        return sub_id

    monkeypatch.setattr(db, "create_submission", fake_create)
    r = _upload(client, monkeypatch, notes="Sector 45 Gurugram · Mr Rao · 1.2cr")
    assert r.status_code == 202, r.text
    assert seen["notes"] == "Sector 45 Gurugram · Mr Rao · 1.2cr"


def test_no_notes_stores_null_rather_than_an_empty_string(client, monkeypatch):
    seen = {}

    def fake_create(sub_id, cand, key, ctype, size, notes=None):
        seen["notes"] = notes
        return sub_id

    monkeypatch.setattr(db, "create_submission", fake_create)
    assert _upload(client, monkeypatch).status_code == 202
    assert seen["notes"] is None


def test_overlong_notes_are_rejected(client, monkeypatch):
    r = _upload(client, monkeypatch, notes="x" * 4001)
    assert r.status_code == 422
    assert "notes" in r.json()["detail"]


def test_notes_never_reach_the_scoring_prompt(client, monkeypatch):
    """The rubric scores the CALL. Feeding the candidate's own write-up to the
    judge would score the claim instead of the conversation, and hands an
    applicant a direct line into the model's input."""
    import inspect

    from app import scoring
    src = inspect.getsource(scoring)
    assert "notes" not in src, "scoring.py must not read the candidate's notes"


# ── the sliding session ───────────────────────────────────────────────────
#
# The 7 days is an IDLE timeout, not an absolute one. Before this, the window
# started at sign-in and never extended, so an admin using the tool daily was
# still signed out every seventh day.

def _renewed(response):
    """The token in this response's Set-Cookie, or None if it did not renew."""
    raw = response.headers.get("set-cookie", "")
    if auth.COOKIE_NAME not in raw:
        return None
    tok = raw.split(f"{auth.COOKIE_NAME}=", 1)[1].split(";", 1)[0]
    return auth.verify(tok)


def test_a_fresh_session_is_not_re_minted_on_every_request(client):
    """A Set-Cookie on every response is noise, and re-signing a token with six
    days left buys nothing."""
    client.cookies.set(auth.COOKIE_NAME, auth.mint(CANDIDATE, "C", "user"))
    try:
        r = client.get("/api/me")
        assert r.status_code == 200
        assert _renewed(r) is None
    finally:
        client.cookies.clear()


def test_a_session_past_halfway_slides(client):
    old = auth.mint(CANDIDATE, "C", "user", ttl_s=60)   # nearly expired
    before = auth.verify(old)
    client.cookies.set(auth.COOKIE_NAME, old)
    try:
        r = client.get("/api/me")
        assert r.status_code == 200
        fresh = _renewed(r)
        assert fresh is not None, "an old session must be re-issued, not left to expire"
        assert fresh["exp"] > before["exp"]
        # A renewal continues the SAME session — a new jti would break the
        # thread between the sign-in audit row and everything that followed.
        assert fresh["jti"] == before["jti"]
    finally:
        client.cookies.clear()


def test_a_renewal_carries_the_CURRENT_role_not_the_old_claim(client):
    """Privilege comes from oh_users on every request. Sliding the window must
    not launder a revoked admin claim into another seven days of access.

    The token claims admin for an address the fixture's oh_users has no row for
    — the shape of someone removed from the team while still holding a cookie.
    """
    stale = auth.mint(CANDIDATE, "C", "admin", ttl_s=60)
    client.cookies.set(auth.COOKIE_NAME, stale)
    try:
        r = client.get("/api/me")
        assert r.status_code == 200
        assert r.json()["role"] == "user"
        assert _renewed(r)["role"] == "user", "a renewal re-signed the revoked claim"
        # and the revocation actually bites
        assert client.get("/api/submissions").status_code == 403
    finally:
        client.cookies.clear()


def test_a_header_session_is_never_handed_a_cookie(client):
    """curl and the tests hold their own token and have nowhere to put a new
    one, so a Set-Cookie there is a header nobody reads."""
    h = {"Authorization": f"Bearer {auth.mint(CANDIDATE, 'C', 'user', ttl_s=60)}"}
    r = client.get("/api/me", headers=h)
    assert r.status_code == 200
    assert _renewed(r) is None


def test_seven_days_idle_still_signs_you_out(client):
    """Sliding must not become immortal: a window that has actually elapsed is
    refused rather than renewed."""
    dead = auth.mint(CANDIDATE, "C", "user", ttl_s=-1)
    client.cookies.set(auth.COOKIE_NAME, dead)
    try:
        r = client.get("/api/me")
        assert r.status_code == 401
        assert _renewed(r) is None, "an expired session must not be re-issued"
    finally:
        client.cookies.clear()


# ── the `internal` staff role ─────────────────────────────────────────────
# Everything staff-facing, EXCEPT the activity log (user, 2026-09-22).

STAFF_SURFACES = [
    ("get", "/api/submissions"),
    ("get", "/api/candidates"),
    ("get", f"/api/submissions/{SUB_ID}"),
    ("get", f"/api/submissions/{SUB_ID}/status"),
    ("post", f"/api/submissions/{SUB_ID}/void"),
    ("post", f"/api/submissions/{SUB_ID}/rescore"),
]


@pytest.mark.parametrize("method,path", STAFF_SURFACES)
def test_internal_reaches_every_staff_surface(client, method, path):
    r = getattr(client, method)(path, headers=INT())
    assert r.status_code < 400, f"{method.upper()} {path} → {r.status_code} {r.text}"


def test_internal_is_refused_the_activity_log(client, monkeypatch):
    """The one admin-only surface. It names every candidate who ever signed in.
    The admin 200 is the control: it proves the 403 is the ROLE, not a route
    that is broken for everybody."""
    monkeypatch.setattr(db, "list_logs", lambda *a, **k: (0, []))
    monkeypatch.setattr(db, "log_filter_options",
                        lambda: {"actions": [], "categories": [], "actors": [], "entities": []})
    assert client.get("/api/logs", headers=INT()).status_code == 403
    assert client.get("/api/logs", headers=ADM()).status_code == 200


def test_internal_is_staff_so_cannot_take_an_assessment(client):
    r = client.post("/api/submissions", headers=INT(),
                    files={"file": ("call.mp3", b"ID3", "audio/mpeg")})
    assert r.status_code == 403


def test_me_reports_the_internal_role(client):
    assert client.get("/api/me", headers=INT()).json()["role"] == "internal"


def test_claiming_internal_in_a_token_grants_nothing(client):
    """Role comes from oh_users on every request, never from the claim — a token
    that SAYS internal for an address not in oh_users is just a candidate."""
    forged = hdr("someone@gmail.com", "internal")
    assert client.get("/api/submissions", headers=forged).status_code == 403
    assert client.get("/api/me", headers=forged).json()["role"] == "user"


# ── candidate details: phone + resume ─────────────────────────────────────
# Required before an assessment. The first resume is read by Claude on its own;
# every later read is a staff decision (user, 2026-09-22).

PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n"


@pytest.mark.parametrize("typed", [
    "9876543210", "+91 98765 43210", "+919876543210", "91-9876543210",
    "09876543210", "(987) 654-3210",
])
def test_indian_mobiles_are_accepted_and_normalised(client, monkeypatch, typed):
    seen = {}
    monkeypatch.setattr(db, "update_candidate_phone",
                        lambda e, p: (seen.update(p=p) or {"id": CAND_ID, "previous": None}))
    assert client.patch("/api/me", headers=CAND(), json={"phone": typed}).status_code == 200
    assert seen["p"] == "+919876543210"


@pytest.mark.parametrize("typed", [
    "", "12345", "5876543210", "98765432101", "+1 415 555 0100", "98765 4321x", 9876543210,
])
def test_anything_else_is_refused_and_nothing_is_written(client, monkeypatch, typed):
    calls = []
    monkeypatch.setattr(db, "update_candidate_phone", lambda *a: calls.append(a))
    assert client.patch("/api/me", headers=CAND(), json={"phone": typed}).status_code == 422
    assert calls == []


def test_a_bad_phone_does_not_leave_a_half_applied_rename(client, monkeypatch):
    calls = []
    monkeypatch.setattr(db, "update_candidate_name", lambda *a: calls.append(a))
    r = client.patch("/api/me", headers=CAND(), json={"name": "New Name", "phone": "123"})
    assert r.status_code == 422
    assert calls == [], "validate both fields before writing either"


def test_a_phone_change_is_audited_without_the_number(client, monkeypatch):
    monkeypatch.setattr(db, "update_candidate_phone",
                        lambda e, p: {"id": CAND_ID, "previous": "+919000000000"})
    client.patch("/api/me", headers=CAND(), json={"phone": "9876543210"})
    rows = [r for r in AUDIT if r["action"] == logs.CANDIDATE_PHONE_SET]
    assert len(rows) == 1
    blob = repr(AUDIT)
    assert "9876543210" not in blob and "9000000000" not in blob


def test_me_reports_details_but_never_the_resume_key(client):
    body = client.get("/api/me", headers=CAND()).json()
    assert body["details_complete"] is True
    assert body["has_resume"] is True
    assert body["phone"] == "+919876543210"
    assert "resumes/" not in repr(body) and "resume_key" not in body
    assert "insight" not in repr(body).lower()


def test_an_assessment_is_refused_until_details_are_complete(client, monkeypatch):
    """The client routes to /candidate-info; this is what holds when someone
    skips that page by URL or by calling the API directly."""
    base = db.candidate_profile(CANDIDATE)
    written = []
    monkeypatch.setattr(storage, "put", lambda *a, **k: written.append(a))
    for missing in ("phone", "resume_key"):
        monkeypatch.setattr(db, "candidate_profile", lambda e, m=missing: {**base, m: None})
        r = client.post("/api/submissions", headers=CAND(),
                        files={"file": ("call.mp3", b"ID3", "audio/mpeg")})
        assert r.status_code == 403, missing
        assert "phone number and resume" in r.json()["detail"]
    assert written == []


def _resume(client, monkeypatch, *, data=PDF, ctype="application/pdf",
            previous_key=None, claimed=True):
    puts, deletes, set_calls = [], [], []
    monkeypatch.setattr(storage, "put", lambda *a, **k: puts.append((a, k)))
    monkeypatch.setattr(storage, "delete", lambda *a, **k: deletes.append((a, k)))
    monkeypatch.setattr(db, "set_resume", lambda e, key: (
        set_calls.append(key) or
        {"id": CAND_ID, "previous_key": previous_key, "claimed": claimed}))
    scheduled = []
    monkeypatch.setattr(tasks, "extract_resume", lambda cid: scheduled.append(cid))
    r = client.post("/api/me/resume", headers=CAND(),
                    files={"file": ("cv.pdf", data, ctype)})
    return r, puts, deletes, set_calls, scheduled


def test_the_first_resume_is_stored_privately_and_read_automatically(client, monkeypatch):
    r, puts, deletes, set_calls, scheduled = _resume(client, monkeypatch)
    assert r.status_code == 200, r.text
    (key, _, ctype), kw = puts[0]
    assert key.startswith(f"resumes/{CAND_ID}/") and key.endswith(".pdf")
    assert kw == {"bucket": storage.RESUME}, "resumes go to their own bucket"
    assert set_calls == [key]
    assert scheduled == [CAND_ID]
    assert deletes == []


def test_a_replacement_is_stored_but_NOT_re_read(client, monkeypatch):
    """Insights change only when staff ask."""
    r, puts, deletes, _, scheduled = _resume(
        client, monkeypatch, previous_key="resumes/c/old.pdf", claimed=False)
    assert r.status_code == 200
    assert scheduled == []
    assert deletes == [(("resumes/c/old.pdf",), {"bucket": storage.RESUME})]
    row = [x for x in AUDIT if x["action"] == logs.RESUME_UPLOADED][0]
    assert row["data"]["replaced"] is True and row["data"]["read_scheduled"] is False


@pytest.mark.parametrize("data,ctype,code", [
    (PDF, "application/msword", 415),
    (b"PK\x03\x04 a docx renamed to .pdf", "application/pdf", 422),
    (PDF + b"x" * (5 * 1024 * 1024), "application/pdf", 413),
])
def test_a_bad_resume_is_refused_before_anything_is_written(client, monkeypatch, data, ctype, code):
    r, puts, _, set_calls, scheduled = _resume(client, monkeypatch, data=data, ctype=ctype)
    assert r.status_code == code
    assert puts == [] and set_calls == [] and scheduled == []
    assert [x for x in AUDIT if x["action"] == logs.RESUME_REJECTED]


def test_staff_have_no_resume_to_upload(client, monkeypatch):
    _resume(client, monkeypatch)
    r = client.post("/api/me/resume", headers=INT(),
                    files={"file": ("cv.pdf", PDF, "application/pdf")})
    assert r.status_code == 403


# ── the staff candidate page ──────────────────────────────────────────────

CANDIDATE_ROW = {
    "id": CAND_ID, "email": CANDIDATE, "name": "Cand", "phone": "+919876543210",
    "first_seen_at": ROW["created_at"], "last_seen_at": ROW["created_at"],
    "login_count": 3, "resume_key": "resumes/c/r.pdf",
    "resume_uploaded_at": ROW["created_at"], "resume_status": "ready",
    "resume_error": None, "resume_insights": {"summary": "x"},
    "resume_model": "claude-opus-5", "resume_extracted_at": ROW["created_at"],
    "resume_changed": True,
}


@pytest.fixture
def staff_candidate(monkeypatch):
    monkeypatch.setattr(db, "get_candidate",
                        lambda cid: dict(CANDIDATE_ROW) if cid == CAND_ID else None)
    monkeypatch.setattr(db, "candidate_submissions", lambda cid: [
        {"id": SUB_ID, "assessment_type": "sales_insight", "status": "scored",
         "overall": 3.4, "duration_s": 150, "created_at": ROW["created_at"]}])
    signed = []
    monkeypatch.setattr(storage, "presign",
                        lambda k, ttl_s=3600, bucket=storage.AUDIO:
                        signed.append(bucket) or "https://signed.example/cv")
    claims, scheduled = [], []
    monkeypatch.setattr(db, "claim_resume_read",
                        lambda cid: claims.append(cid) or {"id": cid, "resume_key": "k"})
    monkeypatch.setattr(tasks, "extract_resume", lambda cid: scheduled.append(cid))
    return {"signed": signed, "claims": claims, "scheduled": scheduled}


def test_staff_see_the_whole_candidate_but_never_the_key(client, staff_candidate):
    for h in (ADM(), INT()):
        r = client.get(f"/api/candidates/{CAND_ID}", headers=h)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["resume_url"] == "https://signed.example/cv"
        assert body["resume_changed"] is True
        assert body["submissions"][0]["assessment_name"]
        assert "resume_key" not in body and "resumes/" not in r.text
    assert staff_candidate["signed"] == [storage.RESUME, storage.RESUME]


def test_a_candidate_cannot_open_the_staff_candidate_page(client, staff_candidate):
    assert client.get(f"/api/candidates/{CAND_ID}", headers=CAND()).status_code == 403
    assert client.post(f"/api/candidates/{CAND_ID}/resume/reevaluate",
                       headers=CAND()).status_code == 403


def test_a_malformed_candidate_id_is_a_404_not_a_500(client, staff_candidate):
    assert client.get("/api/candidates/not-a-uuid", headers=ADM()).status_code == 404


def test_reevaluating_claims_audits_then_schedules(client, staff_candidate):
    r = client.post(f"/api/candidates/{CAND_ID}/resume/reevaluate", headers=INT())
    assert r.status_code == 202
    assert staff_candidate["claims"] == [CAND_ID]
    assert staff_candidate["scheduled"] == [CAND_ID]
    row = [x for x in AUDIT if x["action"] == logs.RESUME_REEVALUATED][0]
    assert row["actor_email"] == INTERNAL and row["data"]["resume_changed"] is True
    assert "summary" not in repr(row), "the old insights are not copied into the log"


def test_a_read_already_in_flight_is_a_409(client, staff_candidate, monkeypatch):
    monkeypatch.setattr(db, "claim_resume_read", lambda cid: None)
    r = client.post(f"/api/candidates/{CAND_ID}/resume/reevaluate", headers=ADM())
    assert r.status_code == 409
    assert staff_candidate["scheduled"] == []


def test_the_read_task_lands_any_failure_as_failed(monkeypatch):
    failed = []
    monkeypatch.setattr(db, "resume_key_of", lambda cid: "resumes/c/r.pdf")
    monkeypatch.setattr(storage, "get", lambda *a, **k: PDF)
    monkeypatch.setattr(main.tasks.resume, "extract",
                        lambda pdf: (_ for _ in ()).throw(RuntimeError("529 overloaded")))
    monkeypatch.setattr(db, "fail_resume", lambda cid, err: failed.append(err))
    monkeypatch.setattr(db, "insert_log", lambda **kw: None)
    main.tasks.extract_resume(CAND_ID)
    assert failed and "529 overloaded" in failed[0]


# ── staff users (admin only) ──────────────────────────────────────────────

OTHER_ID = "22222222-0000-4000-8000-000000000009"


@pytest.fixture
def staff_db(monkeypatch):
    rows = {
        "22222222-0000-4000-8000-000000000001": {"id": "22222222-0000-4000-8000-000000000001",
            "email": ADMIN, "name": "Admin", "role": "admin", "is_active": True,
            "created_at": ROW["created_at"]},
        OTHER_ID: {"id": OTHER_ID, "email": "other@openhouse.in", "name": "Other",
                   "role": "admin", "is_active": True, "created_at": ROW["created_at"]},
    }
    state = {"admins": 2, "created": [], "updated": []}
    monkeypatch.setattr(db, "list_oh_users", lambda: list(rows.values()))
    monkeypatch.setattr(db, "get_oh_user_by_id", lambda i: rows.get(i))
    monkeypatch.setattr(db, "active_admin_count", lambda: state["admins"])

    def create(email, name, role):
        if any(r["email"] == email for r in rows.values()):
            return None
        state["created"].append((email, name, role))
        return {"id": OTHER_ID, "email": email, "name": name, "role": role,
                "is_active": True, "created_at": ROW["created_at"]}
    monkeypatch.setattr(db, "create_oh_user", create)

    def update(i, role, active):
        state["updated"].append((i, role, active))
        r = dict(rows[i])
        if role is not None: r["role"] = role
        if active is not None: r["is_active"] = active
        return r
    monkeypatch.setattr(db, "update_oh_user", update)
    return state


def test_only_an_admin_reaches_the_users_page(client, staff_db):
    for h in (INT(), CAND()):
        assert client.get("/api/users", headers=h).status_code == 403
        assert client.post("/api/users", headers=h,
                           json={"email": "n@openhouse.in", "name": "N", "role": "internal"}).status_code == 403
        assert client.patch(f"/api/users/{OTHER_ID}", headers=h,
                            json={"role": "internal"}).status_code == 403
    assert staff_db["created"] == [] and staff_db["updated"] == []
    body = client.get("/api/users", headers=ADM()).json()
    assert {r["email"] for r in body["items"]} == {ADMIN, "other@openhouse.in"}
    assert body["roles"] == ["admin", "internal"], "reviewer is not offered"


def test_adding_a_user_lowercases_and_audits(client, staff_db):
    r = client.post("/api/users", headers=ADM(),
                    json={"email": "  New.Person@OpenHouse.in ", "name": " New  Person ", "role": "internal"})
    assert r.status_code == 201, r.text
    assert staff_db["created"] == [("new.person@openhouse.in", "New Person", "internal")]
    row = [x for x in AUDIT if x["action"] == logs.STAFF_ADDED][0]
    assert row["actor_email"] == ADMIN and row["data"]["role"] == "internal"


@pytest.mark.parametrize("body,code", [
    ({"email": "someone@gmail.com", "name": "S", "role": "internal"}, 422),
    ({"email": "x@openhouse.in.evil.com", "name": "S", "role": "internal"}, 422),
    ({"email": "@openhouse.in", "name": "S", "role": "internal"}, 422),
    ({"email": "s@openhouse.in", "name": "S", "role": "reviewer"}, 422),
    ({"email": "s@openhouse.in", "name": "   ", "role": "internal"}, 422),
    ({"email": "other@openhouse.in", "name": "Dup", "role": "internal"}, 409),
])
def test_bad_or_duplicate_users_are_refused(client, staff_db, body, code):
    assert client.post("/api/users", headers=ADM(), json=body).status_code == code
    assert staff_db["created"] == []


def test_a_role_change_is_audited_with_both_values(client, staff_db):
    r = client.patch(f"/api/users/{OTHER_ID}", headers=ADM(), json={"role": "internal"})
    assert r.status_code == 200 and r.json()["role"] == "internal"
    row = [x for x in AUDIT if x["action"] == logs.STAFF_ROLE_CHANGED][0]
    assert row["data"] == {"email": "other@openhouse.in", "from": "admin", "to": "internal"}


def test_deactivate_and_reactivate_are_audited(client, staff_db):
    client.patch(f"/api/users/{OTHER_ID}", headers=ADM(), json={"is_active": False})
    assert [x["action"] for x in AUDIT] == [logs.STAFF_DEACTIVATED]
    assert staff_db["updated"] == [(OTHER_ID, None, False)]


def test_an_admin_cannot_change_their_own_access(client, staff_db):
    me_id = "22222222-0000-4000-8000-000000000001"
    for body in ({"role": "internal"}, {"is_active": False}):
        assert client.patch(f"/api/users/{me_id}", headers=ADM(), json=body).status_code == 403
    assert staff_db["updated"] == []


def test_the_last_active_admin_cannot_be_demoted_or_deactivated(client, staff_db):
    staff_db["admins"] = 1
    for body in ({"role": "internal"}, {"is_active": False}):
        assert client.patch(f"/api/users/{OTHER_ID}", headers=ADM(), json=body).status_code == 409
    assert staff_db["updated"] == []


@pytest.mark.parametrize("body", [{}, {"role": "owner"}, {"is_active": "no"}])
def test_a_malformed_edit_is_refused(client, staff_db, body):
    assert client.patch(f"/api/users/{OTHER_ID}", headers=ADM(), json=body).status_code == 422
    assert client.patch("/api/users/not-a-uuid", headers=ADM(), json={"role": "admin"}).status_code == 404
