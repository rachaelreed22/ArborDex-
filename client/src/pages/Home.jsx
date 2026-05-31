import { useNavigate } from "react-router-dom";
import "./Home.css";

export default function Home() {
  const navigate = useNavigate();

  const buyerSegments = [
    {
      title: "Municipalities",
      outcomes: "Urban forestry inventory, storm response tracking, and transparent public records.",
    },
    {
      title: "Botanical Gardens & Arboretums",
      outcomes: "Interactive visitor journeys, education overlays, and donor-ready exhibits.",
    },
    {
      title: "Schools & Universities",
      outcomes: "Field-based learning, sustainability programs, and environmental science projects.",
    },
    {
      title: "Conservation Organizations",
      outcomes: "Habitat documentation, longitudinal health records, and community participation.",
    },
    {
      title: "Parks & Tourism",
      outcomes: "Interactive trail experiences, self-guided learning, and engagement analytics.",
    },
  ];

  return (
    <main className="home-page">
      <div className="home-background" aria-hidden="true" />
      <div className="home-overlay" aria-hidden="true" />

      <div className="home-container">
        <section className="hero-panel reveal">
          <p className="hero-kicker">ArborDex Platform • Powered by ArborTag</p>
          <h1 className="hero-title">Turn Every Tree Into a Story, a Record, and a Resource</h1>
          <p className="hero-subheading">
            ArborTag uses QR codes to help park visitors learn about local trees while giving staff
            a simple way to build useful tree records over time.
          </p>

          <div className="anchor-moment" aria-label="ArborDex brand anchor">
            <div className="anchor-core">ArborTag</div>
            <p>
              QR-linked field records, diagnostics telemetry, and longitudinal ecosystem intelligence in one
              operational graph.
            </p>
          </div>

          <div className="hero-ctas">
            <button className="home-btn home-btn-primary" onClick={() => navigate("/parks")}>View Public Tree Network</button>
            <button className="home-btn home-btn-secondary" onClick={() => navigate("/homeowners")}>Your Digital Garden: HomeOwner's Edition</button>
          </div>

          <div className="signal-grid">
            <article className="signal-card">
              <h2>For Operations</h2>
              <p>Reduce manual tracking work, standardize records, and improve maintenance decisions.</p>
            </article>
            <article className="signal-card">
              <h2>For Communities</h2>
              <p>Connect citizens, students, and visitors directly to the living landscape around them.</p>
            </article>
            <article className="signal-card">
              <h2>For Reporting</h2>
              <p>Build longitudinal data for grants, sustainability targets, and conservation outcomes.</p>
            </article>
          </div>
        </section>

        <section className="capability-panel reveal reveal-delay-1">
          <header className="section-header">
            <p className="section-eyebrow">Homeowner Edition</p>
            <h2>Technical Plant Intelligence For Personal Ecosystems</h2>
          </header>

          <div className="business-grid">
            <article className="business-card">
              <h3>Persistent Plant IDs</h3>
              <p>Maintain longitudinal records with image timelines, profile limits by tier, and profile-level metadata.</p>
            </article>
            <article className="business-card">
              <h3>AI Diagnostics Layer</h3>
              <p>Run structured diagnostics with hazard signal extraction, confidence markers, and actionable care output.</p>
            </article>
            <article className="business-card">
              <h3>Tiered Capacity Controls</h3>
              <p>Free, Gardener, and Estate plans with active profile enforcement and upgrade-ready billing pathways.</p>
            </article>
          </div>

          <div className="action-lanes action-lanes-three">
            <button className="home-btn home-btn-tertiary" onClick={() => navigate("/homeowners/login")}>Homeowner Login</button>
            <button className="home-btn home-btn-tertiary" onClick={() => navigate("/homeowners/signup")}>Create Homeowner Account</button>
            <button className="home-btn home-btn-tertiary" onClick={() => navigate("/homeowners/reset-password-request")}>Reset Homeowner Password</button>
          </div>
        </section>

        <section className="capability-panel reveal reveal-delay-1">
          <header className="section-header">
            <p className="section-eyebrow">Who It Serves</p>
            <h2>Built For Institutions That Manage Public Green Assets</h2>
          </header>

          <div className="buyers-grid">
            {buyerSegments.map((segment) => (
              <article key={segment.title} className="buyer-card">
                <h3>{segment.title}</h3>
                <p>{segment.outcomes}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="capability-panel reveal reveal-delay-2">
          <header className="section-header">
            <p className="section-eyebrow">Platform Model</p>
            <h2>One Ecosystem, Multiple Revenue Paths</h2>
          </header>

          <div className="business-grid">
            <article className="business-card">
              <h3>SaaS & Dashboard Access</h3>
              <p>Subscription access for municipal, campus, and conservation operations teams.</p>
            </article>
            <article className="business-card">
              <h3>QR + Deployment Services</h3>
              <p>ArborTag hardware layer, onboarding, and implementation support for partner sites.</p>
            </article>
            <article className="business-card">
              <h3>Data & Intelligence Layer</h3>
              <p>Long-term ecosystem analytics supporting grants, planning, and policy reporting.</p>
            </article>
          </div>

          <div className="action-lanes">
            <button className="home-btn home-btn-accent" onClick={() => navigate("/staff/login")}>Staff & Partner Access</button>
            <button className="home-btn home-btn-tertiary" onClick={() => navigate("/scan")}>Scan A Tree</button>
            <button className="home-btn home-btn-tertiary" onClick={() => navigate("/ask-arborai")}>Ask ArborAI</button>
            <button className="home-btn home-btn-tertiary" onClick={() => navigate("/homeowners/login")}>Homeowner Login</button>
          </div>

          <p className="trust-note">
            Pilot-ready for cities, schools, parks, and gardens. Request partnership onboarding to launch your first site.
          </p>
        </section>
      </div>
    </main>
  );
}
