import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';

// The API reports one state ('processing') for three distinct stages, so the
// copy advances on a local timer within that state. No percentage: neither
// Scribe nor Claude reports progress, and a bar stalled at 80% is worse than an
// honest one that stops.
const STAGES = [
  [0, 'Transcribing'],
  [15000, 'Measuring delivery'],
  [28000, 'Scoring'],
];

export default function ScoringProgress({ id, onDone }) {
  const [status, setStatus] = useState('queued');
  const [stage, setStage] = useState('Queued');
  const startedAt = useRef(Date.now());

  // Poll the real status endpoint.
  useEffect(() => {
    let alive = true;
    let timer = null;

    async function tick() {
      try {
        const r = await api.get(`/api/submissions/${id}/status`);
        if (!alive) return;
        setStatus(r.status);
        // 'failed' is deliberately treated as done. The candidate never learns
        // a run errored — that is an operations problem, not theirs.
        if (r.status === 'scored' || r.status === 'failed' || r.status === 'voided') {
          onDone();
          return;
        }
      } catch {
        /* transient — the next tick retries */
      }
      if (alive) timer = setTimeout(tick, 2000);
    }

    tick();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [id, onDone]);

  // Advance the copy while we sit in 'processing'.
  useEffect(() => {
    if (status !== 'processing') return undefined;
    const id2 = setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      const found = [...STAGES].reverse().find(([at]) => elapsed >= at);
      setStage(found ? found[1] : 'Transcribing');
    }, 1000);
    return () => clearInterval(id2);
  }, [status]);

  return (
    <div>
      <p className="progress-copy">{status === 'queued' ? 'Queued' : stage}…</p>
      <div className="progress" role="progressbar" aria-label="Assessing your recording">
        <div className="progress-fill" />
      </div>
      <p className="muted">
        This usually takes under a minute. You can leave this page — your
        recording has been received either way.
      </p>
    </div>
  );
}
