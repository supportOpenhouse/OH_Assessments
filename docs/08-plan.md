# Sales (Insight) Audio Assessment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Google-authenticated web app where Sales (Insight) candidates upload one audio pitch that is transcribed, measured, and scored 0–5 on four axes by Claude, with results visible only to admins.

**Architecture:** Two deploy targets, one repo. `frontend/` is a React 18 + Vite SPA on **Vercel** (Hallmark design system on openhouse.in's palette). `backend/` is a FastAPI + uvicorn service on **Render Starter** (always-on). Vercel rewrites `/api/*` to Render so the browser sees one origin. Upload returns `202` in seconds; scoring runs in a FastAPI background task — ElevenLabs Scribe v2 → a pure-Python metrics function → Claude Opus 5 with a strict JSON schema → Neon Postgres. Audio lives in Cloudflare R2, private, reachable only through admin-only presigned URLs. The dashboard polls a status endpoint.

**Tech Stack:** React 18, Vite 5, react-router-dom 6, `@react-oauth/google`, FastAPI, uvicorn, `psycopg[binary,pool]`, `google-auth`, `PyJWT`, `boto3`, `elevenlabs`, `anthropic`, Neon Postgres, Cloudflare R2, Claude Opus 5 (`claude-opus-5`), ElevenLabs Scribe v2.

**Spec:** [`docs/01-spec.md`](01-spec.md) through [`docs/07-frontend.md`](07-frontend.md). Read `01`, `02`, `04` and `07` before Task 1.

## Global Constraints

**Product**

- **Never return a score, star count, or `scores` field on a candidate-facing route.** `GET /api/me` returns `pending`/`submitted`; `/api/submissions/{id}/status` returns a state name. Enforced at the serializer, not the UI.
- **The candidate never sees `failed`.** Both `scored` and `failed` render as the `RECEIVED` stamp. Only admins learn a run errored.
- **One live submission per candidate**, enforced by the partial unique index — not by application code.

**Backend**

- Python 3.12. All SQL parameterised — no f-strings or `%` formatting into query text, ever.
- **Claude call shape is fixed:** `model="claude-opus-5"`, `thinking={"type":"adaptive"}`, `output_config={"effort":"max","format":{...}}`, `max_tokens=16000`. `budget_tokens` returns a 400 — never use it. Never the deprecated top-level `output_format`.
- **Validate before you store.** Content type, ≤25 MB, ≤10 minutes — all checked before the R2 object is written.
- **R2 objects are private.** Admin playback is a presigned GET with a 1-hour TTL, generated at read time. A candidate-facing response never contains a key or URL.
- **No request holds a connection across slow work.** Scoring is always a background task.

**Frontend**

- Node 20, `type: "module"`. **Four runtime packages:** `react`, `react-dom`, `react-router-dom`, `@react-oauth/google`. No Tailwind, no UI kit, no icon package, no animation library, no state manager.
- **All CSS in `frontend/src/styles.css`**, `/* ───────── name ───────── */` banners, Hallmark macrostructure stamp at the top. No new CSS files, no CSS-in-JS.
- **Every colour a `var(--…)` token**, defined in both `:root` and `[data-theme='dark']`. Every duration `--dur-fast`/`--dur-base`/`--dur-slow`. Every spacing value on the 4pt scale — an arbitrary `padding: 17px` is a defect.
- **Never `transition: all`.** Name the properties. One effect per hover. No uniform hover-scale. Never animate `width`/`height`/`top`/`left`/`margin`/`padding`.
- **Every interactive element ships `:hover`, `:focus-visible`, `:active`, `:disabled`.** Focus rings appear instantly — they never transition in.
- **`overflow-x: clip` on both `html` and `body`** — `clip`, not `hidden`. No horizontal scroll between 320px and 1920px.
- **Zero icon libraries, zero emoji as UI icons.** Hand-written SVG only, each `aria-hidden="true"` or `aria-label`led.
- **Every `@keyframes` has a `prefers-reduced-motion` escape.** No exceptions.
- **The full gate list is [`docs/07-frontend.md` §9](07-frontend.md)**, swept before Task 5 is committed.

**Process**

- **Commit steps below are for whoever executes the plan.** Do not commit on the user's behalf without asking — they commit themselves.

## File Structure

| File | Responsibility |
|---|---|
| `migrations/001_schema.sql` | The five tables, two triggers, and the preflight guard. Applied by hand to Neon |
| `backend/rubric.md` | Scoring rubric. Cached system prefix; hashed to `rubric_version` |
| `backend/instructions.md` | Candidate-facing brief, served by `GET /api/instructions` |
| `backend/render.yaml` | Render service definition |
| `backend/requirements.txt` | Python deps |
| `backend/app/metrics.py` | **Pure.** Scribe word list → delivery metrics. No I/O. The most-tested file |
| `backend/app/db.py` | psycopg pool + every SQL statement in the project |
| `backend/app/auth.py` | Google ID token verification, our JWT mint/verify, FastAPI deps |
| `backend/app/storage.py` | R2 put / delete / presign |
| `backend/app/scoring.py` | Scribe call, Claude call, rubric loading and hashing |
| `backend/app/tasks.py` | The background scoring task and the startup stale sweep |
| `backend/app/main.py` | FastAPI app, lifespan, CORS, every route |
| `backend/tests/*` | `test_metrics.py`, `test_auth.py`, `test_scoring.py` |
| `frontend/vercel.json` | Build config + the `/api/*` rewrite to Render |
| `frontend/src/styles.css` | The whole Hallmark design system |
| `frontend/src/api/client.js` | fetch wrapper, bearer token, 401 → `auth:expired`, mock fallback |
| `frontend/src/api/mock.js` | In-memory fixtures so the UI runs with no backend |
| `frontend/src/contexts/*.jsx` | `AuthContext`, `ThemeContext` |
| `frontend/src/components/*.jsx` | Layout, Toaster, Stars, AxisBlock, MetricsStrip, UploadDrop, ScoringProgress, icons |
| `frontend/src/pages/*.jsx` | Landing, Assessment, Dashboard, AdminList, AdminDetail |

---

### Task 1: Repo scaffold, schema, and the metrics function

The one piece of real logic testable with no network, no database and no API key. It goes first so the test cycle exists before anything depends on it.

**Files:**
- Create: `migrations/001_schema.sql`, `backend/requirements.txt`, `backend/pytest.ini`, `backend/app/__init__.py`, `backend/app/metrics.py`, `backend/tests/test_metrics.py`, `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: `app.metrics.derive(words: list[dict]) -> dict` with the keys `duration_s, speech_s, speech_ratio, word_count, wpm, pause_count_2s, longest_pause_s, mean_pause_s, filler_count, fillers_per_min, audio_events, speaker_count`. Consumed by Task 8.

- [ ] **Step 1: Initialise the repo**

```bash
cd /Users/oh-sahaj/Documents/GitHub/OH_Assessments
git init
mkdir -p backend/app backend/tests frontend/src
touch backend/app/__init__.py backend/tests/__init__.py
```

`backend/requirements.txt`:

```
fastapi==0.115.6
uvicorn[standard]==0.34.0
psycopg[binary,pool]==3.2.3
google-auth==2.37.0
PyJWT==2.10.1
boto3==1.35.92
elevenlabs==1.50.3
anthropic>=0.69.0
python-multipart==0.0.20
mutagen==1.47.0
```

`mutagen` reads audio duration from the uploaded bytes without shelling out to ffmpeg — Task 7 needs it to reject over-long files before writing anything to R2.

`backend/pytest.ini`:

```ini
[pytest]
pythonpath = .
testpaths = tests
```

- [ ] **Step 2: Write `migrations/001_schema.sql`**

Copy verbatim from [`docs/03-data-model.md` §2–§4](03-data-model.md) — `oh_users`, `candidates`, `sales_insight_submissions`, and the `sales_insight_one_live` partial unique index. Do not paraphrase: the predicate `where status <> 'voided'` is load-bearing, `audio_key` is a key rather than a URL, and the one-live index is scoped to the per-assessment table so a future assessment type is unaffected.

- [ ] **Step 3: Write the failing tests**

`backend/tests/test_metrics.py`:

```python
from app.metrics import derive

def w(text, start, end, type="word", speaker_id="speaker_0"):
    return {"text": text, "start": start, "end": end, "type": type, "speaker_id": speaker_id}

def test_counts_words_and_ignores_spacing():
    words = [w("Hello", 0.0, 0.4), w(" ", 0.4, 0.5, type="spacing"), w("there", 0.5, 0.9)]
    assert derive(words)["word_count"] == 2

def test_wpm_uses_speech_time_not_wall_time():
    # 10 words inside 5s of speech, then a 55s silence.
    words = [w(f"w{i}", i * 0.5, i * 0.5 + 0.5) for i in range(10)]
    words.append(w("end", 60.0, 60.5))
    m = derive(words)
    # Wall time is 60.5s; speech time is ~5.5s. Wall-time wpm would be ~11.
    assert m["wpm"] > 50, "wpm must be computed over speech time, not wall time"

def test_detects_pauses_over_two_seconds():
    words = [w("a", 0.0, 0.5), w("b", 3.5, 4.0), w("c", 4.2, 4.6)]
    m = derive(words)
    assert m["pause_count_2s"] == 1
    assert m["longest_pause_s"] == 3.0

def test_counts_fillers_case_insensitively():
    words = [w("Um", 0.0, 0.2), w("basically", 0.3, 0.8), w("house", 0.9, 1.2)]
    assert derive(words)["filler_count"] == 2

def test_collects_audio_events():
    words = [w("hi", 0.0, 0.3), w("(laughter)", 0.4, 1.0, type="audio_event")]
    m = derive(words)
    assert m["audio_events"] == {"laughter": 1}
    assert m["word_count"] == 1, "audio events are not words"

def test_counts_distinct_speakers():
    words = [w("hi", 0.0, 0.3), w("yo", 0.4, 0.7, speaker_id="speaker_1")]
    assert derive(words)["speaker_count"] == 2

def test_empty_input_does_not_divide_by_zero():
    m = derive([])
    assert m["word_count"] == 0 and m["wpm"] == 0.0 and m["speech_ratio"] == 0.0
```

- [ ] **Step 4: Run the tests and confirm they fail**

Run: `cd backend && python -m pytest tests/test_metrics.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.metrics'`

- [ ] **Step 5: Implement `backend/app/metrics.py`**

```python
"""Scribe word entries -> delivery metrics. Pure: no I/O, no state, no config."""

FILLERS = {
    "um", "uh", "er", "ah", "like", "basically", "actually", "literally",
    "honestly", "right", "so", "you know", "i mean", "sort of", "kind of",
}
PAUSE_THRESHOLD_S = 2.0


def derive(words: list[dict]) -> dict:
    spoken = [x for x in words if x.get("type") == "word"]
    events = [x for x in words if x.get("type") == "audio_event"]

    if not spoken:
        return {
            "duration_s": 0.0, "speech_s": 0.0, "speech_ratio": 0.0, "word_count": 0,
            "wpm": 0.0, "pause_count_2s": 0, "longest_pause_s": 0.0, "mean_pause_s": 0.0,
            "filler_count": 0, "fillers_per_min": 0.0, "audio_events": {}, "speaker_count": 0,
        }

    duration_s = round(max(x["end"] for x in words), 2)
    speech_s = round(sum(x["end"] - x["start"] for x in spoken), 2)

    # Gaps between consecutive spoken words. An audio event inside a gap does not
    # make that gap speech.
    gaps = [
        round(b["start"] - a["end"], 2)
        for a, b in zip(spoken, spoken[1:])
        if b["start"] > a["end"]
    ]
    long_gaps = [g for g in gaps if g >= PAUSE_THRESHOLD_S]

    # wpm over SPEECH time, not wall time: a fast talker who pauses a lot is a
    # different problem from a slow talker, and wall time collapses them.
    wpm = round(len(spoken) / (speech_s / 60), 1) if speech_s else 0.0

    fillers = sum(1 for x in spoken if x["text"].strip().lower().strip(".,!?") in FILLERS)

    counts: dict[str, int] = {}
    for e in events:
        key = e["text"].strip().strip("()").lower()
        counts[key] = counts.get(key, 0) + 1

    speakers = {x.get("speaker_id") for x in spoken if x.get("speaker_id")}

    return {
        "duration_s": duration_s,
        "speech_s": speech_s,
        "speech_ratio": round(speech_s / duration_s, 3) if duration_s else 0.0,
        "word_count": len(spoken),
        "wpm": wpm,
        "pause_count_2s": len(long_gaps),
        "longest_pause_s": max(gaps) if gaps else 0.0,
        "mean_pause_s": round(sum(gaps) / len(gaps), 2) if gaps else 0.0,
        "filler_count": fillers,
        "fillers_per_min": round(fillers / (speech_s / 60), 1) if speech_s else 0.0,
        "audio_events": counts,
        "speaker_count": len(speakers),
    }
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `cd backend && python -m pytest tests/test_metrics.py -v`
Expected: 7 passed

- [ ] **Step 7: Write `.gitignore` and commit**

```
CLAUDE.md
.env
.env.local
__pycache__/
*.py[cod]
.venv/
node_modules/
dist/
.vercel/
.DS_Store
```

```bash
git add migrations/001_schema.sql backend/ .gitignore
git commit -m "feat: schema and pure delivery-metrics function with tests"
```

---

### Task 2: Frontend scaffold and the Hallmark token system

The whole design system lands before a single component, so no component is ever written against an ad-hoc value.

**Files:**
- Create: `frontend/package.json`, `frontend/vite.config.js`, `frontend/index.html`, `frontend/.env.example`, `frontend/src/main.jsx`, `frontend/src/styles.css`, `frontend/src/contexts/ThemeContext.jsx`, `frontend/src/App.jsx`
- Spec: [`docs/07-frontend.md` §2–§3](07-frontend.md)

**Interfaces:**
- Produces: `useTheme() -> { theme, toggle, setTheme }`, and every CSS token in §2.2 — consumed by every later frontend task.

- [ ] **Step 1: Scaffold**

```bash
cd frontend
npm init -y
npm i react@^18.3.1 react-dom@^18.3.1 react-router-dom@^6.26.2 @react-oauth/google@^0.12.1
npm i -D vite@^5.4.8 @vitejs/plugin-react@^4.3.1
npm pkg set type=module scripts.dev=vite scripts.build="vite build" scripts.preview="vite preview"
```

`frontend/vite.config.js` — the proxy points at the **local** backend during development; in production Vercel's rewrite does the same job.

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5175, proxy: { '/api': { target: 'http://localhost:5060', changeOrigin: true } } },
});
```

`frontend/.env.example`:

```
VITE_GOOGLE_OAUTH_CLIENT_ID=xxxxx.apps.googleusercontent.com
VITE_API_BASE=
VITE_USE_MOCKS=true
```

- [ ] **Step 2: Write `index.html` with the font request**

Four faces, one request, each with a real fallback stack. Weights are budgeted — do not add more.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Openhouse · Sales Assessment</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700&family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400;1,6..72,400&display=swap" />
  </head>
  <body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body>
</html>
```

- [ ] **Step 3: Write `styles.css` — stamp, tokens, base**

Open the file with the Hallmark stamp from [`docs/07-frontend.md` §4](07-frontend.md), then the complete `:root` block from §2.2 and the `[data-theme='dark']` block from §2.4, both verbatim. Then the base layer:

```css
*, *::before, *::after { box-sizing: border-box; }

/* `clip`, not `hidden` — clip preserves position:sticky on descendants. Hard
   requirement on every page, not only where scroll is observed (gate 34). */
html, body { margin: 0; overflow-x: clip; }
html, body, #root { min-height: 100%; }

body {
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: var(--text-base);
  line-height: 1.55;
  font-feature-settings: "kern", "liga";
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

h1, h2, h3 { font-family: var(--font-display); font-weight: 700;
             letter-spacing: -0.02em; margin: 0; }
a { color: inherit; text-decoration: none; text-underline-offset: 4px; }
a:hover { text-decoration: underline; text-decoration-color: var(--accent); }
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; padding: 0; }
img, svg { display: block; max-width: 100%; }
::selection { background: var(--accent); color: var(--paper-2); }

/* Instant. Focus rings never transition (gate 15). */
:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; border-radius: var(--r-xs); }

