import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMode } from "../context/ModeContext";
import { apiUrl } from "../utils/apiUrl";
import "./Home.css";

export default function Home() {
  const navigate = useNavigate();
  const { mode, toggleMode } = useMode();
  const isStaff = mode === "dex";
  const [stats, setStats] = useState({
    trees: 0,
    photos: 0,
    pendingPhotos: 0,
    winnerPhotos: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  const openArborDex = () => {
    if (!isStaff) {
      toggleMode();
    }
    navigate("/database");
  };

  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      try {
        const response = await fetch(apiUrl("/api/listings"), {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });

        const data = await response.json().catch(() => []);
        const listings = Array.isArray(data) ? data : [];

        let photos = 0;
        let pendingPhotos = 0;
        let winnerPhotos = 0;

        listings.forEach((listing) => {
          const treePhotos = Array.isArray(listing?.photos) ? listing.photos : [];
          photos += treePhotos.length;
          pendingPhotos += treePhotos.filter((photo) => photo?.staff_uploaded === false).length;
          winnerPhotos += treePhotos.filter((photo) => photo?.winner).length;
        });

        if (!cancelled) {
          setStats({
            trees: listings.length,
            photos,
            pendingPhotos,
            winnerPhotos,
          });
        }
      } catch {
        if (!cancelled) {
          setStats({
            trees: 0,
            photos: 0,
            pendingPhotos: 0,
            winnerPhotos: 0,
          });
        }
      } finally {
        if (!cancelled) {
          setStatsLoading(false);
        }
      }
    };

    loadStats();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page home-page">
      <section className="home-hero card">
        <p className="home-eyebrow">Welcome to ArborTag</p>
        <h1 className="home-title">Tree Care, Organized For Real Places</h1>
        <p className="home-subtitle">
          ArborTag is a tree and plant database that helps parks and landowners track,
          identify, and care for trees on their land.
        </p>

        <div className="home-actions">
          <button className="btn btn-primary" onClick={() => navigate("/scan")}>
            Scan a Tree
          </button>
          <button className="btn btn-secondary" onClick={() => navigate("/database")}>
            View Database
          </button>
          <button className="btn btn-secondary" onClick={() => navigate("/ask-arborai")}>
            Ask ArborAI
          </button>
          <button className="btn btn-secondary" onClick={openArborDex}>
            {isStaff ? "Open ArborDex" : "Sign In to ArborDex"}
          </button>
        </div>

        <div className="home-stats" aria-label="Quick stats">
          <article className="home-stat-card">
            <p className="home-stat-label">Trees</p>
            <p className="home-stat-value">{statsLoading ? "..." : stats.trees}</p>
          </article>
          <article className="home-stat-card">
            <p className="home-stat-label">Photos</p>
            <p className="home-stat-value">{statsLoading ? "..." : stats.photos}</p>
          </article>
          <article className="home-stat-card">
            <p className="home-stat-label">Pending</p>
            <p className="home-stat-value">{statsLoading ? "..." : stats.pendingPhotos}</p>
          </article>
          <article className="home-stat-card">
            <p className="home-stat-label">Winners</p>
            <p className="home-stat-value">{statsLoading ? "..." : stats.winnerPhotos}</p>
          </article>
        </div>
      </section>
    </main>
  );
}
