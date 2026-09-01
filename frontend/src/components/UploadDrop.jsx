import { useRef, useState } from 'react';
import { toast } from '../utils/toast.js';
import { kb, mmss } from '../utils/format.js';
import { IconUpload } from './icons.jsx';

const ALLOWED = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a',
  'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg',
]);
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_SECONDS = 600;

// Reads duration without decoding the whole file.
function probeDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = new Audio();
    const done = (v) => { URL.revokeObjectURL(url); resolve(v); };
    el.addEventListener('loadedmetadata', () => done(Number.isFinite(el.duration) ? el.duration : null));
    el.addEventListener('error', () => done(null));
    el.src = url;
  });
}

export default function UploadDrop({ onPick, disabled }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);

  async function accept(file) {
    if (!file) return;

    // Validate before anything else happens. A rejected file always says why —
    // silently ignoring a dropped file is the worst possible behaviour here.
    if (!ALLOWED.has(file.type)) {
      toast(`That is a ${file.type || 'unknown'} file. Upload MP3, M4A, WAV, WEBM or OGG.`, 'error');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast(`That file is ${kb(file.size)}. The limit is 25 MB.`, 'error');
      return;
    }
    const duration = await probeDuration(file);
    if (duration == null) {
      toast('That audio file could not be read. Try re-exporting it.', 'error');
      return;
    }
    if (duration > MAX_SECONDS) {
      toast(`That recording is ${mmss(duration)}. The limit is 10:00.`, 'error');
      return;
    }
    onPick({ file, duration, url: URL.createObjectURL(file) });
  }

  return (
    <>
      <div
        className={`drop${over ? ' over' : ''}`}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Choose an audio file to upload"
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
        <div className="drop-cta-pointer">Drop your recording here, or click to choose a file</div>
        <div className="drop-cta-touch">Tap to choose your recording</div>
        <div className="drop-hint">MP3 · M4A · WAV · WEBM · OGG — max 25 MB, 10:00</div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => { accept(e.target.files?.[0]); e.target.value = ''; }}
      />
    </>
  );
}
