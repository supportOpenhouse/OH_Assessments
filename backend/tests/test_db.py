"""Statement-shape tests for the parent/child split.

These do not touch a database. They pin the things that are easy to break
silently: which table each statement targets, and that the two inserts making up
one logical submission happen inside ONE transaction.
"""

import os
import re

import pytest

os.environ.setdefault("JWT_SECRET", "t" * 32)  # >= MIN_SECRET_LEN
os.environ.setdefault("GOOGLE_OAUTH_CLIENT_ID", "test-client")

from app import db  # noqa: E402


class FakeConn:
    rowcount = 1

    def __init__(self, sink):
        self.sink = sink

    def execute(self, sql, params=()):
        self.sink.append((" ".join(sql.split()), params))
        return self

    def fetchone(self):
        return {"id": "x", "n": 0, "created": False}

    def fetchall(self):
        return []


class FakePool:
    """One context-manager entry == one transaction, which is what we assert on."""

    def __init__(self):
        self.txns = []      # list of statement-lists, one per `with` block
        self._open = None

    def connection(self):
        pool = self

        class Ctx:
            def __enter__(self):
                pool._open = []
                return FakeConn(pool._open)

            def __exit__(self, *a):
                pool.txns.append(pool._open)
                pool._open = None
                return False

        return Ctx()


@pytest.fixture
def pool(monkeypatch):
    p = FakePool()
    monkeypatch.setattr(db, "pool", lambda: p)
    return p


def test_create_submission_writes_both_tables_in_one_transaction(pool):
    db.create_submission("sub-1", "cand-1", "audio/sub-1.mp3", "audio/mpeg", 1000)

    assert len(pool.txns) == 1, "parent and child must share one transaction"
    stmts = [s for s, _ in pool.txns[0]]
    assert len(stmts) == 2

    # Order is forced by the foreign key AND by the child's parent-guard trigger:
    # the child cannot be inserted before a parent of the right type exists.
    assert stmts[0].startswith("insert into submissions")
    assert stmts[1].startswith("insert into sales_insight_submissions")


def test_create_submission_stamps_the_assessment_type(pool):
    db.create_submission("sub-1", "cand-1", "k", "audio/mpeg", 1)
    _, params = pool.txns[0][0]
    assert db.ASSESSMENT_TYPE in params


def test_finish_submission_splits_detail_from_state_in_one_transaction(pool):
    db.finish_submission("sub-1", transcript="t", metrics={}, scores={}, duration_s=1.0,
                         rubric_version="v", model="m", stt_model="s")

    assert len(pool.txns) == 1
    stmts = [s for s, _ in pool.txns[0]]
    assert stmts[0].startswith("update sales_insight_submissions"), "detail goes to the child"
    assert stmts[1].startswith("update submissions"), "state goes to the parent"

    # overall_stars is the trigger's job. Writing it here would mean a score
    # arriving by any other route never reaches the parent.
    assert "overall_stars" not in " ".join(stmts)


def test_state_changes_target_the_parent_only(pool):
    for fn, args in (
        (db.set_processing, ("sub-1",)),
        (db.fail_submission, ("sub-1", "boom")),
        (db.void_submission, ("sub-1",)),
    ):
        pool.txns.clear()
        fn(*args)
        sql = pool.txns[0][0][0]
        assert sql.startswith("update submissions "), f"{fn.__name__} wrote: {sql[:60]}"


def test_status_and_candidate_id_exist_only_on_the_parent():
    """The whole point of the split: no value lives in two places."""
    src = open(os.path.join(os.path.dirname(__file__), "..", "app", "db.py")).read()
    child_writes = re.findall(
        r"(?:insert into|update) sales_insight_submissions(.*?)(?:where|values)", src, re.S
    )
    for chunk in child_writes:
        for col in ("status", "candidate_id", "created_at", "scored_at", "voided_at"):
            assert col not in chunk, f"'{col}' is the parent's — duplicating it invites drift"


def test_the_holder_query_needs_no_union(pool):
    """list_all_submissions is why the parent table exists."""
    db.list_all_submissions(50, 0)
    sql = " ".join(s for txn in pool.txns for s, _ in txn).lower()
    assert "union" not in sql
    assert "sales_insight_submissions" not in sql, "cross-assessment reads never touch a child"
