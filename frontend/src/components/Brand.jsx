/**
 * The brand lockup: the supplied Openhouse artwork with the product name
 * beneath it in the accent.
 *
 * Two images rather than one filtered image — the artwork is supplied in both
 * a dark and a white cut, and CSS swaps them on `data-theme`. A `filter` on a
 * single file would be guessing at the inversion the designer already made.
 * Both are ~16KB; the cost of loading the pair is not worth a JS theme read.
 */
export default function Brand({ size = 'sm', sub = 'Careers' }) {
  return (
    <span className={`brand brand-${size}`} role="img" aria-label={`Openhouse ${sub}`}>
      <img className="brand-lockup brand-lockup-light" src="/OH_logo_font.png"
           alt="" aria-hidden="true" width="640" height="128" />
      <img className="brand-lockup brand-lockup-dark" src="/OH_logo_font_white.png"
           alt="" aria-hidden="true" width="640" height="128" />
      <span className="brand-sub">{sub}</span>
    </span>
  );
}
