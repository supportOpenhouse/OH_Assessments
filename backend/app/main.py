"""FastAPI app. Every route in the project.

Every request here is fast — scoring runs in a background task, so no connection
is held open across the slow work. That is what makes the Vercel proxy hop safe.
"""

import hashlib
import io
import logging
import os
import pathlib
import uuid
from contextlib import asynccontextmanager

from fastapi import (
    BackgroundTasks, Depends, FastAPI, File, HTTPException, Request, Response,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from mutagen import File as MutagenFile

from . import assessments, auth, db, logs, scoring, storage, tasks

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

_ROOT = pathlib.Path(__file__).resolve().parent.parent

# Anyone on this domain must be in oh_users to sign in at all.
STAFF_DOMAIN = "@openhouse.in"

MAX_BYTES = 25 * 1024 * 1024
MAX_SECONDS = 600

# Content type -> extension. The browser reports these; anything else is refused
# before a single byte is written anywhere.
ALLOWED = {
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/m4a": ".m4a",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        n = tasks.sweep_stale()
        if n:
            log.warning("startup: failed %s stale submission(s)", n)
    except Exception:
        # A DB hiccup on boot must not stop the service from starting.
        log.exception("startup sweep failed")
    yield


app = FastAPI(title="OpenHouse Sales Assessment", lifespan=lifespan)

# The Vercel rewrite makes the browser same-origin, but the Render URL is
# discoverable. Restrict anyway — the rewrite is a convenience, not a boundary.
_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


# ── public ────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"ok": True}


@app.post("/api/auth/google")
async def google_login(body: dict, request: Request, response: Response):
    token = (body or {}).get("id_token")
    if not token:
        raise HTTPException(401, "missing id_token")
    try:
        info = auth.verify_google(token)
    except auth.AuthError as e:
        raise HTTPException(401, str(e))

    oh = db.get_oh_user(info["email"])

    # An @openhouse.in address that is not in oh_users has no account here.
    # It is NOT silently made a candidate — staff and applicants are separate
    # populations, and a colleague signing in by accident should be told so
    # rather than quietly appearing in the hiring team's own candidate list.
    if not oh and info["email"].endswith(STAFF_DOMAIN):
        logs.record(logs.LOGIN_REFUSED, actor_email=info["email"], actor_role="none",
                    data={"reason": "openhouse_domain_without_oh_users_row"},
                    request=request)
        raise HTTPException(
            403,
            "credentials not created, use non openhouse email and log in as candidate",
        )

    if oh:
        # Staff. No candidates row — they are not applicants.
        role = oh["role"]
        token = auth.mint(info["email"], oh["name"] or info["name"], role)
        auth.set_session_cookie(response, token)
        logs.record(logs.LOGIN, actor_email=info["email"], actor_role=role,
                    data={"staff": True, "session": auth.verify(token)["jti"]},
                    request=request)
        # The token is NOT in the body. It lives in an httpOnly cookie, where no
        # script — ours or an injected one — can read it.
        return {"user": {**info, "name": oh["name"] or info["name"], "role": role}}

    # Candidate. The email is saved on EVERY sign-in, before anything else.
    candidate_id, created = db.upsert_candidate(info["email"], info["name"], is_login=True)
    stored = db.candidate_profile(info["email"])
    display = stored["name"] if stored and stored["name"] else info["name"]
    token = auth.mint(info["email"], display, "user")
    auth.set_session_cookie(response, token)

    if created:
        logs.record(logs.CANDIDATE_CREATED, actor_email=info["email"], actor_role="user",
                    entity=logs.ENTITY_CANDIDATE, entity_id=candidate_id,
                    data={"name": info["name"]}, request=request)
    logs.record(logs.LOGIN, actor_email=info["email"], actor_role="user",
                entity=logs.ENTITY_CANDIDATE, entity_id=candidate_id,
                # The session id, so a sign-in can be tied to the token it issued.
                data={"new_candidate": created, "session": auth.verify(token)["jti"]},
                request=request)

    return {"user": {**info, "name": display, "role": "user"}}


# ── candidate ─────────────────────────────────────────────────────────────

@app.post("/api/auth/logout")
async def logout(response: Response):
    """Clears the session cookie. A client cannot do this itself — the cookie is
    httpOnly, which is the point."""
    auth.clear_session_cookie(response)
    return {"ok": True}


@app.get("/api/me")
async def me(u: dict = Depends(auth.current_user)):
    """Identity and role. Never a number — not a score, star count, or band.

    `submission_count` is what the client routes on: a candidate who has
    attempted anything lands on their history, otherwise on the assessment list.
    """
    p = db.candidate_profile(u["email"])
    return {
        **u,
        # The stored name wins over the token's claim: the claim is a snapshot of
        # the Google profile at sign-in, and a rename must show up immediately
        # rather than after the next login.
        "name": (p["name"] if p and p["name"] else u["name"]),
        "name_set_by_user": bool(p["name_set_by_user"]) if p else False,
        "first_seen_at": p["first_seen_at"].isoformat() if p else None,
        "last_seen_at": p["last_seen_at"].isoformat() if p else None,
        "login_count": p["login_count"] if p else 0,
        "submission_count": p["submission_count"] if p else 0,
    }


NAME_MAX = 80


@app.patch("/api/me")
async def update_me(body: dict, request: Request, u: dict = Depends(auth.current_user)):
    """Change your own display name.

    The name a person picks is what admins see on the board and the record, so it
    is validated rather than trusted: trimmed, length-bounded, and stripped of
    control characters, which are invisible in a form and are how someone smuggles
    a newline or a bidi override into a table cell.
    """
    raw = (body or {}).get("name")
    if not isinstance(raw, str):
        raise HTTPException(422, "name is required")

    name = " ".join(raw.split())          # collapses newlines, tabs, runs of spaces
    name = "".join(c for c in name if c.isprintable())

    if not name:
        raise HTTPException(422, "name cannot be empty")
    if len(name) > NAME_MAX:
        raise HTTPException(422, f"name cannot be longer than {NAME_MAX} characters")

    row = db.update_candidate_name(u["email"], name)
    if not row:
        raise HTTPException(404, "no profile to update")

    if row["previous"] != name:
        logs.record(logs.CANDIDATE_RENAMED, **logs.for_user(u),
                    entity=logs.ENTITY_CANDIDATE, entity_id=str(row["id"]),
                    data={"from": row["previous"], "to": name}, request=request)

    return await me(u)


# ── assessments ───────────────────────────────────────────────────────────

# A candidate is told 'assessing' or 'submitted', never 'scored' or 'failed'.
# Collapsing the two here, once, is what keeps every candidate-facing route
# structurally incapable of revealing that a run errored.
_CANDIDATE_STATE = {
    "queued": "assessing",
    "processing": "assessing",
    "scored": "submitted",
    "failed": "submitted",
}


@app.get("/api/assessments")
async def list_assessments(u: dict = Depends(auth.current_user)):
    """What this candidate can take, and where they stand on each."""
    items = []
    for key in assessments.ASSESSMENTS:
        live = db.live_submission(u["email"], key)
        items.append({
            **assessments.public(key),
            "state": _CANDIDATE_STATE.get(live["status"], "assessing") if live else "available",
            "submission_id": str(live["id"]) if live else None,
            "submitted_at": live["created_at"].isoformat() if live else None,
        })
    return {"items": items}


@app.get("/api/my/submissions")
async def my_submissions(u: dict = Depends(auth.current_user)):
    """The candidate's own history. State only — this query does not even select
    a score column, so there is nothing to leak by accident."""
    rows = db.my_submissions(u["email"])
    return {"items": [{
        "id": str(r["id"]),
        "assessment_key": r["assessment_type"],
        "assessment_name": assessments.name_of(r["assessment_type"]),
        "assessment_slug": assessments.ASSESSMENTS.get(r["assessment_type"], {}).get("slug"),
        "state": "voided" if r["status"] == "voided"
                 else _CANDIDATE_STATE.get(r["status"], "assessing"),
        "submitted_at": r["created_at"].isoformat(),
    } for r in rows]}


@app.get("/api/instructions")
async def instructions(_: dict = Depends(auth.current_user)):
    md = (_ROOT / "instructions.md").read_text()
    return {"markdown": md, "version": hashlib.sha256(md.encode()).hexdigest()[:6]}


@app.post("/api/submissions", status_code=202)
async def create_submission(
    background: BackgroundTasks,
    request: Request,
    file: UploadFile = File(...),
    u: dict = Depends(auth.current_user),
):
    """Validate, store, claim the slot, schedule, return. Two to four seconds."""

    def reject(code: int, why: str, detail: str):
        # A rejected upload is signal — a candidate hitting 409 three times, or
        # 415 on every attempt, is something an admin should be able to see.
        logs.record(logs.SUBMISSION_REJECTED, **logs.for_user(u),
                    data={"reason": why, "status": code, "filename": file.filename,
                          "content_type": file.content_type},
                    request=request)
        return HTTPException(code, detail)

    # Staff are not applicants and have no candidates row to hang this off.
    if u["role"] != "user":
        raise reject(403, "staff_account",
                     "Openhouse team accounts cannot take assessments")

    ext = ALLOWED.get((file.content_type or "").lower())
    if not ext:
        raise reject(415, "unsupported_type", f"unsupported audio type: {file.content_type}")

    data = await file.read()
    if len(data) > MAX_BYTES:
        raise reject(413, "too_large", "file is larger than 25 MB")

    probe = MutagenFile(io.BytesIO(data))
    if probe is None or getattr(probe, "info", None) is None:
        raise reject(422, "unreadable", "could not read that audio file")
    if probe.info.length > MAX_SECONDS:
        raise reject(422, "too_long", "recording is longer than 10 minutes")

    # Everything validated. Only now does anything get written.
    candidate_id, _ = db.upsert_candidate(u["email"], u["name"])
    sub_id = str(uuid.uuid4())
    key = f"audio/{sub_id}{ext}"
    storage.put(key, data, file.content_type)

    try:
        db.create_submission(sub_id, candidate_id, key, file.content_type, len(data))
    except db.AlreadySubmitted:
        storage.delete(key)  # a rejected double-submit leaves nothing behind
        raise reject(409, "already_submitted", "you have already submitted")

    logs.record(logs.SUBMISSION_CREATED, **logs.for_user(u),
                entity=logs.ENTITY_SUBMISSION, entity_id=sub_id,
                data={"candidate_id": candidate_id,
                      "assessment_type": db.ASSESSMENT_TYPE,
                      "bytes": len(data),
                      "content_type": file.content_type,
                      "duration_s": round(probe.info.length, 2)},
                request=request)

    background.add_task(tasks.score_submission, sub_id)
    return {"id": sub_id, "status": "queued"}


@app.get("/api/submissions/{sub_id}/status")
async def submission_status(sub_id: str, u: dict = Depends(auth.current_user)):
    """Polled every 2s by the dashboard. A state name, never a number."""
    row = db.get_status(sub_id)
    # Owner or admin only. A stranger gets 404, not 403 — a 403 would confirm
    # the id exists.
    if not row or (u["role"] != "admin" and row["email"] != u["email"]):
        raise HTTPException(404, "not found")
    return {"id": sub_id, "status": row["status"]}


# ── admin ─────────────────────────────────────────────────────────────────

@app.get("/api/submissions")
async def list_submissions(
    limit: int = 200,
    offset: int = 0,
    status: str | None = None,
    assessment_type: str | None = None,
    q: str | None = None,
    stars: int | None = None,
    _: dict = Depends(auth.require_admin),
):
    """Every filter optional, all ANDed. `q` matches candidate email or name."""
    total, items = db.list_submissions(min(limit, 500), offset, status,
                                       assessment_type, q, stars)
    for it in items:
        it["id"] = str(it["id"])
        it["assessment_name"] = assessments.name_of(it["assessment_type"])
    return {
        "total": total,
        "items": items,
        "assessments": [assessments.public(k) for k in assessments.ASSESSMENTS],
    }


@app.get("/api/candidates")
async def list_candidates(limit: int = 200, offset: int = 0, q: str | None = None,
                          _: dict = Depends(auth.require_admin)):
    """Applicants, with how many attempts and at what.

    No staff filter: staff never get a candidates row, so every row here is an
    applicant by construction rather than by a WHERE clause.
    """
    total, items = db.list_candidates(min(limit, 500), offset, q)
    for it in items:
        it["id"] = str(it["id"])
        it["first_seen_at"] = it["first_seen_at"].isoformat()
        it["last_seen_at"] = it["last_seen_at"].isoformat()
        it["last_submission_at"] = (it["last_submission_at"].isoformat()
                                    if it["last_submission_at"] else None)
        it["assessments"] = [{"key": k, "name": assessments.name_of(k)}
                             for k in (it["assessments"] or [])]
    return {"total": total, "items": items}


@app.get("/api/submissions/{sub_id}")
async def submission_detail(sub_id: str, _: dict = Depends(auth.require_admin)):
    row = db.get_submission(sub_id)
    if not row:
        raise HTTPException(404, "not found")
    key = row.pop("audio_key")  # the key never leaves the server
    row.pop("candidate_id", None)  # internal join key, not an admin-facing field
    row["id"] = str(row["id"])
    row["audio_url"] = storage.presign(key)
    return row


@app.post("/api/submissions/{sub_id}/void")
async def void_submission(sub_id: str, request: Request,
                          u: dict = Depends(auth.require_admin)):
    row = db.get_submission(sub_id)
    if not row:
        raise HTTPException(404, "not found")
    if not db.void_submission(sub_id):
        raise HTTPException(409, "already voided")
    # This log entry is the ONLY record of who voided it — the submissions table
    # deliberately has no reference to oh_users.
    logs.record(logs.SUBMISSION_VOIDED, **logs.for_user(u),
                entity=logs.ENTITY_SUBMISSION, entity_id=sub_id,
                data={"candidate_email": row["email"], "previous_status": row["status"]},
                request=request)


@app.post("/api/submissions/{sub_id}/rescore", status_code=202)
async def rescore_submission(sub_id: str, background: BackgroundTasks, request: Request,
                             u: dict = Depends(auth.require_admin)):
    """Run the whole pipeline again — Scribe, then Claude — on the stored audio.

    Same background task the original upload schedules, so there is exactly one
    scoring path. finish_submission overwrites the child row and clears the
    parent's error, and the overall_sync trigger re-derives overall_stars, so a
    re-run leaves no trace of the previous result in the record itself. The
    activity log is what makes it traceable — hence this entry, recorded BEFORE
    the task is scheduled, so an admin-initiated re-run is on file even if the
    run then dies.
    """
    row = db.get_submission(sub_id)
    if not row:
        raise HTTPException(404, "not found")
    if row["status"] == "voided":
        raise HTTPException(409, "voided submissions cannot be re-scored")
    # queued/processing already has a run in flight; a second would race it and
    # both would write the same child row.
    if row["status"] in ("queued", "processing"):
        raise HTTPException(409, "this submission is already being scored")
    if not row["audio_key"]:
        raise HTTPException(422, "no audio stored for this submission")

    logs.record(logs.SUBMISSION_RESCORED, **logs.for_user(u),
                entity=logs.ENTITY_SUBMISSION, entity_id=sub_id,
                # Never the scores themselves — the same rule the scoring task
                # follows. Enough to say what was discarded, not what it said.
                data={"candidate_email": row["email"],
                      "previous_status": row["status"],
                      "previous_rubric_version": row.get("rubric_version"),
                      "previous_model": row.get("model"),
                      "previous_stt_model": row.get("stt_model")},
                request=request)

    db.set_processing(sub_id)
    background.add_task(tasks.score_submission, sub_id)
    return {"id": sub_id, "status": "processing"}
    return {"id": sub_id, "status": "voided"}


@app.get("/api/logs")
async def list_logs(limit: int = 100, offset: int = 0,
                    action: str | None = None, actor: str | None = None,
                    entity_id: str | None = None, category: str | None = None,
                    q: str | None = None,
                    date_from: str | None = None, date_to: str | None = None,
                    _: dict = Depends(auth.require_admin)):
    """The audit trail. Admin only — it names every candidate who ever signed in.

    `q` searches actor, action, entity id and the data payload. `category` is the
    verb prefix. `date_to` covers its whole day.
    """
    total, items = db.list_logs(min(limit, 500), offset, action, actor, entity_id,
                                category, q, date_from, date_to)
    for it in items:
        it["id"] = str(it["id"])
        it["at"] = it["at"].isoformat()
    return {"total": total, "items": items, **db.log_filter_options()}
