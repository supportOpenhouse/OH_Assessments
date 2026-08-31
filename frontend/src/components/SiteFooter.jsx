import { IconFacebook, IconInstagram, IconLinkedIn, IconYouTube } from './icons.jsx';

// Openhouse's public-site footer. Copy, links, socials and illustration are
// taken from openhouse.in verbatim.
//
// The illustration is served from our own /public rather than hotlinked off
// their CDN — a third-party asset URL is a thing that silently 404s one day.

const LINKS = [
  ['About Us', 'https://openhouse.in/about/'],
  ['Contact Us', 'https://openhouse.in/contact/'],
  ['Terms & Conditions', 'https://openhouse.in/terms/'],
  ['Privacy Policy', 'https://openhouse.in/privacy-policy/'],
];

const SOCIAL = [
  ['Facebook', 'https://www.facebook.com/people/Openhouse/61568972962066/', IconFacebook],
  ['Instagram', 'https://www.instagram.com/openhouse_in/', IconInstagram],
  ['LinkedIn', 'https://www.linkedin.com/company/openhouse-ind', IconLinkedIn],
  ['YouTube', 'https://www.youtube.com/@OpenHouse_at', IconYouTube],
];

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-grid">
        <div className="site-footer-about">
          <img className="brand-lockup brand-lockup-light" src="/OH_logo_font.png"
               alt="Openhouse" width="640" height="128" />
          <img className="brand-lockup brand-lockup-dark" src="/OH_logo_font_white.png"
               alt="Openhouse" width="640" height="128" />
          <p className="site-footer-copy">
            Openhouse is transforming residential resale transactions by making
            them transparent, hassle-free, and ensuring the best price. We offer
            complete transaction support, including legal documentation and
            property registration, ensuring a seamless experience from start to
            finish.
          </p>
        </div>

        <nav className="site-footer-links" aria-label="Openhouse">
          <ul className="site-footer-nav">
            {LINKS.map(([label, href]) => (
              <li key={href}>
                <a href={href} target="_blank" rel="noopener noreferrer">{label}</a>
              </li>
            ))}
          </ul>

          <h3 className="site-footer-social-head">Social</h3>
          <ul className="site-footer-social">
            {SOCIAL.map(([label, href, Icon]) => (
              <li key={href}>
                <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
                  <Icon />
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <img
          className="site-footer-art"
          src="/footer-illustration.png"
          alt=""
          aria-hidden="true"
          width="311"
          height="207"
          loading="lazy"
        />
      </div>

      <div className="site-footer-legal">
        © 2025 &quot;Openhouse&quot; by Avano Technologies Private Limited. All rights reserved.
      </div>
    </footer>
  );
}
