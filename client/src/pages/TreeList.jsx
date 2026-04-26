 import { useEffect, useState } from "react";
import { useMode } from "../context/ModeContext";
import { useNavigate } from "react-router-dom";
import "./TreeList.css";

export default function TreeList() {
  const { mode } = useMode();
  const navigate = useNavigate();
  const [listings, setListings] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const isStaff = mode === "dex";
  const brandName = isStaff ? "ArborDex" : "ArborTag";

  useEffect(() => {
    fetchListings();
  }, []);

  async function fetchListings() {
    try {
      const res = await fetch("/api/listings");
      const data = await res.json();
      setListings(data || []);
    } catch (err) {
      console.error("Error fetching listings:", err);
    }
    setLoading(false);
  }

  // Staff only: delete a tree
  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this tree?")) return;
    try {
      await fetch(`/api/listings/${id}`, { method: "DELETE" });
      setListings((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      console.error("Error deleting listing:", err);
    }
  };

  // Filter by search
  const filtered = listings.filter((l) => {
    const q = search.toLowerCase();
    return (
      l.title?.toLowerCase().includes(q) ||
      l.description?.toLowerCase().includes(q) ||
      l.location?.toLowerCase().includes(q)
    );
  });

  if (loading) return <div className="loading">Loading trees...</div>;

  return (
    <div className="page tree-list-page">
      <h1 className="page-title">{brandName} — Tree Database</h1>
      <p className="page-subtitle">
        {isStaff
          ? "Manage your tree and plant inventory"
          : "Browse tagged trees and plants"}
      </p>

      {/* Toolbar: Search + Add */}
      <div className="tree-list-toolbar">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search trees by name, description, or location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {isStaff && (
          <button
            className="btn btn-primary"
            onClick={() => navigate("/add")}
          >
            + Add Tree
          </button>
        )}
      </div>

      {/* Tree Cards */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="icon">🌳</div>
          <p>{search ? "No trees match your search." : "No trees found."}</p>
        </div>
      ) : (
        <div className="tree-grid">
          {filtered.map((listing) => {
            const mainPhoto =
              listing.photos?.find((p) => p.is_main) ||
              listing.photos?.[0] ||
              null;

            return (
              <div
                key={listing.id}
                className="tree-card"
                onClick={() => navigate(`/listing/${listing.id}`)}
              >
                {/* Photo */}
                {mainPhoto ? (
                  <img
                    src={mainPhoto.url}
                    alt={listing.title}
                    className="tree-card-photo"
                  />
                ) : (
                  <div className="tree-card-placeholder">
                    <span>🌿</span>
                    <p>No photo yet</p>
                  </div>
                )}

                {/* Info */}
                <h3>{listing.title || "Unnamed Tree"}</h3>

                {listing.description && (
                  <p className="tree-card-desc">{listing.description}</p>
                )}

                {listing.location && (
                  <div className="meta">
                    <span className="badge">📍 {listing.location}</span>
                  </div>
                )}

                {listing.photos?.length > 0 && (
                  <div className="meta">
                    <span className="badge">
                      📸 {listing.photos.length} photo{listing.photos.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}

                {/* Staff: Delete */}
                {isStaff && (
                  <div className="actions">
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={(e) => handleDelete(listing.id, e)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
