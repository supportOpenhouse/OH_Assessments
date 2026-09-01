import Stars, { TONE, bandOf } from './Stars.jsx';

// Band colour rides a 2px TOP rule — never a thick left side-stripe. The block
// is not a card, so nothing nests inside anything.
export default function AxisBlock({ n, label, stars, reasoning, overall = false }) {
  return (
    <section className={`axis${overall ? ' axis-overall' : ''}`} data-tone={TONE[bandOf(stars)]}>
      <span className="axis-n">{String(n).padStart(2, '0')}</span>
      <div className="axis-body">
        <h3 className="axis-label">{label}</h3>
        <Stars stars={stars} glyphs={overall} />
        <p className="verdict">{reasoning}</p>
      </div>
    </section>
  );
}
