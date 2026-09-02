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
  // View Transitions do the heavy lifting: the browser snapshots the old and new
  // states, and we animate a clip-path on ::view-transition-new(root) so the new
  // one is wiped in. Everything degrades to a plain swap — an older browser, or
  // a toggle fired from a keyboard shortcut with no element to grow from.
  const toggle = (e) => {
    const next = theme === 'dark' ? 'light' : 'dark';
    const el = e?.currentTarget;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (!document.startViewTransition || !el || reduce) { setTheme(next); return; }

    const t = document.startViewTransition(() => {
      // Set the attribute HERE, not only in the effect below. The snapshot is
      // taken when this callback returns, and a passive effect is not guaranteed
      // to have run by then — the transition would capture the OLD theme twice
      // and animate nothing. The effect still runs and is idempotent.
      document.documentElement.setAttribute('data-theme', next);
      flushSync(() => setTheme(next));
    });

    t.ready.then(() => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      // Reach the furthest corner, or the circle stops short of the far edge.
      const end = Math.hypot(Math.max(x, window.innerWidth - x),
                             Math.max(y, window.innerHeight - y));
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
        // Paired with --dur-theme in styles.css.
        { duration: 520, easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
          pseudoElement: '::view-transition-new(root)' },
      );
    }).catch(() => { /* a transition can be skipped; the theme still changed */ });
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
