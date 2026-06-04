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
          <p className="coming-soon-description">
            Create private plant profiles for your houseplants, garden plants, flowers, shrubs, and backyard trees. Add photos, notes, updates, and use ArborAI for plant guidance.
          </p>
          <p className="coming-soon-description">
            ArborTag Homeowner Edition is currently in early access. Early users are helping shape the app by sharing honest feedback about setup, plant profiles, photo uploads, and ArborAI guidance.
          </p>
          <p className="coming-soon-description">
            Early Access Feedback Offer: Get 50% off your first month in exchange for honest feedback. Coupon expires June 15. Message me for the code.
          </p>
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
