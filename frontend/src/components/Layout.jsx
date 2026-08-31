import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import Brand from './Brand.jsx';
import { IconSun, IconMoon, IconSignOut } from './icons.jsx';

// Role-aware sidebar. The two link sets never mix: a candidate has no admin
// route to reach, so none is rendered for them to discover.
const NAV = {
  admin: [
    { to: '/admin', label: 'Submissions', end: true },
    { to: '/admin/candidates', label: 'Candidates' },
    { to: '/admin/activity', label: 'Activity' },
    { to: '/profile', label: 'Profile' },
  ],
  user: [
    { to: '/assessments', label: 'Assessments', end: true },
    { to: '/history', label: 'Previous' },
    { to: '/profile', label: 'Profile' },
  ],
};

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  function signOut() {
    logout();
    navigate('/', { replace: true });
  }

  const links = NAV[user?.role === 'admin' ? 'admin' : 'user'];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-head">
          <Brand />
        </div>

        <nav className="sidebar-nav" aria-label="Main">
          {links.map((l) => (
            <NavLink key={l.to} className="side-link" to={l.to} end={l.end}>
              {l.label}
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
