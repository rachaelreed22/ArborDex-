import { useNavigate } from 'react-router-dom';
import { landscaperDemoClients } from './landscaperDemoData';
import './LandscaperDemo.css';

const demoHighlights = [
  {
    title: 'Client & property dashboard',
    details: 'Keep a single view of each client’s trees, planting zones, and maintenance calendar.',
  },
  {
    title: 'Tree and plant action items',
    details: 'Plan pruning, pest checks, and planting recommendations with easy status updates.',
  },
  {
    title: 'ArborAI insight preview',
    details: 'Mock diagnostics and condition summaries help explain value to clients without live uploads.',
  },
  {
    title: 'Separate landscaper workflow',
    details: 'This demo is intentionally distinct from the public park demo and homeowner garden experience.',
  },
];

export default function LandscaperDemo() {
  const navigate = useNavigate();

  return (
    <main className="page landscaper-demo-page">
      <section className="landscaper-hero-card">
        <p className="landscaper-kicker">New Demo</p>
        <h1>Landscaper Demo</h1>
        <p className="landscaper-intro">
          Explore a landscaping company workflow designed for client portfolio management, property care planning, and tree health visibility.
        </p>
        <div className="landscaper-hero-actions">
          <button className="btn btn-primary" onClick={() => navigate('/parks')}>
            Back to Demo Selection
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/ask-arborai')}>
            Ask ArborAI
          </button>
        </div>
      </section>

      <section className="landscaper-client-section">
        <h2>Client roster</h2>
        <div className="landscaper-client-grid">
          {landscaperDemoClients.map((client) => (
            <button
              key={client.slug}
              type="button"
              className="landscaper-client-card client-card-button"
              onClick={() => navigate(`/landscaper-demo/client/${client.slug}`)}
            >
              <img src={client.image} alt={client.title} className="client-card-image" />
              <div className="client-card-content">
                <h3>{client.title}</h3>
                <p>{client.summary}</p>
                <span>{client.tag}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="landscaper-overview-grid">
        <div className="landscaper-summary-card">
          <h2>How the workspace supports daily work</h2>
          <p>
            The landscaper experience is about managing multiple clients, tracking plant conditions across properties, and quickly sharing insights with decision-makers.
          </p>
        </div>

        {demoHighlights.map((highlight) => (
          <article key={highlight.title} className="landscaper-feature-card">
            <h3>{highlight.title}</h3>
            <p>{highlight.details}</p>
          </article>
        ))}
      </section>

      <section className="landscaper-investor-section">
        <div className="landscaper-summary-card">
          <h2>Investor-ready story</h2>
          <p>
            ArborTag gives landscapers a practical operating system for service planning, recurring client value, and a professional experience that scales with the business.
          </p>
        </div>
        <div className="investor-grid">
          <div className="investor-card">
            <h3>Recurring revenue visibility</h3>
            <p>Demonstrate how client portfolios and maintenance plans drive predictable service value.</p>
          </div>
          <div className="investor-card">
            <h3>Clear service differentiation</h3>
            <p>Highlight a workflow that connects plant health, work orders, and client-facing recommendations.</p>
          </div>
          <div className="investor-card">
            <h3>Portfolio-level insight</h3>
            <p>Present a unified view of multiple properties, risk factors, and opportunity areas at a glance.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
