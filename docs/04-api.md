# 04 — API

FastAPI on Render, everything under `/api`. Reached by the browser through
Vercel's rewrite, so it is same-origin from the client's point of view.

Auth is `Authorization: Bearer <our-jwt>` on every route except
`POST /api/auth/google` and `GET /api/health`.

Errors are uniform: `{ "error": "human readable message" }`, with the status code
carrying the meaning. `frontend/src/api/client.js` reads `.error` for its toast.

**Every request is fast.** Scoring runs in a background task, so no endpoint holds
a connection open across the slow work — which is what makes the Vercel proxy hop
safe. See [02-architecture.md §6](02-architecture.md).

---

## `GET /api/health`

Render's health check target. Unauthenticated, no DB round-trip on the hot path.

```jsonc
{ "ok": true }
```

---

## `POST /api/auth/google`

Exchange a Google ID token for a session token. Called from the **popup on the
landing page** — there is no redirect and no `/login` route.

```jsonc
// request
{ "id_token": "eyJhbGciOi..." }

// 200
{
  "token": "eyJ...",                       // our JWT, 7 day expiry
  "user": { "email": "a@b.com", "name": "Asha Ramesh", "role": "user" }
}
```

Side effects: upserts the `candidates` row (email saved, `last_seen_at` bumped,
`login_count` incremented, name refreshed), and writes `auth.login` — plus
`candidate.created` on a first-ever sign-in — to `activity_logs`.

`role` is `admin` when the email is in `oh_users`, else `user`.

| Code | When |
|---|---|
| `401` | Signature invalid, expired, `aud` mismatch, or `email_verified` false |

---

## `GET /api/me`

Who am I, and where am I in the flow. Called on boot to decide which page to show.

```jsonc
// candidate who hasn't submitted
{ "email": "a@b.com", "name": "Asha Ramesh", "role": "user",
  "submission_status": "pending" }

// candidate who has
{ "email": "a@b.com", "name": "Asha Ramesh", "role": "user",
  "submission_status": "submitted",
  "submission_id": "9f1c...", "submitted_at": "2026-08-27T09:12:03Z" }
```

`submission_status` is `pending` | `submitted` and nothing else. A candidate whose
scoring failed still reads `submitted` — the failure is an operations problem, not
theirs. **This route never returns a number.**

`submission_id` is included so the dashboard can poll status without a second lookup.

---

## `POST /api/submissions`

The upload. `multipart/form-data`, one field: `file`.

**Returns in 2–4 seconds** — validate, store, insert, schedule, respond. The
scoring happens afterwards, in the background.

```jsonc
// 202 Accepted
{ "id": "9f1c0a3e-...", "status": "queued" }
```

| Code | When |
|---|---|
| `202` | Accepted and queued |
| `409` | Candidate already has a live submission (the partial unique index fired) |
| `413` | File over 25 MB |
| `415` | Content type not in the allowed audio list |
| `422` | Audio longer than 10 minutes, or unreadable |

Handler order, which is not arbitrary:

1. Validate content type, size, duration — **before** anything is written
2. `storage.put()` the object to R2
3. `INSERT ... status='queued'` — claims the one-attempt slot, catches double-submit
4. Schedule the background task
5. Return `202`

If step 3 raises a unique violation the object is deleted from R2 before the
`409` goes out, so a rejected double-submit leaves nothing behind.

**No scores are in the response.** There are none yet, and there never will be on
this route.

---

## `GET /api/submissions/{id}/status`

What the dashboard polls, every 2 seconds.

```jsonc
{ "id": "9f1c...", "status": "processing" }
```

`status` is `queued` | `processing` | `scored` | `failed` | `voided`.

Callable by the **owning candidate** or any admin. A candidate requesting someone
else's id gets `404`, not `403` — a `403` would confirm the id exists.

The candidate's UI treats `scored` and `failed` identically: both render the
"submitted, we'll be in touch" state. Only an admin ever learns a run failed.

