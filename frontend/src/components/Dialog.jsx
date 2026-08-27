import { useEffect, useRef } from 'react';

// Confirm dialog. On a one-shot irreversible action a confirm step is not
// friction — it is the point.
export default function Dialog({ title, children, confirmLabel, confirmClass = 'btn-primary',
                                onConfirm, onCancel, busy = false }) {
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.focus();
    function onKey(e) { if (e.key === 'Escape' && !busy) onCancel(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        <div className="muted">{children}</div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            ref={ref}
            className={`btn ${confirmClass}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
