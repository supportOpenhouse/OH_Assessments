// Thin fetch wrapper around the FastAPI backend, with a mock fallback.
//
// VITE_API_BASE is blank in normal operation: Vercel rewrites /api/* to Render
// in production and Vite's dev proxy does the same locally, so the browser only
// ever talks to one origin.
//
// VITE_USE_MOCKS=true (the default) resolves every call from mock.js, which is
// what lets the entire UI be built and reviewed before the backend exists. Even
// with mocks off, a network failure falls back to mocks so a dead backend never
// hard-crashes the UI during local dev.

import { mockApi } from './mock.js';
import { toast } from '../utils/toast.js';

const BASE = import.meta.env.VITE_API_BASE || '';
const FORCE_MOCKS = String(import.meta.env.VITE_USE_MOCKS ?? 'true') !== 'false';

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

function fromMock(method, path, body) {
  // A little latency so loading states are actually visible in dev.
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        // Clone before resolving. The mock holds its fixtures in module state
        // and mutates them; handing back the same object identity twice makes
        // React bail out of re-rendering, because Object.is(prev, next) is true.
        // Real HTTP always yields fresh objects — the mock has to as well, or it
        // silently stops exercising the code path it exists to exercise.
        resolve(structuredClone(mockApi(method, path, body)));
      } catch (e) {
        const err = new Error(e.message || 'mock error');
        err.status = e.status || 500;
        reject(err);
      }
    }, 120);
  });
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
  if (FORCE_MOCKS) return fromMock(method, path, body);

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
    return fromMock(method, path, body); // no server reachable
  }
  return unwrap(res);
}

// multipart — deliberately NO Content-Type header. Setting it by hand breaks the
// multipart boundary; the browser must generate its own.
async function upload(path, file) {
  if (FORCE_MOCKS) return fromMock('POST', path, null);

  const fd = new FormData();
  fd.append('file', file);

  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  return unwrap(res);
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b),
  upload,
};
