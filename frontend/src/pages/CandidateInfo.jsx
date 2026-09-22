import { useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { toast } from '../utils/toast.js';
import { homeFor } from '../utils/roles.js';
import { useSlideNavigate } from '../utils/pageTransition.js';
import ResumeDrop from '../components/ResumeDrop.jsx';

const NAME_MAX = 80;

// Same rule as backend/app/main.py `_PHONE`: an Indian mobile, optionally with
// +91 / 91 / 0 in front. The server normalises and re-checks; this only keeps
// the button honest about whether the form can go.
const digits = (v) => v.replace(/[\s\-()]/g, '');
const validPhone = (v) => /^(?:\+91|91|0)?[6-9]\d{9}$/.test(digits(v));

// Asked once, before the first assessment: the name (prefilled from Google,
// editable), a phone number and a resume. Everything here can be changed later
// from Profile, so the page asks for exactly what is needed and no more.
export default function CandidateInfo() {
  const { user, refresh } = useAuth();
  const slide = useSlideNavigate();

  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone ? user.phone.slice(3) : '');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const trimmed = name.trim().replace(/\s+/g, ' ');
  // A resume already on file (a candidate who stopped halfway) need not be sent again.
  const needResume = !user?.has_resume;
  const ready = trimmed.length > 0 && validPhone(phone) && (!needResume || file);

  async function submit(e) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    try {
      const body = { phone };
      if (trimmed !== user.name) body.name = trimmed;
      await api.patch('/api/me', body);
      if (file) await api.upload('/api/me/resume', { file });
      const me = await refresh();
      slide(homeFor(me), undefined, { replace: true });
    } catch (err) {
      toast(err.message || 'Could not save your details.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Before you start</span>
        <h2>Your details</h2>
        <p className="muted" style={{ marginTop: 'var(--space-2xs)' }}>
          Asked once. You can change any of it later from your profile.
        </p>
      </div>

      <form onSubmit={submit} noValidate>
        <label className="form-field">
          <span className="form-label">Name</span>
          <input
            className="field"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NAME_MAX}
            autoComplete="name"
            required
          />
          <span className="picked-meta">Taken from your Google account. Change it if it is not how you want to appear.</span>
        </label>

        <label className="form-field">
          <span className="form-label">Mobile number</span>
          <input
            className="field"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-invalid={phone !== '' && !validPhone(phone)}
            required
          />
          {phone !== '' && !validPhone(phone) && (
            <span className="picked-meta">A 10-digit Indian mobile number.</span>
          )}
        </label>

        <div className="form-field">
          <span className="form-label">Resume</span>
          {needResume
            ? <ResumeDrop file={file} onPick={setFile} disabled={busy} />
            : <p className="picked-meta">Already on file. Replace it from your profile.</p>}
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-lg" disabled={!ready || busy}>
            {busy ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </form>
    </>
  );
}
