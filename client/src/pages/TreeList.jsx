import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMode } from "../context/ModeContext";
import { API_BASE_URL, apiUrl } from "../utils/apiUrl";
import { getNeedsAttention } from "../utils/attentionRules";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { normalizeParkText } from "../utils/parkText";
import "./TreeList.css";

const CLOUD_API_BASE = "https://arbordex.onrender.com";

function inferHazardsFromDiagnostics(diagnostics) {
  if (!diagnostics || typeof diagnostics !== "object") {
    return false;
  }

  const explicitHazard = ["yes", "y", "true"].includes(
    (diagnostics.hazards_detected ?? diagnostics.hazard_detected ?? "").toString().trim().toLowerCase()
  );

  const details = Array.isArray(diagnostics.hazard_details) ? diagnostics.hazard_details : [];
  if (explicitHazard || details.length > 0) return true;

  const signals = [
    diagnostics.summary,
    diagnostics.environment,
    diagnostics.public_about,
    ...(Array.isArray(diagnostics.risk_flags) ? diagnostics.risk_flags : []),
    ...(Array.isArray(diagnostics.alerts) ? diagnostics.alerts : []),
    ...(Array.isArray(diagnostics.photo_summaries) ? diagnostics.photo_summaries : []),
    ...details,
  ]
    .map((item) => (item == null ? "" : item.toString().toLowerCase()))
    .join(" | ");

  const hasDecay = /(decay|decaying|rot|rotting|hollow|cavity|loss\s+of\s+integrity)/i.test(signals);
  const hasStructuralRisk = /(instability|structural|failure|compromised|fall\s+risk|collapse|unsafe|consider\s+removal)/i.test(signals);
  const hasTrunkBaseRoot = /(trunk|base|basal|root|root\s*flare|root\s*collar)/i.test(signals);
  const hasNegatedRisk = /(no|not|without)\s+(clear\s+)?(signs?\s+of\s+)?(hazards?|risk|decay|rot|instability|failure)/i.test(signals);
  return hasDecay && hasTrunkBaseRoot && !hasNegatedRisk && (hasStructuralRisk || hasDecay);
}

