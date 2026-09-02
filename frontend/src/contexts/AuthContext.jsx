import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, resetExpiryNotice } from '../api/client.js';
import Curtain, { CURTAIN_SWEEP_MS, CURTAIN_HOLD_MS } from '../components/Curtain.jsx';

// The session lives in an httpOnly cookie set by the server. Nothing is stored
// in JS or localStorage — there is no token here for an injected script to read,
// and closing the tab changes nothing because the cookie has its own 7-day life.

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [curtain, setCurtain] = useState(null);   // null | 'cover' | 'reveal'
  const [line, setLine] = useState('');

  // Cover the screen, and hand back control once it actually is covered — the
  // work behind it (a route swap, the sign-out round trip) must not be visible.
  const cover = useCallback(async (text) => {
    setLine(text);
    setCurtain('cover');
    await new Promise((r) => setTimeout(r, CURTAIN_SWEEP_MS));
  }, []);

  // Deliberately NOT awaited by the caller: sign-out has to navigate while the
  // screen is still covered, so the reveal runs on its own and uncovers onto
  // wherever the caller went.
  const reveal = useCallback(() => {
    setTimeout(() => {
      setCurtain('reveal');
      setTimeout(() => setCurtain(null), CURTAIN_SWEEP_MS);
    }, CURTAIN_HOLD_MS);
  }, []);

  // Boot: ask the server who the cookie belongs to.
  useEffect(() => {
    let alive = true;
    api.get('/api/me', { quiet: true })
      .then((me) => { if (alive) setUser(me); })
      .catch((e) => {
        // ONLY a 401 means "not signed in". Treating every failure as a sign-out
        // is what logged people out on a cold backend, a 500, or a dropped
        // connection — and with localStorage it destroyed the token on the way,
        // so the next load was signed out too.
        if (alive && e.status !== 401) {
          // eslint-disable-next-line no-console
          console.warn('Could not verify the session:', e.message);
        }
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // Session killed server-side (a 401 while we believed we were signed in).
  useEffect(() => {
    function onExpired() { setUser(null); }
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  // Google's popup hands us an ID token; the backend verifies it and replies
  // with Set-Cookie. The token itself never reaches this code.
  const loginWithGoogle = useCallback(async (idToken) => {
    const r = await api.post('/api/auth/google', { id_token: idToken });
    resetExpiryNotice();
    // Cover BEFORE setUser: setting it makes `/` redirect to the dashboard, and
    // that swap is the thing worth hiding.
    const first = (r.user.name || '').trim().split(/\s+/)[0];
    await cover(first ? `Welcome, ${first}` : 'Welcome');
    setUser(r.user);
    reveal();
    return r.user;
  }, [cover, reveal]);

  // Called after an upload lands, so submission_count is current.
  const refresh = useCallback(async () => {
    const me = await api.get('/api/me');
    setUser(me);
    return me;
  }, []);

  const rename = useCallback(async (name) => {
    const me = await api.patch('/api/me', { name });
    setUser(me);
    return me;
  }, []);

  // Only the server can clear an httpOnly cookie, so signing out is a request.
  const logout = useCallback(async () => {
    await cover('Signed out');
    // The whole round trip happens behind the curtain, however slow the backend
    // is. Resolving here — still covered — is what lets the caller navigate
    // before anything is visible.
    try { await api.post('/api/auth/logout'); } catch { /* clear locally anyway */ }
    setUser(null);
    reveal();
  }, [cover, reveal]);

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, refresh, rename, logout }}>
      {children}
      <Curtain phase={curtain} line={line} />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
