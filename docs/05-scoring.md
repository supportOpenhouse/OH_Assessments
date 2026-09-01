# 05 — The Scoring Pipeline

Three stages, one request. Pure functions where possible so the parts that can be
tested without a network call, are.

```
R2 object ─▶ ① ElevenLabs Scribe v2 ──▶ ② metrics.py ──▶ ③ Claude Opus 5 ──▶ scores
              transcript + word            pure Python        the rubric as
              timestamps + events          no I/O             cached prefix
```

---

## 1. Stage ① — Transcription

**ElevenLabs Scribe v2.** Chosen because it returns, in one call, everything the
delivery metrics need: word- *and* character-level timestamps, speaker diarization
(up to 32 speakers), and inline audio-event tags for non-speech sounds like
`(laughter)`. Limits are 3 GB / 10 hours — far beyond anything we'll send. Cost is
**$0.22 per hour** of audio, so a 3-minute pitch transcribes for about **$0.011**.

```python
from elevenlabs.client import ElevenLabs

client = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
result = client.speech_to_text.convert(
    file=audio_bytes,
    model_id="scribe_v2",
    diarize=True,
    tag_audio_events=True,
    timestamps_granularity="word",
)
```

> ✅ **`model_id` confirmed: `scribe_v2`.** The SDK types the parameter as
> `Literal['scribe_v2', 'scribe_v1']`, so both are live and v2 is the one used.
> `test_scribe_v2_is_a_model_id_the_sdk_accepts` asserts this against the
> installed package rather than a docs page.
>
> **The SDK must be `elevenlabs` 2.x.** 1.x exposes `speech_to_speech` but not
> `speech_to_text`; Scribe only exists from 2.x onward.

The response's `words` array classifies each entry as `word`, `spacing`, or
`audio_event` — that three-way split is what makes stage ② possible.

## 2. Stage ② — Delivery metrics (`api/metrics.py`)

A pure function: word list in, numbers out. No network, no state, no config.
This is the file that gets a real unit test.

```python
FILLERS = {"um","uh","er","ah","like","basically","actually",
           "literally","honestly","right","so","you know","i mean",
           "sort of","kind of"}

def derive(words: list[dict]) -> dict:
    """Scribe word entries -> delivery metrics. Pure; no I/O."""
```

Produces the `metrics` jsonb documented in
[03-data-model.md §3](03-data-model.md): `wpm`, `speech_ratio`, `pause_count_2s`,
`longest_pause_s`, `fillers_per_min`, `audio_events`, `speaker_count`.

Plus, since the recordings became two-party calls, a **`by_speaker`** block (the
same delivery figures per voice, with pauses measured inside that speaker's own
turns) and a **`conversation`** block (`talk_ratio`, `interruptions`,
`turn_count`, `longest_monologue_s`).

Two rules that are easy to get wrong:

- **`wpm` is computed over speech time, not wall time.** A candidate who talks
  fast but pauses a lot is a different problem from one who talks slowly, and
  dividing by wall time collapses the two into the same number.
- **Two speakers are now EXPECTED, and one is the anomaly.** These are real
  sales calls: a candidate and a customer. `speaker_count == 1` means diarisation
  found a single voice, and a one-sided recording cannot show the interaction —
  that is what goes in `scores.flags`.
- **The top-level figures blend both voices, so they are the wrong ones to score
  a rep on.** Tone reads `by_speaker[<the salesperson>]`. The blended block stays
  because the admin metrics strip renders it.
- **A pause while the other person is talking is not hesitation.** Per-speaker
  pauses are measured within that speaker's own turns; measuring across all words
  scores a good listener as halting.

## 3. Stage ③ — Claude

Model: **`claude-opus-5`**. This is a judgement task where the reasoning is the
deliverable — an admin has to be able to disagree with a 2 and see why it was a 2.

```python
import anthropic

client = anthropic.Anthropic()   # reads ANTHROPIC_API_KEY

msg = client.messages.parse(
    model="claude-opus-5",
    max_tokens=16000,
    thinking={"type": "adaptive"},
    output_config={
        "effort": "max",
        "format": {"type": "json_schema", "schema": SCORE_SCHEMA},
    },
    system=[
        {"type": "text", "text": RUBRIC_MD,
         "cache_control": {"type": "ephemeral"}},        # ── cached prefix
        {"type": "text", "text": METRICS_GLOSSARY,
         "cache_control": {"type": "ephemeral"}},
    ],
    messages=[{"role": "user", "content": build_submission_block(transcript, metrics)}],
)
```

