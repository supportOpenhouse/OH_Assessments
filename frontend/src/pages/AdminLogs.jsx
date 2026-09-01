import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { toast } from '../utils/toast.js';
import { stamp } from '../utils/format.js';
import { SkeletonRows, LoadingNote } from '../components/Skeleton.jsx';
import { BoardLoader } from '../components/Loader.jsx';

// The audit trail. Every mutation, newest first.
//
// Filter options are read from the server, never hard-coded, so the bar cannot
// offer a verb that has never been recorded or miss one that has.

const EMPTY = { q: '', action: '', category: '', actor: '', date_from: '', date_to: '' };

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
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [opts, setOpts] = useState({ actions: [], categories: [], actors: [] });

  // `draft` is what the bar shows; `applied` is what was actually queried. They
  // are separate so editing a field does not fire a request per keystroke.
  const [draft, setDraft] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const navigate = useNavigate();

  const load = useCallback((f) => {
    setLoading(true);
    const p = new URLSearchParams({ limit: '200' });
    Object.entries(f).forEach(([k, v]) => v && p.set(k, v));
    api.get(`/api/logs?${p}`)
      .then((r) => {
        setRows(r.items);
        setTotal(r.total);
        setOpts({ actions: r.actions || [], categories: r.categories || [], actors: r.actors || [] });
      })
      .catch((e) => { setRows([]); toast(e.message || 'Could not load the activity log.', 'error'); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(applied); }, [load, applied]);

  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  function apply(e) {
    e.preventDefault();
    setApplied(draft);
  }

  const dirty = Object.values(applied).some(Boolean);

  // Picking a category narrows the action list to that category's verbs —
  // choosing "submission" should not still offer "auth.login".
  const actions = draft.category
    ? opts.actions.filter((a) => a.startsWith(`${draft.category}.`))
    : opts.actions;

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Admin</span>
        <h2>Activity</h2>
        <p className="mono muted" style={{ marginTop: 'var(--space-2xs)' }}>
          {total} recorded {total === 1 ? 'event' : 'events'} · append-only
        </p>
      </div>

      <form className="filterbar" onSubmit={apply}>
        <input
          className="field"
          type="search"
          placeholder="Search actor, action, UID, details…"
          value={draft.q}
          onChange={set('q')}
          aria-label="Search the activity log"
        />

        <span className="select">
          <select className="field" value={draft.action} onChange={set('action')} aria-label="Action">
            <option value="">Action</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </span>

        <span className="select">
          <select
            className="field"
            value={draft.category}
            /* Clear the action too: a category change can orphan it. */
            onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value, action: '' }))}
            aria-label="Category"
          >
            <option value="">Category</option>
            {opts.categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </span>

        <span className="select">
          <select className="field" value={draft.actor} onChange={set('actor')} aria-label="Actor">
            <option value="">Actor</option>
            {opts.actors.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </span>

        {/* The label, both inputs and "to" wrap as ONE unit — otherwise a
            narrow viewport strands "DATE" at the end of the row above. */}
        <div className="filterbar-dates">
          <span className="filterbar-label">Date</span>
          <input
            className="field field-date" type="date" value={draft.date_from}
            onChange={set('date_from')} max={draft.date_to || undefined}
            aria-label="From date"
          />
          <span className="filterbar-to">to</span>
          <input
            className="field field-date" type="date" value={draft.date_to}
            onChange={set('date_to')} min={draft.date_from || undefined}
            aria-label="To date"
          />
        </div>

        <div className="filterbar-end">
          {dirty && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => { setDraft(EMPTY); setApplied(EMPTY); }}
            >
              Clear
            </button>
          )}
          <button type="submit" className="btn btn-primary">Apply</button>
        </div>
      </form>

      <div className="board-wrap">
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
            {rows === null && <SkeletonRows rows={6} cols={4} stacked={[1, 3]}
              widths={['80%', '70%', '65%', '90%']} />}
            {rows !== null && loading && <BoardLoader cols={4} label="Loading activity" />}
            {!loading && (rows || []).map((r) => (
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

      {rows === null && <LoadingNote>Loading activity</LoadingNote>}
      {rows !== null && !loading && rows.length === 0 && (
        <div className="empty">{dirty ? 'No activity matches those filters.' : 'No activity yet.'}</div>
      )}
    </>
  );
}
