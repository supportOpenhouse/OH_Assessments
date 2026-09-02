# 02 — Architecture

**Two deploy targets: frontend on Vercel, backend on Render.**

Frontend design is specified in [07-frontend.md](07-frontend.md) — the
[Hallmark](https://github.com/nutlope/hallmark) method on openhouse.in's palette.
The sibling repo `Direct_Inventory/frontend` is the reference for the **auth
architecture, the mock-API pattern, and this exact deploy split** (its Vercel
frontend rewrites `/api/*` to a Render backend); none of its visual language is used.

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18 + Vite, **plain JavaScript** | No TypeScript, no build ceremony |
| Routing | `react-router-dom` v6 | |
| Styling | **Plain CSS, one `styles.css`, OKLCH custom properties** | Hallmark token system. No Tailwind, no CSS-in-JS, no component library |
| Auth (client) | `@react-oauth/google` | Popup flow, no redirect |
| Backend | **FastAPI + uvicorn** in a Render web service | Always-on container. No function limits |
| DB | **Neon Postgres** via `psycopg[binary,pool]`, hand-written SQL | No ORM. Five tables, two triggers |
| Object storage | **Cloudflare R2** via `boto3` | S3-compatible, zero egress, survives redeploys |
| STT | **ElevenLabs Scribe v2** | Word timestamps + audio events at $0.22/hr |
| AI scoring | **Claude Opus 5** (`claude-opus-5`), `effort: max` | |
| Deploy | Vercel (static) + Render **Starter** | Starter is always-on — no cold start, background tasks safe |

## 2. What moving off Vercel serverless changed

Three constraints that shaped the previous revision no longer exist. Each one
deleted work:

| Was | Now | Consequence |
|---|---|---|
| 4.5 MB request body cap | No cap | **Vercel Blob and its Node function are deleted.** Audio POSTs straight to the backend |
| 300s function ceiling | No timeout | Pipeline length is no longer a design constraint |
| ~250 MB bundle limit | No limit | `librosa` / `parselmouth` now fit — **vocal pitch is unblocked**, though still deferred ([05-scoring.md §7](05-scoring.md)) |

One new constraint replaces them: a Render web service is a **long-lived process
that can restart**. A background task interrupted by a deploy or a restart leaves
a row stuck in `processing`. Handled explicitly in §6.

## 3. Repository layout

```
OH_Assessments/
├── frontend/                    →  Vercel
│   ├── index.html
│   ├── vite.config.js
│   ├── vercel.json              # rewrite /api/* → Render, SPA fallback
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── styles.css           # the entire Hallmark design system
│       ├── api/{client.js,mock.js}
│       ├── contexts/{AuthContext.jsx,ThemeContext.jsx}
│       ├── components/{Layout,Toaster,Stars,AxisBlock,MetricsStrip,
│       │               UploadDrop,ScoringProgress,icons}.jsx
│       └── pages/{Landing,Assessment,Dashboard,AdminList,AdminDetail}.jsx
│
├── backend/                     →  Render
│   ├── app/
│   │   ├── main.py              # FastAPI app + every route
│   │   ├── auth.py              # Google verify, our JWT, FastAPI deps
│   │   ├── db.py                # psycopg pool + every SQL statement
│   │   ├── storage.py           # R2 put / presign
│   │   ├── metrics.py           # PURE: word timestamps → delivery numbers
│   │   ├── scoring.py           # Scribe → metrics → Claude
│   │   ├── logs.py              # audit trail: action verbs + record()
│   │   └── tasks.py             # background scoring + the stale sweep
│   ├── tests/{test_metrics,test_auth,test_scoring}.py
│   ├── sales_insight_rubric.md  # THE rubric, per assessment type. Hashed into rubric_version
│   ├── instructions.md          # candidate-facing brief
│   ├── requirements.txt
│   └── render.yaml
│
├── migrations/
│   ├── 001_schema.sql           # oh_users · candidates · submissions (+ per-type
│   │                            #   children) · activity_logs · 2 triggers
│   ├── 002_seed_oh_users.sql
│   ├── inspect.sql              # read-only diagnostic
│   ├── reset.sql                # destructive teardown
│   └── README.md                # run order
└── docs/
```

Two folders, two deploy targets, one repo. Render's root directory is set to
`backend/`; Vercel's to `frontend/`.

## 4. How the two halves connect

The browser only ever talks to **one origin**. Vercel rewrites `/api/*` to Render,
so there is no CORS in the happy path, no second base URL in the bundle, and no
cross-origin token handling.

`frontend/vercel.json`:

```jsonc
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "https://oh-assessments-api.onrender.com/api/$1" },
    { "source": "/(.*)",     "destination": "/index.html" }
  ]
}
```

**CORS is still configured on the backend**, restricted to the Vercel production
and preview domains. The Render URL is discoverable, and the rewrite being
same-origin is a convenience, not a security boundary.

## 5. Request flow

Every request is short. Scoring runs in the background, so **no connection is
ever held open across the slow work** — which is what makes the Vercel proxy hop
safe.

```
┌─ browser ─────────────────────────────────────────────────────────────┐
│  1. Google popup sign-in  ──id_token──▶  POST /api/auth/google        │
│                           ◀──our JWT───  (verified, role resolved)    │
│  2. GET /api/me                       →  { role, submission_status }  │
│  3. POST /api/submissions (multipart) →  202 { id }        ~2-4s      │
│  4. GET  /api/submissions/{id}/status →  poll every 2s     <100ms     │
└───────────────────────────────────────────────────────────────────────┘
        │                                          ▲
        ▼                                          │
┌─ Render (always-on) ─────────────────────────────┴────────────────────┐
│  POST handler (fast path)                                             │
│    a. validate type + size + duration                                 │
│    b. put object → Cloudflare R2                                      │
│    c. INSERT submissions status='queued'   ← claims the one-attempt   │
│    d. schedule background task, return 202                            │
│                                                                        │
│  background task (no timeout)                                          │
│    e. status='processing'                                              │
│    f. ElevenLabs Scribe v2          ~8-20s                             │
│    g. metrics.derive()              <10ms                              │
│    h. Claude Opus 5, effort=max     ~15-35s                            │
│    i. status='scored'  (or 'failed' with the reason)                   │
└────────────────────────────────────────────────────────────────────────┘
                            │                    │
                            ▼                    ▼
                   Cloudflare R2          Neon Postgres
```

## 6. Background tasks, honestly

FastAPI's `BackgroundTasks` runs the scoring in the same process after the
response is sent. **No Celery, no Redis, no worker dyno** — a single always-on
Starter instance handling a handful of submissions a day does not need a queue.

The failure mode this creates, and its fix:

> A deploy, a crash, or a restart mid-scoring leaves a row in `processing`
> forever. On startup the app sweeps rows in `queued`/`processing` older than 10
> minutes and marks them `failed` with `"interrupted by restart"`. An admin sees
> the failure and can void it, which returns the attempt to the candidate.

```python
# app/tasks.py
STALE_AFTER = timedelta(minutes=10)

async def sweep_stale():
    """Run once on startup. Rows stuck in-flight across a restart are dead."""
    db.fail_stale(STALE_AFTER, "interrupted by a backend restart")
```

**When to outgrow this:** more than one Render instance, or submissions arriving
faster than they score. Then the background task becomes a real queue. Not before.

## 7. Auth

1. `@react-oauth/google` opens a **popup on the landing page** — no route change,
   no redirect — and returns a Google ID token.
2. `POST /api/auth/google { id_token }`.
3. Backend verifies signature and `aud` with `google.oauth2.id_token.verify_oauth2_token`.
   Never by decoding unverified.
4. Backend upserts a `candidates` row, then resolves role from `oh_users`
   membership → that row's `role`, else `user`. Staff get a candidate row too,
   so an admin can walk the candidate flow; role never comes from having one.
5. Backend mints **our own** JWT (7 days, HS256, `JWT_SECRET`) and returns it as
   an **httpOnly `oha_session` cookie** — `Secure`, `SameSite=Lax`, `Max-Age` 7
   days. The response body carries only `{ user }`.
6. The browser attaches the cookie automatically (`credentials: 'same-origin'`).
   **No token exists in JavaScript**, so an injected script has nothing to read.
7. `POST /api/auth/logout` clears it — only the server can, which is the point.
8. Any `401` fires an `auth:expired` window event → toast → back to the landing.

   The 7 days is an **idle** timeout, not an absolute one. `current_user`
   re-issues the cookie once a token is past halfway (`RENEW_AFTER_S`), so
   continued use keeps the session alive and seven days without a request
   ends it. A renewal keeps the original `jti` — it is the same session
   continuing — and re-signs the role read fresh from `oh_users`, so it can
   never launder a revoked admin claim into another week.

> **Why not localStorage.** A token in `localStorage` is readable by any script
> that runs on the page, so a single XSS is a full session theft. httpOnly puts
> it out of reach. `SameSite=Lax` covers the CSRF exposure that cookie auth
> introduces: the browser will not attach it to a cross-site POST.
>
> **`COOKIE_SECURE=false` is required for local http** and must be `true`
> anywhere deployed.

> Google ID tokens expire in an hour, which would sign a candidate out mid-upload.
> Our own token avoids that, and `Direct_Inventory` already does exactly this, so
> the `AuthContext` logic ports cleanly — only its visual layer is discarded.

### One secret, one token per sign-in

`JWT_SECRET` is a **single server-side signing key**, not one per user. Its job is
to prove *this server* issued a token; per-user secrets would mean storing N keys
to answer the same question. What is per-user is the **token**: one minted per
person per sign-in, carrying `email`, `name`, `role`, `iat`, `exp`, and its own
`jti` — a session id, recorded on the `auth.login` audit row so a sign-in can be
tied to the token it issued.

The app **refuses to start** if `JWT_SECRET` is under 32 characters. PyJWT signs
happily with an empty key, so a missing secret would not error — it would quietly
mint tokens anyone could forge.

### Identity from the token, privilege from the database

The `role` claim inside a 7-day token is a snapshot of who someone was when they
signed in. `auth.current_user` therefore **re-derives the role from `oh_users` on
every request** and uses the claim only for the client's own routing.

Without that, removing an admin from `oh_users` — or setting `is_active = false`
— would not take effect for up to a week: they would keep full access to every
candidate's results using a token already in their browser. One indexed lookup on
a tiny table, against a revocation that is otherwise seven days late. It also
works in reverse: promoting someone takes effect on their next request rather
than their next sign-in.

**What this does not cover:** an individually stolen token stays valid until it
expires. Revoking one specific session needs a `jti` denylist, which is not built
— rotating `JWT_SECRET` invalidates every session at once and is the current
answer if a leak is ever suspected.

## 8. Object storage

Audio is written to R2 under `audio/{submission_id}{ext}` and **never made
public**. The `submissions` row stores the key, not a URL.

Admin playback uses a **presigned GET URL with a 1-hour TTL**, generated at read
time and returned only from the admin detail endpoint. A candidate-facing
response never contains a key or a URL.

```python
# app/storage.py
def put(key: str, data: bytes, content_type: str) -> None: ...
def presign(key: str, ttl_s: int = 3600) -> str: ...
```

## 9. Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | Render | Neon pooled connection string |
| `JWT_SECRET` | Render | Signs our session tokens |
| `GOOGLE_OAUTH_CLIENT_ID` | Render | `aud` claim to verify against |
| `ELEVENLABS_API_KEY` | Render | Scribe v2 |
| `ANTHROPIC_API_KEY` | Render | Claude |
| `R2_ACCOUNT_ID` | Render | R2 endpoint host |
| `R2_ACCESS_KEY_ID` | Render | |
| `R2_SECRET_ACCESS_KEY` | Render | |
| `R2_BUCKET` | Render | |
| `ALLOWED_ORIGINS` | Render | Comma-separated Vercel domains for CORS |
| `VITE_GOOGLE_OAUTH_CLIENT_ID` | Vercel | Same client id, public half |
| `VITE_API_BASE` | Vercel | Blank — the rewrite makes it same-origin |
| `VITE_USE_MOCKS` | Vercel | `false` in production |

`render.yaml`:

```yaml
services:
  - type: web
    name: oh-assessments-api
    runtime: python
    plan: starter                 # always-on; free tier suspends background tasks
    rootDir: backend
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT
    healthCheckPath: /api/health
```

## 10. Security posture

- **No candidate-facing route can return a score.** `GET /api/me` and
  `/api/submissions/{id}/status` return `pending` / `submitted` / `queued` /
  `processing` / `scored` — a state name, never a number. There is no
  candidate-shaped serialization of a score to leak.
- `GET /api/submissions` and `/api/submissions/{id}` hard-require `role == 'admin'`.
- R2 objects are private. Presigned URLs are admin-only and expire in an hour.
- Every DB call is parameterised. No interpolation into SQL, anywhere.
- **Every mutation is audited** to `activity_logs`, server-side. Client-side
  event tracking is deliberately not used: it is forgeable by the person being
  audited and blind to anything not going through the UI. `GET /api/logs` is
  admin-only — the trail names every candidate who ever signed in.
- Upload validation runs **before** the object is written: content type, ≤25 MB,
  ≤10 minutes.
- CORS restricted to the Vercel domains, even though the rewrite is same-origin.
