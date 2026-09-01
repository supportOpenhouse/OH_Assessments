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

# rubric.md is the live rubric, so this guard is inert — it stays armed for the
# day someone drops a stub back in. Scoring a candidate against placeholder
# criteria produces a plausible-looking number that means nothing, which is
# worse than not scoring at all, because a number gets acted on. So a rubric
# carrying the marker REFUSES by default; ALLOW_PLACEHOLDER_RUBRIC=true is the
# escape hatch for exercising the pipeline against a stub.
PLACEHOLDER_MARKER = "PLACEHOLDER RUBRIC"
RUBRIC_IS_PLACEHOLDER = PLACEHOLDER_MARKER in RUBRIC_MD
ALLOW_PLACEHOLDER = os.environ.get("ALLOW_PLACEHOLDER_RUBRIC", "").lower() == "true"

if RUBRIC_IS_PLACEHOLDER:
    log.warning(
        "rubric.md is still the PLACEHOLDER. Scoring %s. "
        "Replace backend/rubric.md before assessing real candidates.",
        "is ALLOWED (ALLOW_PLACEHOLDER_RUBRIC=true)" if ALLOW_PLACEHOLDER else "will REFUSE",
    )

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

# The structured-output schema subset is NARROW. `minimum`/`maximum` on an
# integer are rejected outright ("For 'integer' type, properties maximum,
# minimum are not supported" — a 400 at scoring time, after the upload has
# already succeeded). `enum` is how you bound a number. Length constraints
# (`minLength`) are out for the same reason, so the "no one-line reasoning"
# rule moved to _reject_stub_reasoning() below. Keep this schema to:
# object / string / integer+enum / array / required / additionalProperties.
AXES = ("pitch", "tone", "company", "sales", "overall")

_AXIS = {
    "type": "object",
    "additionalProperties": False,
    "required": ["stars", "reasoning"],
    "properties": {
        "stars": {"type": "integer", "enum": [0, 1, 2, 3, 4, 5]},
        "reasoning": {"type": "string"},
    },
}

# _AXIS is repeated inline rather than referenced through $defs/$ref — one less
# JSON Schema feature for the validator to reject mid-run. It is the same dict
# object five times, so they cannot drift.
SCORE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": [*AXES, "flags", "summary"],
    "properties": {
        **{a: _AXIS for a in AXES},
        "flags": {"type": "array", "items": {"type": "string"}},
        "summary": {"type": "string"},
    },
}

MIN_REASONING = 40
MIN_SUMMARY = 20


def _reject_stub_reasoning(parsed: dict) -> None:
    """What `minLength` used to do, now that the schema cannot express it.

    Without it a model will happily emit "Good pitch." against a strict schema
    and the whole point of the assessment evaporates. Raising means the row
    lands as `failed` and an admin can re-score — better than filing a stub.
    """
    short = [a for a in AXES
             if len(parsed.get(a, {}).get("reasoning", "").strip()) < MIN_REASONING]
    if len(parsed.get("summary", "").strip()) < MIN_SUMMARY:
        short.append("summary")
    if short:
        raise ScoringError(f"model returned stub reasoning for: {', '.join(short)}")


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
    # audio_duration_secs is the AUDIO's length; the last word's end time is not.
    return {
        "text": r.text,
        "words": words,
        "audio_duration_s": getattr(r, "audio_duration_secs", None),
    }


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
    parsed = msg.parsed_output
    _reject_stub_reasoning(parsed)
    return parsed


def score(audio: bytes) -> dict:
    if RUBRIC_IS_PLACEHOLDER and not ALLOW_PLACEHOLDER:
        raise ScoringError(
            "rubric.md is still the placeholder — refusing to score. Replace "
            "backend/rubric.md, or set ALLOW_PLACEHOLDER_RUBRIC=true to test "
            "the pipeline."
        )
    t = transcribe(audio)
    m = metrics.derive(t["words"], t.get("audio_duration_s"))
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
