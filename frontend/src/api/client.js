// Thin fetch wrapper around the FastAPI backend.
//
// VITE_API_BASE is blank in normal operation: Vercel rewrites /api/* to Render
// in production and Vite's dev proxy does the same locally, so the browser only
// ever talks to one origin.

import { toast } from '../utils/toast.js';

const RAW_BASE = import.meta.env.VITE_API_BASE || '';

// A cross-origin base cannot carry the session, so it is IGNORED rather than
// obeyed. The failure it causes looks like a server bug — sign-in 200s with a
// user, then every call after it 401s "not signed in" — because the browser
// will not store a cross-site Set-Cookie and SameSite=Lax would refuse to send
// it anyway. This was survivable while the token rode in an Authorization
// header; it stopped being survivable when the session became a cookie.
//
// Falling back to same-origin is not a workaround hiding a misconfiguration:
// /api/* is same-origin by design (Vercel's rewrite in production, Vite's dev
// proxy locally), and that is the only shape cookie auth works in. Obeying the
// variable would leave the app permanently signed out instead.
let crossOrigin = false;
try {
  crossOrigin = !!RAW_BASE && new URL(RAW_BASE, location.origin).origin !== location.origin;
} catch { /* unparseable base — treat it as same-origin and let the URL fail loudly */ }

if (crossOrigin) {
  console.error(
    `VITE_API_BASE points at ${RAW_BASE}, a different origin to ${location.origin}. ` +
    'A session cookie cannot survive that, so it is being ignored and /api/* ' +
    'will go same-origin via the rewrite. Unset VITE_API_BASE to silence this.'
  );
}

const BASE = crossOrigin ? '' : RAW_BASE;

// The session is an httpOnly cookie set by the server. There is deliberately no
// token in JS: nothing here can read it, so nothing injected here can steal it.
// `credentials: same-origin` is what attaches it — Vercel rewrites /api/* to the
// backend and Vite's dev proxy does the same, so the browser sees one origin.
const CREDS = 'same-origin';

let expiredFired = false; // guards the notice: parallel 401s must not stack toasts

// A dropped connection, a backend restart, a Neon connection the pool had not
// yet replaced — these are SINGLE-REQUEST blips, and a toast for something that
// would have worked on a second attempt is noise. Two quiet retries fix almost
// all of them without the reader seeing anything.
//
// GET ONLY. A retried POST is a second submission: /api/submissions would burn
// a candidate's one attempt twice over, and a re-score would schedule two runs
// racing the same row. Safe methods only, no exceptions.
const RETRIES = 2;
const BACKOFF_MS = [250, 750];
const isTransient = (status) => status === 0 || status === 429 || status >= 500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The backstop the retries do not cover. Deliberately at most ONE per minute:
// a reload cannot fix a backend that is genuinely down, and reloading on every
// failure would trap the reader in a refresh loop they cannot get out of.
const RELOAD_KEY = 'oha_reloaded_at';
const RELOAD_COOLDOWN_MS = 60_000;

function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;   // no storage to remember with, so no way to stop a loop
  }
  window.location.reload();
  return true;
}

export function resetExpiryNotice() {
  expiredFired = false;
}

// A 401 while we still hold a token means the server killed the session. Say so
// once, then let AuthContext drop auth so RequireAuth redirects.
function sessionExpired() {
  if (expiredFired) return;
  expiredFired = true;
  toast('Session expired. Please sign in again.', 'error');
  window.dispatchEvent(new CustomEvent('auth:expired'));
}

async function unwrap(res, { quiet = false } = {}) {
  // `quiet` is for the boot probe: a 401 there just means "not signed in", which
  // is not an expiry worth announcing.
  if (res.status === 401 && !quiet) sessionExpired();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.detail || data.error || res.statusText);
    e.status = res.status;
    e.data = data;
    throw e;
  }
  return data;
}

async function once(method, path, body, opts) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: CREDS,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // No response at all — DNS, offline, backend down.
    const e = new Error('Could not reach the server. Check your connection and try again.');
    e.status = 0;
    throw e;
  }
  return unwrap(res, opts);
}

async function request(method, path, body, opts) {
  const safe = method === 'GET';
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await once(method, path, body, opts);
    } catch (e) {
      if (!safe || !isTransient(e.status)) throw e;
      if (attempt < RETRIES) { await sleep(BACKOFF_MS[attempt]); continue; }
      // Retries exhausted. `quiet` is the boot probe — reloading on that is how
      // a refresh loop starts, and a failed boot probe is already handled.
      if (!opts?.quiet && reloadOnce()) {
        // Navigating away; keep the promise pending so no toast flashes first.
        return new Promise(() => {});
      }
      throw e;
    }
  }
}

// multipart — deliberately NO Content-Type header. Setting it by hand breaks the
// multipart boundary; the browser must generate its own.
async function upload(path, file, notes = '') {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('notes', notes);

  let res;
  try {
    res = await fetch(BASE + path, {
      method: 'POST',
      credentials: CREDS,
      body: fd,
    });
  } catch {
    const e = new Error('Upload failed — could not reach the server.');
    e.status = 0;
    throw e;
  }
  return unwrap(res);
}

export const api = {
  get: (p, opts) => request('GET', p, undefined, opts),
  post: (p, b) => request('POST', p, b),
  patch: (p, b) => request('PATCH', p, b),
  upload,
};
