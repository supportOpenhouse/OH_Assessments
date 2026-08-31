import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setAuthToken } from '../api/client.js';

const AuthContext = createContext(null);
const TOKEN_KEY = 'oha_token';

function readToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function writeToken(t) {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }
  catch { /* private window — session lasts until reload, which is acceptable */ }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Boot: if we already hold a token, find out who it belongs to.
  useEffect(() => {
    const t = readToken();
    if (!t) { setLoading(false); return; }
    setAuthToken(t);
    api.get('/api/me')
      .then(setUser)
      .catch(() => { writeToken(null); setAuthToken(null); })
      .finally(() => setLoading(false));
  }, []);

  // Session killed server-side (any 401 while signed in) — drop auth so
  // RequireAuth sends the user back to the landing page.
  useEffect(() => {
    function onExpired() {
      writeToken(null);
      setAuthToken(null);
      setUser(null);
    }
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  // Google's popup hands us an ID token; the backend verifies it and returns
  // our own 7-day JWT. Google's own token expires in an hour, which would sign
  // a candidate out mid-upload.
  const loginWithGoogle = useCallback(async (idToken) => {
    const r = await api.post('/api/auth/google', { id_token: idToken });
    writeToken(r.token);
    setAuthToken(r.token);
    setUser(r.user);
    return r.user;
  }, []);

  // Called after an upload lands, so submission_status is current.
  const refresh = useCallback(async () => {
    const me = await api.get('/api/me');
    setUser(me);
    return me;
  }, []);

  // The stored name is authoritative, so the server's response replaces the
  // whole user rather than being merged into it.
  const rename = useCallback(async (name) => {
    const me = await api.patch('/api/me', { name });
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(() => {
    writeToken(null);
    setAuthToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, refresh, rename, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
