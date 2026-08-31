import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { toast } from '../utils/toast.js';
import { stamp } from '../utils/format.js';
import Loader from '../components/Loader.jsx';
import ScoringProgress from '../components/ScoringProgress.jsx';

// A candidate's own record. State only — the API sends no score, and this tree
// has no path to render one.
export default function History() {
  const [items, setItems] = useState(null);

  const load = useCallback(() => {
    api.get('/api/my/submissions')
      .then((r) => setItems(r.items))
      .catch((e) => { setItems([]); toast(e.message || 'Could not load your history.', 'error'); });
  }, []);

  // Wrapped: load() returns a Promise, and React reads an effect's
  // return value as a cleanup function.
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Your record</span>
        <h2>Previous assessments</h2>
      </div>

      {items === null && <div className="loading-block"><Loader /></div>}

      <div className="steps">
        {(items || []).map((s, i) => (
          <section className="step" key={s.id}>
            <span className="step-n">{String(i + 1).padStart(2, '0')}</span>
            <div className="step-body">
              <h3>{s.assessment_name}</h3>
              <p className="picked-meta">Submitted {stamp(s.submitted_at)}</p>

              {s.state === 'assessing' ? (
                <div style={{ marginTop: 'var(--space-md)' }}>
                  <ScoringProgress id={s.id} onDone={load} />
                </div>
              ) : s.state === 'voided' ? (
                <p className="muted" style={{ marginTop: 'var(--space-sm)' }}>
                  This attempt was reset. You can take the assessment again.
                </p>
              ) : (
                <p className="muted" style={{ marginTop: 'var(--space-sm)' }}>
                  Received. The hiring team reviews every submission and will be
                  in touch. Results are not shown here.
                </p>
              )}
            </div>
            <div className="step-end">
              {s.state === 'submitted' && <span className="stamp stamp-sm">Received</span>}
              {s.state === 'assessing' && <span className="status status-processing">assessing</span>}
              {s.state === 'voided' && <span className="status status-voided">reset</span>}
            </div>
          </section>
        ))}
      </div>

      {items !== null && items.length === 0 && (
        <div className="empty">You have not submitted anything yet.</div>
      )}
    </>
  );
}
