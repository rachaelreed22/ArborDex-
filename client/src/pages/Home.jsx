import { useNavigate } from "react-router-dom";
import "./Home.css";
import arborTagLogo from "../assets/ArborTag-Logo.png";

export default function Home() {
  const navigate = useNavigate();

  const buyerSegments = [
    {
      title: "Neighborhood Garden Clubs",
      outcomes: "Simple tree stories and shared plant notes everyone can understand at a glance.",
    },
    {
      title: "Public Parks Teams",
      outcomes: "Friendly tree records that make it easier for staff and visitors to stay in sync.",
    },
    {
      title: "Schools & Campus Gardens",
      outcomes: "A hands-on way for students and teachers to learn care routines in the real world.",
    },
    {
      title: "Neighborhood Volunteers",
      outcomes: "Shared care check-ins, photos, and reminders so no tree gets forgotten.",
    },
    {
      title: "Visitors & Curious Neighbors",
      outcomes: "Scan, learn, and walk away with practical tips you can use at home that same day.",
    },
  ];

  return (
    <main className="home-page">
      <div className="home-background" aria-hidden="true" />
      <div className="home-overlay" aria-hidden="true" />

      <div className="home-container">
        <section className="hero-panel reveal">
          <p className="hero-kicker">ArborDex Platform • Powered by ArborTag</p>
          <h1 className="hero-title">Never Forget Your Garden Again.</h1>
          <p className="hero-subheading">
            ArborTag is your garden's memory. Meet Your Garden Companion: it learns from what you
            record and uses that memory to give personalized guidance, while Plant Diagnostics helps
            you care for individual plants.
          </p>

          <section className="why-arbortag" aria-label="Why ArborTag">
            <h2>Why not just use ChatGPT?</h2>
            <p>ChatGPT answers gardening questions. ArborTag remembers your garden history from what you record.</p>
            <ul>
              <li>✔ Your plant profiles</li>
              <li>✔ Your garden layout</li>
              <li>✔ Your photos</li>
              <li>✔ Your journals</li>
              <li>✔ Your reminders</li>
              <li>✔ Your gardening history</li>
            </ul>
            <p>The more you record, the more personalized your Garden Companion becomes.</p>
          </section>

          <div className="neighbor-moment" aria-label="Friendly plant care introduction">
            <img src={arborTagLogo} alt="ArborTag logo" className="neighbor-avatar" />
            <p>
              Hi, I am your friendly neighborhood plant-care guide. I can help you spot stress early,
              keep records tidy, and build confidence one healthy tree at a time.
            </p>
          </div>

          <div className="hero-ctas">
            <button className="home-btn home-btn-primary" onClick={() => navigate("/parks")}>View Public Tree Network</button>
            <button className="home-btn home-btn-secondary" onClick={() => navigate("/homeowners/demo-garden")}>Explore A Demo Digital Garden</button>
            <button className="home-btn home-btn-secondary" onClick={() => navigate("/homeowners/qr-tag-orders")}>QR Tag Orders</button>
            <button className="home-btn home-btn-secondary" onClick={() => navigate("/homeowners")}>Your Digital Garden: HomeOwner's Edition</button>
          </div>

          <div className="trust-strip" aria-label="ArborTag trust cues">
            <p>No complicated setup.</p>
            <p>Useful guidance grounded in your garden.</p>
            <p>Built for real gardens and real schedules.</p>
          </div>

          <div className="signal-grid">
            <article className="signal-card">
              <h2>Friendly Advice</h2>
              <p>Get practical next steps in plain language instead of technical overwhelm.</p>
            </article>
            <article className="signal-card">
              <h2>Local Stories</h2>
              <p>Each tree has a story, and your neighborhood can learn it together with one quick scan.</p>
            </article>
            <article className="signal-card">
              <h2>Confident Care</h2>
              <p>Save photos and notes over time so it is easier to notice what is improving or declining.</p>
            </article>
          </div>
        </section>

        <section className="capability-panel reveal reveal-delay-1">
          <header className="section-header">
            <p className="section-eyebrow">Homeowner Edition</p>
            <h2>A Memory That Grows With Your Garden</h2>
          </header>

          <div className="business-grid">
            <article className="business-card">
              <h3>🌿 Garden Companion</h3>
              <p>Whole-garden memory for planning, history, reminders, notes, layouts, and seasonal questions.</p>
            </article>
            <article className="business-card">
              <h3>🌱 Plant Diagnostics</h3>
              <p>Plant-by-plant diagnostics for pests, disease, nutrient issues, and species-specific care.</p>
            </article>
            <article className="business-card">
              <h3>Memory That Grows With You</h3>
              <p>Every profile, journal entry, and photo builds long-term context your Garden Companion can use later.</p>
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
            <p className="section-eyebrow">What New Users Notice First</p>
            <h2>Small Wins In Week One</h2>
          </header>

          <div className="quick-win-grid">
            <article className="quick-win-card">
              <h3>Day 1</h3>
              <p>Scan a plant, ask a question, and get clear next steps without guessing.</p>
            </article>
            <article className="quick-win-card">
              <h3>Day 3</h3>
              <p>Save photos and notes so you can compare changes and spot progress faster.</p>
            </article>
            <article className="quick-win-card">
              <h3>Day 7</h3>
              <p>Feel more confident because your care routine is finally organized and consistent.</p>
            </article>
          </div>
        </section>

        <section className="capability-panel reveal reveal-delay-1">
          <header className="section-header">
            <p className="section-eyebrow">Who It Serves</p>
            <h2>Made For Real People Who Care About Trees</h2>
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
            <p className="section-eyebrow">How ArborTag Helps</p>
            <h2>Simple Tools, Neighborly Guidance, Healthier Trees</h2>
          </header>

          <div className="business-grid">
            <article className="business-card">
              <h3>Clear Care Routines</h3>
              <p>Know what to do next for watering, watching stress signals, and seasonal check-ins.</p>
            </article>
            <article className="business-card">
              <h3>Scan-And-Learn Signs</h3>
              <p>QR tags make learning feel easy for visitors, volunteers, homeowners, and staff alike.</p>
            </article>
            <article className="business-card">
              <h3>Progress You Can See</h3>
              <p>Track photos and notes over time so your team can celebrate wins and catch issues early.</p>
            </article>
          </div>

          <div className="action-lanes">
            <button className="home-btn home-btn-accent" onClick={() => navigate("/staff/login")}>Staff & Partner Access</button>
            <button className="home-btn home-btn-tertiary" onClick={() => navigate("/scan")}>Scan A Tree</button>
            <button className="home-btn home-btn-tertiary" onClick={() => navigate("/ask-arborai")}>Ask ArborAI</button>
            <button className="home-btn home-btn-tertiary" onClick={() => navigate("/homeowners/login")}>Homeowner Login</button>
          </div>

          <p className="trust-note">
            The memory behind every garden.
          </p>
        </section>
      </div>
    </main>
  );
}
