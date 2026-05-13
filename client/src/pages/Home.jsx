import { useNavigate } from "react-router-dom";
import { useMode } from "../context/ModeContext";
import "./Home.css";

export default function Home() {
  const navigate = useNavigate();
  const { mode, toggleMode } = useMode();
  const isStaff = mode === "dex";

  const openStaffTools = () => {
    if (!isStaff) {
      toggleMode();
    }
    navigate("/database");
  };

  return (
    <main className="home-page">
      <section className="home-hero" role="img" aria-label="Forest path in autumn">
        <div className="home-hero-overlay">
          <h1 className="home-hero-title">Welcome to ArborTag</h1>
        </div>
      </section>

      <section className="home-content">
        <p className="home-subheading">Scan a tree and get to know its story.</p>

        <section className="home-action-card" aria-label="Quick actions">
          <h2 className="home-card-title">Start With a Simple Action</h2>
          <p className="home-card-subtitle">Choose what you want to do.</p>

          <div className="home-actions">
            <button className="btn btn-primary" onClick={() => navigate("/scan")}>
              Scan a Tree
            </button>
            <button className="btn btn-secondary" onClick={() => navigate("/ask-arborai")}>
              Ask ArborAI
            </button>
            <button className="btn btn-secondary" onClick={() => navigate("/database")}>
              View Tree Database
            </button>
            <button className="btn btn-secondary" onClick={openStaffTools}>
              Staff Tools
            </button>
            {isStaff && (
              <button className="btn btn-secondary" onClick={() => navigate("/park-report")}>
                Pilot Report
              </button>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
