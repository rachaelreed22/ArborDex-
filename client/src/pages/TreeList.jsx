import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMode } from "../context/ModeContext";
import { apiUrl } from "../utils/apiUrl";
import "./TreeList.css";

export default function TreeList() {
  const { mode } = useMode();
  const isStaff = mode === "dex";
  const navigate = useNavigate();

  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchListings();
  }, []);

  async function fetchListings() {
    try {
      const res = await fetch(apiUrl("/api/listings"));
      const data = await res.json();
      setListings(data || []);
    } catch (err) {
      console.error("Error fetching listings:", err);
    }
    setLoading(false);
  }

  const filtered = listings.filter((tree) => {
    const term = search.toLowerCase();
    return (
      tree.title?.toLowerCase().includes(term) ||
      tree.location?.toLowerCase().includes(term)
    );
  });

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this tree? This cannot be undone.")) return;
    try {
      await fetch(apiUrl(`/api/listings/${id}`), { method: "DELETE" });
      fetchListings();
    } catch (err) {
      console.error("Error deleting listing:", err);
    }
  };

  if (loading) return <div className="loading">Loading trees...</div>;

  return (
    <div className="page tree-list-page">
      {/* Top Bar */}
      <div className="tree-list-topbar">
        <input
          type="text"
          className="search-input"
          placeholder="Search trees by name or location..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="topbar-actions">
          {isStaff && (
            <>
              <button
                className="btn btn-secondary"
                onClick={() => navigate("/pending-photos")}
              >
                Pending Photos
              </button>

              <button
                className="btn btn-primary"
                onClick={() => navigate("/add")}
              >
                + Add Tree
              </button>
            </>
          )}

          <div className="mode-indicator">
            {isStaff ? "Staff Mode" : "Public Mode"}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="tree-grid">
        {filtered.length === 0 && (
          <div className="empty-list">
            <p>No trees match your search.</p>
          </div>
        )}

        {filtered.map((tree) => {
          const photos = tree.photos || [];
          const main = photos.find((p) => p.is_main) || photos[0] || null;
          const winner = photos.find((p) => p.winner);
          const hasQR = Boolean(tree.qr_url);

          return (
            <div
              key={tree.id}
              className="tree-card"
              onClick={() => navigate(`/listing/${tree.id}`)}
            >
              {/* Photo */}
              <div className="tree-card-photo-wrapper">
                {main ? (
                  <img
                    src={main.url}
                    alt={tree.title}
                    className="tree-card-photo"
                  />
                ) : (
                  <div className="tree-card-no-photo">🌿 No Photo</div>
                )}

                {winner && <div className="winner-tag">⭐ Winner</div>}

                {hasQR && (
                  <div className="qr-tag">
                    <span>📱</span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="tree-card-info">
                <h3 className="tree-card-title">{tree.title || "Untitled"}</h3>

                {tree.location && (
                  <p className="tree-card-location">📍 {tree.location}</p>
                )}

                <p className="tree-card-meta">
                  {photos.length} photo{photos.length !== 1 ? "s" : ""}
                </p>
              </div>

              {/* Staff actions */}
              {isStaff && (
                <div
                  className="tree-card-actions"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => navigate(`/listing/${tree.id}`)}
                  >
                    Edit
                  </button>

                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleDelete(tree.id)}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