.mono, .num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.verdict { font-family: var(--font-read); font-size: var(--text-lg);
           line-height: 1.6; max-width: 68ch; color: var(--ink-2); }
.eyebrow { font-family: var(--font-mono); font-size: var(--text-xs);
           text-transform: uppercase; letter-spacing: .08em; color: var(--ink-mute); }
```

- [ ] **Step 4: Write the button voice**

Four states minimum on every interactive element.

```css
/* ───────── Buttons ───────── */
.btn { display: inline-flex; align-items: center; justify-content: center;
  gap: var(--space-xs); padding: var(--space-sm) var(--space-lg);
  border-radius: var(--r-md); font-weight: 500; font-size: var(--text-base);
  border: 1px solid transparent;
  transition: background var(--dur-fast) var(--ease-out),
              border-color var(--dur-fast) var(--ease-out); }

.btn-primary { background: var(--accent); color: var(--paper-2); }
.btn-primary:hover    { background: var(--accent-press); }
.btn-primary:active   { background: var(--accent-press); transform: translateY(1px); }
.btn-primary:disabled { background: var(--accent-mute); cursor: not-allowed; }

.btn-ghost { background: transparent; color: var(--ink-2); border-color: var(--hairline); }
.btn-ghost:hover    { background: var(--paper-3); border-color: var(--rule); }
.btn-ghost:active   { background: var(--paper-4); }
.btn-ghost:disabled { color: var(--ink-mute); cursor: not-allowed; }

.btn-danger { background: transparent; color: var(--band-stop); border-color: var(--band-stop); }
.btn-danger:hover    { background: var(--band-stop); color: var(--paper-2); }
.btn-danger:active   { transform: translateY(1px); }
.btn-danger:disabled { opacity: .5; cursor: not-allowed; }
```

Each transition names its properties. `transition: all` is a defect.

- [ ] **Step 5: Write `ThemeContext.jsx`**

Sets `data-theme` on `document.documentElement`, persists to `localStorage` under `oha_theme`, defaults to `'light'` regardless of OS preference — light is the brand.

- [ ] **Step 6: Write `main.jsx`**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { ThemeProvider } from './contexts/ThemeContext.jsx';
import './styles.css';

const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || '';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={clientId}>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </React.StrictMode>
);
```

Close the `GoogleOAuthProvider` before `React.StrictMode`. Temporary `App.jsx`: one of each button, an `h1`, a `.verdict` paragraph, a `.mono` figure, and a theme toggle — enough to eyeball every token now.

- [ ] **Step 7: Verify the tokens**

Run: `cd frontend && npm run dev`, open `http://localhost:5175`.

