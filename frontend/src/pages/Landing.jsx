import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { toast } from '../utils/toast.js';
import { IconSun, IconMoon } from '../components/icons.jsx';

// Off-axis split. The mark is anchored bottom-left; the sign-in panel starts at
// 38% down its own column. Nothing sits on a shared centre line.
//
// Sign-in is a Google popup opened on this page — @react-oauth/google defaults
// to ux_mode="popup", so there is no redirect and no route change.
export default function Landing() {
  const { loginWithGoogle } = useAuth();
  const { theme, toggle } = useTheme();
  const hasClientId = Boolean(import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID);

  async function onSuccess(res) {
    try {
      await loginWithGoogle(res.credential);
    } catch (e) {
      toast(e.message || 'Sign-in failed. Please try again.', 'error');
    }
  }

  return (
    <div className="landing">
      <section className="landing-mark">
        <img
          className="brand-logo brand-logo-lg landing-brand"
          src="/openhouse-logo.png"
          alt="Openhouse"
          width="640"
          height="128"
        />
        <span className="eyebrow">Assessments</span>
        <h1>Openhouse<br />Careers</h1>
        <div className="landing-rule" />
      </section>

      <section className="landing-panel">
        <div>
          <p className="landing-copy">
            Take your assessment, see where your application stands, all in
            one place.
          </p>
          <p className="landing-copy muted">
            Sign in with the Google account you applied with.
          </p>
        </div>

        <div className="landing-signin">
          {hasClientId ? (
            <GoogleLogin
              onSuccess={onSuccess}
              onError={() => toast('Sign-in failed. Please try again.', 'error')}
              shape="rectangular"
              text="signin_with"
              width="300"
            />
          ) : (
            // No client id configured yet (mock mode). Keeps the flow walkable.
            <button type="button" className="btn btn-primary" onClick={() => onSuccess({ credential: 'dev' })}>
              Continue with Google
            </button>
          )}
        </div>

        <div className="landing-foot">
          <button
            type="button"
            className="icon-btn"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
        </div>
      </section>
    </div>
  );
}
