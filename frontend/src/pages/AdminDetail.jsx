import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { toast } from '../utils/toast.js';
import { kb, stamp } from '../utils/format.js';
import Stars from '../components/Stars.jsx';
import AxisBlock from '../components/AxisBlock.jsx';
import MetricsStrip from '../components/MetricsStrip.jsx';
import Dialog from '../components/Dialog.jsx';
import { IconBack, IconAlert } from '../components/icons.jsx';

const AXES = [
  ['pitch', 'Pitch'],
  ['tone', 'Tone'],
  ['company', 'Company representation'],
  ['sales', 'Sales skills'],
];

export default function AdminDetail() {
  const { id } = useParams();
  const [row, setRow] = useState(null);
  const [voiding, setVoiding] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(() => {
    api.get(`/api/submissions/${id}`)
      .then(setRow)
      .catch((e) => toast(e.message || 'Could not load that submission.', 'error'));
  }, [id]);

  useEffect(load, [load]);

  async function voidIt() {
    setBusy(true);
    try {
      await api.post(`/api/submissions/${id}/void`);
      setVoiding(false);
      load();
    } catch (e) {
      toast(e.message || 'Could not void that submission.', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!row) return <p className="muted">Loading…</p>;

  const s = row.scores;
  const failed = row.status === 'failed';

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => navigate('/admin')}
        style={{ marginBottom: 'var(--space-lg)' }}
      >
        <IconBack /> All submissions
      </button>

      <div className="page-head">
        <span className="eyebrow mono">{row.id}</span>
        <h2>{row.name || row.email}</h2>
        <p className="mono muted" style={{ marginTop: 'var(--space-2xs)' }}>
          {row.email} · {stamp(row.created_at)} · {kb(row.audio_bytes)} ·{' '}
          <span className={`status status-${row.status}`}>{row.status}</span>
        </p>
      </div>

      {failed && (
        <div className="callout callout-stop">
          <IconAlert />
          <span>
            <strong>Scoring failed.</strong> {row.error}
            <br />
            Void this submission to let the candidate upload again.
          </span>
        </div>
      )}

      {s && (
        <div style={{ marginBottom: 'var(--space-xl)' }}>
          <Stars stars={s.overall.stars} size="lg" />
          <p className="verdict" style={{ marginTop: 'var(--space-md)' }}>{s.summary}</p>
        </div>
      )}

      {row.audio_url && <audio controls src={row.audio_url} preload="none" />}

      <MetricsStrip metrics={row.metrics} />

      {s && (
        <>
          {AXES.map(([k, label], i) => (
            <AxisBlock
              key={k}
              n={i + 1}
              label={label}
              stars={s[k].stars}
              reasoning={s[k].reasoning}
            />
          ))}
          <AxisBlock
            n={5}
            label="Overall"
            stars={s.overall.stars}
            reasoning={s.overall.reasoning}
            overall
          />
        </>
      )}

      {row.transcript && (
        <section style={{ marginTop: 'var(--space-xl)' }}>
          <h3 className="axis-label">Transcript</h3>
          <div className="transcript">{row.transcript}</div>
        </section>
      )}

      <div className="record-foot">
        <span>rubric {row.rubric_version || '—'}</span>
        <span>{row.model || '—'}</span>
        <span>{row.stt_model || '—'}</span>
        <span>scored {stamp(row.scored_at)}</span>
      </div>

      {row.status !== 'voided' && (
        <div style={{ marginTop: 'var(--space-xl)' }}>
          <button type="button" className="btn btn-danger" onClick={() => setVoiding(true)}>
            Void submission
          </button>
        </div>
      )}

      {voiding && (
        <Dialog
          title="Void this submission?"
          confirmLabel="Void"
          confirmClass="btn-danger"
          busy={busy}
          onCancel={() => setVoiding(false)}
          onConfirm={voidIt}
        >
          The candidate will be able to upload again. This record is kept —
          audio, transcript and scores all stay visible to admins.
        </Dialog>
      )}
    </>
  );
}
