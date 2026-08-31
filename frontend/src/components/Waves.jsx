import { useEffect, useRef } from 'react';

// Noise-driven line field. Ported from the supplied TypeScript/Next component.
//
// The source's cursor dot is removed. The pointer still deforms the field —
// that is the interaction; the dot was only a marker for it.
//
// One change from the source: `simplex-noise` is not installed. The 2D gradient
// noise below is ~30 lines, used in exactly one place — a dependency for that is
// a supply-chain surface and a version to track for no gain.
//
// THE 8px GRID IS THE DESIGN, NOT AN OVERSIGHT. I widened it to 38px once on a
// performance hunch and got sparse squiggles instead of the flowing bands the
// effect is for: the density is what makes neighbouring lines diverge into
// sweeping curves. The reference renders 159 lines x 80 points = 12,720 and
// holds a 16.6ms median frame. Measured, not assumed. Do not thin it out.

// ── 2D gradient noise ─────────────────────────────────────────────────────
// Deterministic permutation, smoothstep interpolation. Not simplex proper, but
// visually equivalent once the output is smoothed and scaled as it is here.
function makeNoise2D(seed = 1337) {
  const perm = new Uint8Array(512);
  let n = seed;
  const rand = () => {
    // xorshift — same sequence every load, so the field is not different on
    // every refresh.
    n ^= n << 13; n ^= n >>> 17; n ^= n << 5;
    return (n >>> 0) / 4294967296;
  };
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const grad = (h, x, y) => {
    switch (h & 3) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      default: return -x - y;
    }
  };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + t * (b - a);

  return (x, y) => {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[xi] + yi];
    const ab = perm[perm[xi] + yi + 1];
    const ba = perm[perm[xi + 1] + yi];
    const bb = perm[perm[xi + 1] + yi + 1];
    return lerp(
      lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
      lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
      v,
    );
  };
}

