// The score is a display numeral, not five glyphs.
//
// Five drawn stars make the reader count, and an unfilled row of five reads as
// "not scored yet" — fatal when 0 is a real band that means Irrelevant. The
// band name spelled out removes the ambiguity entirely.

export const BANDS = [
  'Irrelevant',
  'Reject',
  'Can hire, but train',
  'Average · can hire',
  'Hire',
  'Must hire',
];

export const TONE = ['stop', 'stop', 'hold', 'mid', 'go', 'go'];

export default function Stars({ stars, size = 'md', showBand = true }) {
  if (stars == null) return <span className="mono muted">—</span>;
  return (
    <span
      className={`stars stars-${size}`}
      data-tone={TONE[stars]}
      role="img"
      aria-label={`${stars} of 5 — ${BANDS[stars]}`}
    >
      <span className="stars-mark">{stars}</span>
      <span className="stars-of">/5</span>
      {showBand && <span className="stars-band">{BANDS[stars]}</span>}
    </span>
  );
}
