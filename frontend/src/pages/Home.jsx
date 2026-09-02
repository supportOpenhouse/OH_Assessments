import { Link, useNavigate } from 'react-router-dom';
import { flushSync } from 'react-dom';
import { useTheme } from '../contexts/ThemeContext.jsx';
import Brand from '../components/Brand.jsx';
import SiteFooter from '../components/SiteFooter.jsx';
import {
  IconArrow, IconSun, IconMoon,
  IconOverview, IconVision, IconMission, IconValues,
} from '../components/icons.jsx';

// The public front door. `/` is marketing; the assessment sign-in moved to
// /assessmentlogin, which is where "Take Assessment" leads — and which bounces
// an already-signed-in visitor straight to their dashboard.
//
// Copy is VERBATIM from openhouse.in/about, "About Openhouse" through "Our Core
// Values". Read off the rendered DOM, not the source: their site is
// client-rendered and the HTML ships almost empty. Leadership is deliberately
// not here — names and roles go stale and this page is not the org chart.

const LEDE =
  'Openhouse is a platform that simplifies the process of buying and selling '
  + 'resale homes in India. We make property transactions faster, more '
  + 'transparent, and easier for both buyers and sellers - to enable them move '
  + 'forward with confidence and peace of mind.';

const OVERVIEW = [
  'Openhouse is re-imagining the secondary residential real estate market in '
  + 'India. Traditionally fragmented and opaque, the resale transaction journey '
  + 'often leaves both buyers and sellers confused, misinformed, and underserved. '
  + 'We address this by acquiring handpicked homes through a large network of '
  + 'exclusive channel partners, then curating them through our highly talented '
  + 'in-house design team and finally reselling them transparently.',
  'Our platform brings together data science, verified listings, property '
  + 'certification, and broker incentives to create a seamless transaction '
  + 'experience. Openhouse is building India’s most trusted platform for '
  + 'pre-owned homes—driven by trust, speed, and customer delight.',
];

const AIMS = [
  [IconVision, 'Our Vision',
   'To transform the way India buys and sells pre-owned homes by making '
   + 'homeownership more transparent, efficient, and trusted—enabling every '
   + 'Indian family to find a home they truly belong to.'],
  [IconMission, 'Our Mission',
   'We simplify the resale home journey through data-backed pricing, trustworthy '
   + 'brokers, quality-assured properties, and a customer-first experience—'
   + 'delivering value to buyers, sellers, and ecosystem partners alike.'],
];

const VALUES = [
  ['Transparency',
   'We bring radical transparency to a market plagued by opacity—on pricing, '
   + 'property condition, and process.'],
  ['Innovation',
   'We constantly seek new ways to improve the home selling process, leveraging '
   + 'technology to solve problems and create better experiences.'],
  ['Customer-First',
   'Every decision we make begins with understanding and solving the real needs '
   + 'of home buyers and sellers.'],
];

export default function Home() {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  // Cross-fade into the sign-in page instead of a hard cut. The browser
  // snapshots both states; `.route-vt` is what picks the route animation, and
  // it is scoped so the theme toggle's own circular reveal is unaffected —
  // both use ::view-transition(root) and would otherwise fight.
  function toSignIn(e) {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduce) return;   // let <Link> just navigate
    e.preventDefault();
    const root = document.documentElement;
    root.classList.add('route-vt');
    document.startViewTransition(() => flushSync(() => navigate('/assessmentlogin')))
      .finished.finally(() => root.classList.remove('route-vt'));
  }

  return (
    <div className="home">
      <section className="home-hero">
        <div className="home-nav shell">
          <Link to="/" aria-label="Openhouse Careers"><Brand /></Link>
          <button
            type="button"
            className="icon-btn"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
        </div>

        <div className="home-hero-body shell">
          <div className="home-hero-text">
            <h1>About Openhouse</h1>
            <p className="home-lede">{LEDE}</p>
            <Link
              to="/assessmentlogin"
              className="btn btn-primary btn-lg home-cta"
              onClick={toSignIn}
            >
              Take Assessment <IconArrow />
            </Link>
          </div>

          {/* Their own photograph, served from our public/ — hotlinking their
              CDN is a URL that silently 404s one day. Decorative, so alt="". */}
          <figure className="home-hero-art">
            <img src="/about.jpg" alt="" width="1920" height="1280" loading="eager" />
          </figure>
        </div>
      </section>

      <section className="shell home-section">
        <h2 className="home-h"><IconOverview size={26} /> Company Overview</h2>
        {OVERVIEW.map((t) => <p className="home-copy" key={t.slice(0, 24)}>{t}</p>)}

        <div className="home-aims">
          {AIMS.map(([Icon, h, t]) => (
            <div className="home-aim" key={h}>
              <h3 className="home-h"><Icon size={22} /> {h}</h3>
              <p className="home-copy">{t}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="shell home-section">
        <h2 className="home-h"><IconValues size={26} /> Our Core Values</h2>
        <p className="home-copy muted">
          These principles guide every decision we make and every interaction we have.
        </p>

        <div className="home-values">
          {VALUES.map(([h, t], i) => (
            <article className="home-value" key={h}>
              <span className="home-value-n">{String(i + 1).padStart(2, '0')}</span>
              <h3>{h}</h3>
              <p className="home-copy">{t}</p>
            </article>
          ))}
        </div>
      </section>

      {/* SiteFooter takes its horizontal inset from whatever contains it — on the
          signed-in pages that is Layout's .shell. Here it needs one, or the
          About column sits flush against the viewport edge while the lockup
          above it is inset. The rule stays full-bleed on the wrapper. */}
      <div className="home-footer">
        <div className="shell"><SiteFooter /></div>
      </div>
    </div>
  );
}
