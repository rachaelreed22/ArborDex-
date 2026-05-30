import { Link } from 'react-router-dom';
import './InformationalPage.css';

export default function PhotoSubmissionPolicy() {
  return (
    <main className="info-page">
      <div className="info-shell">
        <section className="info-hero">
          <p className="info-kicker">Legal</p>
          <h1>Photo Submission Policy</h1>
          <p className="info-lead">
            ArborTag accepts community, homeowner, and documentation photos to help identify trees, preserve records,
            support seasonal challenges, and review issues. This policy sets the rules for what can be uploaded.
          </p>
        </section>

        <section className="info-card">
          <h2>Submission rules</h2>
          <ul>
            <li>Uploaded photos may be reviewed before they appear publicly in ArborTag.</li>
            <li>Only upload photos you took yourself or have permission to share.</li>
            <li>Avoid uploading faces, license plates, addresses, home interiors, or other private property details.</li>
            <li>ArborTag and RR Tech may remove photos that are inappropriate, misleading, unsafe, or unrelated.</li>
            <li>Submitted photos may be used inside the app for tree documentation, public display, challenge entries, or support review.</li>
          </ul>
        </section>

        <div className="info-grid">
          <section className="info-card">
            <h2>What to upload</h2>
            <ul>
              <li>Clear images of the tree, plant, bark, canopy, leaves, flowers, or fruit.</li>
              <li>Photos that help document seasonal changes, health, hazards, or site conditions.</li>
              <li>Only content relevant to plant, tree, landscape, or ArborTag support activity.</li>
            </ul>
          </section>

          <section className="info-card">
            <h2>What not to upload</h2>
            <ul>
              <li>Photos that infringe someone else’s copyright or privacy.</li>
              <li>Graphic, abusive, unsafe, or intentionally misleading content.</li>
              <li>Files that are not legitimate images or that attempt to misuse the upload system.</li>
            </ul>
          </section>
        </div>

        <section className="info-card info-highlight">
          <h3>Need help with a photo issue?</h3>
          <p>
            Use the <Link className="info-inline-link" to="/contact?subject=Issue%20Report">report an issue form</Link> if you need a photo reviewed or removed.
          </p>
        </section>
      </div>
    </main>
  );
}