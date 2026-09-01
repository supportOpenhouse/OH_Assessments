/**
 * The brand lockup: the supplied Openhouse artwork.
 *
 * CAREERS is PART OF THE ARTWORK now — both files set it in the accent — so
 * there is no sub-word to typeset beneath it and no Poppins needed for one word.
 * Two different cuts rather than two sizes of one: the header logo sets CAREERS
 * beside "house", the landing logo stacks it underneath, which is what the
 * larger lockup has the room for.
 *
 * One black-on-transparent file per cut, so dark mode is a filter rather than a
 * second image: invert(1) turns the black artwork white, hue-rotate(180deg) puts
 * the hue back where it started, and CAREERS stays orange. `brightness(0)
 * invert(1)` — what the circular mark uses — would flatten the accent to white.
 * Measured against both before choosing.
 */
const CUTS = {
  header:  { src: '/header_logo.png',       w: 3376, h: 676 },
  landing: { src: '/landing_page_logo.png', w: 3380, h: 820 },
};

export default function Brand({ size = 'sm', cut = 'header' }) {
  const { src, w, h } = CUTS[cut];
  return (
    <span className={`brand brand-${size}`} role="img" aria-label="Openhouse Careers">
      <img className="brand-lockup brand-art" src={src} alt="" aria-hidden="true"
           width={w} height={h} />
    </span>
  );
}
