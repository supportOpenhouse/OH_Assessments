import { IconStar, IconStarFill } from './icons.jsx';

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

// Scores carry one decimal place, so the band is the FLOOR, not the nearest:
// 3.9 has not reached "Hire" yet, it is a very good "Average · can hire". That
// matches the rubric's own rule of taking the lower band when torn.
export const bandOf = (stars) => Math.min(5, Math.max(0, Math.floor(stars)));

// Five glyphs, filled proportionally: 3.4 is three stars and 40% of a fourth.
// The row is aria-hidden — the numeral beside it already carries the label, and
// a screen reader counting five icons learns nothing.
//
// This is only ever shown NEXT TO the numeral, never instead of it. Five empty
// glyphs on their own read as "not scored yet", and 0 is a real band here that
// means Irrelevant.
function Glyphs({ stars }) {
  return (
    <span className="stars-glyphs" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => {
        // Each star clips its OWN fill. Clipping once across the whole row is
        // arithmetically identical and visually wrong: Lucide's glyph carries
        // transparent padding inside its box, so a row-wide cut lands in the
        // gap and the outline underneath peeks out as a sixth star. Measured —
        // 3.4 rendered as four and a half.
        const filled = Math.min(1, Math.max(0, stars - i));
        return (
          <span className="stars-glyph" key={i}>
            <IconStar />
            {filled > 0 && (
              <span className="stars-glyph-fill" style={{ width: `${filled * 100}%` }}>
                <IconStarFill />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

export default function Stars({ stars, size = 'md', showBand = true, glyphs = false }) {
  if (stars == null) return <span className="mono muted">—</span>;
  // Always one decimal. A bare "3" beside a "3.4" reads as a different scale.
  const shown = Number(stars).toFixed(1);
  const band = bandOf(stars);
  return (
    <span
      className={`stars stars-${size}`}
      data-tone={TONE[band]}
      role="img"
      aria-label={`${shown} of 5 — ${BANDS[band]}`}
    >
      {glyphs && <Glyphs stars={stars} />}
      <span className="stars-mark">{shown}</span>
      <span className="stars-of">/5</span>
      {showBand && <span className="stars-band">{BANDS[band]}</span>}
    </span>
  );
}
