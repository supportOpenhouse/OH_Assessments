import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useSlideNavigate, BACK } from '../utils/pageTransition.js';
import { toast } from '../utils/toast.js';
import { mmss, phone, stamp } from '../utils/format.js';
import Stars from '../components/Stars.jsx';
import { Skeleton, SkeletonLines, LoadingNote } from '../components/Skeleton.jsx';
import { IconBack, IconAlert, IconRescore } from '../components/icons.jsx';

// The labels for backend/app/resume.py FACTS, in reading order.
const FACTS = [
  ['total_experience', 'Experience'],
  ['current_role', 'Current role'],
  ['sales_experience', 'Sales'],
  ['real_estate_experience', 'Real estate'],
  ['education', 'Education'],
  ['location', 'Location'],
];

// One applicant: who they are, every attempt, what Claude read off their
// resume, and the resume itself.
export default function AdminCandidate() {
  const { cid } = useParams();
  const [c, setC] = useState(null);
  const [busy, setBusy] = useState(false);
  const slide = useSlideNavigate();

  const load = useCallback(() => {
    api.get(`/api/candidates/${cid}`)
      // Every response carries a freshly signed URL. Swapping it into the
      // iframe would reload the PDF on every poll, so keep the one already
      // loaded unless the resume itself has changed.
      .then((next) => setC((prev) => (
        prev && prev.resume_uploaded_at === next.resume_uploaded_at
          ? { ...next, resume_url: prev.resume_url }
          : next
      )))
      .catch((e) => toast(e.message || 'Could not load that candidate.', 'error'));
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  // A read runs in the background; without a poll the page would say
  // "reading" until someone refreshed it.
  const reading = c?.resume_status === 'processing';
  useEffect(() => {
    if (!reading) return undefined;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [reading, load]);

  async function reevaluate() {
    setBusy(true);
    try {
      await api.post(`/api/candidates/${cid}/resume/reevaluate`);
      load();
    } catch (e) {
      toast(e.message || 'Could not start the resume read.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const back = (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={() => slide('/admin/candidates', BACK)}
      style={{ marginBottom: 'var(--space-lg)' }}
    >
      <IconBack /> All candidates
    </button>
  );

  if (!c) {
    return (
      <>
        {back}
        <LoadingNote>Loading candidate</LoadingNote>
        <div className="page-head">
          <Skeleton w="10ch" h={12} />
          <div style={{ marginTop: 'var(--space-sm)' }}><Skeleton w="30%" h={34} /></div>
          <div style={{ marginTop: 'var(--space-sm)' }}><Skeleton w="45%" h={12} /></div>
        </div>
        <SkeletonLines n={3} widths={['90%', '75%', '60%']} />
      </>
    );
  }

  const ins = c.resume_insights;

  return (
    <>
      {back}

      <div className="page-head">
        <span className="eyebrow">Candidate</span>
        <h2>{c.name || c.email}</h2>
        <p className="mono muted" style={{ marginTop: 'var(--space-2xs)' }}>
          {c.email} · {phone(c.phone)} · first seen {stamp(c.first_seen_at)}
        </p>
      </div>

      <section className="record-section">
        <h3 className="axis-label">Submissions</h3>
        {c.submissions.length === 0 ? (
          <div className="empty">No submissions yet.</div>
        ) : (
          <div className="board-wrap">
            <table className="board">
              <thead>
                <tr>
                  <th>Submitted</th>
                  <th>Assessment</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th>Overall</th>
                </tr>
              </thead>
              <tbody>
                {c.submissions.map((s) => (
                  <tr
                    key={s.id}
                    tabIndex={0}
                    onClick={() => slide(`/admin/${s.id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter') slide(`/admin/${s.id}`); }}
                  >
                    <td className="num">{stamp(s.created_at)}</td>
                    <td>{s.assessment_name}</td>
                    <td className="num">{mmss(s.duration_s)}</td>
                    <td><span className={`status status-${s.status}`}>{s.status}</span></td>
                    <td><Stars stars={s.overall} size="sm" showBand={false} glyphs /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="record-section">
        <h3 className="axis-label">Resume insights</h3>

        {!c.resume_url && <div className="empty">No resume uploaded yet.</div>}

        {reading && (
          <div className="callout" role="status">
            <IconRescore />
            <span>Reading the resume. This takes a minute or so.</span>
          </div>
        )}

        {/* The candidate replaced their resume after it was read. The insights
            below are still the OLD one's until staff ask for a new read. */}
        {!reading && c.resume_changed && (
          <div className="callout callout-warn">
            <IconAlert />
            <span className="callout-body">
              Candidate has changed their resume, re-evaluate resume?
              <button type="button" className="btn btn-ghost btn-sm" onClick={reevaluate} disabled={busy}>
                Re-evaluate
              </button>
            </span>
          </div>
        )}

        {!reading && c.resume_status === 'failed' && (
          <div className="callout callout-stop">
            <IconAlert />
            <span className="callout-body">
              <span><strong>Reading the resume failed.</strong> {c.resume_error}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={reevaluate} disabled={busy}>
                Try again
              </button>
            </span>
          </div>
        )}

        {ins && (
          <>
            <p className="verdict">{ins.summary}</p>
            <div className="kw-rows">
              <span className="kw-head">Strengths</span>
              <span className="kw-list">
                {ins.strengths.map((k) => <span className="kw kw-good" key={k}>{k}</span>)}
              </span>
              <span className="kw-head">Gaps</span>
              <span className="kw-list">
                {ins.gaps.map((k) => <span className="kw kw-bad" key={k}>{k}</span>)}
              </span>
            </div>
            <dl className="facts">
              {FACTS.map(([k, label]) => (
                <div className="fact" key={k}>
                  <dt className="fact-k">{label}</dt>
                  <dd className="fact-v">{ins[k]}</dd>
                </div>
              ))}
              <div className="fact">
                <dt className="fact-k">Languages</dt>
                <dd className="fact-v">{ins.languages.join(', ') || 'Not stated'}</dd>
              </div>
            </dl>
            <div className="record-foot">
              <span>{c.resume_model}</span>
              <span>read {stamp(c.resume_extracted_at)}</span>
            </div>
          </>
        )}
      </section>

      {c.resume_url && (
        <section className="record-section">
          <h3 className="axis-label">Resume</h3>
          <p className="picked-meta" style={{ marginBottom: 'var(--space-sm)' }}>
            Uploaded {stamp(c.resume_uploaded_at)} ·{' '}
            {/* Phones render an embedded PDF poorly; a tab gets the full viewer. */}
            <a className="ext-link" href={c.resume_url} target="_blank" rel="noopener noreferrer">
              Open in a new tab
            </a>
          </p>
          <iframe className="pdf-frame" src={c.resume_url} title={`Resume of ${c.name || c.email}`} />
        </section>
      )}
    </>
  );
}
