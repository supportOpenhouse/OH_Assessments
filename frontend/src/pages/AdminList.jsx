import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { toast } from '../utils/toast.js';
import { mmss, stamp } from '../utils/format.js';
import Stars from '../components/Stars.jsx';
import { IconAlert } from '../components/icons.jsx';

const FILTERS = ['all', 'scored', 'processing', 'failed', 'voided'];

// The departure board. Ruled rows, mono columns, status treatment. No cards,
// no zebra striping, no shadows — the hairlines do the separating.
export default function AdminList() {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/api/submissions?limit=200')
      .then((r) => setRows(r.items))
      .catch((e) => { setRows([]); toast(e.message || 'Could not load submissions.', 'error'); });
  }, []);

  const shown = useMemo(() => {
    if (!rows) return [];
    if (filter === 'all') return rows;
    if (filter === 'processing') return rows.filter((r) => r.status === 'processing' || r.status === 'queued');
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  // Scores from different rubric versions are not comparable. Say so rather
  // than letting someone rank across them silently.
  const mixedRubrics = useMemo(() => {
    const vs = new Set(shown.map((r) => r.rubric_version).filter(Boolean));
    return vs.size > 1;
  }, [shown]);

  function open(id) { navigate(`/admin/${id}`); }

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Admin</span>
        <h2>Submissions</h2>
      </div>

      <div className="seg" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {mixedRubrics && (
        <div className="callout callout-warn">
          <IconAlert />
          <span>
            These submissions were scored against different rubric versions and
            are not directly comparable.
          </span>
        </div>
      )}

      <div className="board-wrap" style={{ marginTop: 'var(--space-lg)' }}>
        <table className="board">
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Submitted</th>
              <th>Duration</th>
              <th>Status</th>
              <th>Overall</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr
                key={r.id}
                tabIndex={0}
                onClick={() => open(r.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') open(r.id); }}
              >
                <td className="cand">
                  {r.name || '—'}
                  <small>{r.email}</small>
                </td>
                <td className="num">{stamp(r.created_at)}</td>
                <td className="num">{mmss(r.duration_s)}</td>
                <td><span className={`status status-${r.status}`}>{r.status}</span></td>
                <td><Stars stars={r.overall} size="sm" showBand={false} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows === null && <div className="empty">Loading…</div>}
      {rows !== null && shown.length === 0 && (
        <div className="empty">No submissions{filter === 'all' ? ' yet' : ` with status “${filter}”`}.</div>
      )}
    </>
  );
}
