import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { flushSync } from 'react-dom';

/**
 * Navigate with the reel: the page you leave slides out, the one you open
 * slides in from the other side.
 *
 * The two directions are the same classes the sidebar uses, so there is one
 * animation in `styles.css` rather than one per caller:
 *
 *   FORWARD — going deeper (a row into its record), or further DOWN the nav
 *             list. The new page arrives from the RIGHT.
 *   BACK    — coming back out, or further UP the nav list. It arrives from
 *             the LEFT.
 *
 * Falls through to a plain navigate with no `startViewTransition` and under
 * `prefers-reduced-motion`. `flushSync` is what makes the router commit inside
 * the transition callback — without it the snapshot is taken before the route
 * has changed and nothing moves.
 */
export const FORWARD = 'nav-down';
export const BACK = 'nav-up';

export function useSlideNavigate() {
  const navigate = useNavigate();

  return useCallback((to, direction = FORWARD, options) => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduce) { navigate(to, options); return; }

    const root = document.documentElement;
    root.classList.add(direction);
    document.startViewTransition(() => flushSync(() => navigate(to, options)))
      .finished.finally(() => root.classList.remove(FORWARD, BACK));
  }, [navigate]);
}
