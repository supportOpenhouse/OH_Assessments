"""ElevenLabs Scribe -> delivery metrics -> Claude.

The rubric is the cached system prefix and is hashed into every row, so any
score can be traced back to the exact text that produced it.
"""

import hashlib
import io
import json
import logging
import os
import pathlib

import anthropic
from elevenlabs.client import ElevenLabs

from . import metrics

log = logging.getLogger(__name__)

MODEL = "claude-opus-5"
# Verify against the live API before first use — the docs name the model but not
# the id string. scribe_v1 is the known-good predecessor.
STT_MODEL = os.environ.get("STT_MODEL", "scribe_v2")

_ROOT = pathlib.Path(__file__).resolve().parent.parent


class ScoringError(Exception):
    pass


def rubric_version_of(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:12]


RUBRIC_MD = (_ROOT / "rubric.md").read_text()
RUBRIC_VERSION = rubric_version_of(RUBRIC_MD)

# Numbers mean nothing to a model without bands. Part of the cached prefix, so
# it must never contain anything that varies per candidate.
METRICS_GLOSSARY = """\
# How to read the delivery metrics

These are measured from the recording's word-level timings, not inferred from
the transcript. Use them for the Tone axis.

wpm              < 110 slow/hesitant · 110-135 measured · 135-165 brisk, engaging
                 · 165-190 fast · > 190 rushed, hard to follow
fillers_per_min  < 2 clean · 2-4 normal · 4-7 noticeable · > 7 distracting
speech_ratio     > .90 dense · .80-.90 natural · .70-.80 halting
                 · < .70 heavy dead air
longest_pause_s  > 6s usually a lost thread or a restart
pause_count_2s   deliberate pauses land emphasis; clustered ones read as searching
speaker_count    > 1 means another voice is on the recording. Note it in flags;
                 do not lower a score for it on its own
audio_events     non-speech sounds Scribe tagged (laughter, music, applause)
"""

_AXIS = {
    "type": "object",
    "additionalProperties": False,
    "required": ["stars", "reasoning"],
    "properties": {
        "stars": {"type": "integer", "minimum": 0, "maximum": 5},
        # minLength is load-bearing: under a strict schema a model will happily
        # emit "Good pitch." and the whole point of the tool evaporates.
        "reasoning": {"type": "string", "minLength": 40},
    },
}

SCORE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["pitch", "tone", "company", "sales", "overall", "flags", "summary"],
    "properties": {
        "pitch": {"$ref": "#/$defs/axis"},
        "tone": {"$ref": "#/$defs/axis"},
        "company": {"$ref": "#/$defs/axis"},
        "sales": {"$ref": "#/$defs/axis"},
        "overall": {"$ref": "#/$defs/axis"},
        "flags": {"type": "array", "items": {"type": "string"}},
        "summary": {"type": "string", "minLength": 20},
    },
    "$defs": {"axis": _AXIS},
}


def build_submission_block(transcript: str, m: dict) -> str:
    """The volatile half of the prompt. The rubric is NOT repeated here — it
    lives in the cached system prefix, and duplicating it would double input
    cost for nothing."""
    return (
        "Assess this candidate's recorded sales pitch against the rubric.\n\n"
        "## Delivery metrics\n\n```json\n"
        + json.dumps(m, indent=2)
        + "\n```\n\n## Transcript\n\n"
        + transcript
    )


def transcribe(audio: bytes) -> dict:
    client = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
    r = client.speech_to_text.convert(
        file=io.BytesIO(audio),
        model_id=STT_MODEL,
        diarize=True,
        tag_audio_events=True,
        timestamps_granularity="word",
    )
    words = [w.model_dump() if hasattr(w, "model_dump") else dict(w) for w in (r.words or [])]
    if not words:
        raise ScoringError("transcription returned no speech: audio may be silent or corrupt")
    return {"text": r.text, "words": words}


def judge(transcript: str, m: dict) -> dict:
    client = anthropic.Anthropic()
    msg = client.messages.parse(
        model=MODEL,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        # effort=max: a hiring decision, and cost is explicitly not a constraint
        # on this project. budget_tokens does not exist on Opus 5 — it 400s.
        output_config={
            "effort": "max",
            "format": {"type": "json_schema", "schema": SCORE_SCHEMA},
        },
        system=[
            {"type": "text", "text": RUBRIC_MD, "cache_control": {"type": "ephemeral"}},
            {"type": "text", "text": METRICS_GLOSSARY, "cache_control": {"type": "ephemeral"}},
        ],
        messages=[{"role": "user", "content": build_submission_block(transcript, m)}],
    )
    # Opus 5 can decline with HTTP 200. A transcript is untrusted user content.
    if msg.stop_reason == "refusal":
        raise ScoringError(f"model declined to score: {msg.stop_details}")

    usage = getattr(msg, "usage", None)
    if usage is not None:
        # Zero cache reads on the second and later runs means something volatile
        # crept into the system prefix — a permanent 2x on input cost.
        log.info(
            "claude usage in=%s cache_read=%s out=%s",
            getattr(usage, "input_tokens", "?"),
            getattr(usage, "cache_read_input_tokens", "?"),
            getattr(usage, "output_tokens", "?"),
        )
    return msg.parsed_output


def score(audio: bytes) -> dict:
    t = transcribe(audio)
    m = metrics.derive(t["words"])
    scores = judge(t["text"], m)
    return {
        "transcript": t["text"],
        "metrics": m,
        "scores": scores,
        "duration_s": m["duration_s"],
        "rubric_version": RUBRIC_VERSION,
        "model": MODEL,
        "stt_model": STT_MODEL,
    }
