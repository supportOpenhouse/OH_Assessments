import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { stamp } from '../utils/format.js';
import ScoringProgress from '../components/ScoringProgress.jsx';

// Two states, one route. While scoring runs: the polling progress. Once it is
// finished — whether it scored or failed — the stamp.
//
// This component contains no reference to scores, stars, or any numeric result.
// The API sends none, and the tree has no path to render one.
export default function Dashboard() {
  const { user } = useAuth();
  const [done, setDone] = useState(false);
  const [checking, setChecking] = useState(true);

  const id = user?.submission_id;

  // One check on mount decides which state to show, so a returning candidate
  // does not see a progress bar for something that finished days ago.
  useEffect(() => {
    if (!id) { setDone(true); setChecking(false); return; }
    let alive = true;
    api.get(`/api/submissions/${id}/status`)
      .then((r) => { if (alive) setDone(r.status !== 'queued' && r.status !== 'processing'); })
      .catch(() => { if (alive) setDone(true); })
      .finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, [id]);

  const onDone = useCallback(() => setDone(true), []);

  if (checking) {
    return <p className="muted">Checking your submission…</p>;
  }

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Your submission</span>
        <h2>{done ? 'Recording received' : 'Assessing your recording'}</h2>
      </div>

      {done ? (
        <>
          <div className="stamp">Received</div>
          <p className="mono muted" style={{ marginTop: 'var(--space-md)' }}>
            {stamp(user?.submitted_at)}
          </p>
          <p className="measure" style={{ marginTop: 'var(--space-lg)' }}>
            Thanks — your pitch is in. The hiring team reviews every submission
            personally and will be in touch about next steps.
          </p>
          <p className="measure muted">
            Results are not shown here.
          </p>
        </>
      ) : (
        <ScoringProgress id={id} onDone={onDone} />
      )}
    </>
  );
}