Expected: warm off-white ground (not `#fff`), Bricolage heading, DM Sans body, Newsreader on `.verdict`, tabular figures in `.mono`. Primary button is `#fa541c`. Tab to a button — the ring appears **instantly**, no fade. Toggle to dark: warm near-black, never `#000`. Drag the devtools width from 320px to 1920px — **no horizontal scrollbar at any width**.

- [ ] **Step 8: Commit**

```bash
git add frontend/ && git commit -m "feat(fe): scaffold and Hallmark token system on the openhouse palette"
```

---

### Task 3: Mock API layer and auth context

What makes the entire UI buildable and reviewable before any Python exists.

**Files:**
- Create: `frontend/src/api/client.js`, `frontend/src/api/mock.js`, `frontend/src/utils/toast.js`, `frontend/src/components/Toaster.jsx`, `frontend/src/contexts/AuthContext.jsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: `useTheme` (Task 2)
- Produces:
  - `api.get(path)`, `api.post(path, body)`, `api.upload(path, file)` → resolved JSON; rejects with `err.status`, `err.data`
  - `setAuthToken(t: string | null)`, `getAuthToken()`
  - `useAuth() -> { user, loading, loginWithGoogle(idToken), logout(), refresh() }`, where `user = { email, name, role: 'user'|'admin', submission_status: 'pending'|'submitted', submission_id?, submitted_at? }`
  - `toast(message, kind)` with `kind` in `'error' | 'info'`

- [ ] **Step 1: Write `client.js`**

```js
import { mockApi } from './mock.js';
import { toast } from '../utils/toast.js';

const BASE = import.meta.env.VITE_API_BASE || '';       // blank: Vercel rewrites /api → Render
const FORCE_MOCKS = String(import.meta.env.VITE_USE_MOCKS ?? 'true') !== 'false';

let token = null;
let expiredFired = false;          // parallel 401s must not stack toasts

export function setAuthToken(t) { token = t; if (t) expiredFired = false; }
export function getAuthToken() { return token; }

// A 401 while we still hold a token means the server killed the session.
// Say it once, then let AuthContext drop auth so RequireAuth redirects.
function sessionExpired() {
  if (expiredFired) return;
  expiredFired = true;
  toast('Session expired. Please sign in again.', 'error');
  window.dispatchEvent(new CustomEvent('auth:expired'));
}

function fromMock(method, path, body) {
  return new Promise((resolve, reject) => setTimeout(() => {
    try { resolve(mockApi(method, path, body)); }
    catch (e) { const err = new Error(e.message); err.status = e.status || 500; reject(err); }
  }, 120));                        // visible loading states in dev
}

async function handle(res, method, path, body) {
  if (res.status === 401 && token) sessionExpired();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || res.statusText); e.status = res.status; e.data = data; throw e; }
  return data;
}

async function request(method, path, body) {
  if (FORCE_MOCKS) return fromMock(method, path, body);
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json',
                 ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { return fromMock(method, path, body); }   // dead backend never hard-crashes the UI
  return handle(res, method, path, body);
}

// multipart — no Content-Type header; the browser must set its own boundary.
async function upload(path, file) {
  if (FORCE_MOCKS) return fromMock('POST', path, null);
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  return handle(res, 'POST', path, null);
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b),
  upload,
};
```

Setting `Content-Type` manually on a `FormData` body breaks the multipart boundary. Let the browser do it.

- [ ] **Step 2: Write `toast.js` and `Toaster.jsx`**

A module-level subscriber list; `toast(msg, kind)` pushes and auto-dismisses after 5s. `Toaster` renders fixed bottom-right.

**Failures and invisible effects only.** Never a success toast for something the user can already see — a completed upload shows the stamp, so it gets no toast.

```css
/* ───────── Toasts ───────── */
.toaster { position: fixed; right: var(--space-lg); bottom: var(--space-lg);
  display: flex; flex-direction: column; gap: var(--space-xs); z-index: 100; }
.toast { display: flex; gap: var(--space-xs); padding: var(--space-sm) var(--space-md);
  background: var(--paper-2); border: 1px solid var(--hairline);
  border-left: 2px solid var(--ink-mute); border-radius: var(--r-sm);
  font-size: var(--text-sm); max-width: 380px;
  animation: toast-in var(--dur-base) var(--ease-out); }
.toast-error { border-left-color: var(--band-stop); }
@keyframes toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
```

- [ ] **Step 3: Write `mock.js`**

Fixtures with real-shaped content — no "Jane Doe", no invented metrics.

```js
function axis(stars, reasoning) { return { stars, reasoning }; }

const SUBMISSIONS = [
  {
    id: '9f1c0a3e-0000-4000-8000-000000000001',
    email: 'asha.r@example.com', name: 'Asha Ramesh', status: 'scored',
    duration_s: 184.3, created_at: '2026-08-27T09:12:03Z',
    audio_url: '', rubric_version: 'a91c3fbb21c4', model: 'claude-opus-5',
    stt_model: 'scribe_v2',
    transcript: 'Hi, thanks for taking my call. I noticed you listed your flat in Powai three weeks ago and it is still up...',
    metrics: { duration_s: 184.3, speech_s: 161, speech_ratio: 0.874, word_count: 412,
               wpm: 153.5, pause_count_2s: 4, longest_pause_s: 5.2, mean_pause_s: 0.61,
               filler_count: 11, fillers_per_min: 3.6, audio_events: { laughter: 1 },
               speaker_count: 1 },
    scores: {
      pitch: axis(4, 'Opens with a concrete pain point rather than a company introduction, states the value proposition inside twenty seconds, and closes on a specific next step.'),
      tone: axis(3, 'Steady at 153 words per minute and clearly audible, but 3.6 fillers per minute and one 5.2 second pause mid-pitch read as searching for the next line.'),
      company: axis(2, 'Describes OpenHouse as a listing site, which undersells it and could be any competitor. Accurate in outline, generic in substance.'),
      sales: axis(4, 'Qualifies budget early, pre-empts the brokerage objection before it lands, and closes for a scheduled visit rather than a vague follow-up.'),
      overall: axis(3, 'A capable seller who has not yet learned the company. Coachable — the sales instincts are real and the gap is knowledge, not attitude.'),
      flags: [], summary: 'Strong seller, weak on the company. Train and re-assess.',
    },
  },
  {
    id: '9f1c0a3e-0000-4000-8000-000000000002',
    email: 'dev.k@example.com', name: 'Dev Kulkarni', status: 'scored',
    duration_s: 96.1, created_at: '2026-08-26T14:02:00Z',
    rubric_version: 'a91c3fbb21c4', model: 'claude-opus-5', stt_model: 'scribe_v2',
    transcript: 'So basically, um, we have properties, and, uh, you know, they are good properties...',
    metrics: { duration_s: 96.1, speech_s: 61.4, speech_ratio: 0.639, word_count: 121,
               wpm: 118.2, pause_count_2s: 9, longest_pause_s: 7.8, mean_pause_s: 1.9,
               filler_count: 14, fillers_per_min: 13.7, audio_events: {}, speaker_count: 1 },
    scores: {
      pitch: axis(1, 'No discernible structure. Never states what is being sold or to whom, and there is no ask at any point in the recording.'),
      tone: axis(1, 'Nine pauses over two seconds and 13.7 fillers per minute. A speech ratio of 0.64 means over a third of the recording is dead air.'),
      company: axis(1, 'Says OpenHouse "has properties", which is true of every listing site and conveys nothing specific or accurate.'),
      sales: axis(1, 'Features listed without a customer in the picture. No discovery, no benefit framing, no close.'),
      overall: axis(1, 'Not ready. The gaps are foundational rather than coachable within a reasonable ramp.'),
      flags: [], summary: 'Reject. No structure, no ask, heavy hesitation throughout.',
    },
  },
];

let me_ = { email: 'you@openhouse.in', name: 'You', role: 'admin', submission_status: 'pending' };
let pollCount = 0;     // lets the dashboard's polling UI be exercised offline

