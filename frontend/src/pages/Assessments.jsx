import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { toast } from '../utils/toast.js';
import { stamp } from '../utils/format.js';
import { IconArrow } from '../components/icons.jsx';
import { Skeleton, SkeletonLines, LoadingNote } from '../components/Skeleton.jsx';

// Ruled rows, not a card grid — one assessment today, and a three-column grid of
// icon tiles is exactly the shape this design exists to avoid.
const STATE_COPY = {
  available: 'Not started',
  assessing: 'Being assessed',
  submitted: 'Submitted',
};

export default function Assessments() {
  const [items, setItems] = useState(null);

  useEffect(() => {
    api.get('/api/assessments')
      .then((r) => setItems(r.items))
      .catch((e) => { setItems([]); toast(e.message || 'Could not load assessments.', 'error'); });
  }, []);

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Assessments</span>
        <h2>Choose an assessment</h2>
      </div>

      {items === null && (
        <>
          <LoadingNote>Loading assessments</LoadingNote>
          <div className="steps">
            {[0, 1].map((i) => (
              <div className="step" key={i}>
                <span className="step-n"><Skeleton w={20} /></span>
                <div className="step-body">
                  <Skeleton w="42%" h={20} />
                  <SkeletonLines n={2} widths={['90%', '55%']} />
                </div>
                <div className="step-end"><Skeleton w={90} /></div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="steps">
        {(items || []).map((a, i) => {
          const open = a.state === 'available';
          const Row = (
            <>
              <span className="step-n">{String(i + 1).padStart(2, '0')}</span>
              <div className="step-body">
                <h3>{a.name}</h3>
                <p className="muted">{a.blurb}</p>
                <p className="picked-meta">
                  {a.format} · {a.target_length} · {a.attempts === 1 ? 'one attempt' : `${a.attempts} attempts`}
                </p>
              </div>
              <div className="step-end">
                <span className={`status status-${open ? 'available' : a.state}`}>
                  {STATE_COPY[a.state]}
                </span>
                {a.submitted_at && (
                  <span className="picked-meta">{stamp(a.submitted_at)}</span>
                )}
                {open && <IconArrow />}
              </div>
            </>
          );

          return open ? (
            <Link key={a.key} className="step step-link" to={`/assessments/${a.slug}`}>
              {Row}
            </Link>
          ) : (
            <div key={a.key} className="step">{Row}</div>
          );
        })}
      </div>

      {items !== null && items.length === 0 && (
        <div className="empty">No assessments are open to you right now.</div>
      )}
    </>
  );
}
