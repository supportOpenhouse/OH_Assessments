"""Background scoring and the startup sweep.

Every state change here lands in activity_logs with a 'system' actor, so the
audit trail covers work no human initiated.
"""

import logging
from datetime import timedelta

from . import db, logs, resume, scoring, storage

log = logging.getLogger(__name__)

STALE_AFTER = timedelta(minutes=10)


def score_submission(sub_id: str) -> None:
    """Runs after the 202 has already gone out. No timeout, so no length limit.

    The bare except is deliberate: ANY failure must land in the row as 'failed',
    or the candidate's single attempt is consumed with nothing to show for it.
    """
    try:
        row = db.get_submission(sub_id)
        if row is None:
            log.error("scoring: submission %s vanished", sub_id)
            return

        db.set_processing(sub_id)
        logs.record(logs.SUBMISSION_PROCESSING, actor_role=logs.SYSTEM,
                    entity=logs.ENTITY_SUBMISSION, entity_id=sub_id)

        audio = storage.get(row["audio_key"])
        result = scoring.score(audio)
        db.finish_submission(sub_id, **result)

        # Metrics and model identity, never the scores themselves — duplicating a
        # result into the audit trail would double the surface that can leak one.
        logs.record(logs.SUBMISSION_SCORED, actor_role=logs.SYSTEM,
                    entity=logs.ENTITY_SUBMISSION, entity_id=sub_id,
                    data={"rubric_version": result["rubric_version"],
                          "model": result["model"],
                          "stt_model": result["stt_model"],
                          "duration_s": result["duration_s"],
                          "word_count": result["metrics"]["word_count"]})
        log.info("scored %s", sub_id)

    except Exception as e:
        log.exception("scoring failed for %s", sub_id)
        reason = f"{type(e).__name__}: {e}"
        try:
            db.fail_submission(sub_id, reason)
        except Exception:
            log.exception("could not even record the failure for %s", sub_id)
        logs.record(logs.SUBMISSION_FAILED, actor_role=logs.SYSTEM,
                    entity=logs.ENTITY_SUBMISSION, entity_id=sub_id,
                    data={"error": reason[:500]})


def extract_resume(candidate_id: str) -> None:
    """Claude reads the candidate's current resume. The caller has already set
    resume_status='processing' (set_resume or claim_resume_read).

    Same bare-except rule as scoring: ANY failure must land as 'failed', or the
    row sits in 'processing' until the next restart's sweep.
    """
    try:
        key = db.resume_key_of(candidate_id)
        if not key:
            raise resume.ResumeError("no resume stored")
        result = resume.extract(storage.get(key, bucket=storage.RESUME))
        db.finish_resume(candidate_id, insights=result["insights"], key=key,
                         model=result["model"])
        # Model identity only, never the insights — same rule as scores.
        logs.record(logs.RESUME_EXTRACTED, actor_role=logs.SYSTEM,
                    entity=logs.ENTITY_CANDIDATE, entity_id=candidate_id,
                    data={"model": result["model"]})
        log.info("resume read for %s", candidate_id)
    except Exception as e:
        log.exception("resume read failed for %s", candidate_id)
        reason = f"{type(e).__name__}: {e}"
        try:
            db.fail_resume(candidate_id, reason)
        except Exception:
            log.exception("could not even record the resume failure for %s", candidate_id)
        logs.record(logs.RESUME_FAILED, actor_role=logs.SYSTEM,
                    entity=logs.ENTITY_CANDIDATE, entity_id=candidate_id,
                    data={"error": reason[:500]})


def sweep_stale() -> int:
    """Once, on startup. A row still in flight after a restart is dead.

    Without this a deploy mid-scoring strands a row in 'processing' forever and
    the candidate can never re-submit.
    """
    n = db.fail_stale(STALE_AFTER, "interrupted by a backend restart")
    if n:
        logs.record(logs.SUBMISSION_SWEPT, actor_role=logs.SYSTEM,
                    data={"count": n, "stale_after_minutes": STALE_AFTER.total_seconds() / 60})
    # A resume read stranded the same way would show "reading…" forever and
    # never offer the re-run button.
    r = db.fail_stale_resumes(STALE_AFTER, "interrupted by a backend restart")
    if r:
        logs.record(logs.RESUME_SWEPT, actor_role=logs.SYSTEM, data={"count": r})
    return n + r
