// Hexagonal edge-tracing loader.
//
// Ported off styled-components deliberately — that would be a fifth runtime
// dependency for one component, and every other style in this app lives in
// styles.css. Classes are namespaced `ldr-*`: the original used bare `.h1`–`.h6`,
// which is a collision waiting to happen in a stylesheet full of headings.
export default function Loader({ label = 'Loading' }) {
  return (
    <span className="ldr" role="status" aria-label={label}>
      <span className="ldr-arm">
        <span className="ldr-inner">
          <span className="ldr-bar ldr-h6" />
          <span className="ldr-bar ldr-h3" />
        </span>
      </span>
      <span className="ldr-arm">
        <span className="ldr-inner"><span className="ldr-bar ldr-h1" /></span>
      </span>
      <span className="ldr-arm">
        <span className="ldr-inner"><span className="ldr-bar ldr-h2" /></span>
      </span>
      <span className="ldr-arm">
        <span className="ldr-inner"><span className="ldr-bar ldr-h4" /></span>
      </span>
    </span>
  );
}

// A REFETCH state for the boards: filters changed, the rows on screen are now
// stale, and there is nothing to reserve layout for because the layout is
// already there. It lives inside the existing <tbody> so the header row and the
// board's rules stay put.
//
// Not SkeletonRows: those are for the FIRST paint, where their job is to hold
// the column widths before any content exists. Once the table is on screen a
// skeleton would just redraw the same shape, which reads as a flicker rather
// than as work happening. The user asked for the house here.
export function BoardLoader({ cols, label = 'Loading' }) {
  return (
    <tr className="board-loading">
      <td colSpan={cols}><Loader label={label} /></td>
    </tr>
  );
}
