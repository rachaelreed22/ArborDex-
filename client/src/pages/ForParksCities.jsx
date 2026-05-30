import { Link } from 'react-router-dom';
import './InformationalPage.css';

export default function ForParksCities() {
  return (
    <main className="info-page">
      <div className="info-shell">
        <section className="info-hero">
          <p className="info-kicker">Product / Business</p>
          <h1>For Parks & Cities</h1>
          <p className="info-lead">
            ArborTag gives municipalities, parks departments, schools, gardens, and pilot partners a cleaner way to manage tree records,
            public education, and on-the-ground visibility.
          </p>
          <div className="info-actions">
            <Link className="btn btn-primary" to="/contact?subject=Partnership%20Inquiry">Request partnership onboarding</Link>
            <Link className="btn btn-secondary" to="/parks">View public tree network</Link>
          </div>
        </section>

        <div className="info-grid">
          <section className="info-card">
            <h2>Operational value</h2>
            <ul>
              <li>Standardized tree records and public-facing QR identity</li>
              <li>Photo-backed documentation for maintenance and review</li>
              <li>Stronger continuity across staff, seasons, and sites</li>
            </ul>
          </section>

          <section className="info-card">
            <h2>Public value</h2>
            <ul>
              <li>Tree discovery for residents, visitors, and students</li>
              <li>Cleaner public information around species and site context</li>
              <li>Better support for engagement, grants, and reporting</li>
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}