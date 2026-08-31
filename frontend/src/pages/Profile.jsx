import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { stamp } from '../utils/format.js';

// One page, both roles. A candidate sees what they have attempted; an admin sees
// their access level. Neither sees a score — an admin's own results, if they
// ever took an assessment, are not privileged information about themselves.
export default function Profile() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [me, setMe] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    api.get('/api/me').then(setMe).catch(() => {});
    api.get('/api/my/submissions').then((r) => setHistory(r.items)).catch(() => {});
  }, []);

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
        <h2>{user?.name || 'Your profile'}</h2>
      </div>

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
