import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { toast } from '../utils/toast.js';
import { SkeletonRows, LoadingNote } from '../components/Skeleton.jsx';
import { BoardLoader } from '../components/Loader.jsx';
import Stars from '../components/Stars.jsx';

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
        <table className="board">
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Attempts</th>
              {/* Both span EVERY attempt, voided ones included — a reset frees
                  the slot, it does not un-happen the call. Said in the header
                  because it is the one thing here an admin would not assume.
                  Ahead of Assessments so a phone's first screen shows them —
                  while there is one assessment type that column says the same
                  thing on every row. */}
              <th title="Best overall score across every attempt, voided included">Highest rating</th>
              <th title="Mean overall score across every attempt, voided included">Avg rating</th>
              <th>Assessments</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && <SkeletonRows rows={5} cols={5} stacked={[0]}
              widths={['65%', '25%', '45%', '45%', '70%']} />}
            {rows !== null && loading && <BoardLoader cols={5} label="Loading candidates" />}
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
                {/* null until something has been scored — Stars renders a dash */}
                <td><Stars stars={c.highest_rating} size="sm" showBand={false} /></td>
                <td><Stars stars={c.avg_rating} size="sm" showBand={false} /></td>
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
