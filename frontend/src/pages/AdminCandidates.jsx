import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { toast } from '../utils/toast.js';
import { SkeletonRows, LoadingNote } from '../components/Skeleton.jsx';
import { BoardLoader } from '../components/Loader.jsx';

// Everyone who has ever signed in. Attempts and which assessments come from one
// grouped query, not a round trip per row.
export default function AdminCandidates() {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');

  const load = useCallback((term) => {
    const p = new URLSearchParams({ limit: '200' });
    if (term) p.set('q', term);
    api.get(`/api/candidates?${p}`)
      .then((r) => { setRows(r.items); setTotal(r.total); })
      .catch((e) => { setRows([]); toast(e.message || 'Could not load candidates.', 'error'); })
      .finally(() => setLoading(false));
  }, []);

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    // Before the debounce, not inside it: otherwise the first 250ms of typing
    // shows the previous results with no indication they are already stale.
    setLoading(true);
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Admin</span>
        <h2>Candidates</h2>
        <p className="mono muted" style={{ marginTop: 'var(--space-2xs)' }}>
          {total} {total === 1 ? 'applicant' : 'applicants'}
        </p>
      </div>

      <input
        className="field"
        type="search"
        placeholder="Search name or email"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search candidates by name or email"
      />

      <div className="board-wrap" style={{ marginTop: 'var(--space-lg)' }}>
        <table className="board board-narrow">
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Attempts</th>
              <th>Assessments</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && <SkeletonRows rows={5} cols={3} stacked={[0]}
              widths={['65%', '25%', '70%']} />}
            {rows !== null && loading && <BoardLoader cols={3} label="Loading candidates" />}
            {!loading && (rows || []).map((c) => (
              <tr key={c.id} style={{ cursor: 'default' }}>
                <td className="cand">
                  {c.name || '—'}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows === null && <LoadingNote>Loading candidates</LoadingNote>}
      {rows !== null && !loading && rows.length === 0 && (
        <div className="empty">
          {q ? `No applicant matches “${q}”.` : 'No applicants yet.'}
        </div>
      )}
    </>
  );
}
