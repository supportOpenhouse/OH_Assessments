"""Every SQL statement in the project lives here.

No ORM, two tables, hand-written parameterised SQL. Nothing is ever interpolated
into query text.
"""

import os
from datetime import timedelta

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Json
from psycopg_pool import ConnectionPool

_pool: ConnectionPool | None = None


class AlreadySubmitted(Exception):
    """The submissions_one_live partial unique index fired.

    The candidate already has a submission that has not been voided.
    """


def pool() -> ConnectionPool:
    """One pool per process, opened lazily.

    Small max_size on purpose: one always-on Render instance, and Neon's pooled
    endpoint is the real connection budget.
    """
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            os.environ["DATABASE_URL"],
            min_size=1,
            max_size=5,
            kwargs={"row_factory": dict_row},
            open=True,
        )
    return _pool


def _one(sql: str, params: tuple = ()):
    with pool().connection() as conn:
        return conn.execute(sql, params).fetchone()


def _all(sql: str, params: tuple = ()):
    with pool().connection() as conn:
        return conn.execute(sql, params).fetchall()


def _exec(sql: str, params: tuple = ()) -> int:
    with pool().connection() as conn:
        return conn.execute(sql, params).rowcount


# ── admins ────────────────────────────────────────────────────────────────

def is_admin(email: str) -> bool:
    return _one("select 1 as ok from admins where email = %s", (email,)) is not None


# ── submissions ───────────────────────────────────────────────────────────

def live_submission(email: str) -> dict | None:
    """The candidate's one non-voided submission, whatever its status."""
    return _one(
        "select id, status, created_at from submissions "
        "where email = %s and status <> 'voided'",
        (email,),
    )


def create_submission(sub_id, email, name, audio_key, audio_type, audio_bytes) -> str:
    """Claim the one-attempt slot. Raises AlreadySubmitted on a duplicate.

    The id is passed in rather than generated here so the R2 object key and the
    row id are the same value.
    """
    try:
        with pool().connection() as conn:
            conn.execute(
                "insert into submissions "
                "(id, email, name, audio_key, audio_type, audio_bytes) "
                "values (%s, %s, %s, %s, %s, %s)",
                (sub_id, email, name, audio_key, audio_type, audio_bytes),
            )
    except psycopg.errors.UniqueViolation:
        raise AlreadySubmitted()
    return str(sub_id)


def set_processing(sub_id) -> None:
    _exec("update submissions set status = 'processing' where id = %s", (sub_id,))


def finish_submission(sub_id, *, transcript, metrics, scores, duration_s,
                      rubric_version, model, stt_model) -> None:
    _exec(
        "update submissions set status = 'scored', transcript = %s, metrics = %s, "
        "scores = %s, duration_s = %s, rubric_version = %s, model = %s, "
        "stt_model = %s, error = null, scored_at = now() where id = %s",
        (transcript, Json(metrics), Json(scores), duration_s,
         rubric_version, model, stt_model, sub_id),
    )


def fail_submission(sub_id, error: str) -> None:
    _exec(
        "update submissions set status = 'failed', error = %s where id = %s",
        (error[:500], sub_id),
    )


def fail_stale(older_than: timedelta, reason: str) -> int:
    """Rows still in flight after a restart are dead. Returns how many were cleared.

    A Render deploy or crash mid-scoring would otherwise strand a row in
    'processing' forever, silently consuming the candidate's one attempt.
    """
    return _exec(
        "update submissions set status = 'failed', error = %s "
        "where status in ('queued', 'processing') "
        "and created_at < now() - %s::interval",
        (reason, older_than),
    )


def get_status(sub_id) -> dict | None:
    """Minimal row for the polling endpoint. email is used for the ownership check."""
    return _one("select id, email, status from submissions where id = %s", (sub_id,))


def get_submission(sub_id) -> dict | None:
    return _one("select * from submissions where id = %s", (sub_id,))


def list_submissions(limit: int, offset: int, status: str | None) -> tuple[int, list]:
    if status:
        total = _one("select count(*) as n from submissions where status = %s", (status,))["n"]
        rows = _all(
            "select id, email, name, status, duration_s, created_at, rubric_version, "
            "(scores->'overall'->>'stars')::int as overall "
            "from submissions where status = %s "
            "order by created_at desc limit %s offset %s",
            (status, limit, offset),
        )
    else:
        total = _one("select count(*) as n from submissions")["n"]
        rows = _all(
            "select id, email, name, status, duration_s, created_at, rubric_version, "
            "(scores->'overall'->>'stars')::int as overall "
            "from submissions order by created_at desc limit %s offset %s",
            (limit, offset),
        )
    return total, rows


def void_submission(sub_id, by: str) -> bool:
    """Returns False if it was already voided."""
    return _exec(
        "update submissions set status = 'voided', voided_at = now(), voided_by = %s "
        "where id = %s and status <> 'voided'",
        (by, sub_id),
    ) > 0
