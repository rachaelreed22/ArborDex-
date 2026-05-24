import { useNavigate } from 'react-router-dom';
import './HomeownerTheme.css';
import './HomeownersEdition.css';

export default function HomeownersEdition() {
  const navigate = useNavigate();

  return (
    <main className="homeowners-page">
      <div className="homeowners-container">
        <div className="coming-soon-card">
          <h1>Homeowner's Edition</h1>
          <p className="coming-soon-text">Now Available</p>
          <p className="coming-soon-description">
            Personalized plant care guidance and profile tracking for your home, garden beds, and indoor rooms.
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
