"""Background scoring and the startup sweep."""

import logging
from datetime import timedelta

from . import db, scoring, storage

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
        audio = storage.get(row["audio_key"])
        result = scoring.score(audio)
        db.finish_submission(sub_id, **result)
        log.info("scored %s", sub_id)
    except Exception as e:
        log.exception("scoring failed for %s", sub_id)
        try:
            db.fail_submission(sub_id, f"{type(e).__name__}: {e}")
        except Exception:
            log.exception("could not even record the failure for %s", sub_id)


def sweep_stale() -> int:
    """Once, on startup. A row still in flight after a restart is dead.

    Without this a deploy mid-scoring strands a row in 'processing' forever and
    the candidate can never re-submit.
    """
    return db.fail_stale(STALE_AFTER, "interrupted by a backend restart")
