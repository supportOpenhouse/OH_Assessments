// Thin fetch wrapper around the FastAPI backend.
//
// VITE_API_BASE is blank in normal operation: Vercel rewrites /api/* to Render
// in production and Vite's dev proxy does the same locally, so the browser only
// ever talks to one origin.

import { toast } from '../utils/toast.js';

const BASE = import.meta.env.VITE_API_BASE || '';

let token = null;
let expiredFired = false; // guards the notice: parallel 401s must not stack toasts

export function setAuthToken(t) {
  token = t;
  if (t) expiredFired = false; // fresh session — re-arm the expiry notice
}

export function getAuthToken() {
  return token;
}

// A 401 while we still hold a token means the server killed the session. Say so
// once, then let AuthContext drop auth so RequireAuth redirects.
function sessionExpired() {
  if (expiredFired) return;
  expiredFired = true;
  toast('Session expired. Please sign in again.', 'error');
  window.dispatchEvent(new CustomEvent('auth:expired'));
}

async function unwrap(res) {
  if (res.status === 401 && token) sessionExpired();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.detail || data.error || res.statusText);
    e.status = res.status;
    e.data = data;
    throw e;
  }
  return data;
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // No response at all — DNS, offline, backend down.
    const e = new Error('Could not reach the server. Check your connection and try again.');
    e.status = 0;
    throw e;
  }
  return unwrap(res);
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
      headers: token ? { Authorization: `Bearer ${token}` } : {},
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
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b),
  patch: (p, b) => request('PATCH', p, b),
  upload,
};
