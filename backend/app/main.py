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

from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from mutagen import File as MutagenFile

from . import auth, db, logs, scoring, storage, tasks

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

_ROOT = pathlib.Path(__file__).resolve().parent.parent

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
async def google_login(body: dict, request: Request):
    token = (body or {}).get("id_token")
    if not token:
        raise HTTPException(401, "missing id_token")
    try:
        info = auth.verify_google(token)
    except auth.AuthError as e:
        raise HTTPException(401, str(e))

    # The email is saved to candidates on EVERY sign-in, before anything else.
    # Staff get a row too — it costs nothing and it is what lets an admin walk
    # the candidate flow. Role comes from oh_users membership, never from
    # having a candidates row.
    candidate_id, created = db.upsert_candidate(info["email"], info["name"], is_login=True)

    oh = db.get_oh_user(info["email"])
    role = oh["role"] if oh else "user"

    if created:
        logs.record(logs.CANDIDATE_CREATED, actor_email=info["email"], actor_role=role,
                    entity=logs.ENTITY_CANDIDATE, entity_id=candidate_id,
                    data={"name": info["name"]}, request=request)
    logs.record(logs.LOGIN, actor_email=info["email"], actor_role=role,
                entity=logs.ENTITY_CANDIDATE, entity_id=candidate_id,
                data={"new_candidate": created}, request=request)

    return {
        "token": auth.mint(info["email"], info["name"], role),
        "user": {**info, "role": role},
    }


# ── candidate ─────────────────────────────────────────────────────────────

@app.get("/api/me")
async def me(u: dict = Depends(auth.current_user)):
    """Never returns a number. Not a score, not a star count, not a band."""
    live = db.live_submission(u["email"])
    if not live:
        return {**u, "submission_status": "pending"}
    # 'submitted' for ANY live row — queued, processing, scored or failed alike.
    # A candidate whose scoring errored is not shown a failure; that is ours.
    return {
        **u,
        "submission_status": "submitted",
        "submission_id": str(live["id"]),
        "submitted_at": live["created_at"].isoformat(),
    }


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
    limit: int = 50,
    offset: int = 0,
    status: str | None = None,
    _: dict = Depends(auth.require_admin),
):
    total, items = db.list_submissions(min(limit, 200), offset, status)
    for it in items:
        it["id"] = str(it["id"])
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
    return {"id": sub_id, "status": "voided"}


@app.get("/api/logs")
async def list_logs(limit: int = 100, offset: int = 0, action: str | None = None,
                    actor: str | None = None, entity_id: str | None = None,
                    _: dict = Depends(auth.require_admin)):
    """The audit trail. Admin only — it names every candidate who ever signed in."""
    total, items = db.list_logs(min(limit, 500), offset, action, actor, entity_id)
    for it in items:
        it["id"] = str(it["id"])
        it["at"] = it["at"].isoformat()
    return {"total": total, "items": items, "actions": db.distinct_log_actions()}
