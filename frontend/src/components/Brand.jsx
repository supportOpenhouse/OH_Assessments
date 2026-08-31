// The brand lockup: the circular mark, "Openhouse" with Open in bold, and the
// product name beneath it in the accent.
//
// Set as TEXT rather than shipped as an image, because the wordmark carries two
// weights — a raster would need one file per size and per theme, and would not
// respond to the type scale.
//
// One <span role="img"> with a single accessible name: a screen reader should
// hear "Openhouse Careers", not four fragments.
export default function Brand({ size = 'sm', sub = 'Careers' }) {
  return (
    <span className={`brand brand-${size}`} role="img" aria-label={`Openhouse ${sub}`}>
      <img
        className="brand-mark"
        src="/openhouse-mark.png"
        alt=""
        aria-hidden="true"
        width="180"
        height="180"
      />
      <span className="brand-words">
        <span className="brand-name"><b>Open</b>house</span>
        <span className="brand-sub">{sub}</span>
      </span>
    </span>
  );
}
