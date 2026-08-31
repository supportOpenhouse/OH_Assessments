import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { IconSun, IconMoon, IconSignOut } from './icons.jsx';

// Edge-aligned minimal nav. No sidebar — this app has four routes.
export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  function signOut() {
    logout();
    navigate('/', { replace: true });
  }

  return (
    <>
      <header className="shell">
        <nav className="nav">
          <img className="brand-logo" src="/openhouse-logo.png" alt="Openhouse" width="640" height="128" />
          <span className="eyebrow">Sales Assessment</span>
          <div className="nav-right">
            {user && <span className="nav-who">{user.email}</span>}
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
