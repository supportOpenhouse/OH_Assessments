import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { flushSync } from 'react-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import Brand from './Brand.jsx';
import {
  IconSun, IconMoon, IconSignOut,
  IconSubmissions, IconCandidates, IconActivity, IconProfile,
  IconAssessments, IconHistory,
} from './icons.jsx';

// Role-aware sidebar. The two link sets never mix: a candidate has no admin
// route to reach, so none is rendered for them to discover.
const NAV = {
  admin: [
    { to: '/admin', label: 'Submissions', Icon: IconSubmissions, end: true },
    { to: '/admin/candidates', label: 'Candidates', Icon: IconCandidates },
    { to: '/admin/activity', label: 'Activity', Icon: IconActivity },
    { to: '/profile', label: 'Profile', Icon: IconProfile },
  ],
  user: [
    { to: '/assessments', label: 'Assessments', Icon: IconAssessments, end: true },
    { to: '/history', label: 'Previous', Icon: IconHistory },
    { to: '/profile', label: 'Profile', Icon: IconProfile },
  ],
};

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  // On a phone the nav is a bottom tab bar, so the top strip is only the brand
  // plus these two. Carrying a theme toggle and a sign-out on every single page
  // is chrome for its own sake; Profile is where you go to manage the session,
  // so that is where they live. Desktop keeps them in the rail throughout.
  const { pathname } = useLocation();
  const onProfile = pathname === '/profile';

  // logout is a server call now (only the server can clear an httpOnly cookie),
  // so wait for it before leaving — otherwise the landing page can race the
  // still-valid session and bounce straight back in.
  async function signOut() {
    await logout();
    navigate('/', { replace: true });
  }

  const links = NAV[user?.role === 'admin' ? 'admin' : 'user'];

  // Moving between pages slides the content like a reel, and the DIRECTION
  // comes from the nav order: go UP the list and the page arrives from the
  // left, go DOWN and it arrives from the right — so the motion matches where
  // you just pointed. Only the sidebar links do this; a row click into a
  // submission has no position in the list to take a direction from.
  //
  // Longest prefix wins, so /admin/<id> counts as "Submissions" rather than
  // matching nothing — otherwise leaving a detail page had no direction.
  const currentIndex = links.reduce(
    (best, l, i) => (pathname.startsWith(l.to)
      && (best < 0 || l.to.length > links[best].to.length) ? i : best),
    -1,
  );

  function onNavigate(e, to, index) {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduce) return;   // let NavLink navigate
    if (currentIndex < 0 || index === currentIndex) return; // nowhere to slide from
    e.preventDefault();
    const root = document.documentElement;
    root.classList.add(index < currentIndex ? 'nav-up' : 'nav-down');
    document.startViewTransition(() => flushSync(() => navigate(to)))
      .finished.finally(() => root.classList.remove('nav-up', 'nav-down'));
  }

  return (
    <div className="app">
      <aside className="sidebar" data-on-profile={onProfile || undefined}>
        <div className="sidebar-head">
          <Brand />
        </div>

        <nav className="sidebar-nav" aria-label="Main">
          {links.map(({ to, label, Icon, end }, i) => (
            <NavLink
              key={to}
              className="side-link"
              to={to}
              end={end}
              onClick={(e) => onNavigate(e, to, i)}
            >
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          {user && <span className="nav-who" title={user.email}>{user.email}</span>}
          <div className="sidebar-actions">
            <button
              type="button"
              className="icon-btn"
              onClick={toggle}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {theme === 'dark' ? <IconSun /> : <IconMoon />}
            </button>
            <button type="button" className="icon-btn" onClick={signOut} aria-label="Sign out">
              <IconSignOut />
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="shell">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
