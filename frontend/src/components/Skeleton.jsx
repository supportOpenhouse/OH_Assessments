// Loading placeholders shaped like the content they stand in for.
//
// A spinner in the middle of an empty page tells you something is happening but
// not what is coming, and the layout jumps when it arrives. A skeleton reserves
// the real geometry, so the page settles instead of reflowing.
//
// The house <Loader /> is still right for ROUTE-level waits — the auth splash,
// where there is no shape to reserve yet.
//
// All of this is aria-hidden and paired with ONE role="status", so a screen
// reader hears "Loading" once rather than a stream of empty boxes.

export function Skeleton({ w = '100%', h = 14, r = 4, className = '' }) {
  return (
    <span
      className={`skel${className ? ` ${className}` : ''}`}
      style={{ width: w, height: h, borderRadius: r }}
      aria-hidden="true"
    />
  );
}

export function SkeletonLines({ n = 3, widths = ['100%', '92%', '64%'] }) {
  return (
    <span className="skel-lines" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <Skeleton key={i} w={widths[i % widths.length]} />
      ))}
    </span>
  );
}

/**
 * Rows inside an existing <tbody>, so the header and column widths hold.
 *
 * `stacked` lists the columns that render TWO bars. The board's candidate cell
 * is a name over an email, and a one-line placeholder under it understates the
 * row height — the table then jumps when the real rows land, which is the exact
 * thing a skeleton is supposed to prevent.
 */
export function SkeletonRows({ rows = 5, cols = 5, widths = [], stacked = [] }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className="skel-row" aria-hidden="true">
          {Array.from({ length: cols }, (_, c) => (
            <td key={c}>
              {/* Heights mirror the real cell's text metrics: a 1rem/1.5 name
                  over a .75rem <small>. Guessing here is what leaves the table
                  jumping when the rows land. */}
              <Skeleton w={widths[c] || '70%'} h={stacked.includes(c) ? 20 : 14} />
              {stacked.includes(c) && (
                <Skeleton w="85%" h={16} className="skel-sub" />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** The one announcement that accompanies any group of skeletons. */
export function LoadingNote({ children = 'Loading' }) {
  return <span className="sr-only" role="status">{children}</span>;
}
