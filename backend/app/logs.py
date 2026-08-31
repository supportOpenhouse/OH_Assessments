"""Audit trail.

Every action that changes, creates or removes data is recorded here, plus every
sign-in.

**Server-side only, on purpose.** Logging button clicks in the browser would miss
anything that does not go through our UI — a curl, a replayed request, a second
tab — and it can be forged by the person being audited. Every mutation in this
product goes through the API, so the API is the complete and trustworthy record.
The browser is where actions are *initiated*; it is not where they happen.

A failed audit write must never fail the action it audits. `record()` swallows
its own errors and shouts into the application log instead.
"""

import logging

from . import db

log = logging.getLogger(__name__)

# Action verbs. Constants so they are greppable and stable — a typo'd string
# literal is an audit hole that nothing catches.
LOGIN = "auth.login"
CANDIDATE_CREATED = "candidate.created"
SUBMISSION_CREATED = "submission.created"
SUBMISSION_REJECTED = "submission.rejected"
SUBMISSION_PROCESSING = "submission.processing"
SUBMISSION_SCORED = "submission.scored"
SUBMISSION_FAILED = "submission.failed"
SUBMISSION_VOIDED = "submission.voided"
SUBMISSION_SWEPT = "submission.swept"

ENTITY_SUBMISSION = "submission"   # addresses submissions.id, whatever the type
ENTITY_CANDIDATE = "candidate"

SYSTEM = "system"


def _client(request) -> tuple[str | None, str | None]:
    if request is None:
        return None, None
    # Render sits behind a proxy, and Vercel's rewrite adds another hop, so the
    # socket peer is a load balancer. The left-most X-Forwarded-For entry is the
    # real client. Trusted here only because nothing security-critical keys off
    # it — it is an audit hint, not an authorisation input.
    fwd = request.headers.get("x-forwarded-for", "")
    ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else None)
    return ip, (request.headers.get("user-agent") or None)[:500] if request.headers.get("user-agent") else None


def record(action: str, *, actor_email: str | None = None, actor_role: str | None = None,
           entity: str | None = None, entity_id: str | None = None,
           data: dict | None = None, request=None) -> None:
    """Append one row. Never raises."""
    try:
        ip, ua = _client(request)
        db.insert_log(
            actor_email=actor_email,
            actor_role=actor_role,
            action=action,
            entity=entity,
            entity_id=str(entity_id) if entity_id is not None else None,
            data=data or {},
            ip=ip,
            user_agent=ua,
        )
    except Exception:
        # Losing an audit row is bad. Losing the user's action because we could
        # not write an audit row is worse.
        log.exception("audit write failed: action=%s entity_id=%s", action, entity_id)


def for_user(u: dict) -> dict:
    """Actor kwargs from a current_user dict."""
    return {"actor_email": u["email"], "actor_role": u["role"]}
