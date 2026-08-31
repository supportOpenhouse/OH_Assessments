import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { IconSun, IconMoon, IconSignOut } from './icons.jsx';

// Edge-aligned minimal nav, role-aware. No sidebar — there are four
// destinations per role, and a sidebar for four links is furniture.
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
    <>
      <header className="shell">
        <nav className="nav">
          <img className="brand-logo" src="/openhouse-logo.png" alt="Openhouse"
               width="640" height="128" />
          <span className="eyebrow">Careers</span>

          <div className="nav-links">
            {links.map((l) => (
              <NavLink key={l.to} className="nav-link" to={l.to} end={l.end}>
                {l.label}
              </NavLink>
            ))}
          </div>

          <div className="nav-right">
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
        </nav>
      </header>
      <main className="shell main">
        <Outlet />
      </main>
    </>
  );
}
