import { useNavigate, useParams } from 'react-router-dom';
import { landscaperDemoClients } from './landscaperDemoData';
import './LandscaperDemo.css';
import './LandscaperClientPage.css';

export default function LandscapeClientPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const client = landscaperDemoClients.find((entry) => entry.slug === slug);

  if (!client) {
    return (
      <main className="page landscaper-demo-page">
        <section className="landscaper-hero-card">
          <p className="landscaper-kicker">Client not found</p>
          <h1>That client profile is not available in this demo.</h1>
          <button className="btn btn-primary" onClick={() => navigate('/landscaper-demo')}>
            Back to landscape demo
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page landscaper-demo-page">
      <section className="landscaper-detail-shell">
        <section className="landscaper-hero-card client-detail-hero">
          <div className="client-detail-copy">
            <p className="landscaper-kicker">Client profile</p>
            <h1>{client.title}</h1>
            <p className="landscaper-intro">{client.longDescription}</p>
            <div className="landscaper-hero-actions">
              <button className="btn btn-primary" onClick={() => navigate('/landscaper-demo')}>
                Back to demo
              </button>
              <button className="btn btn-secondary" onClick={() => navigate('/ask-arborai')}>
                Ask ArborAI
              </button>
            </div>
            <div className="client-quick-stats">
              <div className="stat-card">
                <span className="stat-label">Service cadence</span>
                <strong>{client.serviceCadence}</strong>
              </div>
              <div className="stat-card">
                <span className="stat-label">Last visit</span>
                <strong>{client.lastVisit}</strong>
              </div>
              <div className="stat-card">
                <span className="stat-label">Current priority</span>
                <strong>{client.currentPriority}</strong>
              </div>
            </div>
          </div>
          <div className="client-detail-visual">
            <img src={client.image} alt={client.title} className="client-detail-image" />
            <div className="hero-note-card">
              <h3>Property snapshot</h3>
              <p>{client.propertyAddress}</p>
              <span className="client-pill">{client.tag}</span>
            </div>
          </div>
        </section>

        <section className="landscape-section-card">
          <div className="section-heading">
            <p className="section-eyebrow">Property record</p>
            <h2>Property overview</h2>
          </div>
          <div className="property-record-grid">
            <article className="detail-card detail-card-large">
              <h3>At a glance</h3>
              <p>{client.summary}</p>
              <div className="meta-row">
                <span className="client-pill">{client.tag}</span>
                <span className="status-pill">Active service plan</span>
              </div>
            </article>
            <article className="detail-card detail-card-compact">
              <h3>Key details</h3>
              <ul className="detail-list">
                <li>
                  <span>Property</span>
                  <strong>{client.propertyAddress}</strong>
                </li>
                <li>
                  <span>Service cadence</span>
                  <strong>{client.serviceCadence}</strong>
                </li>
                <li>
                  <span>Last visit</span>
                  <strong>{client.lastVisit}</strong>
                </li>
              </ul>
            </article>
          </div>
        </section>

        <section className="landscape-section-card">
          <div className="section-heading">
            <p className="section-eyebrow">Service flow</p>
            <h2>Request services</h2>
          </div>
          <div className="service-request-grid">
            {client.serviceRequests.map((request) => (
              <article key={request.title} className="detail-card">
                <h3>{request.title}</h3>
                <p>{request.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landscape-section-card">
          <div className="section-heading">
            <p className="section-eyebrow">Inventory</p>
            <h2>Managed areas and care notes</h2>
          </div>
          <div className="inventory-card-grid">
            {client.sections.map((section) => (
              <article key={section.title} className="detail-card">
                <h3>{section.title}</h3>
                <ul className="landscaper-item-list">
                  {section.items.map((item) => (
                    <li key={item.name}>
                      <strong>{item.name}</strong>
                      <span>{item.status}</span>
                      <p>{item.detail}</p>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="landscape-section-card">
          <div className="section-heading">
            <p className="section-eyebrow">ArborAI insights</p>
            <h2>Recommended next steps</h2>
          </div>
          <div className="next-step-grid">
            {client.nextSteps.map((step) => (
              <article key={step} className="detail-card">
                <h3>{step}</h3>
              </article>
            ))}
          </div>
          <div className="focus-area-row">
            <h3>Focus areas</h3>
            <ul className="focus-list">
              {client.focusAreas.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>
      </section>
    </main>
  );
}
