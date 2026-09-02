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

  // The new theme is wiped in like a curtain, left-to-right or right-to-left,
  // picked at random each time.
  //
  // A wipe rather than the old circle-from-the-button: coverage is then LINEAR
  // in progress, where a circle's went as r² and made the reveal crawl then
  // lurch however it was eased. It also needs no origin, so a toggle fired from
  // the keyboard animates the same as one fired from a click.
  //
  // The animation is declared in CSS, not attached from JS after `t.ready` —
  // that hop was a race against a transition the browser had already begun.
  // Here JS only sets which edge it starts from.
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (!document.startViewTransition || reduce) { setTheme(next); return; }

    const root = document.documentElement;
    // inset(top right bottom left): shrink the RIGHT inset and the new theme is
    // uncovered from the left edge; shrink the LEFT and it comes from the right.
    const leftToRight = Math.random() < 0.5;
    root.style.setProperty('--vt-from-right', leftToRight ? '100%' : '0%');
    root.style.setProperty('--vt-from-left', leftToRight ? '0%' : '100%');
    // Scopes the wipe to THIS transition — the nav reel and the home page's
    // route transition also animate ::view-transition(root).
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
