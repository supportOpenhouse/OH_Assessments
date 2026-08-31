import hashlib
import os

import pytest

os.environ.setdefault("ELEVENLABS_API_KEY", "test")
os.environ.setdefault("ANTHROPIC_API_KEY", "test")

from app import scoring  # noqa: E402


def test_rubric_version_is_a_stable_12_char_hash():
    assert len(scoring.RUBRIC_VERSION) == 12
    assert scoring.RUBRIC_VERSION == scoring.rubric_version_of(scoring.RUBRIC_MD)


def test_rubric_version_tracks_rubric_content():
    assert scoring.rubric_version_of("abc") == hashlib.sha256(b"abc").hexdigest()[:12]
    assert scoring.rubric_version_of("abc") != scoring.rubric_version_of("abd")


def test_score_schema_bounds_stars_and_requires_real_reasoning():
    s = scoring.SCORE_SCHEMA
    assert s["additionalProperties"] is False
    axis = s["$defs"]["axis"]["properties"]
    assert axis["stars"] == {"type": "integer", "minimum": 0, "maximum": 5}
    assert axis["reasoning"]["minLength"] >= 40
    for k in ("pitch", "tone", "company", "sales", "overall", "flags", "summary"):
        assert k in s["required"]


def test_submission_block_keeps_the_rubric_out_of_the_user_message():
    block = scoring.build_submission_block("hello world", {"wpm": 150})
    assert "hello world" in block
    assert "150" in block
    # The rubric lives in the cached system prefix. Repeating it here would
    # double input cost and gain nothing.
    assert "PLACEHOLDER RUBRIC" not in block


def test_glossary_has_no_per_candidate_content():
    # One varying byte in the cached prefix invalidates it for every request.
    g = scoring.METRICS_GLOSSARY
    assert "{" not in g and "}" not in g


# ── the placeholder guard ─────────────────────────────────────────────────

def test_the_shipped_rubric_is_still_the_placeholder():
    """A canary. When someone replaces rubric.md this test fails, which is the
    prompt to delete it and the guard along with it."""
    assert scoring.RUBRIC_IS_PLACEHOLDER


def test_scoring_refuses_a_placeholder_rubric_by_default(monkeypatch):
    """A number produced against a placeholder gets acted on. Refusing is the
    safer failure."""
    monkeypatch.setattr(scoring, "ALLOW_PLACEHOLDER", False)
    with pytest.raises(scoring.ScoringError, match="placeholder"):
        scoring.score(b"anything")


def test_the_placeholder_can_be_allowed_for_pipeline_testing(monkeypatch):
    monkeypatch.setattr(scoring, "ALLOW_PLACEHOLDER", True)
    called = {}
    monkeypatch.setattr(scoring, "transcribe",
                        lambda a: called.setdefault("hit", True) or {"text": "", "words": []})
    with pytest.raises(Exception):
        scoring.score(b"anything")      # fails later, at transcription
    assert called.get("hit"), "the guard must not fire when explicitly allowed"
