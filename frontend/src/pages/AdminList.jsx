import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { toast } from '../utils/toast.js';
import { mmss, stamp } from '../utils/format.js';
import Stars from '../components/Stars.jsx';
import { SkeletonRows, LoadingNote } from '../components/Skeleton.jsx';
import { BoardLoader } from '../components/Loader.jsx';
import { IconAlert } from '../components/icons.jsx';

const FILTERS = ['all', 'scored', 'processing', 'failed', 'voided'];

// The departure board. Ruled rows, mono columns, status treatment. No cards,
// no zebra striping, no shadows — the hairlines do the separating.
export default function AdminList() {
  const [rows, setRows] = useState(null);
  // Separate from `rows === null`: that is only ever true on the FIRST load, so
  // without this a filter change left the stale table on screen, unchanged, for
  // the whole round trip — no signal that anything was happening.
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [types, setTypes] = useState([]);
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [stars, setStars] = useState('all');
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  // Filtering happens server-side: with a growing table the client cannot hold
  // every row, and 'processing' has to include 'queued', which a naive client
  // filter gets wrong.
  useEffect(() => {
    setLoading(true);   // synchronous, so the press registers before the debounce
    const t = setTimeout(() => {
      const p = new URLSearchParams({ limit: '200' });
      if (status !== 'all') p.set('status', status);
      if (type !== 'all') p.set('assessment_type', type);
      if (stars !== 'all') p.set('stars', stars);
      if (q) p.set('q', q);
      api.get(`/api/submissions?${p}`)
        .then((r) => { setRows(r.items); setTotal(r.total); setTypes(r.assessments || []); })
        .catch((e) => { setRows([]); toast(e.message || 'Could not load submissions.', 'error'); })
        .finally(() => setLoading(false));
    }, 250);   // debounced so typing does not fire a request per keystroke
    return () => clearTimeout(t);
  }, [status, type, stars, q]);

  const shown = rows || [];

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
        <p className="mono muted" style={{ marginTop: 'var(--space-2xs)' }}>
          {total} {total === 1 ? 'submission' : 'submissions'}
        </p>
      </div>

      <div className="filters">
        <input
          className="field"
          type="search"
          placeholder="Search name or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search submissions by candidate name or email"
        />

        <div className="seg" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button key={f} type="button" aria-pressed={status === f} onClick={() => setStatus(f)}>
              {f}
            </button>
          ))}
        </div>

        {/* Only worth showing once a second assessment exists. */}
        {types.length > 1 && (
          <div className="seg" role="group" aria-label="Filter by assessment">
            <button type="button" aria-pressed={type === 'all'} onClick={() => setType('all')}>
              all
            </button>
            {types.map((a) => (
              <button key={a.key} type="button" aria-pressed={type === a.key}
                      onClick={() => setType(a.key)}>
                {a.name}
              </button>
            ))}
          </div>
        )}

        <div className="seg" role="group" aria-label="Filter by overall score">
          <button type="button" aria-pressed={stars === 'all'} onClick={() => setStars('all')}>
            any
          </button>
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-pressed={String(stars) === String(n)}
                    onClick={() => setStars(String(n))}>
              {n}
            </button>
          ))}
        </div>
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
            {rows === null && <SkeletonRows rows={5} cols={5} stacked={[0]}
              widths={['60%', '80%', '40%', '55%', '30%']} />}
            {rows !== null && loading && <BoardLoader cols={5} label="Loading submissions" />}
            {!loading && shown.map((r) => (
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
                <td><Stars stars={r.overall} size="sm" showBand={false} glyphs /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows === null && <LoadingNote>Loading submissions</LoadingNote>}
      {rows !== null && !loading && shown.length === 0 && (
        <div className="empty">
          {status === 'all' && stars === 'all' && !q
            ? 'No submissions yet.'
            : 'No submission matches those filters.'}
        </div>
      )}
    </>
  );
}
