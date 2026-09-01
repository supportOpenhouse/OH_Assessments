import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { toast } from '../utils/toast.js';
import Brand from '../components/Brand.jsx';
import Waves from '../components/Waves.jsx';
import LegalLinks from '../components/LegalLinks.jsx';
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
      {/* Full-bleed now, not confined to the left panel — the card floats on it. */}
      <Waves />

      <section className="landing-mark">
        <h1><Brand size="lg" cut="landing" /></h1>
      </section>

      <section className="landing-panel">
        <div className="landing-card">
          <p className="landing-copy">
            Take your assessment, see where your application stands, all in
            one place.
          </p>
          <p className="landing-copy muted">
            Sign in with the Google account you applied with.
          </p>

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
              // No dev bypass. A missing client id is a deployment fault, and a
              // button that fakes a credential is a door left open in prod.
              <p className="landing-copy muted">
                Sign-in is unavailable — this deployment is missing its Google
                client id.
              </p>
            )}
          </div>

          <LegalLinks />
        </div>

        <button
          type="button"
          className="icon-btn landing-theme"
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>
      </section>
    </div>
  );
}
