import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { toast } from '../utils/toast.js';
import { kb, mmss } from '../utils/format.js';
import Loader from '../components/Loader.jsx';
import Markdown, { parseSections } from '../components/Markdown.jsx';
import UploadDrop from '../components/UploadDrop.jsx';
import Dialog from '../components/Dialog.jsx';
import { IconAlert } from '../components/icons.jsx';

// Instructions and the dropzone on one page. Steps are numbered with the
// numeral in the left margin — no cards, no icons, no three-column grid.
export default function Assessment() {
  const [sections, setSections] = useState(null);
  const [picked, setPicked] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState(null);
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const { slug } = useParams();

  useEffect(() => {
    api.get('/api/instructions')
      .then((r) => setSections(parseSections(r.markdown)))
      .catch(() => toast('Could not load the instructions. Reload the page.', 'error'));

    // Resolve the slug so the page names the assessment it belongs to, and
    // bounce anyone who already used their attempt.
    api.get('/api/assessments').then((r) => {
      const a = r.items.find((x) => x.slug === slug);
      if (!a) { navigate('/assessments', { replace: true }); return; }
      if (a.state !== 'available') { navigate('/history', { replace: true }); return; }
      setMeta(a);
    }).catch(() => {});
  }, [slug, navigate]);

  async function submit() {
    setBusy(true);
    try {
      await api.upload('/api/submissions', picked.file);
      await refresh();
      navigate('/history', { replace: true });
    } catch (e) {
      setConfirming(false);
      if (e.status === 409) {
        toast('You have already submitted.', 'error');
        await refresh();
        navigate('/history', { replace: true });
        return;
      }
      toast(e.message || 'Upload failed. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">{meta ? meta.name : 'Assessment'}</span>
        <h2>Your recording</h2>
      </div>

      <div className="callout">
        <IconAlert />
        <span>
          <strong>You get one attempt.</strong> Listen back before you upload.
        </span>
      </div>

      {sections === null ? (
        <div className="loading-block"><Loader label="Loading instructions" /></div>
      ) : (
        <div className="steps">
          {sections.map((s, i) => (
            <section className="step" key={i}>
              <span className="step-n">{String(i + 1).padStart(2, '0')}</span>
              <div className="step-body">
                {s.title && <h3>{s.title}</h3>}
                <Markdown lines={s.lines} />
              </div>
            </section>
          ))}
        </div>
      )}

      <div style={{ marginTop: 'var(--space-xl)' }}>
        {picked ? (
          <div className="picked">
            <div className="picked-head">
              <span className="picked-name">{picked.file.name}</span>
              <span className="picked-meta">
                {mmss(picked.duration)} · {kb(picked.file.size)}
              </span>
            </div>
            <audio controls src={picked.url} style={{ marginTop: 'var(--space-md)' }} />
            <div className="picked-actions">
              <button type="button" className="btn btn-primary" onClick={() => setConfirming(true)}>
                Submit this recording
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setPicked(null)}>
                Choose a different file
              </button>
            </div>
          </div>
        ) : (
          <UploadDrop onPick={setPicked} />
        )}
      </div>

      {confirming && (
        <Dialog
          title="Submit this recording?"
          confirmLabel="Submit"
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={submit}
        >
          You get one attempt. Once submitted, this recording is final and cannot
          be replaced.
        </Dialog>
      )}
    </>
  );
}
