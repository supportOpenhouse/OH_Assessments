/**
 * The sign-in / sign-out curtain: a full-screen wipe in the accent.
 *
 * TWO phases driven from JS rather than one timed sweep, because the sign-out
 * request has to complete while the screen is covered. A single self-timed
 * animation would uncover on a slow backend and let the landing page race a
 * session that is still valid — the exact bug `Layout.signOut` awaits to avoid.
 * So: cover, do the work unseen, then reveal whatever is now behind it.
 *
 * One sweep's length. JS sequences the phases, so this constant and
 * `--dur-curtain` in styles.css are the same number in two places; they are
 * commented as a pair.
 */
export const CURTAIN_SWEEP_MS = 420;
export const CURTAIN_HOLD_MS = 620;

export default function Curtain({ phase, line }) {
  if (!phase) return null;
  return (
    // aria-hidden: it is decorative and transient, and the page it uncovers
    // announces itself. pointer-events: none in CSS, so it never swallows a
    // click meant for what is behind it.
    <div className={`curtain curtain-${phase}`} aria-hidden="true">
      <p className="curtain-line">{line}</p>
    </div>
  );
}
