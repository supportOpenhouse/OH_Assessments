import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { toast } from '../utils/toast.js';
import { stamp } from '../utils/format.js';
import Loader from '../components/Loader.jsx';

// Everyone who has ever signed in. Attempts and which assessments come from one
// grouped query, not a round trip per row.
export default function AdminCandidates() {
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [staffHidden, setStaffHidden] = useState(0);
  const [showStaff, setShowStaff] = useState(false);
  const [q, setQ] = useState('');

  const load = useCallback((term, staff) => {
    const p = new URLSearchParams({ limit: '200' });
    if (term) p.set('q', term);
    if (staff) p.set('include_staff', 'true');
    api.get(`/api/candidates?${p}`)
      .then((r) => { setRows(r.items); setTotal(r.total); setStaffHidden(r.staff_hidden || 0); })
      .catch((e) => { setRows([]); toast(e.message || 'Could not load candidates.', 'error'); });
  }, []);

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => load(q, showStaff), 250);
    return () => clearTimeout(t);
  }, [q, showStaff, load]);

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Admin</span>
        <h2>Candidates</h2>
        <p className="mono muted" style={{ marginTop: 'var(--space-2xs)' }}>
          {total} {total === 1 ? 'applicant' : 'applicants'}
          {/* Say what is hidden. A filtered row nobody knows about is worse
              than a visible one that does not belong. */}
          {staffHidden > 0 && ` · ${staffHidden} Openhouse team member${staffHidden === 1 ? '' : 's'} hidden`}
        </p>
      </div>

      <div className="filters">
        <input
          className="field"
          type="search"
          placeholder="Search name or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search candidates by name or email"
        />
        <div className="seg" role="group" aria-label="Include Openhouse team">
          <button type="button" aria-pressed={!showStaff} onClick={() => setShowStaff(false)}>
            applicants
          </button>
          <button type="button" aria-pressed={showStaff} onClick={() => setShowStaff(true)}>
            + team
          </button>
        </div>
      </div>

      <div className="board-wrap" style={{ marginTop: 'var(--space-lg)' }}>
        <table className="board">
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Attempts</th>
              <th>Assessments</th>
              <th>Sign-ins</th>
              <th>First seen</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((c) => (
              <tr key={c.id} style={{ cursor: 'default' }}>
                <td className="cand">
                  {c.name || '—'}
                  {c.is_staff && <span className="chip chip-mute">team</span>}
                  <small>{c.email}</small>
                </td>
                <td className="num">
                  {c.attempts}
                  {c.voided > 0 && <small className="muted"> ({c.voided} reset)</small>}
                </td>
                <td>
                  {c.assessments.length === 0
                    ? <span className="mono muted">—</span>
                    : c.assessments.map((a) => (
                        <span className="chip" key={a.key}>{a.name}</span>
                      ))}
                </td>
                <td className="num">{c.login_count}</td>
                <td className="num">{stamp(c.first_seen_at)}</td>
                <td className="num">{stamp(c.last_seen_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows === null && <div className="loading-block"><Loader /></div>}
      {rows !== null && rows.length === 0 && (
        <div className="empty">
          {q ? `No applicant matches “${q}”.` : 'No applicants yet.'}
        </div>
      )}
    </>
  );
}
