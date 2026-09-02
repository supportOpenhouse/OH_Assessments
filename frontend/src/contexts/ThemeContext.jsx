import { createContext, useContext, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

const ThemeContext = createContext(null);
const KEY = 'oha_theme';

function initialTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* private window / blocked storage — fall through to the default */
  }
  // Light regardless of the OS preference: light is the brand. An explicit
  // toggle is still remembered.
  return 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(KEY, theme); } catch { /* nothing to do */ }
  }, [theme]);

  // The new theme is revealed by a circle growing out of the button that was
  // pressed, rather than the whole page flipping at once.
  //
  // The circle is a CSS animation, not a JS one. Driving it from
  // `t.ready.then(() => el.animate(...))` meant two races: the geometry was read
  // AFTER the DOM had already swapped, and the animation was attached a hop
  // after the browser had begun the transition — during which
  // `animation: none` left the new snapshot fully painted. That is what showed
  // as a circle in the wrong place, a pause, then the theme arriving at once.
  // Declaring it up front hands the whole thing to the browser: the geometry is
  // measured from the live button BEFORE anything moves, and the animation is
  // already in the stylesheet when the transition starts.
  const toggle = (e) => {
    const next = theme === 'dark' ? 'light' : 'dark';
    const el = e?.currentTarget;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (!document.startViewTransition || !el || reduce) { setTheme(next); return; }

    const root = document.documentElement;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    // Reach the furthest corner, or the circle stops short of the far edge.
    // clientWidth/Height, not innerWidth/Height: the latter include the
    // scrollbar, which is not part of the area being revealed.
    const w = root.clientWidth;
    const h = root.clientHeight;
    const end = Math.hypot(Math.max(x, w - x), Math.max(y, h - y));

    root.style.setProperty('--vt-x', `${x}px`);
    root.style.setProperty('--vt-y', `${y}px`);
    root.style.setProperty('--vt-r', `${end}px`);
    // Scopes the reveal to THIS transition, so the home page's route transition
    // keeps its own animation — there is only one ::view-transition(root).
    root.classList.add('theme-vt');

    const t = document.startViewTransition(() => {
      // Set the attribute HERE, not only in the effect below. The snapshot is
      // taken when this callback returns, and a passive effect is not guaranteed
      // to have run by then — the transition would capture the OLD theme twice
      // and animate nothing. The effect still runs and is idempotent.
      root.setAttribute('data-theme', next);
      flushSync(() => setTheme(next));
    });

    t.finished.finally(() => root.classList.remove('theme-vt'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
