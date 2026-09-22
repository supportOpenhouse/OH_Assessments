import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import Brand from './Brand.jsx';
import { isAdmin, isStaff } from '../utils/roles.js';
import { useSlideNavigate, FORWARD, BACK } from '../utils/pageTransition.js';
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
    { to: '/admin/activity', label: 'Activity', Icon: IconActivity, adminOnly: true },
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
  const slide = useSlideNavigate();
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

  // Staff share one link set; `adminOnly` entries drop out for `internal`, so a
  // page they cannot open is not offered to them.
  const links = isStaff(user)
    ? NAV.admin.filter((l) => !l.adminOnly || isAdmin(user))
    : NAV.user;

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
    if (currentIndex < 0 || index === currentIndex) return;   // already here
    e.preventDefault();
    slide(to, index < currentIndex ? BACK : FORWARD);
  }

  // /candidate-info is a gate, not a page among pages: every nav link there
  // would only bounce back to it. So no rail — just the brand, and a way out.
  if (pathname === '/candidate-info') {
    return (
      <div className="app app-bare">
        <main className="main">
          <div className="shell">
            <header className="bare-head">
              <Brand />
              <button type="button" className="icon-btn" onClick={signOut} aria-label="Sign out">
                <IconSignOut />
              </button>
            </header>
            <Outlet />
          </div>
        </main>
      </div>
    );
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
