import { useNavigate } from "react-router-dom";
import "./Home.css";

export default function Home() {
  const navigate = useNavigate();

  return (
    <main className="home-page">
      <div className="home-background">
        <div className="home-overlay"></div>
        
        <div className="home-container">
          <div className="home-content-box">
            <h1 className="home-title">Welcome to ArborTag</h1>
            <p className="home-subheading">Choose your path</p>

            {/* Visit Your Park - Section 1 */}
            <section className="home-section">
              <h2 className="section-title">🌳 Visit Your Park</h2>
              <button 
                className="btn btn-park"
                onClick={() => navigate("/parks")}
                aria-label="Visit Your Park"
              >
                View Tree Database
              </button>
            </section>

            {/* Ask ArborAI and Scan A Tree - Horizontal */}
            <section className="home-section home-section-duo">
              <button 
                className="btn btn-arborai"
                onClick={() => navigate("/ask-arborai")}
                aria-label="Ask ArborAI"
              >
                🤖 Ask ArborAI
              </button>
              <button 
                className="btn btn-scan"
                onClick={() => navigate("/scan")}
                aria-label="Scan a Tree"
              >
                📱 Scan A Tree
              </button>
            </section>

            {/* Admin Dashboard - Section 2 */}
            <section className="home-section">
              <h2 className="section-title">⚙️ Admin Dashboard</h2>
              <button 
                className="btn btn-admin"
                onClick={() => navigate("/staff/login")}
                aria-label="Admin Dashboard"
              >
                Staff Access
              </button>
            </section>

            {/* Homeowner's Edition - Section 3 */}
            <section className="home-section">
              <h2 className="section-title">🏡 Homeowner's Edition</h2>
              <button 
                className="btn btn-homeowner"
                onClick={() => navigate("/homeowners/login")}
                aria-label="Homeowner's Edition"
              >
                Enter Homeowner Edition
              </button>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
