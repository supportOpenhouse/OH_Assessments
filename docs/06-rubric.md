# 06 — Rubric (how it is used)

> **The live rubric is [`backend/rubric.md`](../backend/rubric.md).** That file
> is what Claude is given and what `rubric_version` hashes. This doc is the
> *shape* it must keep — the fixed 0–5 scale, the five axis names the schema
> depends on, and how versioning works. The per-axis tables below are the
> original illustrative draft, kept for reference; `backend/rubric.md` supersedes
> them and is the one to edit.
>
> Still outstanding: **calibration** (§8). Nothing has been scored against a
> human opinion yet, so treat early numbers as directional.

---

## How this file is used

At build time the contents of `rubric.md` (repo root — this doc describes its
shape) become the **cached system prefix** of every Claude call. It is hashed:

```python
rubric_version = hashlib.sha256(RUBRIC_MD.encode()).hexdigest()[:12]
```

and that hash is stored on every `submissions` row. So:

- Editing the rubric changes `rubric_version`, and every score written afterwards
  is distinguishable from every score written before.
- Two candidates are only ever compared fairly if their `rubric_version` matches.
  The admin list should say so when they don't.
- Editing the rubric requires **no code change and no redeploy of logic** — just
  a new deploy of the file.

Rewrite the rubric freely. Do not rename the five axes (`pitch`, `tone`,
`company`, `sales`, `overall`) without also editing `SCORE_SCHEMA` in
[05-scoring.md §5](05-scoring.md).

---

## 1. The scale (fixed — do not change)

| Stars | Label | Meaning |
|---|---|---|
| 0 | Irrelevant | Off-topic, inaudible, not a sales pitch, or empty |
| 1 | Reject | Genuinely poor. No path to fixing it with training |
| 2 | Can hire, but train | Real gaps, but coachable ones |
| 3 | Average — can hire | Competent. Would not stand out |
| 4 | Hire | Clearly good. Confident yes |
| 5 | Must hire | Exceptional. Move fast before someone else does |

**0 is not "very bad".** 0 means the submission does not answer the task —
wrong topic, no audio, reading a script off a page, a different language than
asked. Bad-but-on-task is a 1.

---

## 2. Axis: **Pitch** *(the sales pitch — placeholder)*

What the candidate actually said, structurally.

| Stars | Placeholder criteria |
|---|---|
| 0 | Not a pitch at all |
| 1 | No structure. Rambles. Never states what is being sold or why it matters |
| 2 | Hits some beats but out of order; the value proposition is buried |
| 3 | Clear open, body, close. Nothing memorable |
| 4 | Strong hook, specific value proposition, clean close, well paced |
| 5 | The kind of open you'd repeat back to someone. Concrete, tailored, ends on a real ask |

*(Vocal pitch — F0, monotone — is **not** scored here. See
[05-scoring.md §7](05-scoring.md).)*

---

## 3. Axis: **Tone** *(delivery — placeholder)*

Judged from the transcript **and** the delivery metrics. The glossary in
[05-scoring.md §4](05-scoring.md) tells the model what the numbers mean.

| Stars | Placeholder criteria |
|---|---|
| 0 | Inaudible or unintelligible |
| 1 | Flat or anxious throughout; fillers dominate; long searching pauses |
| 2 | Audible discomfort. Pace swings. Filler density distracting |
| 3 | Steady and clear. Neither warm nor compelling |
| 4 | Confident, well paced, pauses used for emphasis rather than recall |
| 5 | You want to keep listening. Warmth and authority at once |

---

## 4. Axis: **Company representation (OpenHouse)** *(placeholder)*

> **Needs the most real content.** Claude does not know what OpenHouse does. This
> section must carry enough factual grounding for the model to tell an accurate
> description from a confident-sounding wrong one.
>
> Supply at minimum:
> - What OpenHouse actually is, in two or three sentences
> - The value proposition, in the company's own words
> - Who the customer is
> - **Common misconceptions** — the specific wrong things a candidate might say.
>   This is what separates a 2 from a 4, and the model cannot infer it

| Stars | Placeholder criteria |
|---|---|
| 0 | Describes a different company, or never mentions OpenHouse |
| 1 | Materially wrong about what OpenHouse does |
| 2 | Roughly right but generic — could be any competitor |
| 3 | Accurate. Flat |
| 4 | Accurate and differentiated; names what makes OpenHouse different |
| 5 | Speaks like someone who already works here. Accurate, specific, genuinely persuasive |

---

## 5. Axis: **Sales skills** *(placeholder)*

| Stars | Placeholder criteria |
|---|---|
| 0 | No selling attempted |
| 1 | Features only. No customer in the picture. No ask |
| 2 | Some benefit language; no discovery, no urgency, weak close |
| 3 | Competent: benefits framed, an ask exists, objections acknowledged |
| 4 | Qualifies, anticipates the objection before it lands, closes for a next step |
| 5 | Reads like a top performer — discovery, framing, urgency, a specific close |

---

## 6. **Overall**

Not an average. A holistic verdict against the six bands in §1.

Guidance for the model (rewrite to taste):

- A candidate can be a 5 on Pitch and a 2 overall if they misrepresent the company.
- Weight **coachability**. Weak tone is trainable; being fundamentally uninterested
  in the customer is not.
- When genuinely torn between two bands, take the lower one and say so in the
  reasoning. A hiring manager can be talked up from a 3; they cannot un-see a 4.

---

## 7. Instructions shown to the candidate

> **Also placeholder.** Served by `GET /api/instructions`
> ([04-api.md](04-api.md)) so the copy can change without a frontend deploy.

```markdown
## Your task

Record a **2–3 minute** sales pitch for OpenHouse, as if you were speaking to
[TARGET CUSTOMER] on a first call.

Cover:
- Who you are and why you're calling
- What OpenHouse is and why it matters to them
- Handle this objection: "[OBJECTION]"
- Close for a next step

**Guidelines**
- Speak naturally. Do not read a script.
- Record somewhere quiet, on any device.
- Upload as MP3, M4A, WAV or WEBM. Under 25 MB.
- **You get one attempt.** Listen back before you upload.
```

Whatever goes here must match the rubric — if the instructions don't ask for
objection handling, the Sales axis must not penalise its absence.

---

## 8. Checklist before this file goes live

- [ ] Real criteria for all five axes, at every band 0–5
- [ ] §4 carries real OpenHouse facts **and** the common misconceptions list
- [ ] §7 instructions match what the rubric rewards
- [ ] Calibrated: score 3–5 real recordings you already have a human opinion on,
      and check the model lands within ±1 star
- [ ] `rubric_version` bumped and any placeholder-era rows voided
