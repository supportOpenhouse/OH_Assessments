import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { toast } from '../utils/toast.js';
import { stamp } from '../utils/format.js';
import { IconCheck } from '../components/icons.jsx';

const NAME_MAX = 80;

// One page, both roles. A candidate sees what they have attempted; an admin sees
// their access level. Neither sees a score.
export default function Profile() {
  const { user, rename, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [me, setMe] = useState(null);
  const [history, setHistory] = useState([]);

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef(null);

  useEffect(() => {
    api.get('/api/me').then((r) => { setMe(r); setName(r.name || ''); }).catch(() => {});
    api.get('/api/my/submissions').then((r) => setHistory(r.items)).catch(() => {});
    return () => clearTimeout(savedTimer.current);
  }, []);

  const current = me?.name ?? user?.name ?? '';
  const trimmed = name.trim().replace(/\s+/g, ' ');
  const dirty = trimmed !== current && trimmed.length > 0;

  async function save(e) {
    e.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const updated = await rename(trimmed);
      setMe(updated);
      setName(updated.name);
      // Silent success would leave the user unsure it took, and the field looks
      // identical either way — so this is one of the few effects worth marking.
      setSaved(true);
      savedTimer.current = setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      toast(err.message || 'Could not update your name.', 'error');
    } finally {
      setSaving(false);
    }
  }

  const facts = [
    ['Email', user?.email],
    ['Role', user?.role === 'admin' ? 'Openhouse team' : 'Candidate'],
    ['First signed in', me?.first_seen_at ? stamp(me.first_seen_at) : '—'],
    ['Sign-ins', me?.login_count ?? '—'],
    ['Assessments attempted', me?.submission_count ?? 0],
  ];

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Account</span>
        <h2>{current || 'Your profile'}</h2>
      </div>

      <section>
        <h3 className="axis-label">Display name</h3>
        <p className="muted measure" style={{ marginBottom: 'var(--space-md)' }}>
          This is the name the hiring team sees on your submission.
        </p>

        <form className="name-form" onSubmit={save}>
          <input
            className="field"
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setSaved(false); }}
            maxLength={NAME_MAX}
            placeholder="Your name"
            aria-label="Display name"
            aria-describedby="name-hint"
          />
          <button type="submit" className="btn btn-primary" disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {dirty && !saving && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { setName(current); setSaved(false); }}
            >
              Cancel
            </button>
          )}
          {saved && (
            <span className="name-saved" role="status">
              <IconCheck /> Saved
            </span>
          )}
        </form>

        <p id="name-hint" className="picked-meta" style={{ marginTop: 'var(--space-xs)' }}>
          {me?.name_set_by_user
            ? 'Set by you. Signing in with Google will not change it back.'
            : 'Taken from your Google account. Change it and it stays changed.'}
          {' '}{name.length}/{NAME_MAX}
        </p>
      </section>

      <div className="metrics">
        {facts.map(([k, v]) => (
          <div className="metric" key={k}>
            <div className="metric-v metric-v-sm">{v}</div>
            <div className="metric-k">{k}</div>
          </div>
        ))}
      </div>

      {history.length > 0 && (
        <section style={{ marginTop: 'var(--space-xl)' }}>
          <h3 className="axis-label">Assessments</h3>
          <div className="steps">
            {history.map((s) => (
              <div className="step step-tight" key={s.id}>
                <div className="step-body">
                  <strong>{s.assessment_name}</strong>
                  <p className="picked-meta">{stamp(s.submitted_at)}</p>
                </div>
                <div className="step-end">
                  <span className={`status status-${s.state === 'assessing' ? 'processing' : s.state}`}>
                    {s.state === 'assessing' ? 'being assessed' : s.state}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={{ marginTop: 'var(--space-xl)' }}>
        <h3 className="axis-label">Preferences</h3>
        <div className="picked-actions">
          <button type="button" className="btn btn-ghost" onClick={toggle}>
            Switch to {theme === 'dark' ? 'light' : 'dark'} theme
          </button>
          <button type="button" className="btn btn-ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </section>
    </>
  );
}
