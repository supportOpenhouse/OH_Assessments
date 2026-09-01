// Thin fetch wrapper around the FastAPI backend.
//
// VITE_API_BASE is blank in normal operation: Vercel rewrites /api/* to Render
// in production and Vite's dev proxy does the same locally, so the browser only
// ever talks to one origin.

import { toast } from '../utils/toast.js';

const BASE = import.meta.env.VITE_API_BASE || '';

// The session is an httpOnly cookie set by the server. There is deliberately no
// token in JS: nothing here can read it, so nothing injected here can steal it.
// `credentials: same-origin` is what attaches it — Vercel rewrites /api/* to the
// backend and Vite's dev proxy does the same, so the browser sees one origin.
const CREDS = 'same-origin';

let expiredFired = false; // guards the notice: parallel 401s must not stack toasts

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

async function request(method, path, body, opts) {
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

// multipart — deliberately NO Content-Type header. Setting it by hand breaks the
// multipart boundary; the browser must generate its own.
async function upload(path, file) {
  const fd = new FormData();
  fd.append('file', file);

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