export function mockApi(method, path, body) {
  if (method === 'GET'  && path === '/api/health') return { ok: true };
  if (method === 'POST' && path === '/api/auth/google') return { token: 'mock', user: me_ };
  if (method === 'GET'  && path === '/api/me') return me_;
  if (method === 'GET'  && path === '/api/instructions')
    return { markdown: '## Your task\n\nRecord a **2-3 minute** sales pitch for OpenHouse.\n\n- Speak naturally. Do not read a script.\n- Record somewhere quiet, on any device.\n- You get one attempt.', version: 'mock' };

  if (method === 'POST' && path === '/api/submissions') {
    pollCount = 0;
    me_ = { ...me_, submission_status: 'submitted',
            submission_id: SUBMISSIONS[0].id, submitted_at: new Date().toISOString() };
    return { id: SUBMISSIONS[0].id, status: 'queued' };
  }

  // Three polls of 'processing', then 'scored' — exercises the real UI path.
  if (method === 'GET' && /\/api\/submissions\/[^/]+\/status$/.test(path)) {
    pollCount += 1;
    const id = path.split('/')[3];
    return { id, status: pollCount < 4 ? 'processing' : 'scored' };
  }

  if (method === 'GET' && /\/api\/submissions\/[^/]+$/.test(path)) {
    const row = SUBMISSIONS.find((s) => s.id === path.split('/').pop());
    if (!row) { const e = new Error('not found'); e.status = 404; throw e; }
    return row;
  }
  if (method === 'GET' && path.startsWith('/api/submissions')) {
    return { total: SUBMISSIONS.length,
      items: SUBMISSIONS.map(({ id, email, name, status, duration_s, created_at, rubric_version, scores }) =>
        ({ id, email, name, status, duration_s, created_at, rubric_version,
           overall: scores.overall.stars })) };
  }
  const e = new Error(`mock: unhandled ${method} ${path}`); e.status = 500; throw e;
}
```

- [ ] **Step 4: Write `AuthContext.jsx`**

```js
loginWithGoogle(idToken) → POST /api/auth/google → localStorage 'oha_token' → setUser
refresh()                → GET  /api/me → setUser        (after an upload lands)
logout()                 → clear token, clear user
```

Plus a boot `useEffect` that reads `oha_token`, calls `setAuthToken`, then `GET /api/me`; and a `window` listener for `auth:expired` that clears auth so `RequireAuth` redirects.

**No welcome curtain.** The `Direct_Inventory` sign-in animation is deliberately not carried over — see [`docs/07-frontend.md` §7](07-frontend.md).

- [ ] **Step 5: Verify against mocks**

Run: `npm run dev`, call `loginWithGoogle('x')` from a temporary button.
Expected: `user.role === 'admin'`, no animation, `oha_token` in localStorage. Reload keeps the session. Clear the key and reload → signed out.

- [ ] **Step 6: Commit**

```bash
git add frontend/src && git commit -m "feat(fe): mock API layer, toasts, auth context"
```

---

### Task 4: Landing, Assessment, Dashboard

Three candidate surfaces, three distinct rhythms. This is where the macrostructure is either real or the design collapses into a template.

**Files:**
- Create: `frontend/src/components/{icons,Layout,UploadDrop,ScoringProgress}.jsx`, `frontend/src/pages/{Landing,Assessment,Dashboard}.jsx`
- Modify: `frontend/src/App.jsx`, `frontend/src/styles.css`
- Spec: [`docs/07-frontend.md` §4](07-frontend.md)

**Interfaces:**
- Consumes: `useAuth`, `useTheme`, `api`, `toast`
- Produces: `RequireAuth`, `RequireAdmin`, `<Layout />`. Task 5 mounts admin routes inside the same `Layout`.

- [ ] **Step 1: Write `icons.jsx`**

Hand-written inline SVG. `stroke="currentColor"`, `fill="none"`, `strokeWidth={1.5}`, `width/height={16}`, `aria-hidden="true"` on every one.

Needed: `IconSun`, `IconMoon`, `IconSignOut`, `IconUpload`, `IconCheck`, `IconAlert`, `IconArrow`.

**No icon library, no emoji as a UI icon.** Either is a defect.

- [ ] **Step 2: Write `Layout.jsx`**

Edge-aligned minimal nav: `Openhouse` wordmark in display far left, `SALES ASSESSMENT` as a mono eyebrow beside it, theme toggle and sign-out flush right, `--rule-hair` bottom border. No sidebar, no shadow.

```css
/* ───────── Shell ───────── */
.shell { width: 100%; max-width: 1180px; margin-inline: auto;
         padding-inline: clamp(var(--space-md), 4vw, var(--space-2xl)); }
.nav { display: flex; align-items: center; gap: var(--space-md);
       padding-block: var(--space-md); border-bottom: var(--rule-hair); }
.nav-mark { font-family: var(--font-display); font-size: var(--text-lg); letter-spacing: -0.02em; }
.nav-right { margin-left: auto; display: flex; align-items: center; gap: var(--space-sm); }
```

Interactive bars are explicitly `align-items: center` — default flex `stretch` makes a button taller than its sibling.

- [ ] **Step 3: Write `App.jsx` routes**

`/` is **public**. A signed-in visitor is routed by state, once.

```jsx
function homeFor(user) {
  if (user.role === 'admin') return '/admin';
  return user.submission_status === 'submitted' ? '/dashboard' : '/assessment';
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="shell" style={{ paddingBlock: '25vh' }}>
                        <span className="eyebrow">Loading</span></div>;
  if (!user) return <Navigate to="/" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { user } = useAuth();
  return user?.role === 'admin' ? children : <Navigate to="/assessment" replace />;
}

