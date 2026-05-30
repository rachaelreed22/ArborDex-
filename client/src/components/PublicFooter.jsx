import { Link } from 'react-router-dom';
import './PublicFooter.css';

const sections = [
  {
    title: 'ArborTag',
    links: [
      { to: '/', label: 'Home' },
      { to: '/scan', label: 'Scan a Tree' },
      { to: '/for-parks-cities', label: 'For Parks & Cities' },
      { to: '/homeowners', label: 'Homeowners Edition' },
    ],
  },
  {
    title: 'Support',
    links: [
      { to: '/contact', label: 'Contact Support' },
      { to: '/help', label: 'Help / FAQ' },
      { to: '/contact?subject=Issue%20Report', label: 'Report an Issue' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { to: '/privacy', label: 'Privacy Policy' },
      { to: '/terms', label: 'Terms & Conditions' },
      { to: '/photo-submission-policy', label: 'Photo Submission Policy' },
    ],
  },
  {
    title: 'Product',
    links: [
      { to: '/parks', label: 'Scan Trees' },
      { to: '/about', label: 'About ArborTag / RR Tech' },
    ],
  },
];

export default function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="public-footer__shell">
        <div className="public-footer__brand">
          <p className="public-footer__eyebrow">ArborTag</p>
          <h2>Trust-first infrastructure for trees, parks, and homeowners.</h2>
          <p>
            Public tree discovery, homeowner plant records, QR-linked documentation, and operational support from RR Tech.
          </p>
        </div>

        <div className="public-footer__grid">
          {sections.map((section) => (
            <section key={section.title} className="public-footer__section" aria-label={section.title}>
              <h3>{section.title}</h3>
              <div className="public-footer__links">
                {section.links.map((link) => (
                  <Link key={link.to + link.label} to={link.to}>{link.label}</Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className="public-footer__bottom">
        <p>© 2026 RR Tech. ArborTag is a product of RR Tech.</p>
      </div>
    </footer>
  );
}