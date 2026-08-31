import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { toast } from '../utils/toast.js';
import { stamp } from '../utils/format.js';

// The audit trail. Every mutation, newest first.
//
// Actions are read from the server rather than hard-coded, so the filter row can
// never drift from the verbs actually in use.

function detail(data) {
  if (!data || Object.keys(data).length === 0) return '—';
  return Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join('  ');
}

// Colour by what the action DID, not by which entity it touched: a reject and a
// failure read the same way to someone scanning the column.
function toneOf(action) {
  if (action.endsWith('.failed') || action.endsWith('.rejected')) return 'stop';
  if (action.endsWith('.voided') || action.endsWith('.swept')) return 'hold';
  if (action.endsWith('.scored') || action.endsWith('.created')) return 'go';
  return 'mid';
}

export default function AdminLogs() {
  const [rows, setRows] = useState(null);
  const [actions, setActions] = useState([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  const load = useCallback((action) => {
    const q = action && action !== 'all' ? `&action=${encodeURIComponent(action)}` : '';
    api.get(`/api/logs?limit=200${q}`)
      .then((r) => { setRows(r.items); setActions(r.actions || []); setTotal(r.total); })
      .catch((e) => { setRows([]); toast(e.message || 'Could not load the activity log.', 'error'); });
  }, []);

  useEffect(() => { load(filter); }, [load, filter]);

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Admin</span>
        <h2>Activity</h2>
        <p className="mono muted" style={{ marginTop: 'var(--space-2xs)' }}>
          {total} recorded {total === 1 ? 'event' : 'events'} · append-only
        </p>
      </div>

      <div className="seg seg-chips" role="group" aria-label="Filter by action">
        <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          all
        </button>
        {actions.map((a) => (
          <button key={a} type="button" aria-pressed={filter === a} onClick={() => setFilter(a)}>
            {a}
          </button>
        ))}
      </div>

      <div className="board-wrap" style={{ marginTop: 'var(--space-lg)' }}>
        <table className="board board-logs">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((r) => (
              <tr
                key={r.id}
                tabIndex={r.entity === 'submission' ? 0 : -1}
                onClick={() => r.entity === 'submission' && navigate(`/admin/${r.entity_id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && r.entity === 'submission') {
                    navigate(`/admin/${r.entity_id}`);
                  }
                }}
                style={r.entity === 'submission' ? undefined : { cursor: 'default' }}
              >
                <td className="num">{stamp(r.at)}</td>
                <td className="log-actor">
                  {r.actor_email || <span className="mono muted">system</span>}
                  {r.actor_role && <small>{r.actor_role}</small>}
                </td>
                <td>
                  <span className="status" data-tone={toneOf(r.action)}>{r.action}</span>
                </td>
                <td className="log-data">{detail(r.data)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows === null && <div className="empty">Loading…</div>}
      {rows !== null && rows.length === 0 && (
        <div className="empty">No activity{filter === 'all' ? ' yet' : ` for “${filter}”`}.</div>
      )}
    </>
  );
}