Four things here are deliberate:

**Adaptive thinking, effort `max`.** `max` is for when correctness matters more
than cost, which is the whole shape of a hiring decision — the difference between
a 2 and a 3 is whether someone gets a job. Scoring against a rubric with six
defined bands rewards reasoning depth more than almost any other task type.
`budget_tokens` does not exist on Opus 5 — it returns a 400. Do not carry that
pattern in from older code.

**The rubric is the cached prefix.** `sales_insight_rubric.md` and the metrics glossary are byte-identical
across every candidate, so they cache; the transcript is volatile and goes after
the last breakpoint, in `messages`. Verify it's working by checking
`usage.cache_read_input_tokens` is non-zero on the second and later submissions —
if it's always zero, something is varying inside the prefix.

**Structured outputs via `output_config.format`.** Not the deprecated top-level
`output_format`. `messages.parse()` validates the response against the schema, so
there is no JSON parsing or repair code to write.

**Check `stop_reason` before reading content.** Opus 5 can return
`stop_reason: "refusal"` with HTTP 200. Unlikely on a sales pitch, but a
transcript is untrusted user content and the guard is one line. If refusals ever
show up in practice, the fix is the server-side `fallbacks` parameter
(`betas=["server-side-fallback-2026-07-01"]`, `fallbacks="default"` on
`client.beta.messages`) rather than a retry loop — note that this moves the call
to the beta namespace, so confirm it composes with `.parse()` before adopting it.

## 4. The metrics glossary

Numbers mean nothing to a model without bands. This block is part of the cached
system prefix and exists so `wpm: 153` reads as a judgement rather than a guess.

```
wpm              < 110 slow/hesitant · 110-135 measured · 135-165 brisk, engaging
                 · 165-190 fast · > 190 rushed, hard to follow
fillers_per_min  < 2 clean · 2-4 normal · 4-7 noticeable · > 7 distracting
speech_ratio     > .90 dense · .80-.90 natural · .70-.80 halting · < .70 heavy dead air
longest_pause_s  > 6s usually a lost thread or a restart
pause_count_2s   deliberate pauses land emphasis; clustered ones read as searching
speaker_count    > 1 means another voice is on the recording — note it, don't punish it
```

## 5. Output schema

> **Superseded by `backend/app/scoring.py::SCORE_SCHEMA`, which is the live
> one.** The block below was written against ordinary JSON Schema and every
> highlighted feature in it is REJECTED by `output_config.format` — `minimum` /
> `maximum` on an integer return a 400, `minLength` goes the same way, and
> `$defs`/`$ref` were dropped rather than risk another round-trip. The failure
> arrives at scoring time, after the candidate's upload has already succeeded.
> Bound a number with `enum`; enforce lengths in Python.

The live shape, as of the two-party call rework:

```jsonc
{
  "type": "object",
  "additionalProperties": false,
  "required": ["pitch","tone","company","sales","overall",
               "salesperson","flags","summary"],
  "properties": {
    // each of the five axes, inlined — no $ref
    "pitch": {
      "type": "object", "additionalProperties": false,
      "required": ["stars","reasoning"],
      "properties": {
        // 0.0-5.0 in tenths. enum enforces range AND precision; minimum/
        // maximum are rejected by output_config.format.
        "stars":     { "type": "number", "enum": [0.0, 0.1, "…", 5.0] },
        "reasoning": { "type": "string" }
      }
    },
    // which voice was judged — two people are on the call, one is assessed
    "salesperson": {
      "type": "object", "additionalProperties": false,
      "required": ["speaker","reasoning"],
      "properties": { "speaker": {"type":"string"}, "reasoning": {"type":"string"} }
    },
    "flags":   { "type": "array", "items": { "type": "string" } },
    "summary": { "type": "string" }
  }
}
```

The no-stub-reasoning rule that `minLength` used to carry now lives in
`_reject_stub_reasoning()`. Without it a model under a strict schema will happily
emit `"Good pitch."` and the whole point of the tool — a defensible verdict —
evaporates.

## 6. Cost per candidate

For a 3-minute pitch (~450 words):

| Item | Amount | Cost |
|---|---|---|
| Scribe v2 | 3 min @ $0.22/hr | **$0.011** |
| Claude input | ~2,500 tok @ $5/MTok (mostly cached after the first) | **~$0.013** |
| Claude output + thinking | ~2,500 tok @ $25/MTok (`effort: max`) | **~$0.063** |
| | | **≈ $0.09** |

