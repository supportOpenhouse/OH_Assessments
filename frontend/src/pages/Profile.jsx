import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { toast } from '../utils/toast.js';
import { stamp } from '../utils/format.js';
import { IconCheck, IconEdit, IconClose } from '../components/icons.jsx';
import SiteFooter from '../components/SiteFooter.jsx';

const NAME_MAX = 80;

// One page, both roles. A candidate sees what they have attempted; an admin sees
// their access level. Neither sees a score.
//
// The name is READ-ONLY until you ask to change it. An always-open form implies
// a field you are expected to fill; this is something most people touch once.
export default function Profile() {
  const { user, rename } = useAuth();
  const [me, setMe] = useState(null);
  const [history, setHistory] = useState([]);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef(null);
  const savedTimer = useRef(null);

  useEffect(() => {
    api.get('/api/me').then(setMe).catch(() => {});
    api.get('/api/my/submissions').then((r) => setHistory(r.items)).catch(() => {});
    return () => clearTimeout(savedTimer.current);
  }, []);

  const current = me?.name ?? user?.name ?? '';

  function open() {
    setName(current);
    setSaved(false);
    setEditing(true);
    // Focus after the input exists, with the cursor at the end.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    });
  }

  function cancel() {
    setEditing(false);
    setName('');
  }

  const trimmed = name.trim().replace(/\s+/g, ' ');
  const dirty = trimmed.length > 0 && trimmed !== current;

  async function save(e) {
    e.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const updated = await rename(trimmed);
      setMe(updated);
      setEditing(false);
      // Silent success would leave it unclear the change took — the heading
      // looks the same either way until you notice the letters.
      setSaved(true);
      savedTimer.current = setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      toast(err.message || 'Could not update your name.', 'error');
    } finally {
      setSaving(false);
    }
  }

  // Third element: render as mono. Every figure in this app is monospaced and
  // tabular — a date or a count set in the UI face reads as prose.
  const facts = [
    ['Email', user?.email, true],
    ['Role', user?.role === 'admin' ? 'Openhouse team' : 'Candidate', false],
    ['First signed in', me?.first_seen_at ? stamp(me.first_seen_at) : '—', true],
    ['Sign-ins', me?.login_count ?? '—', true],
    ['Assessments attempted', me?.submission_count ?? 0, true],
  ];

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Account</span>

        {editing ? (
          <form className="name-edit" onSubmit={save}>
            <input
              ref={inputRef}
              className="field name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && cancel()}
              maxLength={NAME_MAX}
              placeholder="Your name"
              aria-label="Display name"
            />
            <button type="submit" className="btn btn-primary" disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="icon-btn" onClick={cancel} aria-label="Cancel">
              <IconClose />
            </button>
          </form>
        ) : (
          <h2 className="name-head">
            {current || 'Your profile'}
            <button type="button" className="icon-btn name-edit-btn" onClick={open}
                    aria-label="Edit your display name">
              <IconEdit />
            </button>
            {saved && (
              <span className="name-saved" role="status"><IconCheck /> Saved</span>
            )}
          </h2>
        )}

        {editing && (
          <p className="picked-meta name-hint">
            {me?.name_set_by_user
              ? 'Set by you. Signing in with Google will not change it back.'
              : 'Taken from your Google account. Change it and it stays changed.'}
            {' '}{name.length}/{NAME_MAX} · Esc to cancel
          </p>
        )}
      </div>

      {/* A <dl>, not a stat strip: these are label/value pairs, and squeezing an
          email address into a fifth of the width breaks it mid-word. */}
      <dl className="facts">
        {facts.map(([k, v, mono]) => (
          <div className="fact" key={k}>
            <dt className="fact-k">{k}</dt>
            <dd className={`fact-v${mono ? ' mono' : ''}`}>{v}</dd>
          </div>
        ))}
      </dl>

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

      <SiteFooter />
    </>
  );
}