export default function Waves({ xGap = 8, yGap = 8 }) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const linesRef = useRef([]);
  const pathsRef = useRef([]);
  const noiseRef = useRef(null);
  const rafRef = useRef(null);
  const boundingRef = useRef(null);
  const mouseRef = useRef({ x: -10, y: 0, lx: 0, ly: 0, sx: 0, sy: 0, v: 0, vs: 0, a: 0, set: false });

  useEffect(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg) return undefined;

    noiseRef.current = makeNoise2D();

    const setSize = () => {
      boundingRef.current = container.getBoundingClientRect();
      svg.style.width = `${boundingRef.current.width}px`;
      svg.style.height = `${boundingRef.current.height}px`;
    };

    const setLines = () => {
      const { width, height } = boundingRef.current;
      linesRef.current = [];
      pathsRef.current.forEach((p) => p.remove());
      pathsRef.current = [];

      const oWidth = width + 200;
      const oHeight = height + 30;
      const totalLines = Math.ceil(oWidth / xGap);
      const totalPoints = Math.ceil(oHeight / yGap);
      const xStart = (width - xGap * totalLines) / 2;
      const yStart = (height - yGap * totalPoints) / 2;

      for (let i = 0; i < totalLines; i++) {
        const points = [];
        for (let j = 0; j < totalPoints; j++) {
          points.push({
            x: xStart + xGap * i,
            y: yStart + yGap * j,
            wave: { x: 0, y: 0 },
            cursor: { x: 0, y: 0, vx: 0, vy: 0 },
          });
        }
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-width', '1');
        svg.appendChild(path);
        pathsRef.current.push(path);
        linesRef.current.push(points);
      }
    };

    const movePoints = (time) => {
      const noise = noiseRef.current;
      const mouse = mouseRef.current;
      linesRef.current.forEach((points) => {
        points.forEach((p) => {
          // x-scale is 0.0072, not the source's 0.003. The source uses simplex,
          // which carries more high-frequency content per lattice unit than the
          // gradient noise above — at 0.003 our neighbouring lines moved in
          // near-lockstep (p95 divergence 1.7px against the reference's 5.9) and
          // the field read as a flat ripple instead of flowing bands. Tuned by
          // measuring line-to-line divergence against the reference, not by eye.
          const move = noise((p.x + time * 0.008) * 0.0072, (p.y + time * 0.003) * 0.002) * 8;
          p.wave.x = Math.cos(move) * 12;
          p.wave.y = Math.sin(move) * 6;

          const dx = p.x - mouse.sx;
          const dy = p.y - mouse.sy;
          const d = Math.hypot(dx, dy);
          const l = Math.max(175, mouse.vs);
          if (d < l) {
            const sc = 1 - d / l;
            const f = Math.cos(d * 0.001) * sc;
            p.cursor.vx += Math.cos(mouse.a) * f * l * mouse.vs * 0.00035;
            p.cursor.vy += Math.sin(mouse.a) * f * l * mouse.vs * 0.00035;
          }
          p.cursor.vx += (0 - p.cursor.x) * 0.01;
          p.cursor.vy += (0 - p.cursor.y) * 0.01;
          p.cursor.vx *= 0.95;
          p.cursor.vy *= 0.95;
          p.cursor.x = Math.min(50, Math.max(-50, p.cursor.x + p.cursor.vx));
          p.cursor.y = Math.min(50, Math.max(-50, p.cursor.y + p.cursor.vy));
        });
      });
    };

    const drawLines = () => {
      linesRef.current.forEach((points, li) => {
        const path = pathsRef.current[li];
        if (!path || points.length < 2) return;
        let d = `M ${(points[0].x + points[0].wave.x).toFixed(1)} ${(points[0].y + points[0].wave.y).toFixed(1)}`;
        for (let i = 1; i < points.length; i++) {
          const p = points[i];
          d += `L ${(p.x + p.wave.x + p.cursor.x).toFixed(1)} ${(p.y + p.wave.y + p.cursor.y).toFixed(1)}`;
        }
        path.setAttribute('d', d);
      });
    };

    const tick = (time) => {
      const mouse = mouseRef.current;
      mouse.sx += (mouse.x - mouse.sx) * 0.1;
      mouse.sy += (mouse.y - mouse.sy) * 0.1;
      const dx = mouse.x - mouse.lx;
      const dy = mouse.y - mouse.ly;
      const d = Math.hypot(dx, dy);
      mouse.v = d;
      mouse.vs += (d - mouse.vs) * 0.1;
      mouse.vs = Math.min(100, mouse.vs);
      mouse.lx = mouse.x;
      mouse.ly = mouse.y;
      mouse.a = Math.atan2(dy, dx);

      movePoints(time);
      drawLines();
      rafRef.current = requestAnimationFrame(tick);
    };

    const updateMouse = (x, y) => {
      const b = boundingRef.current;
      if (!b) return;
      const mouse = mouseRef.current;
      mouse.x = x - b.left;
      mouse.y = y - b.top;
      if (!mouse.set) {
        mouse.sx = mouse.x; mouse.sy = mouse.y;
        mouse.lx = mouse.x; mouse.ly = mouse.y;
        mouse.set = true;
      }
    };

    const onMouseMove = (e) => updateMouse(e.clientX, e.clientY);
    // NOT passive:false + preventDefault like the source — swallowing touchmove
    // over a full-bleed background would break scrolling on a phone.
    const onTouchMove = (e) => {
      const t = e.touches[0];
      if (t) updateMouse(t.clientX, t.clientY);
    };
    const onResize = () => { setSize(); setLines(); };

    setSize();
    setLines();

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const start = () => {
      if (rafRef.current == null && !reduced.matches) rafRef.current = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
    // Reduced motion gets ONE static frame — the field is the design, the drift
    // is the decoration.
    movePoints(0);
    drawLines();
    start();

    // A background animation has no business burning frames on a hidden tab.
    const onVisibility = () => (document.hidden ? stop() : start());

    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onMouseMove);
    container.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    reduced.addEventListener('change', () => (reduced.matches ? stop() : start()));

    return () => {
      stop();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [xGap, yGap]);

  return (
    <div className="waves" ref={containerRef} aria-hidden="true">
      <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" />
    </div>
  );
}