Inside the $0.15 target in [01-spec.md §8](01-spec.md); around $0.27 if the panel
in §8 is switched on. 500 candidates costs $45–135 all in.

**Cost is not a design constraint on this project and must never be traded
against scoring quality.** The user said so explicitly. If a change would make
scores more reliable and more expensive, take it.

## 7. Phase 2 — vocal pitch

Deferred, not dropped. Scribe gives no F0 contour, so true vocal pitch —
fundamental frequency range, intonation variance, monotone detection, jitter —
is not measurable in this pipeline.

> **No longer blocked by infrastructure.** The original reason for deferring this
> was Vercel's serverless bundle limit — `librosa` / `parselmouth` are ~300 MB of
> native wheels. The backend now runs in a Render container with no bundle limit,
> so this is a **product** decision, not a platform one.

**Why it is still deferred:** it adds a sixth scoring dimension to calibrate
before the base four-axis rubric has been proven against real recordings. Get the
rubric right first; a wobbly rubric plus a new axis is two unknowns at once.

**The path, when you want it:**

1. `pip install praat-parselmouth` into `backend/requirements.txt`. No
   infrastructure change — it just installs.
2. Add a `prosody` key to `metrics`: `f0_mean`, `f0_range_semitones`, `f0_std`,
   `monotone_score`.
3. Add a matching band block to the glossary in §4, so the numbers mean something
   to the model.
4. Split the rubric's **Pitch** axis into `pitch_content` and `pitch_voice`, or add
   a sixth axis. Bump `rubric_version` so pre- and post-change scores are never
   silently compared.

Nothing in Phase 1 blocks this. `metrics` is jsonb, `scores` is jsonb, and
`rubric_version` exists precisely to mark the discontinuity.

**Cheap intermediate step:** extract and store the prosody numbers without
scoring them. Steps 1–2 only. You accumulate real data on what the values look
like across actual candidates before they ever affect anyone's rating.

## 8. Judgement reliability

[01-spec.md §8](01-spec.md) sets a hard success criterion: **the same audio scored
twice must land within ±1 star on every axis.** That is a variance property, and
an LLM judge sampling once has no guarantee of it. Borderline candidates — the
3-versus-4 calls, which are exactly the ones a hiring manager cares about — are
where a single sample wobbles.

**Measure before building.** Task 10 of [08-plan.md](08-plan.md) already runs the
±1 check. Score five real recordings three times each and look at the spread.

**If it holds**, ship the single call. Nothing more to do.

**If it wobbles**, switch on the panel — three independent judgements, per-axis
median:

```python
def judge_panel(transcript: str, m: dict, n: int = 3) -> dict:
    """N independent judgements, median per axis. Reasoning comes from the
    sample that landed ON the median, so the text always matches the number."""
    runs = [judge(transcript, m) for _ in range(n)]
    out = {}
    for axis in ("pitch", "tone", "company", "sales", "overall"):
        stars = sorted(r[axis]["stars"] for r in runs)
        med = stars[len(stars) // 2]
        pick = next(r for r in runs if r[axis]["stars"] == med)
        out[axis] = {"stars": med, "reasoning": pick[axis]["reasoning"],
                     "spread": stars[-1] - stars[0]}
    out["flags"] = sorted({f for r in runs for f in r["flags"]})
    out["summary"] = runs[0]["summary"]
    return out
```

Three properties worth keeping if you rewrite this:

- **Median, not mean.** A mean produces 3.67 stars, which is not a band on the
  scale in [01-spec.md §3](01-spec.md) and would have to be rounded anyway.
- **Reasoning comes from the run that produced the median.** Averaging numbers
  while keeping a different run's prose would show an admin text that argues for
  a different score than the one displayed.
- **`spread` is stored.** A spread of 2+ on an axis means the model itself is
  torn, and that is worth surfacing to the admin — it usually marks a genuinely
  ambiguous candidate rather than a broken rubric.

Cost with the panel is roughly **$0.27 per candidate**. Latency goes to 40–70s
run serially, or back to near a single call with `asyncio.gather`. Either is fine
— scoring is a background task with no timeout ([02-architecture.md §6](02-architecture.md)).

> **The panel treats a symptom.** High spread usually means the rubric is
> ambiguous at that band boundary. Fix the rubric first; reach for the panel when
> the rubric is genuinely tight and the model still wobbles.
