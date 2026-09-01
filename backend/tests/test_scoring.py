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


def test_score_schema_bounds_stars_to_the_six_bands():
    s = scoring.SCORE_SCHEMA
    assert s["additionalProperties"] is False
    for a in scoring.AXES:
        assert s["properties"][a]["properties"]["stars"]["enum"] == [0, 1, 2, 3, 4, 5]
    for k in (*scoring.AXES, "flags", "summary"):
        assert k in s["required"]


def test_score_schema_uses_only_keywords_the_api_accepts():
    """The API rejects most of JSON Schema in output_config.format — and it does
    so with a 400 at scoring time, long after the candidate's upload succeeded.
    minimum/maximum on an integer cost one such round. Anything outside this set
    has to be proven supported before it goes in."""
    allowed = {"type", "properties", "required", "additionalProperties", "items", "enum"}
    seen = set()

    def walk(node):
        if isinstance(node, dict):
            seen.update(node.keys())
            for k, v in node.items():
                # under "properties" the keys are OUR field names, not schema
                # keywords — descend to the subschemas without collecting them
                walk(list(v.values()) if k == "properties" else v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(scoring.SCORE_SCHEMA)
    assert seen <= allowed, f"unproven schema keywords: {sorted(seen - allowed)}"


class _Block:
    def __init__(self, type, text=None):
        self.type, self.text = type, text


class _Msg:
    def __init__(self, content, stop_reason="end_turn"):
        self.content, self.stop_reason = content, stop_reason


def test_output_json_reads_the_text_block_past_the_thinking_block():
    """parse()'s parsed_output is None unless it is given a pydantic type, so we
    read the JSON ourselves. Thinking is on, so the text block is not content[0]."""
    msg = _Msg([_Block("thinking"), _Block("text", '{"pitch": {"stars": 4}}')])
    assert scoring._output_json(msg) == {"pitch": {"stars": 4}}


def test_output_json_names_the_stop_reason_when_there_is_nothing_to_read():
    with pytest.raises(scoring.ScoringError, match="max_tokens"):
        scoring._output_json(_Msg([_Block("thinking")], stop_reason="max_tokens"))
    with pytest.raises(scoring.ScoringError, match="not JSON"):
        scoring._output_json(_Msg([_Block("text", "Sure! Here you go:")]))


def test_stub_reasoning_is_rejected():
    """minLength used to do this in the schema; the schema can no longer say it."""
    good = {a: {"stars": 3, "reasoning": "x" * 60} for a in scoring.AXES}
    good["summary"] = "y" * 40
    scoring._reject_stub_reasoning(good)          # does not raise

    stub = {**good, "pitch": {"stars": 5, "reasoning": "Good pitch."}}
    with pytest.raises(scoring.ScoringError, match="pitch"):
        scoring._reject_stub_reasoning(stub)


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

def test_the_shipped_rubric_is_live():
    """rubric.md is the real rubric now — scoring must not refuse it, and no
    deploy may need ALLOW_PLACEHOLDER_RUBRIC to score. The guard below stays
    armed for the day someone drops a stub back in."""
    assert not scoring.RUBRIC_IS_PLACEHOLDER


def test_scoring_refuses_a_placeholder_rubric_by_default(monkeypatch):
    """A number produced against a placeholder gets acted on. Refusing is the
    safer failure."""
    monkeypatch.setattr(scoring, "RUBRIC_IS_PLACEHOLDER", True)
    monkeypatch.setattr(scoring, "ALLOW_PLACEHOLDER", False)
    with pytest.raises(scoring.ScoringError, match="placeholder"):
        scoring.score(b"anything")


def test_the_placeholder_can_be_allowed_for_pipeline_testing(monkeypatch):
    monkeypatch.setattr(scoring, "RUBRIC_IS_PLACEHOLDER", True)
    monkeypatch.setattr(scoring, "ALLOW_PLACEHOLDER", True)
    called = {}
    monkeypatch.setattr(scoring, "transcribe",
                        lambda a: called.setdefault("hit", True) or {"text": "", "words": []})
    with pytest.raises(Exception):
        scoring.score(b"anything")      # fails later, at transcription
    assert called.get("hit"), "the guard must not fire when explicitly allowed"


# ── the SDK contract we actually depend on ────────────────────────────────

def test_the_installed_sdk_exposes_speech_to_text():
    """elevenlabs 1.x has speech_to_speech but NOT speech_to_text — pinning a
    version from memory shipped exactly that break. This fails loudly if the pin
    ever moves back."""
    from elevenlabs.client import ElevenLabs
    assert hasattr(ElevenLabs(api_key="x"), "speech_to_text")


def test_scribe_v2_is_a_model_id_the_sdk_accepts():
    import typing
    from elevenlabs.speech_to_text.types.speech_to_text_convert_request_model_id \
        import SpeechToTextConvertRequestModelId as M
    allowed = typing.get_args(typing.get_args(M)[0])
    assert scoring.STT_MODEL in allowed, f"{scoring.STT_MODEL} not in {allowed}"


def test_the_word_fields_metrics_reads_all_exist():
    from elevenlabs.types.speech_to_text_word_response_model import (
        SpeechToTextWordResponseModel as W)
    for field in ("text", "start", "end", "type", "speaker_id"):
        assert field in W.model_fields, field


def test_the_response_carries_an_authoritative_duration():
    from elevenlabs.types.speech_to_text_chunk_response_model import (
        SpeechToTextChunkResponseModel as R)
    assert "audio_duration_secs" in R.model_fields


# ── two speakers: the rep and the customer ────────────────────────────────

def test_the_transcript_handed_to_the_model_is_labelled_by_speaker():
    """Scribe's plain .text is one undivided wall. Scoring one person out of a
    two-party call is impossible without knowing who said what."""
    words = [
        {"type": "word", "text": "Hello?", "start": 0.0, "end": 1.0, "speaker_id": "speaker_1"},
        {"type": "word", "text": "Hi,", "start": 1.0, "end": 1.5, "speaker_id": "speaker_0"},
        {"type": "word", "text": "Anil", "start": 1.5, "end": 2.0, "speaker_id": "speaker_0"},
    ]
    out = scoring.diarized_transcript(words, "Hello? Hi, Anil")
    assert out == "[speaker_1] Hello?\n[speaker_0] Hi, Anil"


def test_a_single_voice_falls_back_to_the_plain_transcript():
    """A transcript labelled [speaker_unknown] throughout is worse than none."""
    words = [{"type": "word", "text": "Hi", "start": 0.0, "end": 1.0, "speaker_id": "speaker_0"}]
    assert scoring.diarized_transcript(words, "Hi") == "Hi"


def test_the_model_must_say_which_speaker_it_judged():
    """Two people are on the call and only one is assessed. A score against the
    customer is indistinguishable from a bad score unless this is recorded."""
    sp = scoring.SCORE_SCHEMA["properties"]["salesperson"]
    assert "salesperson" in scoring.SCORE_SCHEMA["required"]
    assert sp["required"] == ["speaker", "reasoning"]


def test_discovery_is_a_scored_axis():
    assert "discovery" in scoring.AXES
    assert "discovery" in scoring.SCORE_SCHEMA["required"]


def test_the_prompt_says_who_is_being_assessed():
    block = scoring.build_submission_block("[speaker_0] hi", {"wpm": 150})
    assert "salesperson" in block.lower() and "customer" in block.lower()
