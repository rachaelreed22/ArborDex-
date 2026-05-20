import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMode } from "../context/ModeContext";
import { API_BASE_URL, apiUrl } from "../utils/apiUrl";
import { getNeedsAttention } from "../utils/attentionRules";
import "./TreeList.css";

export default function TreeList() {
  const { mode } = useMode();
  const isStaff = mode === "dex";
  const navigate = useNavigate();

  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [attentionByListingId, setAttentionByListingId] = useState({});

  useEffect(() => {
    fetchListings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch attention flags when mode changes
  useEffect(() => {
    if (listings.length > 0) {
      fetchAttentionFlags(listings);
    } else {
      setAttentionByListingId({});
    }
  }, [isStaff]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchListings() {
    try {
      const res = await fetch(apiUrl("/api/listings"), {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const data = await res.json();
      const nextListings = Array.isArray(data) ? data : [];
      setListings(nextListings);

      if (nextListings.length > 0) {
        await fetchAttentionFlags(nextListings);
      } else {
        setAttentionByListingId({});
      }
    } catch (err) {
      console.error("Error fetching listings:", err);
      setAttentionByListingId({});
    }
    setLoading(false);
  }

  async function fetchAttentionFlags(listingRows) {
    try {
      const listingIds = listingRows.map((l) => l.id);
      const res = await fetch(apiUrl("/api/diagnostics-logs/bulk-latest"), {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ listingIds }),
      });

      if (!res.ok) {
        setAttentionByListingId({});
        return;
      }

      const latestByListing = await res.json().catch(() => ({}));

      const flags = {};
      for (const listing of listingRows) {
        const listingId = (listing?.id ?? "").toString();
        let diagnostics = latestByListing[listingId] ?? null;
        if (typeof diagnostics === "string") {
          try { diagnostics = JSON.parse(diagnostics); } catch { diagnostics = null; }
        }
        flags[listingId] = getNeedsAttention(diagnostics);
      }

      setAttentionByListingId(flags);
    } catch (err) {
      console.error("Error fetching diagnostics attention flags:", err);
      setAttentionByListingId({});
    }
  }

  const filtered = listings.filter((tree) => {
    const term = search.toLowerCase();
    return (
      tree.title?.toLowerCase().includes(term) ||
      tree.location?.toLowerCase().includes(term)
    );
  });

  const handleDelete = async (event, id) => {
    event.stopPropagation();
    if (!window.confirm("Delete this tree? This cannot be undone.")) return;

    const normalizedId = (id ?? "").toString().trim();
    if (!normalizedId) {
      alert("Delete failed: invalid listing id");
      return;
    }

    setDeletingId(normalizedId);

    try {
      const res = await fetch(apiUrl(`/api/listings/${encodeURIComponent(normalizedId)}`), {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        const contentType = res.headers.get("content-type") || "";
        let serverMessage = "";

        if (contentType.includes("application/json")) {
          const data = await res.json().catch(() => ({}));
          serverMessage = data?.error || JSON.stringify(data);
        } else {
          serverMessage = await res.text().catch(() => "");
        }

        throw new Error(serverMessage || `Delete failed (${res.status})`);
      }

      const verifyRes = await fetch(apiUrl("/api/listings"), {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const verifyData = await verifyRes.json().catch(() => []);
      const nextListings = Array.isArray(verifyData) ? verifyData : [];

      setListings(nextListings);

      if (nextListings.length > 0) {
        await fetchAttentionFlags(nextListings);
      } else {
        setAttentionByListingId({});
      }

      if (nextListings.some((listing) => listing.id === normalizedId)) {
        throw new Error("Delete completed but listing still exists in backend response");
      }
    } catch (err) {
      console.error("Error deleting listing:", err);
      const backendLabel = API_BASE_URL || "(same-origin /api)";
      alert(`Delete failed for listing ${normalizedId}: ${err.message || "Unknown error"}\nBackend: ${backendLabel}`);
    } finally {
      setDeletingId(null);
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
          <button
            className="btn btn-secondary"
            onClick={() => navigate("/")}
          >
            Home
          </button>

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
          const treeIdKey = (tree?.id ?? "").toString();
          const needsAttention = Boolean(attentionByListingId[treeIdKey]);

          return (
            <div
              key={tree.id}
              className={`tree-card ${needsAttention ? "tree-card-needs-attention" : ""}`}
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

                {needsAttention && (
                  <p className="attention-pill">Needs human inspection</p>
                )}

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
                    disabled={deletingId === tree.id}
                    onClick={(event) => handleDelete(event, tree.id)}
                  >
                    {deletingId === tree.id ? "Deleting..." : "Delete"}
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

