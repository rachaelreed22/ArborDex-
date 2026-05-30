import { Link } from 'react-router-dom';
import './InformationalPage.css';

export default function AboutArborTag() {
  return (
    <main className="info-page">
      <div className="info-shell">
        <section className="info-hero">
          <p className="info-kicker">About</p>
          <h1>About ArborTag / RR Tech</h1>
          <p className="info-lead">
            ArborTag is a product of RR Tech focused on making living landscapes easier to document, understand, and manage across public and private environments.
          </p>
        </section>

        <div className="info-grid">
          <section className="info-card">
            <h2>What ArborTag does</h2>
            <p>
              ArborTag connects QR identity, field records, photo documentation, and support workflows so trees and plants can be tracked over time instead of treated like disconnected notes.
            </p>
          </section>

          <section className="info-card">
            <h2>What RR Tech builds</h2>
            <p>
              RR Tech builds practical digital infrastructure for organizations and property owners who need trustworthy systems, clear records, and modern tools around environmental assets.
            </p>
          </section>
        </div>

        <section className="info-card info-highlight">
          <h3>Interested in working with ArborTag?</h3>
          <p>
            Visit <Link className="info-inline-link" to="/for-parks-cities">For Parks & Cities</Link> or reach out through <Link className="info-inline-link" to="/contact?subject=Partnership%20Inquiry">Contact Support</Link>.
          </p>
        </section>
      </div>
    </main>
  );
}