export default function TreeList() {
  const { mode } = useMode();
  const isStaff = mode === "dex";
  const navigate = useNavigate();

  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [attentionByListingId, setAttentionByListingId] = useState({});
  const [hazardByListingId, setHazardByListingId] = useState({});
  const [usingCloudFallback, setUsingCloudFallback] = useState(false);
  const selectedParkId = (localStorage.getItem("selectedParkId") || "").toString().trim();
  const selectedParkName = (localStorage.getItem("selectedParkName") || "").toString().trim();

  const listingsEndpoint = selectedParkId
    ? `/api/listings?parkId=${encodeURIComponent(selectedParkId)}${selectedParkName ? `&parkName=${encodeURIComponent(selectedParkName)}` : ""}`
    : selectedParkName
    ? `/api/listings?parkName=${encodeURIComponent(selectedParkName)}`
    : "/api/listings";

  function canUseCloudFallback() {
    return import.meta.env.DEV && window.location.hostname === "localhost";
  }

  function apiUrlFromBase(path, base = "") {
    return `${base}${path}`;
  }

  function listingsApiUrl(path) {
    return apiUrlFromBase(path, usingCloudFallback ? CLOUD_API_BASE : "");
  }

  useEffect(() => {
    fetchListings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch attention flags when mode changes
  useEffect(() => {
    if (listings.length > 0) {
      fetchAttentionFlags(listings);
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAttentionByListingId({});
      setHazardByListingId({});
    }
  }, [isStaff]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchListings() {
    try {
      setLoadError("");
      const candidateBases = [""];
      if (canUseCloudFallback()) candidateBases.push(CLOUD_API_BASE);

      let nextListings = [];
      let resolvedBase = "";
      let lastError = null;

      for (const base of candidateBases) {
        try {
          const fetchListingsAtBase = async (path) => {
            const res = await fetchWithTimeout(apiUrlFromBase(path, base), {
              cache: "no-store",
              headers: { Accept: "application/json" },
            }, 15000);

            if (!res.ok) {
              throw new Error(`Listings request failed (${res.status})`);
            }

            const data = await res.json();
            return Array.isArray(data) ? data : [];
          };

          nextListings = await fetchListingsAtBase(listingsEndpoint);
          resolvedBase = base;
          break;
        } catch (err) {
          lastError = err;
          nextListings = [];
          continue;
        }
      }

      if (!resolvedBase && lastError) {
        throw lastError;
      }

      setUsingCloudFallback(Boolean(resolvedBase));
      setListings(nextListings);
      setLoading(false); // show cards immediately

      if (nextListings.length > 0) {
        fetchAttentionFlags(nextListings, resolvedBase); // background — no await
      } else {
        setAttentionByListingId({});
        setHazardByListingId({});
      }
    } catch (err) {
      console.error("Error fetching listings:", err);
      if (err?.name === "AbortError") {
        setLoadError("Tree listings request timed out. Please check API availability and try again.");
      } else {
        setLoadError("Unable to load tree listings right now.");
      }
      setAttentionByListingId({});
      setHazardByListingId({});
      setLoading(false);
    }
  }

  async function fetchAttentionFlags(listingRows, base = "") {
    try {
      const listingIds = listingRows.map((l) => l.id);
      const res = await fetchWithTimeout(apiUrlFromBase("/api/diagnostics-logs/bulk-latest", base), {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ listingIds }),
      }, 12000);

      if (!res.ok) {
        setAttentionByListingId({});
        setHazardByListingId({});
        return;
      }

      const latestByListing = await res.json().catch(() => ({}));

      const flags = {};
      const hazards = {};
      for (const listing of listingRows) {
        const listingId = (listing?.id ?? "").toString();
        let diagnostics = latestByListing[listingId] ?? null;
        if (typeof diagnostics === "string") {
          try { diagnostics = JSON.parse(diagnostics); } catch { diagnostics = null; }
        }
        flags[listingId] = getNeedsAttention(diagnostics);
        hazards[listingId] = inferHazardsFromDiagnostics(diagnostics);
      }

      setAttentionByListingId(flags);
      setHazardByListingId(hazards);
    } catch (err) {
      console.error("Error fetching diagnostics attention flags:", err);
      setAttentionByListingId({});
      setHazardByListingId({});
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
      const res = await fetchWithTimeout(apiUrl(`/api/listings/${encodeURIComponent(normalizedId)}`), {
        method: "DELETE",
        headers: { Accept: "application/json" },
      }, 15000);

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

      const verifyRes = await fetchWithTimeout(listingsApiUrl(listingsEndpoint), {
        cache: "no-store",
        headers: { Accept: "application/json" },
      }, 15000);
      const verifyData = await verifyRes.json().catch(() => []);
      const nextListings = Array.isArray(verifyData) ? verifyData : [];

      setListings(nextListings);

      if (nextListings.length > 0) {
        fetchAttentionFlags(nextListings); // background — no await
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
      <section className="tree-list-park-flow">
        <div>
          <p className="tree-list-kicker">Tree Database</p>
          <h1>{selectedParkName ? `${normalizeParkText(selectedParkName)} Listings` : "All Tree Listings"}</h1>
          <p className="tree-list-subtitle">
            {selectedParkName
              ? `Browse, search, and manage profiles for ${normalizeParkText(selectedParkName)}.`
              : "Browse, search, and manage tree profiles for the active park."}
          </p>
        </div>
        <button className="btn btn-secondary" onClick={() => navigate("/parks")}>
          Change Park
        </button>
      </section>

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

      {loadError ? (
        <div className="empty-list">
          <p>{loadError}</p>
        </div>
      ) : null}

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
          const hazardsDetected = Boolean(hazardByListingId[treeIdKey]);

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
                    loading="lazy"
                    decoding="async"
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
                  <p className="tree-card-location">📍 {normalizeParkText(tree.location)}</p>
                )}

                <p className={`tree-card-location tree-card-hazards ${hazardsDetected ? "tree-card-hazards-danger" : ""}`}>
                  Hazards Detected: {hazardsDetected ? "Y" : "N"}
                </p>

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

