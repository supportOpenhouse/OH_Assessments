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
