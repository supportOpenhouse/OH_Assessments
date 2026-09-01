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
the transcript.

The top-level block is the WHOLE recording, both voices blended. Do not score
delivery from it on a two-party call — it is the average of two people. Read
`by_speaker[<the salesperson>]` for Tone, and `conversation` for Sales skills.

## by_speaker — one block per voice, keyed by the speaker id in the transcript

wpm              < 110 slow/hesitant · 110-135 measured · 135-165 brisk, engaging
                 · 165-190 fast · > 190 rushed, hard to follow
fillers_per_min  < 2 clean · 2-4 normal · 4-7 noticeable · > 7 distracting
longest_pause_s  measured INSIDE that speaker's own turns, so it is hesitation,
                 not the gap while the other person is talking. > 6s is usually
                 a lost thread or a restart
pause_count_2s   deliberate pauses land emphasis; clustered ones read as searching
question_count   turns ending in "?". A rep asking none is talking AT the
                 customer rather than qualifying them
turn_count       how often they took the floor
longest_turn_s   their longest single unbroken stretch

## conversation — only meaningful because two people are on the call

talk_ratio          share of speech time per speaker. On a good discovery call
                    the REP is usually the smaller share (~.40-.55). A rep above
                    ~.75 is monologuing; below ~.25 has lost control of the call
interruptions       turns that began before the other person finished. A couple
                    is normal conversational overlap; a pattern is talking over
                    the customer, and it matters most when the rep does it
longest_monologue_s the longest unbroken stretch by anyone
turn_count          total floor changes. A very low count on a long call means
                    two monologues rather than a conversation

## whole-recording

speech_ratio     > .90 dense · .80-.90 natural · .70-.80 halting
                 · < .70 heavy dead air
speaker_count    2 is expected. 1 means diarisation found only one voice — flag
                 it, since a one-sided recording cannot show the interaction
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

# Scores are one decimal place, 0.0 to 5.0. The bands stay whole numbers and
# the decimal places a candidate WITHIN a band — a 3.4 is a solid 3, not most of
# a 4. Expressed as an enum of the 51 legal values because `minimum`/`maximum`
# are rejected outright by output_config.format (see the note above): the enum
# is what enforces the range AND the single decimal place, both of which a bare
# {"type": "number"} would leave the model free to ignore.
STAR_VALUES = [round(i / 10, 1) for i in range(51)]

_AXIS = {
    "type": "object",
    "additionalProperties": False,
    "required": ["stars", "reasoning"],
    "properties": {
        "stars": {"type": "number", "enum": STAR_VALUES},
        "reasoning": {"type": "string"},
    },
}

# _AXIS is repeated inline rather than referenced through $defs/$ref — one less
# JSON Schema feature for the validator to reject mid-run. It is the same dict
# object five times, so they cannot drift.
SCORE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": [*AXES, "salesperson", "flags", "summary"],
    "properties": {
        **{a: _AXIS for a in AXES},
        # Which voice was judged. Nothing tells us which speaker id is the rep —
        # the customer speaks first on plenty of calls, and the rep is not
        # reliably the one who talks most (a rep who lets the customer talk is
        # what the rubric REWARDS). So the model decides from context and has to
        # say so, and an admin can check that against the transcript. A score
        # against the wrong speaker is worse than no score, and silently so.
        "salesperson": {"type": "object", "additionalProperties": False,
                        "required": ["speaker", "reasoning"],
                        "properties": {"speaker": {"type": "string"},
                                       "reasoning": {"type": "string"}}},
        "flags": {"type": "array", "items": {"type": "string"}},
        "summary": {"type": "string"},
    },
}

MIN_REASONING = 40
MIN_SUMMARY = 20


def _output_json(msg) -> dict:
    """The scores, out of the response's text block.

    `output_config.format` guarantees the text block is valid JSON matching
    SCORE_SCHEMA, but nothing hands it back as a dict — see the note in judge().
    Every failure here names `stop_reason`, because "no text block" and "not
    JSON" have completely different causes (a refusal or a max_tokens cut-off
    versus a schema the API did not actually enforce).
    """
    text = next((b.text for b in msg.content if b.type == "text"), None)
    if not text:
        raise ScoringError(f"model returned no text block (stop_reason={msg.stop_reason})")
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise ScoringError(
            f"model output was not JSON (stop_reason={msg.stop_reason}): {e}"
        ) from e


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
        "Assess the SALESPERSON on this recorded call against the rubric.\n\n"
        "Two people are on the recording: the candidate (a salesperson) and a "
        "customer. The transcript is diarised but the speaker ids are arbitrary "
        "— work out which one is the salesperson from the content of the call, "
        "report it in `salesperson`, and score only that person. The customer is "
        "not being assessed.\n\n"
        "## Delivery metrics\n\n```json\n"
        + json.dumps(m, indent=2)
        + "\n```\n\n## Transcript\n\n"
        + transcript
    )


def diarized_transcript(words: list[dict], fallback: str) -> str:
    """One line per turn, labelled with the speaker.

    Scribe's plain `.text` is a single undivided wall with no idea who said
    what, which on a two-party call makes it impossible to score one of them.
    Falls back to that plain text when diarisation found only one voice — a
    transcript labelled `[speaker_unknown]` throughout is worse than none.
    """
    spoken = [w for w in words if w.get("type") == "word"]
    turns = metrics.turns(spoken)
    if len({t["speaker"] for t in turns}) < 2:
        return fallback
    return "\n".join(f"[{t['speaker']}] {t['text']}" for t in turns)


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
    # The SDK default is 2 retries, which a 529 (Anthropic overloaded) can still
    # outlast — and here that costs a candidate their single attempt, since the
    # run dies and an admin has to notice and re-score by hand. This is a
    # background job with nobody waiting on it, so trade latency for delivery:
    # 8 attempts with the SDK's own exponential backoff and jitter.
    client = anthropic.Anthropic(max_retries=8)
    # create(), NOT parse(). The SDK only fills `parsed_output` when parse() is
    # handed a pydantic TYPE via `output_format=` (lib/_parse/_response.py:
    # parse_text returns None otherwise) — so parse() with a hand-written schema
    # in `output_config` silently returned a message whose parsed_output was
    # always None. Going the other way, output_format=<pydantic model> makes the
    # SDK generate the schema, and a nested model generates $defs/$ref, which is
    # exactly the shape the API rejected earlier. Hand-written schema + read the
    # text block ourselves is the combination that actually works here.
    msg = client.messages.create(
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
    parsed = _output_json(msg)
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
    # The diarised transcript is what gets judged AND what gets stored, so an
    # admin reads exactly what the model read.
    transcript = diarized_transcript(t["words"], t["text"])
    scores = judge(transcript, m)
    return {
        "transcript": transcript,
        "metrics": m,
        "scores": scores,
        "duration_s": m["duration_s"],
        "rubric_version": RUBRIC_VERSION,
        "model": MODEL,
        "stt_model": STT_MODEL,
    }
