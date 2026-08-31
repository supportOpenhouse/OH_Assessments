"""Every SQL statement in the project lives here.

No ORM, hand-written parameterised SQL. Nothing is ever interpolated into query
text — including the table names, which are written literally on purpose. See
the recipe at the bottom of schema.sql for adding an assessment type.

    oh_users                    staff                   (assessment-agnostic)
    candidates                  people being assessed   (assessment-agnostic)
    submissions                 EVERY submission        (assessment-agnostic)
    sales_insight_submissions   audio-specific columns  (per assessment type)
    activity_logs               audit trail             (assessment-agnostic)

`submissions` and `sales_insight_submissions` share a primary key. The parent
owns everything common to any assessment; the child owns only the audio bits.
Nothing is duplicated, so nothing can drift.
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

def upsert_candidate(email: str, name: str | None, *, is_login: bool = False) -> tuple[str, bool]:
    """Record the email against a candidate row. Returns (id, was_created).

    Called on EVERY sign-in — the email is saved the moment someone logs in,
    before they do anything else. Staff get a row too: it costs nothing and it
    is what lets an admin walk the candidate flow end to end. Role comes from
    oh_users, never from the presence of a row here.

    `xmax = 0` is the standard Postgres trick for telling an INSERT apart from
    an UPDATE in an upsert — it is zero only for a freshly inserted tuple.
    """
    row = _one(
        "insert into candidates (email, name, login_count) values (%s, %s, %s) "
        "on conflict (email) do update set "
        "  name = coalesce(excluded.name, candidates.name), "
        "  last_seen_at = now(), "
        "  login_count = candidates.login_count + %s "
        "returning id, (xmax = 0) as created",
        (email, name or None, 1 if is_login else 0, 1 if is_login else 0),
    )
    return str(row["id"]), bool(row["created"])


# ── submissions (parent) + sales_insight_submissions (child) ──────────────
# The parent holds what is true of any assessment. The child holds the audio
# bits. They share a primary key, so a "submission" is one logical row split
# across two tables — never two copies of the same value.

ASSESSMENT_TYPE = "sales_insight"


def live_submission(email: str) -> dict | None:
    """The candidate's one non-voided submission for THIS assessment type.

    Reads the parent only: who, which type, and status all live there.
    """
    return _one(
        "select s.id, s.status, s.created_at "
        "from submissions s "
        "join candidates c on c.id = s.candidate_id "
        "where c.email = %s and s.assessment_type = %s and s.status <> 'voided'",
        (email, ASSESSMENT_TYPE),
    )


def create_submission(sub_id, candidate_id, audio_key, audio_type, audio_bytes) -> str:
    """Insert the parent then the child, in ONE transaction.

    Order is forced by the foreign key and by the child's parent-guard trigger.
    If either insert fails the whole thing rolls back, so a parent can never be
    left behind without its child.

    Raises AlreadySubmitted when submissions_one_live fires.
    """
    try:
        with pool().connection() as conn:
            conn.execute(
                "insert into submissions (id, candidate_id, assessment_type) "
                "values (%s, %s, %s)",
                (sub_id, candidate_id, ASSESSMENT_TYPE),
            )
            conn.execute(
                "insert into sales_insight_submissions "
                "(id, audio_key, audio_type, audio_bytes) values (%s, %s, %s, %s)",
                (sub_id, audio_key, audio_type, audio_bytes),
            )
    except psycopg.errors.UniqueViolation:
        raise AlreadySubmitted()
    return str(sub_id)


def set_processing(sub_id) -> None:
    # Status lives on the parent, and only on the parent.
    _exec("update submissions set status = 'processing' where id = %s", (sub_id,))


def finish_submission(sub_id, *, transcript, metrics, scores, duration_s,
                      rubric_version, model, stt_model) -> None:
    """Child gets the detail, parent gets the state. One transaction.

    overall_stars on the parent is NOT written here — the sales_insight_overall_sync
    trigger derives it from the scores this statement writes, so a score reaching
    the child by any route (a backfill, a hand-run UPDATE) still reaches the parent.
    """
    with pool().connection() as conn:
        conn.execute(
            "update sales_insight_submissions set "
            "transcript = %s, metrics = %s, scores = %s, duration_s = %s, "
            "rubric_version = %s, model = %s, stt_model = %s "
            "where id = %s",
            (transcript, Json(metrics), Json(scores), duration_s,
             rubric_version, model, stt_model, sub_id),
        )
        conn.execute(
            "update submissions set status = 'scored', error = null, scored_at = now() "
            "where id = %s",
            (sub_id,),
        )


def fail_submission(sub_id, error: str) -> None:
    _exec(
        "update submissions set status = 'failed', error = %s where id = %s",
        (error[:500], sub_id),
    )


def fail_stale(older_than: timedelta, reason: str) -> int:
    """Rows still in flight after a restart are dead. Returns how many were cleared.

    Sweeps EVERY assessment type — a stranded row is stranded regardless of which
    assessment it belongs to.
    """
    return _exec(
        "update submissions set status = 'failed', error = %s "
        "where status in ('queued', 'processing') "
        "and created_at < now() - %s::interval",
        (reason, older_than),
    )


def get_status(sub_id) -> dict | None:
    """Minimal row for the polling endpoint. email drives the ownership check."""
    return _one(
        "select s.id, c.email, s.status "
        "from submissions s "
        "join candidates c on c.id = s.candidate_id "
        "where s.id = %s",
        (sub_id,),
    )


def get_submission(sub_id) -> dict | None:
    """The whole logical submission: parent state + child detail + identity.

    No oh_users join — who on staff acted on it is answered by activity_logs.
    """
    return _one(
        "select s.id, s.assessment_type, s.status, s.overall_stars, s.error, "
        "       s.created_at, s.scored_at, s.voided_at, "
        "       d.audio_key, d.audio_type, d.audio_bytes, d.duration_s, "
        "       d.transcript, d.metrics, d.scores, d.rubric_version, "
        "       d.model, d.stt_model, "
        "       c.email, c.name "
        "from submissions s "
        "join candidates c on c.id = s.candidate_id "
        "left join sales_insight_submissions d on d.id = s.id "
        "where s.id = %s",
        (sub_id,),
    )


def list_submissions(limit: int, offset: int, status: str | None) -> tuple[int, list]:
    """The board, scoped to this assessment type.

    duration_s comes from the child because it is audio-specific; everything
    else the board shows is on the parent.
    """
    where = (
        "where s.assessment_type = %s "
        "  and (%s::text is null or s.status = %s) "
    )
    args = (ASSESSMENT_TYPE, status, status)
    total = _one(
        f"select count(*) as n from submissions s {where}", args
    )["n"]
    rows = _all(
        "select s.id, c.email, c.name, s.status, s.overall_stars as overall, "
        "       d.duration_s, s.created_at, d.rubric_version "
        "from submissions s "
        "join candidates c on c.id = s.candidate_id "
        "left join sales_insight_submissions d on d.id = s.id "
        f"{where}"
        "order by s.created_at desc limit %s offset %s",
        args + (limit, offset),
    )
    return total, rows


def list_all_submissions(limit: int, offset: int) -> tuple[int, list]:
    """EVERY submission, of every assessment type. No UNION, no child join.

    This is what the parent table exists for. Unused by the current UI — there is
    one assessment type — but it is the query a second one makes free.
    """
    total = _one("select count(*) as n from submissions")["n"]
    rows = _all(
        "select s.id, c.email, c.name, s.assessment_type, s.status, "
        "       s.overall_stars as overall, s.created_at "
        "from submissions s "
        "join candidates c on c.id = s.candidate_id "
        "order by s.created_at desc limit %s offset %s",
        (limit, offset),
    )
    return total, rows


def void_submission(sub_id) -> bool:
    """Returns False if it was already voided.

    Who voided it is recorded in activity_logs by the caller, which is why no
    table here needs a reference to oh_users.
    """
    return _exec(
        "update submissions set status = 'voided', voided_at = now() "
        "where id = %s and status <> 'voided'",
        (sub_id,),
    ) > 0


# ── activity_logs ─────────────────────────────────────────────────────────
# Append-only. There is no update or delete against this table, anywhere.

def insert_log(*, actor_email, actor_role, action, entity, entity_id, data, ip, user_agent) -> None:
    _exec(
        "insert into activity_logs "
        "(actor_email, actor_role, action, entity, entity_id, data, ip, user_agent) "
        "values (%s, %s, %s, %s, %s, %s, %s, %s)",
        (actor_email, actor_role, action, entity, entity_id, Json(data), ip, user_agent),
    )


def list_logs(limit: int, offset: int, action: str | None = None,
              actor: str | None = None, entity_id: str | None = None) -> tuple[int, list]:
    """Newest first. Filters are ANDed; any combination may be omitted.

    Written as one statement with null-guards rather than assembled from
    fragments — string-built SQL is how a filter becomes an injection.
    """
    where = (
        "where (%s::text is null or action = %s) "
        "  and (%s::text is null or actor_email = %s) "
        "  and (%s::text is null or entity_id = %s) "
    )
    args = (action, action, actor, actor, entity_id, entity_id)
    total = _one(f"select count(*) as n from activity_logs {where}", args)["n"]
    rows = _all(
        "select id, at, actor_email, actor_role, action, entity, entity_id, data, ip "
        f"from activity_logs {where} order by at desc, id desc limit %s offset %s",
        args + (limit, offset),
    )
    return total, rows


def distinct_log_actions() -> list[str]:
    """Drives the filter row on the activity page, so it can never drift from
    the verbs actually in use."""
    return [r["action"] for r in _all(
        "select distinct action from activity_logs order by action"
    )]
