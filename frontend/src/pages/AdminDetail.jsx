import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useSlideNavigate, BACK } from '../utils/pageTransition.js';
import { toast } from '../utils/toast.js';
import { kb, stamp } from '../utils/format.js';
import Stars from '../components/Stars.jsx';
import AxisBlock from '../components/AxisBlock.jsx';
import MetricsStrip from '../components/MetricsStrip.jsx';
import Dialog from '../components/Dialog.jsx';
import AudioPlayer from '../components/AudioPlayer.jsx';
import { Skeleton, SkeletonLines, LoadingNote } from '../components/Skeleton.jsx';
import { IconBack, IconAlert, IconClose, IconRescore } from '../components/icons.jsx';

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
  const [rescoring, setRescoring] = useState(false);
  const [busy, setBusy] = useState(false);
  const slide = useSlideNavigate();

  const load = useCallback(() => {
    api.get(`/api/submissions/${id}`)
      .then(setRow)
      .catch((e) => toast(e.message || 'Could not load that submission.', 'error'));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // A re-score runs in the background, so the row lands here as 'processing'
  // and would sit stale until a manual refresh. Same 2s cadence the candidate
  // dashboard uses. Also covers landing on a submission that is mid-run.
  const inFlight = row?.status === 'queued' || row?.status === 'processing';
  useEffect(() => {
    if (!inFlight) return undefined;
    const t = setInterval(() => {
      api.get(`/api/submissions/${id}/status`)
        .then((st) => { if (st.status !== 'queued' && st.status !== 'processing') load(); })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(t);
  }, [inFlight, id, load]);

  async function rescoreIt() {
    setBusy(true);
    try {
      await api.post(`/api/submissions/${id}/rescore`);
      setRescoring(false);
      toast('Re-scoring started. This takes a minute or two.');
      load();
    } catch (e) {
      toast(e.message || 'Could not start a re-score.', 'error');
    } finally {
      setBusy(false);
    }
  }

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

  // The record has a lot of shape — verdict, metrics strip, five axes. A spinner
  // here means the whole page arrives at once and shoves the layout; the
  // skeleton reserves it.
  if (!row) {
    return (
      <>
        <LoadingNote>Loading submission</LoadingNote>
        <div className="page-head">
          <Skeleton w="22ch" h={12} />
          <div style={{ marginTop: 'var(--space-sm)' }}><Skeleton w="30%" h={34} /></div>
          <div style={{ marginTop: 'var(--space-sm)' }}><Skeleton w="45%" h={12} /></div>
        </div>
        <div style={{ marginBottom: 'var(--space-xl)' }}>
          <Skeleton w="18%" h={44} />
          <div style={{ marginTop: 'var(--space-md)' }}>
            <SkeletonLines n={2} widths={['70%', '48%']} />
          </div>
        </div>
        <Skeleton w="100%" h={58} r={12} />
        <div className="metrics">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div className="metric" key={i}>
              <Skeleton w="60%" h={22} />
              <div style={{ marginTop: 'var(--space-2xs)' }}><Skeleton w="80%" h={10} /></div>
            </div>
          ))}
        </div>
        {[1, 2, 3].map((n) => (
          <section className="axis" data-tone="mid" key={n}>
            <span className="axis-n"><Skeleton w={20} /></span>
            <div className="axis-body">
              <Skeleton w="30%" h={20} />
              <div style={{ margin: 'var(--space-sm) 0 var(--space-md)' }}>
                <Skeleton w="22%" h={26} />
              </div>
              <SkeletonLines n={2} widths={['94%', '66%']} />
            </div>
          </section>
        ))}
      </>
    );
  }

  const s = row.scores;
  const failed = row.status === 'failed';

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => slide('/admin', BACK)}
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
          <Stars stars={s.overall.stars} size="lg" glyphs />
          <p className="verdict" style={{ marginTop: 'var(--space-md)' }}>{s.summary}</p>
        </div>
      )}

      {row.audio_url && (
        <div className="record-audio">
          <AudioPlayer src={row.audio_url} preload="none" label="submission" />
          <div className="record-audio-acts">
            <button
              type="button"
              className="icon-btn icon-btn-danger"
              onClick={() => setVoiding(true)}
              disabled={row.status === 'voided'}
              title="Void submission"
              aria-label="Void submission"
            >
              <IconClose size={18} />
            </button>
            <button
              type="button"
              className="icon-btn icon-btn-danger"
              onClick={() => setRescoring(true)}
              disabled={row.status === 'voided' || inFlight}
              title="Re-score: transcribe and judge this audio again"
              aria-label="Re-score this submission"
            >
              <IconRescore size={18} />
            </button>
          </div>
        </div>
      )}

      <MetricsStrip metrics={row.metrics} />

      {s && (
        <>
          {/* Two people are on the call and only one is being assessed. Which
              one the model judged is the first thing an admin has to be able to
              check — a score against the customer would otherwise read as a
              perfectly ordinary bad score. */}
          {s.salesperson && (
            <p className="muted" style={{ marginTop: 'var(--space-lg)' }}>
              Scored <strong>{s.salesperson.speaker}</strong> as the salesperson
              — {s.salesperson.reasoning}
            </p>
          )}

          {/* Axes are filtered on presence: rows scored before an axis existed
              have no key for it, and reading .stars off undefined blanks the
              whole page. */}
          {AXES.filter(([k]) => s[k]).map(([k, label], i) => (
            <AxisBlock
              key={k}
              n={i + 1}
              label={label}
              stars={s[k].stars}
              reasoning={s[k].reasoning}
            />
          ))}
          <AxisBlock
            n={AXES.filter(([k]) => s[k]).length + 1}
            label="Overall"
            stars={s.overall.stars}
            reasoning={s.overall.reasoning}
            overall
          />
        </>
      )}

      {/* The candidate's own account of the call — who they rang, the asking
          price, what they took away. Above the transcript because it is the
          context you want before reading what was actually said. It is NOT part
          of scoring: the rubric judges the call, not the write-up. */}
      {row.notes && (
        <section style={{ marginTop: 'var(--space-xl)' }}>
          <h3 className="axis-label">Candidate's notes</h3>
          <div className="transcript">{row.notes}</div>
        </section>
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

      {rescoring && (
        <Dialog
          title="Re-score this submission?"
          confirmLabel="Re-score"
          confirmClass="btn-danger"
          busy={busy}
          onCancel={() => setRescoring(false)}
          onConfirm={rescoreIt}
        >
          The audio is transcribed and judged again from scratch. The existing
          score, reasoning and transcript are overwritten in place — only the
          activity log will show that an earlier result existed.
        </Dialog>
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
