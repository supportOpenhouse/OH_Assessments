import { useRef, useState } from 'react';
import { toast } from '../utils/toast.js';
import { kb } from '../utils/format.js';
import { IconUpload } from './icons.jsx';

// Mirrors backend/app/main.py RESUME_MAX_BYTES and its PDF-only rule. The server
// checks the file's header too; this only saves a round trip on an obvious miss.
const MAX_BYTES = 5 * 1024 * 1024;

export function checkResume(file) {
  if (file.type !== 'application/pdf') return 'Upload your resume as a PDF.';
  if (file.size > MAX_BYTES) return `That file is ${kb(file.size)}. The limit is 5 MB.`;
  return null;
}

// Same dropzone as the recording upload, for one PDF. Validation failures toast
// and pick nothing — a dropped file is never silently ignored.
export default function ResumeDrop({ file, onPick, disabled }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);

  function accept(f) {
    if (!f) return;
    const why = checkResume(f);
    if (why) { toast(why, 'error'); return; }
    onPick(f);
  }

  return (
    <>
      <div
        className={`drop${over ? ' over' : ''}`}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={file ? `Resume chosen: ${file.name}. Choose a different file` : 'Choose your resume'}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); }
        }}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!disabled) accept(e.dataTransfer.files?.[0]);
        }}
      >
        <IconUpload width={22} height={22} style={{ margin: '0 auto var(--space-sm)' }} />
        {file ? (
          <>
            <div className="drop-picked">{file.name}</div>
            <div className="drop-hint">{kb(file.size)} · click to choose a different file</div>
          </>
        ) : (
          <>
            <div className="drop-cta-pointer">Drop your resume here, or click to choose a file</div>
            <div className="drop-cta-touch">Tap to choose your resume</div>
            <div className="drop-hint">PDF — max 5 MB</div>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => { accept(e.target.files?.[0]); e.target.value = ''; }}
      />
    </>
  );
}
