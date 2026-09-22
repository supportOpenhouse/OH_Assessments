import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { toast } from '../utils/toast.js';
import { stamp } from '../utils/format.js';
import Dialog from '../components/Dialog.jsx';
import { SkeletonRows, LoadingNote } from '../components/Skeleton.jsx';

const DOMAIN = '@openhouse.in';   // mirrors backend auth.STAFF_DOMAIN
const EMPTY = { email: '', name: '', role: 'internal' };

// What each role can do, said where the role is picked.
const ROLE_LABEL = {
  admin: 'Admin — everything, including Activity and Users',
  internal: 'Internal — Submissions and Candidates only',
};

// Who on staff can sign in, and as what. Admin only. Every rule that matters
// (domain, last admin, your own row) is enforced by the server; the disabled
// controls here only avoid offering what would be refused.
export default function AdminUsers() {
  const { user } = useAuth();
  const [rows, setRows] = useState(null);
  const [roles, setRoles] = useState(['admin', 'internal']);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);   // the row being (de)activated

  const load = useCallback(() => {
    api.get('/api/users')
      .then((r) => { setRows(r.items); setRoles(r.roles); })
      .catch((e) => { setRows([]); toast(e.message || 'Could not load users.', 'error'); });
  }, []);

  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const row = await api.post('/api/users', draft);
      toast(`${row.email} can now sign in as ${row.role}.`);
      setDraft(EMPTY);
      setAdding(false);
      load();
    } catch (err) {
      toast(err.message || 'Could not add that user.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function edit(row, change) {
    setBusy(true);
    try {
      await api.patch(`/api/users/${row.id}`, change);
      setConfirm(null);
      load();
    } catch (err) {
      toast(err.message || 'Could not update that user.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const activeAdmins = (rows || []).filter((r) => r.role === 'admin' && r.is_active).length;
  const draftOk = draft.email.trim().toLowerCase().endsWith(DOMAIN)
    && draft.email.trim().length > DOMAIN.length && draft.name.trim();

  return (
    <>
      <div className="page-head page-head-row">
        <div>
          <span className="eyebrow">Admin</span>
          <h2>Users</h2>
          <p className="mono muted" style={{ marginTop: 'var(--space-2xs)' }}>
            {rows ? `${rows.filter((r) => r.is_active).length} active` : ' '}
          </p>
        </div>
        {!adding && (
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            Add user
          </button>
        )}
      </div>

      {adding && (
        <form className="user-add" onSubmit={add}>
          <label className="form-field">
            <span className="form-label">Email</span>
            <input className="field" type="email" value={draft.email} autoFocus
                   placeholder={`name${DOMAIN}`}
                   onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          </label>
          <label className="form-field">
            <span className="form-label">Name</span>
            <input className="field" type="text" value={draft.name} maxLength={80}
                   onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="form-field">
            <span className="form-label">Role</span>
            <select className="field" value={draft.role}
                    onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
              {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
            </select>
          </label>
          <p className="picked-meta">
            Only {DOMAIN} addresses. They can sign in with Google straight away.
          </p>
          <div className="picked-actions">
            <button type="submit" className="btn btn-primary" disabled={!draftOk || busy}>
              {busy ? 'Adding…' : 'Add user'}
            </button>
            <button type="button" className="btn btn-ghost"
                    onClick={() => { setAdding(false); setDraft(EMPTY); }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="board-wrap" style={{ marginTop: 'var(--space-lg)' }}>
        <table className="board board-static">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Added</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows === null && <SkeletonRows rows={3} cols={5} stacked={[0]}
              widths={['60%', '50%', '40%', '70%', '50%']} />}
            {(rows || []).map((r) => {
              const self = r.email === user?.email;
              // The server refuses both; the UI simply does not offer them.
              const lastAdmin = r.role === 'admin' && r.is_active && activeAdmins <= 1;
              return (
                <tr key={r.id} className={r.is_active ? undefined : 'row-inactive'}>
                  <td className="cand">
                    {r.name || '—'} {self && <span className="chip">you</span>}
                    <small>{r.email}</small>
                  </td>
                  <td>
                    <select
                      className="field field-role"
                      value={r.role}
                      disabled={self || lastAdmin || busy}
                      title={self ? 'You cannot change your own role'
                        : lastAdmin ? 'The last active admin cannot be demoted' : undefined}
                      aria-label={`Role for ${r.email}`}
                      onChange={(e) => edit(r, { role: e.target.value })}
                    >
                      {/* A legacy role still shows as itself rather than
                          silently displaying as the first option. */}
                      {!roles.includes(r.role) && <option value={r.role}>{r.role}</option>}
                      {roles.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </td>
                  <td>
                    <span className={`status status-${r.is_active ? 'scored' : 'voided'}`}>
                      {r.is_active ? 'active' : 'deactivated'}
                    </span>
                  </td>
                  <td className="num">{stamp(r.created_at)}</td>
                  <td className="row-acts">
                    {!self && (r.is_active ? (
                      <button type="button" className="btn btn-ghost btn-sm"
                              disabled={lastAdmin || busy} onClick={() => setConfirm(r)}>
                        Deactivate
                      </button>
                    ) : (
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
                              onClick={() => edit(r, { is_active: true })}>
                        Reactivate
                      </button>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows === null && <LoadingNote>Loading users</LoadingNote>}

      {confirm && (
        <Dialog
          title={`Deactivate ${confirm.name || confirm.email}?`}
          confirmLabel="Deactivate"
          confirmClass="btn-danger"
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => edit(confirm, { is_active: false })}
        >
          They are signed out on their next request and cannot sign in again.
          Nothing they did is removed, and you can reactivate them later.
        </Dialog>
      )}
    </>
  );
}
