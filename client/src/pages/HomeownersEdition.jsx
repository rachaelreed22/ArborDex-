import { useNavigate } from 'react-router-dom';
import './HomeownerTheme.css';
import './HomeownersEdition.css';

export default function HomeownersEdition() {
  const navigate = useNavigate();

  return (
    <main className="homeowners-page">
      <div className="homeowners-container">
        <div className="coming-soon-card">
          <button
            className="homeowners-demo-cta"
            onClick={() => navigate('/homeowners/demo-garden')}
          >
            Explore a Demo Digital Garden
          </button>
          <h1>Homeowner's Edition</h1>
          <p className="coming-soon-text">Never Forget Your Garden Again.</p>
          <p className="coming-soon-description">
            ArborTag is your garden's memory.
          </p>
          <p className="coming-soon-description">
            Meet Your Garden Companion.
          </p>
          <p className="coming-soon-description">
            ArborTag helps you build a living memory of your garden, and Garden Companion personalizes guidance from what you record over time.
          </p>
          <div className="homeowners-why-block" role="region" aria-label="Why ArborTag">
            <p className="homeowners-why-title">Why not just use ChatGPT?</p>
            <p className="coming-soon-description">ChatGPT answers gardening questions. ArborTag remembers your garden history from what you record.</p>
            <ul className="homeowners-why-list">
              <li>✔ Your plant profiles</li>
              <li>✔ Your garden layout</li>
              <li>✔ Your photos</li>
              <li>✔ Your journals</li>
              <li>✔ Your reminders</li>
              <li>✔ Your gardening history</li>
            </ul>
          </div>
          <p className="coming-soon-description">
            Garden Companion learns from your plant profiles, journals, photos, reminders, layout, and notes so answers reflect your own garden, not just general advice.
          </p>
          <p className="coming-soon-description">
            Use Plant Diagnostics for one-plant analysis (pests, disease, deficiencies, and species-specific care), and use Garden Companion for whole-garden planning and memory.
          </p>
          <p className="coming-soon-description">
            The more you record, the more personalized your Garden Companion becomes.
          </p>
          <p className="coming-soon-description">The memory behind every garden.</p>
          <p className="coming-soon-description">Your plant profiles are private to your account.</p>
          <p className="coming-soon-description">
            ArborAI provides educational plant guidance and does not replace professional arborist, medical, legal, or chemical-treatment advice.
          </p>
          <div className="homeowners-feature-strip">
            <div className="homeowners-feature-pill">Plant IDs</div>
            <div className="homeowners-feature-pill">Diagnostics</div>
            <div className="homeowners-feature-pill">Ask ArborAI</div>
          </div>
          <div className="homeowners-actions">
            <button className="btn btn-primary" onClick={() => navigate('/homeowners/signup')}>
              Sign Up
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/homeowners/login')}>
              Login
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/homeowners/ask-arborai')}>
              Ask ArborAI
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
