"""Every SQL statement in the project lives here.

No ORM, hand-written parameterised SQL. Nothing is ever interpolated into query
text — including the table names, which are written literally on purpose. See
the recipe at the bottom of schema.sql for adding an assessment type.

Three tables:
    oh_users                    staff                   (assessment-agnostic)
    candidates                  people being assessed   (assessment-agnostic)
    sales_insight_submissions   this assessment         (per assessment type)
"""

import os
from datetime import timedelta

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Json
from psycopg_pool import ConnectionPool

_pool: ConnectionPool | None = None


class AlreadySubmitted(Exception):
    """The sales_insight_one_live partial unique index fired.

    The candidate already has a submission for THIS assessment that has not been
    voided. Says nothing about other assessment types.
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


# ── oh_users ──────────────────────────────────────────────────────────────

def get_oh_user(email: str) -> dict | None:
    """Staff record, or None for an ordinary candidate.

    Deactivating someone is `is_active = false` rather than a delete, so their
    name stays resolvable on submissions they voided.
    """
    return _one(
        "select id, email, name, role from oh_users "
        "where email = %s and is_active",
        (email,),
    )


# ── candidates ────────────────────────────────────────────────────────────

def upsert_candidate(email: str, name: str | None) -> str:
    """Called on every sign-in. Returns the candidate id.

    Staff get a candidate row too — it costs nothing and it is what lets an
    admin walk the candidate flow end to end. Role comes from oh_users, never
    from the presence of a row here.
    """
    row = _one(
        "insert into candidates (email, name) values (%s, %s) "
        "on conflict (email) do update set "
        "  name = coalesce(excluded.name, candidates.name), "
        "  last_seen_at = now() "
        "returning id",
        (email, name or None),
    )
    return str(row["id"])


# ── sales_insight_submissions ─────────────────────────────────────────────
# Everything below is specific to ONE assessment type. A second assessment
# copies this section against its own table.

def live_submission(email: str) -> dict | None:
    """The candidate's one non-voided submission for this assessment."""
    return _one(
        "select s.id, s.status, s.created_at "
        "from sales_insight_submissions s "
        "join candidates c on c.id = s.candidate_id "
        "where c.email = %s and s.status <> 'voided'",
        (email,),
    )


def create_submission(sub_id, candidate_id, audio_key, audio_type, audio_bytes) -> str:
    """Claim the one-attempt slot. Raises AlreadySubmitted on a duplicate.

    The id is passed in rather than generated here so the R2 object key and the
    row id are the same value.
    """
    try:
        with pool().connection() as conn:
            conn.execute(
                "insert into sales_insight_submissions "
                "(id, candidate_id, audio_key, audio_type, audio_bytes) "
                "values (%s, %s, %s, %s, %s)",
                (sub_id, candidate_id, audio_key, audio_type, audio_bytes),
            )
    except psycopg.errors.UniqueViolation:
        raise AlreadySubmitted()
    return str(sub_id)


def set_processing(sub_id) -> None:
    _exec(
        "update sales_insight_submissions set status = 'processing' where id = %s",
        (sub_id,),
    )


def finish_submission(sub_id, *, transcript, metrics, scores, duration_s,
                      rubric_version, model, stt_model) -> None:
    _exec(
        "update sales_insight_submissions set "
        "status = 'scored', transcript = %s, metrics = %s, scores = %s, "
        "duration_s = %s, rubric_version = %s, model = %s, stt_model = %s, "
        "error = null, scored_at = now() "
        "where id = %s",
        (transcript, Json(metrics), Json(scores), duration_s,
         rubric_version, model, stt_model, sub_id),
    )


def fail_submission(sub_id, error: str) -> None:
    _exec(
        "update sales_insight_submissions set status = 'failed', error = %s where id = %s",
        (error[:500], sub_id),
    )


def fail_stale(older_than: timedelta, reason: str) -> int:
    """Rows still in flight after a restart are dead. Returns how many were cleared.

    A Render deploy or crash mid-scoring would otherwise strand a row in
    'processing' forever, silently consuming the candidate's one attempt.
    """
    return _exec(
        "update sales_insight_submissions set status = 'failed', error = %s "
        "where status in ('queued', 'processing') "
        "and created_at < now() - %s::interval",
        (reason, older_than),
    )


def get_status(sub_id) -> dict | None:
    """Minimal row for the polling endpoint. email drives the ownership check."""
    return _one(
        "select s.id, c.email, s.status "
        "from sales_insight_submissions s "
        "join candidates c on c.id = s.candidate_id "
        "where s.id = %s",
        (sub_id,),
    )


def get_submission(sub_id) -> dict | None:
    return _one(
        "select s.*, c.email, c.name, v.email as voided_by_email "
        "from sales_insight_submissions s "
        "join candidates c on c.id = s.candidate_id "
        "left join oh_users v on v.id = s.voided_by "
        "where s.id = %s",
        (sub_id,),
    )


def list_submissions(limit: int, offset: int, status: str | None) -> tuple[int, list]:
    if status:
        total = _one(
            "select count(*) as n from sales_insight_submissions where status = %s",
            (status,),
        )["n"]
        rows = _all(
            "select s.id, c.email, c.name, s.status, s.duration_s, s.created_at, "
            "s.rubric_version, (s.scores->'overall'->>'stars')::int as overall "
            "from sales_insight_submissions s "
            "join candidates c on c.id = s.candidate_id "
            "where s.status = %s "
            "order by s.created_at desc limit %s offset %s",
            (status, limit, offset),
        )
    else:
        total = _one("select count(*) as n from sales_insight_submissions")["n"]
        rows = _all(
            "select s.id, c.email, c.name, s.status, s.duration_s, s.created_at, "
            "s.rubric_version, (s.scores->'overall'->>'stars')::int as overall "
            "from sales_insight_submissions s "
            "join candidates c on c.id = s.candidate_id "
            "order by s.created_at desc limit %s offset %s",
            (limit, offset),
        )
    return total, rows


def void_submission(sub_id, by_email: str) -> bool:
    """Returns False if it was already voided.

    voided_by is resolved from the email in one statement rather than making the
    caller carry an oh_users id around.
    """
    return _exec(
        "update sales_insight_submissions set "
        "status = 'voided', voided_at = now(), "
        "voided_by = (select id from oh_users where email = %s) "
        "where id = %s and status <> 'voided'",
        (by_email, sub_id),
    ) > 0
