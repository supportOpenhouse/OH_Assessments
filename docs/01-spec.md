# 01 — Product Spec

**Project:** OpenHouse Sales (Insight) Audio Assessment
**Status:** Design approved 2026-08-27. Not yet built.
**Owner:** support@openhouse.in

---

## 1. What this is

A hiring assessment tool for **Sales (Insight) candidates only**. A candidate signs
in with Google, reads a fixed set of instructions, records a sales pitch offline,
uploads the audio file, and the system scores it 0–5 on four axes using AI.

**The candidate never sees their score.** Results are admin-only.

This is not a general assessment platform. It scores one role, against one rubric,
with one submission per candidate. Every design decision below follows from that.

## 2. Roles

| Role | Who | Can do |
|---|---|---|
| **Candidate** | Anyone who signs in with Google and is not in `oh_users` | Read instructions, upload audio once, see submission status (`pending` / `submitted`) |
| **Admin** | Any active email in `oh_users` | Everything a candidate can, plus: list all submissions, read transcripts, read scores and reasoning, play back audio, void a submission to grant a retry |

Anyone can sign in. Being an OpenHouse employee grants nothing — `@openhouse.in`
users who are not in `oh_users` are ordinary candidates. Admin access is explicit
and table-driven, never inferred from a domain.

Identity lives in `candidates`, which is assessment-agnostic: the same row serves
every assessment a person takes. See [03-data-model.md](03-data-model.md).

> **Decided against:** domain-based admin (every employee would see every
> candidate's results) and an invite-only flow (an invite table and management UI
> for a problem a shared link already solves).

## 3. The scoring scale

| Stars | Meaning |
|---|---|
| 0 | Irrelevant |
| 1 | Reject |
| 2 | Can hire, but train |
| 3 | Average — can hire |
| 4 | Hire |
| 5 | Must hire |

Integers only. No half-stars.

## 4. The four axes

Each is scored 0–5 independently, each with written reasoning.

| Axis | What it measures | Signal source |
|---|---|---|
| **Pitch** | The sales pitch itself — hook, structure, value proposition, objection handling, close | Transcript |
| **Tone** | Delivery — pace, confidence, warmth, energy, filler density, hesitation | Transcript + timing metrics from Scribe |
| **Company representation** | How accurately and compellingly the candidate represents OpenHouse | Transcript |
| **Sales skills** | Discovery, listening cues, qualifying, urgency, handling of a "no" | Transcript |

Plus an **overall** score, which is a holistic judgement — deliberately *not* an
average of the four. A candidate can be a 5 on pitch and a 1 overall if they
misrepresent the company.

> **"Pitch" means the sales pitch, not vocal frequency.** Vocal pitch (F0 contour,
> intonation range, monotone detection) is a real and separate signal that is
> **deferred to Phase 2** — see §7.

## 5. Candidate flow

```
  Landing page        ← public. Sign-in is a Google popup on this page
        ↓
  Instructions        ← fixed copy, same for every candidate
        ↓
  Upload audio        ← one file, mp3/m4a/wav/webm, ≤ 25 MB, ≤ 10 min
        ↓             ← accepted in ~3s
  Dashboard           ← polls status every 2s while scoring runs in the background
        ↓
  "Received. We'll be in touch."   ← no score shown, ever
```

Returning to the site after submitting lands on the same dashboard. There is no
way for a candidate to see a number — and **a candidate whose scoring failed sees
exactly the same confirmation.** A failed run is an operations problem, not
theirs; only an admin ever learns it errored.

## 6. Attempts

One live submission per candidate email.

- A candidate with no live submission may upload.
- A candidate with a live submission sees the confirmation screen and cannot upload.
- An **admin can void** a submission (bad recording, wrong file, corrupt upload).
  The voided row is kept — audio, transcript, scores and all — and the candidate
  can upload again.

No attempts counter, no attempts table. `status = 'voided'` is the whole mechanism.

## 7. Explicitly out of scope (Phase 1)

Each of these is deferred on purpose. None is forgotten.

| Deferred | Why | What it would take |
|---|---|---|
| **Vocal pitch analysis** (F0 contour, intonation variance, monotone detection) | **No longer an infrastructure limit** — the Render container fits `parselmouth` fine. Deferred because it adds a sixth dimension to calibrate before the base rubric is proven | `pip install praat-parselmouth`, add a `prosody` key to `metrics`, add a glossary band block, split the Pitch axis. See [05-scoring.md §7](05-scoring.md) |
| In-browser recording | Upload covers the requirement; recording adds MediaRecorder codec handling across browsers | A `<button>` + `MediaRecorder`, roughly a day |
| Multiple roles / assessments | The brief is Sales (Insight) only | A `role` column and a rubric per role |
| Emailing candidates | Nobody asked | Resend or similar |
| Score appeals / manual override | No process exists for it yet | An `admin_override` jsonb column on `submissions` |
| Analytics dashboard | Admin list view answers the actual question | A few `GROUP BY` queries |

## 8. Success criteria

1. A candidate completes sign-in → upload → confirmation without help.
2. Scores are reproducible: the same audio and the same `rubric_version` yield the
   same scores within ±1 star on each axis.
3. Every score carries written reasoning an admin can read and disagree with.
4. An admin can trace any score back to the exact rubric text that produced it.
5. Cost stays under **$0.15 per candidate** (see [05-scoring.md §6](05-scoring.md)).
6. No candidate can reach another candidate's data, or their own score.

## 9. Open items

- **The rubric itself.** [06-rubric.md](06-rubric.md) is a template with the
  structure the scoring prompt expects. The real content is coming from the user.
  Until it lands, scoring runs against the placeholder and produces plausible but
  uncalibrated numbers.
- **Instructions copy.** The exact text the candidate reads before recording —
  scenario, target length, what they are pitching to whom. Placeholder in
  [06-rubric.md §5](06-rubric.md).