// Candidates who have already submitted must not reach the upload form again.
function RequireNoSubmission({ children }) {
  const { user } = useAuth();
  return user?.submission_status === 'submitted'
    ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
  const { user, loading } = useAuth();
  return (
    <>
      <Toaster />
      <Routes>
        <Route path="/" element={
          loading ? <Splash /> : user ? <Navigate to={homeFor(user)} replace /> : <Landing />
        } />
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route path="/assessment" element={<RequireNoSubmission><Assessment /></RequireNoSubmission>} />
          <Route path="/dashboard"  element={<Dashboard />} />
          <Route path="/admin"      element={<RequireAdmin><AdminList /></RequireAdmin>} />
          <Route path="/admin/:id"  element={<RequireAdmin><AdminDetail /></RequireAdmin>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
```

The landing page is outside `Layout` — it has its own full-bleed structure and no nav.

- [ ] **Step 4: Write `Landing.jsx` — off-axis, popup sign-in**

Two panels, full height, a hairline between. **Nothing on a shared centre axis.**

- Left: `--paper-3` ground. The mark `Sales Assessment` at `--text-mark` in display, anchored **bottom-left** with `--space-3xl` padding. Above it a mono eyebrow `OPENHOUSE · SALES (INSIGHT)` on the left margin. Below it one `--accent` rule, 64px × 2px — the only accent on the page.
- Right: `--paper` ground, a content block at `max-width: 360px` starting at 38% from the top, **left-aligned inside its column**. Three or four lines explaining what this is and that it takes one attempt, then the sign-in.

Sign-in is a **popup on this page** — `@react-oauth/google`'s `GoogleLogin` defaults to `ux_mode="popup"`, so there is no redirect and no route change:

```jsx
<GoogleLogin
  onSuccess={(r) => loginWithGoogle(r.credential)}
  onError={() => toast('Sign-in failed. Please try again.', 'error')}
  shape="rectangular" text="signin_with" width="320"
/>
```

```css
/* ───────── Landing · off-axis split ───────── */
.landing { display: grid; grid-template-columns: 1.15fr 1fr; min-height: 100vh; }
.landing-mark { background: var(--paper-3); border-right: var(--rule-hair);
  display: flex; flex-direction: column; justify-content: flex-end;
  padding: var(--space-3xl); gap: var(--space-md); }
.landing-mark h1 { font-size: var(--text-mark); line-height: .95; }
.landing-rule { width: 64px; height: 2px; background: var(--accent); }
.landing-panel { display: flex; flex-direction: column; justify-content: flex-start;
  padding: 38vh var(--space-2xl) 0; gap: var(--space-lg); }
@media (max-width: 820px) {
  .landing { grid-template-columns: 1fr; min-height: auto; }
  .landing-mark { border-right: 0; border-bottom: var(--rule-hair); padding: var(--space-2xl); }
  .landing-panel { padding: var(--space-2xl); }
}
```

- [ ] **Step 5: Write `Assessment.jsx` — numbered steps, then the dropzone**

Fetch `GET /api/instructions`. Render with a ~20-line markdown function handling `##`, `**bold**`, `-` lists and paragraphs. **No markdown library** — the content is ours and this is the whole requirement.

Steps numbered `01`–`04`, numeral in the **left margin** in mono, hairline between each. No cards, no icons, no 3-column grid. The `UploadDrop` sits below the steps on the same page.

```css
/* ───────── Numbered steps ───────── */
.steps { border-top: var(--rule-hair); }
.step { display: grid; grid-template-columns: 3rem 1fr; gap: var(--space-lg);
        padding-block: var(--space-lg); border-bottom: var(--rule-hair); }
.step-n { font-family: var(--font-mono); font-size: var(--text-sm); color: var(--accent);
          padding-top: .2rem; }
.step-body { max-width: 68ch; }

/* ───────── Callout ───────── */
.callout { display: flex; gap: var(--space-sm); align-items: flex-start;
  padding: var(--space-md); background: var(--accent-wash);
  border-left: 2px solid var(--accent); border-radius: 0 var(--r-sm) var(--r-sm) 0;
  font-size: var(--text-sm); margin-block: var(--space-lg); }
```

The one-attempt warning sits above the fold:

```jsx
<div className="callout">
  <IconAlert /> <span><strong>You get one attempt.</strong> Listen back before you upload.</span>
</div>
```

- [ ] **Step 6: Write `UploadDrop.jsx`**

Drag-and-drop plus a hidden `<input type="file">`. Validates **before** accepting: type in `audio/mpeg, audio/mp4, audio/wav, audio/x-wav, audio/webm, audio/ogg`; size ≤ 25 MB; duration ≤ 10 min from a hidden `<audio>`'s `loadedmetadata`. On reject, `toast(msg, 'error')` — never silently ignore a dropped file.

On accept: filename, size, duration in mono, plus an `<audio controls>` preview.

```css
/* ───────── Dropzone ───────── */
.drop { border: 1px dashed var(--rule); border-radius: var(--r-lg);
  padding: var(--space-3xl) var(--space-lg); text-align: center;
  color: var(--ink-mute); background: var(--paper-2); cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-out),
              background var(--dur-fast) var(--ease-out); }
.drop:hover, .drop.over { border-color: var(--accent); background: var(--accent-wash); }
.drop.over { border-style: solid; }
```

Two properties, both named. No scale, no shadow.

Submit path: confirm dialog → `api.upload('/api/submissions', file)` → on `202`, `refresh()` then `navigate('/dashboard', { replace: true })`. On `409`, toast "You have already submitted." and navigate to `/dashboard`. On `413`/`415`/`422`, toast the server's `.error` and stay put.

The confirm is not friction on a one-shot irreversible act; it is the point.

- [ ] **Step 7: Write `ScoringProgress.jsx` — real polling**

```jsx
const COPY = { queued: 'QUEUED', processing: 'TRANSCRIBING', scored: 'DONE', failed: 'DONE' };

export default function ScoringProgress({ id, onDone }) {
  const [status, setStatus] = useState('queued');
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await api.get(`/api/submissions/${id}/status`);
        if (!alive) return;
        setStatus(r.status);
        // 'failed' is deliberately treated as done. The candidate never learns.
        if (r.status === 'scored' || r.status === 'failed') return onDone();
      } catch { /* transient — the next tick retries */ }
      if (alive) setTimeout(tick, 2000);
    };
    tick();
    return () => { alive = false; };
  }, [id, onDone]);
  ...
}
```

Within `processing`, advance the copy on a local timer — `TRANSCRIBING` → `MEASURING DELIVERY` (at 15s) → `SCORING` (at 25s) — because the API reports one state for all three.

```css
.progress { height: 2px; background: var(--paper-4); overflow: hidden; }
.progress-fill { height: 100%; background: var(--accent); width: 0;
                 animation: fill 45s var(--ease-out) forwards; }
@keyframes fill { to { width: 88%; } }   /* honest ceiling — never reaches 100% */
@media (prefers-reduced-motion: reduce) { .progress-fill { animation: none; width: 88%; } }
```

**No percentage number.** Neither Scribe nor Claude reports progress.

- [ ] **Step 8: Write `Dashboard.jsx`**

Two states, one route:

- While `queued`/`processing` → `<ScoringProgress id={user.submission_id} onDone={refresh} />`
- Otherwise → the **stamp**

```css
/* ───────── Stamp ───────── */
.stamp { display: inline-block; transform: rotate(-1.5deg);
  border: 2px solid var(--band-go); border-radius: var(--r-sm);
  padding: var(--space-sm) var(--space-lg); color: var(--band-go);
  font-family: var(--font-mono); font-size: var(--text-xl);
  text-transform: uppercase; letter-spacing: .12em; }
```

`RECEIVED`, the timestamp in mono beneath, one line of plain copy. **This component must contain no reference to `scores`, `stars`, or any numeric result** — the API sends none and the tree must have no path to one.

- [ ] **Step 9: Verify the candidate flow**

Run: `npm run dev`. Land on `/`, sign in, read the steps, upload any audio file.

Expected: the landing hero has **nothing on a shared centre axis**; sign-in opens a popup and the URL never changes; steps are numbered in the left margin with hairlines; the dropzone accepts and previews; confirm appears; the dashboard polls (the mock returns `processing` three times, then `scored`); the stamp lands. **No number appears anywhere in the flow.** Drop a `.pdf` → error toast, no upload. Navigate back to `/assessment` after submitting → redirected to `/dashboard`. Both themes legible; 320px → no horizontal scroll.

- [ ] **Step 10: Commit**

```bash
git add frontend/src && git commit -m "feat(fe): landing with popup sign-in, assessment, polling dashboard"
```

---

### Task 5: The board and the record

**Files:**
- Create: `frontend/src/components/{Stars,AxisBlock,MetricsStrip}.jsx`, `frontend/src/pages/{AdminList,AdminDetail}.jsx`
- Modify: `frontend/src/styles.css`
- Spec: [`docs/07-frontend.md` §5–§6](07-frontend.md)

**Interfaces:**
- Consumes: `api`, `toast`, `Layout`, `RequireAdmin` (Task 4)
- Produces: `<Stars stars={n} size />`, `<AxisBlock n label stars reasoning />`, `<MetricsStrip metrics={obj} />`

- [ ] **Step 1: Write `Stars.jsx` — a numeral, not five glyphs**

```jsx
const BANDS = ['Irrelevant', 'Reject', 'Can hire, but train',
               'Average · can hire', 'Hire', 'Must hire'];
const TONE  = ['stop', 'stop', 'hold', 'mid', 'go', 'go'];

export default function Stars({ stars, size = 'md', showBand = true }) {
  return (
    <span className={`stars stars-${size}`} data-tone={TONE[stars]}
          role="img" aria-label={`${stars} of 5 — ${BANDS[stars]}`}>
      <span className="stars-mark">{stars}</span>
      <span className="stars-of">/5</span>
      {showBand && <span className="stars-band">{BANDS[stars]}</span>}
    </span>
  );
}
```

```css
/* ───────── Verdict ───────── */
.stars { display: inline-flex; align-items: baseline; gap: var(--space-xs); }
.stars[data-tone="go"]   { --band: var(--band-go); }
.stars[data-tone="hold"] { --band: var(--band-hold); }
.stars[data-tone="stop"] { --band: var(--band-stop); }
.stars[data-tone="mid"]  { --band: var(--band-mid); }
.stars-mark { font-family: var(--font-display); line-height: 1; color: var(--band);
              font-variant-numeric: tabular-nums; }
.stars-md .stars-mark { font-size: var(--text-2xl); }
.stars-lg .stars-mark { font-size: var(--text-mark); }
.stars-sm .stars-mark { font-size: var(--text-lg); }
.stars-of   { font-family: var(--font-mono); font-size: var(--text-sm); color: var(--ink-mute); }
.stars-band { font-family: var(--font-mono); font-size: var(--text-xs);
              text-transform: uppercase; letter-spacing: .08em;
              color: var(--ink-2); margin-left: var(--space-xs); }
```

**Why a numeral.** Five drawn glyphs make the reader count, and an empty row of five reads as *not yet scored* — fatal when 0 is a real band meaning "Irrelevant". The band name spelled out removes the ambiguity.

- [ ] **Step 2: Write `AdminList.jsx` — the board**

`GET /api/submissions`. Paste the `.board` CSS from [`docs/07-frontend.md` §5](07-frontend.md) into `styles.css` verbatim.

Columns: candidate (name over email), submitted (mono, `YYYY-MM-DD HH:MM`), duration (mono `m:ss`), status (mono word + dot), overall (`<Stars size="sm" showBand={false} />`, or `—` when not scored). Row click → `/admin/:id`; rows are keyboard-focusable and respond to Enter.

Status filter as a mono segmented row above the board, default "all".

When visible rows carry more than one distinct `rubric_version`, render a `.callout`: "These submissions were scored against different rubric versions and are not directly comparable."

No cards, no zebra striping, no shadows, no rounded rows. Hairlines separate; `--rule-thick` under the header.

- [ ] **Step 3: Write `MetricsStrip.jsx`**

Ruled columns, not tiles.

```css
/* ───────── Metrics strip ───────── */
.metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  border-block: var(--rule-hair); }
.metric { padding: var(--space-md) var(--space-sm); border-left: var(--rule-hair); }
.metric:first-child { border-left: 0; }
.metric-v { font-family: var(--font-mono); font-size: var(--text-xl);
            font-variant-numeric: tabular-nums; color: var(--ink); }
.metric-k { font-family: var(--font-mono); font-size: var(--text-xs);
            text-transform: uppercase; letter-spacing: .06em;
            color: var(--ink-mute); margin-top: var(--space-2xs); }
```

Show `wpm`, `fillers/min`, `speech ratio` (as a percentage), `longest pause`, `words`, `duration` (`m:ss`). If `speaker_count > 1`, a mono `--band-hold` line reading `2 SPEAKERS DETECTED`. Flag, don't punish.

- [ ] **Step 4: Write `AxisBlock.jsx`**

```jsx
export default function AxisBlock({ n, label, stars, reasoning }) {
  return (
    <section className="axis" data-tone={TONE[stars]}>
      <span className="axis-n mono">{String(n).padStart(2, '0')}</span>
      <div className="axis-body">
        <h3 className="axis-label">{label}</h3>
        <Stars stars={stars} />
        <p className="verdict">{reasoning}</p>
      </div>
    </section>
  );
}
```

```css
/* ───────── Axis blocks ───────── */
.axis { display: grid; grid-template-columns: 3rem 1fr; gap: var(--space-lg);
        padding-block: var(--space-xl); border-top: 2px solid var(--band); }
.axis[data-tone="go"]   { --band: var(--band-go); }
.axis[data-tone="hold"] { --band: var(--band-hold); }
.axis[data-tone="stop"] { --band: var(--band-stop); }
.axis[data-tone="mid"]  { --band: var(--band-mid); }
.axis-n { color: var(--ink-mute); font-size: var(--text-sm); padding-top: .35rem; }
.axis-label { font-size: var(--text-xl); margin-bottom: var(--space-sm); }
```

Band colour on a **2px top rule**, never a thick left side-stripe. The block is not a card, so nothing nests.

- [ ] **Step 5: Write `AdminDetail.jsx`**

`GET /api/submissions/:id`, in order:

1. `.eyebrow` with the submission id in mono, then the candidate name in display
2. `<Stars stars={overall} size="lg" />` and the summary in `.verdict`
3. `<audio controls src={audio_url} style={{ width: '100%' }} />` — the presigned URL from the response
4. `<MetricsStrip />`
5. `AxisBlock` `01` pitch, `02` tone, `03` company, `04` sales — then `--rule-thick` — then `05` overall
6. Transcript in a block with `max-height: 340px; overflow-y: auto`, body in `--font-read` at 68ch
7. A mono footer: `rubric_version` · `model` · `stt_model`
8. A `.btn-danger` **Void** behind a confirm: "Void this submission? The candidate will be able to upload again."

When `status === 'failed'`, render the `error` string in a `.callout` and skip sections 2, 4, 5 and 6 — there is nothing to show.

- [ ] **Step 6: Verify**

Run: `npm run dev`, sign in (mock user is `admin`), open `/admin`.

Expected: a ruled board, mono columns aligned because of `tabular-nums`, Asha at 3 and Dev at 1. Row hover changes exactly one property. Detail shows numbered axes with band-coloured top rules, reasoning in Newsreader at a comfortable measure. Set `me_.role = 'user'` in `mock.js` → `/admin` redirects to `/assessment`. Both themes legible; 320px → no horizontal scroll; keyboard tab reaches every row.

- [ ] **Step 7: Run the gate sweep**

Work through the checklist in [`docs/07-frontend.md` §9](07-frontend.md) against the built UI. Every answer must be **no**. Fix anything that isn't before committing.

- [ ] **Step 8: Commit**

```bash
git add frontend/src && git commit -m "feat(fe): admin board and the score record"
```

---

### Task 6: Backend — auth, database, app skeleton

**Files:**
- Create: `backend/app/auth.py`, `backend/app/db.py`, `backend/app/main.py`, `backend/tests/test_auth.py`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - Assessment-agnostic: `db.get_oh_user(email) -> dict | None`, `db.upsert_candidate(email, name) -> str`
  - Per-assessment: `db.live_submission(email) -> dict | None`, `db.create_submission(sub_id, candidate_id, audio_key, audio_type, audio_bytes) -> str`, `db.set_processing(id)`, `db.finish_submission(id, **r)`, `db.fail_submission(id, error)`, `db.fail_stale(older_than, reason) -> int`, `db.get_status(id) -> dict | None`, `db.list_submissions(limit, offset, status) -> (total, items)`, `db.get_submission(id) -> dict | None`, `db.void_submission(id, by_email) -> bool`, `db.AlreadySubmitted`
  - `auth.verify_google(id_token) -> {"email","name"}`, `auth.mint(email, name, role, ttl_s) -> str`, `auth.verify(token) -> dict`, `auth.AuthError`, `auth.current_user` and `auth.require_admin` FastAPI dependencies

- [ ] **Step 1: Write the failing auth tests**

`backend/tests/test_auth.py`:

```python
import os, time, pytest
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("GOOGLE_OAUTH_CLIENT_ID", "test-client")

from app import auth

def test_mint_and_verify_round_trip():
    claims = auth.verify(auth.mint("a@b.com", "Asha", "admin"))
    assert claims["email"] == "a@b.com" and claims["role"] == "admin"

def test_expired_token_is_rejected():
    with pytest.raises(auth.AuthError):
        auth.verify(auth.mint("a@b.com", "Asha", "user", ttl_s=-1))

def test_tampered_token_is_rejected():
    tok = auth.mint("a@b.com", "Asha", "user")
    with pytest.raises(auth.AuthError):
        auth.verify(tok[:-4] + "AAAA")

def test_token_signed_with_another_secret_is_rejected():
    import jwt
    forged = jwt.encode({"email": "x@y.com", "role": "admin",
                         "exp": int(time.time()) + 60}, "wrong", algorithm="HS256")
    with pytest.raises(auth.AuthError):
        auth.verify(forged)
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd backend && python -m pytest tests/test_auth.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.auth'`

- [ ] **Step 3: Write `backend/app/auth.py`**

```python
import os, time
import jwt
from fastapi import Header, HTTPException
from google.auth.transport import requests as g_requests
from google.oauth2 import id_token as g_id_token

SECRET = os.environ["JWT_SECRET"]
CLIENT_ID = os.environ["GOOGLE_OAUTH_CLIENT_ID"]
ALG = "HS256"
TTL_S = 7 * 24 * 3600


class AuthError(Exception):
    pass


def verify_google(token: str) -> dict:
    """Verify a Google ID token's signature and audience. Never decode unverified."""
    try:
        info = g_id_token.verify_oauth2_token(token, g_requests.Request(), CLIENT_ID)
    except Exception as e:
        raise AuthError(f"invalid google token: {e}")
    if not info.get("email_verified"):
        raise AuthError("google account has no verified email")
    return {"email": info["email"].lower(), "name": info.get("name") or ""}


def mint(email: str, name: str, role: str, ttl_s: int = TTL_S) -> str:
    now = int(time.time())
    return jwt.encode(
        {"email": email, "name": name, "role": role, "iat": now, "exp": now + ttl_s},
        SECRET, algorithm=ALG,
    )


def verify(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET, algorithms=[ALG])
    except jwt.PyJWTError as e:
        raise AuthError(str(e))


async def current_user(authorization: str = Header(default="")) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "missing bearer token")
    try:
        c = verify(authorization[7:])
    except AuthError as e:
        raise HTTPException(401, str(e))
    return {"email": c["email"], "name": c.get("name", ""), "role": c["role"]}


async def require_admin(authorization: str = Header(default="")) -> dict:
    u = await current_user(authorization)
    if u["role"] != "admin":
        raise HTTPException(403, "admin only")
    return u
```

- [ ] **Step 4: Run and confirm the tests pass**

Run: `cd backend && python -m pytest tests/ -v`
Expected: 11 passed (7 metrics + 4 auth)

- [ ] **Step 5: Write `backend/app/db.py`**

A module-level `psycopg_pool.ConnectionPool` opened lazily, `min_size=1, max_size=5` — one always-on instance, and Neon's pooled endpoint is the budget. Implement every function from the Interfaces block using the statements in [`docs/03-data-model.md` §5](03-data-model.md) **verbatim and parameterised**.

Two behaviours callers depend on:

```python
class AlreadySubmitted(Exception):
    """Raised when the submissions_one_live partial unique index fires."""


def create_submission(email, name, audio_key, audio_type, audio_bytes) -> str:
    try:
        # INSERT ... RETURNING id
    except psycopg.errors.UniqueViolation:
        raise AlreadySubmitted()


def fail_stale(older_than: timedelta, reason: str) -> int:
    """Rows still queued/processing after a restart are dead. Returns the count."""
```

`get_submission` returns `metrics` and `scores` as dicts — psycopg already parses jsonb, so do not `json.loads` a second time.

- [ ] **Step 6: Write `backend/app/main.py`**

App, lifespan, CORS, health, and the two auth routes. Submission routes arrive in Task 9.

```python
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import auth, db, tasks


@asynccontextmanager
async def lifespan(app: FastAPI):
    # A deploy or crash mid-scoring leaves rows in flight forever. Clear them
    # once, on the way up, so an admin sees a failure they can void.
    n = await tasks.sweep_stale()
    if n:
        print(f"startup: failed {n} stale submission(s)")
    yield


app = FastAPI(lifespan=lifespan)

# The Vercel rewrite makes the browser same-origin, but the Render URL is
# discoverable — restrict anyway.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o],
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/api/health")
async def health():
    return {"ok": True}


@app.post("/api/auth/google")
async def google_login(body: dict):
    try:
        info = auth.verify_google(body["id_token"])
    except auth.AuthError as e:
        raise HTTPException(401, str(e))
    # Everyone who signs in gets a candidate row — staff included. Role comes
    # from oh_users membership, never from having a candidates row.
    db.upsert_candidate(info["email"], info["name"])
    oh = db.get_oh_user(info["email"])
    role = oh["role"] if oh else "user"
    return {"token": auth.mint(info["email"], info["name"], role),
            "user": {**info, "role": role}}


@app.get("/api/me")
async def me(u: dict = Depends(auth.current_user)):
    live = db.live_submission(u["email"])
    if not live:
        return {**u, "submission_status": "pending"}
    # 'submitted' for ANY live row — queued, processing, scored, or failed alike.
    # A candidate whose scoring errored is not shown a failure; that is ours.
    return {**u, "submission_status": "submitted",
            "submission_id": str(live["id"]),
            "submitted_at": live["created_at"].isoformat()}
```

Create a stub `app/tasks.py` with `async def sweep_stale(): return 0` so this imports; Task 9 fills it in.

- [ ] **Step 7: Verify against Neon**

Apply `migrations/001_schema.sql` and the admin seed to Neon, export the env vars, then:

```bash
cd backend && uvicorn app.main:app --reload --port 5060
curl -s localhost:5060/api/health
TOK=$(python -c "from app import auth; print(auth.mint('support@openhouse.in','S','admin'))")
curl -s localhost:5060/api/me -H "Authorization: Bearer $TOK"
```

Expected: `{"ok":true}`, then `{"email":"support@openhouse.in","name":"S","role":"admin","submission_status":"pending"}`.

- [ ] **Step 8: Commit**

```bash
git add backend/ && git commit -m "feat(api): google auth, session tokens, db layer, health, /api/me"
```

---

### Task 7: R2 storage and the upload endpoint

**Files:**
- Create: `backend/app/storage.py`
- Modify: `backend/app/main.py`

**Interfaces:**
- Consumes: `db.create_submission`, `db.AlreadySubmitted`, `auth.current_user`
- Produces: `storage.put(key, data, content_type)`, `storage.delete(key)`, `storage.presign(key, ttl_s=3600) -> str`, `storage.get(key) -> bytes`; and `POST /api/submissions` returning `202`

- [ ] **Step 1: Write `backend/app/storage.py`**

```python
import os
import boto3
from botocore.config import Config

_BUCKET = os.environ["R2_BUCKET"]
_client = None


def client():
    """R2 speaks S3. One client per process; boto3's is thread-safe for these calls."""
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
            aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )
    return _client


def put(key: str, data: bytes, content_type: str) -> None:
    client().put_object(Bucket=_BUCKET, Key=key, Body=data, ContentType=content_type)


def get(key: str) -> bytes:
    return client().get_object(Bucket=_BUCKET, Key=key)["Body"].read()


def delete(key: str) -> None:
    client().delete_object(Bucket=_BUCKET, Key=key)


def presign(key: str, ttl_s: int = 3600) -> str:
    """Short-lived read URL. Admin responses only — never candidate-facing."""
    return client().generate_presigned_url(
        "get_object", Params={"Bucket": _BUCKET, "Key": key}, ExpiresIn=ttl_s)
```

Objects are never public. `presign` is the only way anyone reads one.

- [ ] **Step 2: Write `POST /api/submissions`**

```python
import io, uuid
from fastapi import UploadFile, File
from mutagen import File as MutagenFile

MAX_BYTES = 25 * 1024 * 1024
MAX_SECONDS = 600
ALLOWED = {
    "audio/mpeg": ".mp3", "audio/mp4": ".m4a", "audio/x-m4a": ".m4a",
    "audio/wav": ".wav", "audio/x-wav": ".wav",
    "audio/webm": ".webm", "audio/ogg": ".ogg",
}


@app.post("/api/submissions", status_code=202)
async def create_submission(background: BackgroundTasks,
                            file: UploadFile = File(...),
                            u: dict = Depends(auth.current_user)):
    ext = ALLOWED.get(file.content_type)
    if not ext:
        raise HTTPException(415, f"unsupported audio type: {file.content_type}")

    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "file is larger than 25 MB")

    probe = MutagenFile(io.BytesIO(data))
    if probe is None or not getattr(probe, "info", None):
        raise HTTPException(422, "could not read that audio file")
    if probe.info.length > MAX_SECONDS:
        raise HTTPException(422, "recording is longer than 10 minutes")

    # Validate everything BEFORE writing anything.
    sub_id = str(uuid.uuid4())
    key = f"audio/{sub_id}{ext}"
    storage.put(key, data, file.content_type)

    try:
        db.create_submission(u["email"], u["name"], key, file.content_type, len(data),
                             sub_id=sub_id)
    except db.AlreadySubmitted:
        storage.delete(key)          # a rejected double-submit leaves nothing behind
        raise HTTPException(409, "you have already submitted")

    background.add_task(tasks.score_submission, sub_id)
    return {"id": sub_id, "status": "queued"}
```

`create_submission` takes the id rather than generating one, so the R2 key and the row id are the same value.

- [ ] **Step 3: Verify**

Export the R2 env vars and run the server.

```bash
curl -i -X POST localhost:5060/api/submissions -H "Authorization: Bearer $USER_TOK" \
     -F "file=@sample.mp3;type=audio/mpeg"
```

Expected: `202` with an id, within a few seconds. Confirm the object exists in the R2 bucket. Repeat → `409`, and confirm **no second object** was created. Post a `.pdf` as `application/pdf` → `415`. Post a 12-minute file → `422`.

- [ ] **Step 4: Commit**

```bash
git add backend/app && git commit -m "feat(api): r2 storage and the async upload endpoint"
```

---

### Task 8: The scoring pipeline

**Files:**
- Create: `backend/app/scoring.py`, `backend/rubric.md`, `backend/tests/test_scoring.py`
- Reference: [`docs/05-scoring.md`](05-scoring.md), [`docs/06-rubric.md`](06-rubric.md)

**Interfaces:**
- Consumes: `metrics.derive` (Task 1)
- Produces: `scoring.score(audio: bytes) -> dict` returning `{"transcript","metrics","scores","duration_s","rubric_version","model","stt_model"}`; `scoring.RUBRIC_VERSION`; `scoring.ScoringError`

- [ ] **Step 1: Create `backend/rubric.md`**

Copy sections 1–6 of [`docs/06-rubric.md`](06-rubric.md), dropping the meta-commentary. The header must say what it is:

```markdown
> PLACEHOLDER RUBRIC. Scores produced against this file are uncalibrated and
> must not drive a hiring decision. Replace before real candidates are assessed.
```

- [ ] **Step 2: Write the failing test**

`backend/tests/test_scoring.py` — network calls are not exercised; what is under test is the wiring, the schema, and the rubric hash.

```python
import os, hashlib
os.environ.setdefault("ELEVENLABS_API_KEY", "x")
os.environ.setdefault("ANTHROPIC_API_KEY", "x")

from app import scoring

def test_rubric_version_is_a_stable_12_char_hash():
    assert len(scoring.RUBRIC_VERSION) == 12
    assert scoring.RUBRIC_VERSION == scoring.RUBRIC_VERSION

def test_rubric_version_tracks_rubric_content():
    assert scoring.rubric_version_of("abc") == hashlib.sha256(b"abc").hexdigest()[:12]
    assert scoring.rubric_version_of("abc") != scoring.rubric_version_of("abd")

def test_score_schema_bounds_stars_and_requires_real_reasoning():
    s = scoring.SCORE_SCHEMA
    assert s["additionalProperties"] is False
    axis = s["$defs"]["axis"]["properties"]
    assert axis["stars"] == {"type": "integer", "minimum": 0, "maximum": 5}
    assert axis["reasoning"]["minLength"] >= 40
    for k in ("pitch", "tone", "company", "sales", "overall"):
        assert k in s["required"]

def test_submission_block_keeps_volatile_content_out_of_the_cached_prefix():
    block = scoring.build_submission_block("hello world", {"wpm": 150})
    assert "hello world" in block
    # The rubric lives in the cached system prefix. Repeating it in the user
    # message would double input cost and gain nothing.
    assert "PLACEHOLDER RUBRIC" not in block
```

- [ ] **Step 3: Run and confirm failure**

Run: `cd backend && python -m pytest tests/test_scoring.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.scoring'`

- [ ] **Step 4: Write `backend/app/scoring.py`**

Module constants: `MODEL = "claude-opus-5"`, `STT_MODEL = "scribe_v2"`, `RUBRIC_MD` read from `backend/rubric.md` at import, `RUBRIC_VERSION = rubric_version_of(RUBRIC_MD)`, `METRICS_GLOSSARY` verbatim from [`docs/05-scoring.md` §4](05-scoring.md), `SCORE_SCHEMA` verbatim from [`docs/05-scoring.md` §5](05-scoring.md).

```python
def transcribe(audio: bytes) -> dict:
    client = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
    r = client.speech_to_text.convert(
        file=io.BytesIO(audio), model_id=STT_MODEL, diarize=True,
        tag_audio_events=True, timestamps_granularity="word",
    )
    return {"text": r.text, "words": [w.model_dump() for w in r.words]}


def judge(transcript: str, m: dict) -> dict:
    client = anthropic.Anthropic()
    msg = client.messages.parse(
        model=MODEL, max_tokens=16000,
        thinking={"type": "adaptive"},
        output_config={"effort": "max",
                       "format": {"type": "json_schema", "schema": SCORE_SCHEMA}},
        system=[
            {"type": "text", "text": RUBRIC_MD, "cache_control": {"type": "ephemeral"}},
            {"type": "text", "text": METRICS_GLOSSARY, "cache_control": {"type": "ephemeral"}},
        ],
        messages=[{"role": "user", "content": build_submission_block(transcript, m)}],
    )
    if msg.stop_reason == "refusal":
        raise ScoringError(f"model declined: {msg.stop_details}")
    log.info("cache_read=%s", msg.usage.cache_read_input_tokens)
    return msg.parsed_output
```

`score(audio)` chains `transcribe` → `metrics.derive(words)` → `judge` and returns the dict in the Interfaces block.

Three things that must not drift:
- **No `budget_tokens`.** Opus 5 returns a 400. `thinking={"type":"adaptive"}` plus `output_config.effort` is the whole control surface.
- **`output_config.format`**, never the deprecated top-level `output_format`.
- **Nothing volatile in the `system` blocks.** No timestamp, no candidate name, no id. One varying byte invalidates the cache for every request.

- [ ] **Step 5: Run and confirm the tests pass**

Run: `cd backend && python -m pytest tests/ -v`
Expected: 15 passed

- [ ] **Step 6: Verify `model_id` against the live API**

The Scribe v2 id string is **unconfirmed** — see [`docs/05-scoring.md` §1](05-scoring.md).

```bash
cd backend && python -c "
from elevenlabs.client import ElevenLabs; import os
c = ElevenLabs(api_key=os.environ['ELEVENLABS_API_KEY'])
print(c.speech_to_text.convert(file=open('sample.mp3','rb'), model_id='scribe_v2',
      diarize=True, tag_audio_events=True, timestamps_granularity='word').text[:200])"
```

If it 404s or reports an unknown model, try `scribe_v1`. **Write the answer into `CLAUDE.md`** and set `STT_MODEL` accordingly.

- [ ] **Step 7: End-to-end smoke against real APIs**

Run `score()` on a real 30-second recording. Confirm: `metrics.wpm` is plausible for what you hear; all five axes have integer stars 0–5; every `reasoning` cites something specific from the recording; the second run logs a non-zero `cache_read_input_tokens`.

**If cache reads are zero on run two, stop and find the varying byte** before moving on — it is a permanent 2× on input cost.

- [ ] **Step 8: Commit**

```bash
git add backend/app/scoring.py backend/tests/test_scoring.py backend/rubric.md
git commit -m "feat(api): scribe transcription, delivery metrics, and claude scoring"
```

---

### Task 9: Background task, status, and admin routes

**Files:**
- Create: `backend/instructions.md`
- Modify: `backend/app/tasks.py`, `backend/app/main.py`

**Interfaces:**
- Consumes: `db.*`, `storage.*`, `scoring.score`, `auth.current_user`, `auth.require_admin`
- Produces: `tasks.score_submission(sub_id)`, `tasks.sweep_stale()`, and the remaining endpoints in [`docs/04-api.md`](04-api.md)

- [ ] **Step 1: Write `backend/app/tasks.py`**

```python
import logging
from datetime import timedelta
from . import db, storage, scoring

log = logging.getLogger(__name__)
STALE_AFTER = timedelta(minutes=10)


def score_submission(sub_id: str) -> None:
    """Runs after the 202 has been sent. No timeout, so no length limit."""
    try:
        row = db.get_submission(sub_id)
        db.set_processing(sub_id)
        audio = storage.get(row["audio_key"])
        result = scoring.score(audio)
        db.finish_submission(sub_id, **result)
    except Exception as e:
        log.exception("scoring failed for %s", sub_id)
        db.fail_submission(sub_id, str(e)[:500])


async def sweep_stale() -> int:
    """Once, on startup. A row still in flight after a restart is dead."""
    return db.fail_stale(STALE_AFTER, "interrupted by a backend restart")
```

The bare `except` is deliberate: **any** failure must land in the row as `failed`, or the candidate's attempt is consumed with nothing to show for it.

- [ ] **Step 2: Write `GET /api/submissions/{id}/status`**

```python
@app.get("/api/submissions/{sub_id}/status")
async def status(sub_id: str, u: dict = Depends(auth.current_user)):
    row = db.get_status(sub_id)
    # Owner or admin only. A stranger gets 404, not 403 — a 403 would confirm
    # the id exists.
    if not row or (u["role"] != "admin" and row["email"] != u["email"]):
        raise HTTPException(404, "not found")
    return {"id": sub_id, "status": row["status"]}
```

- [ ] **Step 3: Write the admin routes**

```python
@app.get("/api/submissions")
async def list_(limit: int = 50, offset: int = 0, status: str | None = None,
                _: dict = Depends(auth.require_admin)):
    total, items = db.list_submissions(limit, offset, status)
    return {"total": total, "items": items}


@app.get("/api/submissions/{sub_id}")
async def detail(sub_id: str, _: dict = Depends(auth.require_admin)):
    row = db.get_submission(sub_id)
    if not row:
        raise HTTPException(404, "not found")
    key = row.pop("audio_key")                    # the key never leaves the server
    return {**row, "audio_url": storage.presign(key)}


@app.post("/api/submissions/{sub_id}/void")
async def void(sub_id: str, u: dict = Depends(auth.require_admin)):
    if not db.get_submission(sub_id):
        raise HTTPException(404, "not found")
    if not db.void_submission(sub_id, u["email"]):
        raise HTTPException(409, "already voided")
    return {"id": sub_id, "status": "voided"}


@app.get("/api/instructions")
async def instructions(_: dict = Depends(auth.current_user)):
    md = (pathlib.Path(__file__).parent.parent / "instructions.md").read_text()
    return {"markdown": md, "version": hashlib.sha256(md.encode()).hexdigest()[:6]}
```

Create `backend/instructions.md` from [`docs/06-rubric.md` §7](06-rubric.md).

- [ ] **Step 4: Verify every status code by hand**

Server running, two tokens exported (`$ADMIN`, `$USER`):

```bash
curl -s -o /dev/null -w '%{http_code}\n' localhost:5060/api/me                     # 401
curl -s -o /dev/null -w '%{http_code}\n' localhost:5060/api/submissions \
     -H "Authorization: Bearer $USER"                                              # 403
curl -s -o /dev/null -w '%{http_code}\n' localhost:5060/api/submissions \
     -H "Authorization: Bearer $ADMIN"                                             # 200
curl -s -o /dev/null -w '%{http_code}\n' \
     localhost:5060/api/submissions/00000000-0000-0000-0000-000000000000/status \
     -H "Authorization: Bearer $USER"                                              # 404
```

Upload as `$USER`, then poll the status endpoint until it reads `scored`. Confirm the row in Neon has `transcript`, `metrics`, `scores` and `rubric_version` populated.

**Then check for leakage:**

```bash
curl -s localhost:5060/api/me -H "Authorization: Bearer $USER" | grep -i 'star\|score' \
  && echo LEAK || echo clean
curl -s localhost:5060/api/submissions/$ID/status -H "Authorization: Bearer $USER" \
  | grep -i 'star\|score\|reason' && echo LEAK || echo clean
```

Both must print `clean`.

**Restart test:** upload, then `Ctrl-C` the server mid-scoring and restart it. The startup sweep must flip the row to `failed`, not leave it in `processing`.

- [ ] **Step 5: Commit**

```bash
git add backend/ && git commit -m "feat(api): background scoring, status polling, admin routes"
```

---

### Task 10: Local integration

**Files:**
- Modify: `frontend/.env`

- [ ] **Step 1: Flip mocks off**

Set `VITE_USE_MOCKS=false` in `frontend/.env`. Run uvicorn on `:5060` and Vite on `:5175` together — Vite's proxy stands in for Vercel's rewrite.

- [ ] **Step 2: Walk the whole product**

- Land on `/`, sign in with a **real Google account** through the popup
- As a candidate: read the steps, upload a real 2–3 minute recording
- Watch the dashboard poll from `queued` → `processing` → the stamp
- Sign in as an admin (an email seeded into `oh_users`), open `/admin`
- Open the record: play the audio through the presigned URL, read the metrics, read all five axes
- Void it, then confirm the candidate can upload again

- [ ] **Step 3: Fix what the walk surfaces, then commit**

```bash
git commit -am "fix: local integration"
```

---

### Task 11: Deploy

**Files:**
- Create: `backend/render.yaml`, `frontend/vercel.json`

- [ ] **Step 1: Deploy the backend to Render**

`backend/render.yaml`:

```yaml
services:
  - type: web
    name: oh-assessments-api
    runtime: python
    plan: starter                 # always-on. Free tier suspends background tasks
    rootDir: backend
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT
    healthCheckPath: /api/health
```

Set every backend variable from [`docs/02-architecture.md` §9](02-architecture.md) in the Render dashboard. **Plan must be Starter** — on the free tier an idle instance is suspended and a background scoring task dies with it.

Verify: `curl https://oh-assessments-api.onrender.com/api/health` → `{"ok":true}`.

- [ ] **Step 2: Deploy the frontend to Vercel**

`frontend/vercel.json` — copy from [`docs/02-architecture.md` §4](02-architecture.md), substituting the real Render hostname. **Rewrite order matters:** `/api/(.*)` must precede the SPA catch-all.

Vercel project root directory: `frontend`. Set `VITE_GOOGLE_OAUTH_CLIENT_ID`, `VITE_API_BASE=` (blank), `VITE_USE_MOCKS=false`.

- [ ] **Step 3: Close the loop between the two**

- Set `ALLOWED_ORIGINS` on Render to the Vercel production **and** preview domains
- Add the Vercel production domain and `http://localhost:5175` to the Google OAuth client's **Authorised JavaScript origins**
- Confirm `https://<vercel-domain>/api/health` returns `{"ok":true}` — that proves the rewrite works

- [ ] **Step 4: Run the acceptance list**

Against the deployed URL, verify each success criterion from [`docs/01-spec.md` §8](01-spec.md):

- [ ] A candidate completes landing → popup sign-in → upload → stamp with no guidance
- [ ] Score five recordings three times each and record the per-axis spread. If any axis spreads by more than 1 star, switch on the panel in [`docs/05-scoring.md` §8](05-scoring.md) before assessing real candidates
- [ ] Every axis has reasoning that cites something specific from the recording
- [ ] `rubric_version` is on the record page and matches `sha256(rubric.md)[:12]`
- [ ] A candidate account gets `403` on `/api/submissions` and is redirected away from `/admin`
- [ ] `GET /api/me` and `/status` as a candidate contain no number
- [ ] A candidate cannot read another candidate's status (`404`)
- [ ] Void → the candidate can upload again; the voided row stays visible to the admin
- [ ] Audio plays on the record page; the presigned URL 403s after an hour
- [ ] Redeploy Render mid-scoring → the row lands as `failed`, not stuck in `processing`
- [ ] Both themes legible on every page; `prefers-reduced-motion` suppresses all animation
- [ ] No horizontal scroll between 320px and 1920px on any page

- [ ] **Step 5: Commit**

```bash
git add backend/render.yaml frontend/vercel.json
git commit -m "chore: render and vercel deployment config"
```

---

## Before real candidates

1. **Replace `backend/rubric.md`.** Everything until then is uncalibrated. [`docs/06-rubric.md` §8](06-rubric.md) has the checklist.
2. **Write `backend/instructions.md`** — the scenario, target length, and the objection to handle. It must match what the rubric rewards.
3. **Calibrate.** Score three to five recordings you already hold a human opinion on and confirm the model lands within ±1 star. If it doesn't, fix the rubric — not the prompt, and not the model.
4. **Write the confirmed Scribe `model_id` into `CLAUDE.md`.**
5. Void every placeholder-era submission so no uncalibrated score is ever compared against a real one.