---

## `GET /api/submissions` — **admin only**

```jsonc
// ?limit=50&offset=0&status=scored
{
  "total": 137,
  "items": [
    { "id": "9f1c...", "email": "a@b.com", "name": "Asha Ramesh",
      "status": "scored", "overall": 3, "duration_s": 184.3,
      "rubric_version": "a91c3fbb21c4",
      "created_at": "2026-08-27T09:12:03Z" }
  ]
}
```

Light — no transcript, no per-axis scores, no reasoning. `rubric_version` is
included so the board can warn when visible rows aren't comparable.

`403` for `role != 'admin'`.

---

## `GET /api/submissions/{id}` — **admin only**

The full record: `transcript`, `metrics`, `scores` with every reasoning string,
`rubric_version`, `model`, `stt_model`, `error` if it failed, plus the
candidate's `email` and `name` from the `candidates` join.

The response is one logical submission assembled from the parent (`status`,
`assessment_type`, `overall_stars`, timestamps) and the child (`audio`,
`transcript`, `metrics`, `scores`). `candidate_id` is not returned — an internal
join key is not an admin-facing field.
**Who voided a submission is not on this response**; it is an event, and it
lives in `GET /api/logs?entity_id=<id>`.

Plus `audio_url` — a **presigned R2 GET URL with a 1-hour TTL**, generated at read
time. The stored `audio_key` is never returned.

`403` for non-admins, `404` for an unknown id. Both are checked — an admin-only
route that returned `404` to non-admins would leak which ids are real.

---

## `POST /api/submissions/{id}/void` — **admin only**

Grants the candidate a retry. The row is kept in full, audio included.

```jsonc
{ "id": "9f1c...", "status": "voided" }
```

| Code | When |
|---|---|
| `403` | Not an admin |
| `404` | No such submission |
| `409` | Already voided |

Writes `submission.voided` to `activity_logs` naming the admin. That row is the
**only** record of who did it — `sales_insight_submissions` has no reference to
`oh_users`.

---

## `GET /api/logs` — **admin only**

The audit trail, newest first. Every mutation and every sign-in.

```jsonc
// ?limit=100&offset=0&action=submission.voided&actor=a@b.com&entity_id=9f1c...
{
  "total": 412,
  "actions": ["auth.login", "candidate.created", "submission.created", "..."],
  "items": [
    { "id": "412", "at": "2026-08-27T09:12:48Z",
      "actor_email": null, "actor_role": "system",
      "action": "submission.scored",
      "entity": "sales_insight_submission", "entity_id": "9f1c...",
      "data": { "rubric_version": "a91c3fbb21c4", "model": "claude-opus-5" },
      "ip": null }
  ]
}
```

All three filters are optional and ANDed. `actions` is `select distinct action`,
so the UI's filter row can never drift from the verbs actually in use.

**Admin only, and it matters:** the trail names every candidate who ever signed
in. `data` never carries a score, a reasoning string, or a transcript.

---

## `GET /api/instructions`

The candidate-facing brief — scenario, target length, what to record. Served from
the backend so the copy changes without a frontend deploy.

```jsonc
{ "markdown": "## Your task\n\nRecord a **2-3 minute**...", "version": "a91c3f" }
```

---

## Route summary

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/health` | none | Render health check |
| `POST` | `/api/auth/google` | none | ID token → session token |
| `GET` | `/api/me` | user | Never returns a number |
| `GET` | `/api/instructions` | user | |
| `POST` | `/api/submissions` | user | multipart. `202`, scores in background |
| `GET` | `/api/submissions/{id}/status` | owner or admin | Polled every 2s |
| `GET` | `/api/submissions` | **admin** | |
| `GET` | `/api/submissions/{id}` | **admin** | Includes a presigned `audio_url` |
| `POST` | `/api/submissions/{id}/void` | **admin** | Audited; the only record of who |
| `GET` | `/api/logs` | **admin** | The audit trail |
