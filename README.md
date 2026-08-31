# OpenHouse · Sales (Insight) Audio Assessment

AI-scored audio assessment for Sales (Insight) candidates. A candidate signs in
with Google, reads a brief, uploads a recorded sales pitch, and the system scores
it **0–5 stars** on four axes. Results are **admin-only** — the candidate never
sees a number.

**Status: built.** Frontend and backend are implemented and tested. What remains
before real candidates is credentials, a Neon database, and the real rubric —
see [Setup](#setup) and [Before real candidates](#before-real-candidates).

## The scale

| ★ | Meaning |
|---|---|
| 0 | Irrelevant |
| 1 | Reject |
| 2 | Can hire, but train |
| 3 | Average — can hire |
| 4 | Hire |
| 5 | Must hire |

Scored on **pitch** (the sales pitch), **tone** (delivery), **company
representation**, and **sales skills** — plus a holistic **overall** that is
deliberately not an average.

## How it works

```
landing page → Google popup sign-in → instructions → upload (one attempt)
        ↓                                              202 in ~3s
  ─────────────── background task, no timeout ───────────────
  ElevenLabs Scribe v2   transcript + word timestamps + audio events
        ↓
  metrics.py             wpm, pauses, fillers, speech ratio  (pure Python)
        ↓
  Claude Opus 5          rubric.md as cached prefix, effort=max, strict JSON
        ↓
  Neon Postgres          admin-only results
  ───────────────────────────────────────────────────────────
        ↑
  dashboard polls status every 2s
```

Scoring takes 20–45 seconds and runs in the background, so no request is ever
held open. About **$0.09 per candidate**.

## Stack

**Frontend on Vercel, backend on Render**, one repo, two folders.

React 18 + Vite (plain JS) · FastAPI + uvicorn on Render Starter · Neon Postgres ·
Cloudflare R2 · ElevenLabs Scribe v2 · Claude Opus 5. Vercel rewrites `/api/*` to
Render, so the browser only ever sees one origin.

Frontend follows the [Hallmark](https://github.com/nutlope/hallmark) method with
[Wayfare](https://www.usehallmark.com/examples/wayfare/) as the structural
reference, on [openhouse.in](https://openhouse.in)'s exact palette. See
[docs/07-frontend.md](docs/07-frontend.md).

## Docs

| | |
|---|---|
| [01-spec.md](docs/01-spec.md) | What it does, roles, scale, attempts, what's out of scope |
| [02-architecture.md](docs/02-architecture.md) | Stack, repo layout, `vercel.json`, request flow, auth, env |
| [03-data-model.md](docs/03-data-model.md) | The five tables, the two triggers, the complete query set |
| [migrations/README.md](migrations/README.md) | Run order, and which files are tools rather than migrations |
| [04-api.md](docs/04-api.md) | Every endpoint, every status code |
| [05-scoring.md](docs/05-scoring.md) | Scribe → metrics → Claude, cost, Phase 2 vocal pitch |
| [06-rubric.md](docs/06-rubric.md) | **Template — awaiting real content** |
| [07-frontend.md](docs/07-frontend.md) | Hallmark design system on the openhouse.in palette |
| [08-plan.md](docs/08-plan.md) | Implementation plan |

## Before building

- [ ] **The real rubric.** [06-rubric.md](docs/06-rubric.md) is a placeholder.
      Scores against it are uncalibrated and must not drive a hiring decision.
- [ ] **Candidate instructions copy** — scenario, target length, the objection to handle.
- [ ] Neon project + `DATABASE_URL`
- [ ] Cloudflare R2 bucket + access key pair
- [ ] Google OAuth client id (authorised origins: `localhost:5175` + the Vercel domain)
- [ ] `ELEVENLABS_API_KEY`, `ANTHROPIC_API_KEY`
- [ ] Render **Starter** ($7/mo) — always-on. The free tier suspends background scoring tasks
- [ ] Confirm the Scribe v2 `model_id` string ([05-scoring.md §1](docs/05-scoring.md))

## Setup

### 1. Frontend — runs standalone, no credentials needed

```bash
cd frontend
npm install
cp .env.example .env      # fill in VITE_GOOGLE_OAUTH_CLIENT_ID
npm run dev               # http://localhost:5175
```

**The frontend talks to the real API only.** There is no mock layer — it was
removed so nothing fixture-shaped can reach production. Start the backend below
before the UI is usable.

### 2. Database

Create a Neon project, then apply the schema and seed yourself into `oh_users`:

```bash
psql "$DATABASE_URL" -f migrations/inspect.sql            # read-only: what's there?
psql "$DATABASE_URL" -f migrations/001_schema.sql
psql "$DATABASE_URL" -f migrations/002_seed_oh_users.sql  # edit the email first
```

**If the database already has tables from an earlier revision of this schema**,
`001_schema.sql` refuses to run and tells you so. `create table if not exists` does
nothing when a table of that name exists with a *different* shape — it skips
silently and fails several statements later as an unreadable "column does not
exist". The preflight block at the top of `001_schema.sql` catches that up front.

To start clean (**destructive** — check `inspect.sql`'s row counts first):

```bash
psql "$DATABASE_URL" -f migrations/reset.sql
psql "$DATABASE_URL" -f migrations/001_schema.sql
psql "$DATABASE_URL" -f migrations/002_seed_oh_users.sql
```

See [migrations/README.md](migrations/README.md) for what each file is.

Five tables. `oh_users` (staff) · `candidates` (everyone who signs in) ·
**`submissions`** — the holder, one row for every submission to every assessment
type · `sales_insight_submissions` — the audio-specific columns, sharing the
parent's primary key · `activity_logs` (append-only audit trail).

Parent and child share a PK and duplicate nothing, so "every submission across
every assessment" is `select * from submissions` with no `UNION` and nothing that
can drift. Two triggers enforce it. See
[docs/03-data-model.md](docs/03-data-model.md).

```bash
```

### 3. Backend

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env                        # fill in every value
./run.sh                                    # http://localhost:5060
```

Vite's dev proxy forwards `/api/*` to `:5060`, which is exactly what Vercel's
rewrite does in production, so the browser sees one origin either way.

**Scoring refuses to run while `backend/rubric.md` is the placeholder.** That is
deliberate: a score produced against placeholder criteria looks real and gets
acted on. Replace it, or set `ALLOW_PLACEHOLDER_RUBRIC=true` to exercise the
pipeline first.

### 4. Tests

```bash
cd backend && .venv/bin/python -m pytest -q     # 32 tests
```

Covers the pure metrics function, JWT signing and the `alg=none` bypass, the
scoring schema and rubric hashing, the route authorisation matrix, the audit
trail (including that a failed audit write does not fail the action it audits),
the parent/child split (one transaction, no duplicated columns, no `UNION`), and
the invariant that no candidate-facing route can return a score.

**Not covered:** the two plpgsql trigger bodies. They are opaque to every parser
available offline — the first `psql -f migrations/001_schema.sql` against Neon is their first
real test.

## Deploy

**Backend → Render.** Root directory `backend`, plan **Starter** (the free tier
suspends idle instances and kills background scoring tasks with them).
`render.yaml` declares the service; set the secrets in the dashboard.

**Frontend → Vercel.** Root directory `frontend`. Edit the Render hostname in
`frontend/vercel.json`, then set `VITE_GOOGLE_OAUTH_CLIENT_ID` and
`VITE_API_BASE=` (blank).

**Then close the loop:** set `ALLOWED_ORIGINS` on Render to the Vercel domains,
add the Vercel domain and `http://localhost:5175` to the Google OAuth client's
authorised JavaScript origins, and confirm `https://<vercel-domain>/api/health`
returns `{"ok":true}` — that proves the rewrite works.
