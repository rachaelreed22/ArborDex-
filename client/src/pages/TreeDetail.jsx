import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMode } from "../context/ModeContext";
import { getNeedsAttention } from "../utils/attentionRules";
import { apiUrl } from "../utils/apiUrl";
import { getStaffHeaders } from "../utils/staffAuth";
import "./TreeDetail.css";

export default function TreeDetail() {
  const { id } = useParams();
  const { mode } = useMode();
  const navigate = useNavigate();

  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    location: "",
    latitude: "",
    longitude: "",
  });

  const [aiInput, setAiInput] = useState("");
  const [aiMessages, setAiMessages] = useState([
    {
      role: "system",
      text: "Ask ArborAI anything about this tree — health, environment, care, or observations.",
    },
  ]);
  const [aiLoading, setAiLoading] = useState(false);

  // ⭐ NEW: AI diagnostic output (Dex mode only)
  const [diagnostics, setDiagnostics] = useState(null);
  const [diagnosticsStatus, setDiagnosticsStatus] = useState("idle");
  const [diagnosticsError, setDiagnosticsError] = useState("");
  const [diagnosticsLogs, setDiagnosticsLogs] = useState([]);

  const isStaff = mode === "dex";
  console.log("LISTING DATA:", listing);
  const needsAttention = isStaff && getNeedsAttention(diagnostics);

  useEffect(() => {
    let cancelled = false;

    async function loadTreeData() {
      const data = await fetchListing();
      if (!data || cancelled) return;

      await fetchDiagnosticsLogs();

      const hasDescription = typeof data.description === "string" && data.description.trim().length > 0;
      const shouldRunDiagnostics = mode === "dex" || !hasDescription;

      if (!shouldRunDiagnostics) {
        setDiagnostics(null);
        setDiagnosticsStatus("idle");
        setDiagnosticsError("");
        return;
      }

      await fetchDiagnostics();

      // If public description was missing, refresh listing once after diagnostics
      // so persisted friendly copy appears in the About section.
      if (!hasDescription && !cancelled) {
        await fetchListing();
      }
    }

    loadTreeData();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, mode]);

  async function fetchListing() {
    try {
      const res = await fetch(apiUrl(`/api/listings/${id}`));
      if (!res.ok) {
        setListing(null);
        return null;
      }
      const data = await res.json();
      setListing(data);
      setEditForm({
        title: data.title || "",
        description: data.description || "",
        location: data.location || "",
        latitude: data.latitude || "",
        longitude: data.longitude || "",
      });
      return data;
    } catch (err) {
      console.error("Error fetching listing:", err);
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function fetchDiagnosticsLogs() {
    try {
      const res = await fetch(apiUrl(`/api/listings/${id}/diagnostics-logs`));
      if (!res.ok) {
        setDiagnosticsLogs([]);
        return;
      }
      const data = await res.json();
      setDiagnosticsLogs(Array.isArray(data) ? data : []);
    } catch {
      setDiagnosticsLogs([]);
    }
  }

  // ⭐ NEW: Fetch AI diagnostics for Dex mode
  async function fetchDiagnostics() {
    try {
      setDiagnosticsStatus("loading");
      setDiagnosticsError("");
      console.log("[TreeDetail] fetching diagnostics for tree", id);
      const res = await fetch(apiUrl(`/api/ai/analyze-tree/${id}`));
      if (!res.ok) {
        setDiagnostics(null);
        setDiagnosticsStatus("error");
        setDiagnosticsError(`${res.status} ${res.statusText}`.trim());
        console.warn("[TreeDetail] diagnostics request failed", res.status, res.statusText);
        return;
      }
      const data = await res.json();
      console.log("[TreeDetail] diagnostics loaded", data);
      setDiagnostics(data);
      setDiagnosticsStatus("success");
    } catch (err) {
      setDiagnostics(null);
      setDiagnosticsStatus("error");
      setDiagnosticsError(err?.message || "Network error");
      console.error("Error fetching diagnostics:", err);
    }
  }

  const handleSaveEdit = async () => {
    try {
      await fetch(apiUrl(`/api/listings/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      setEditing(false);
      fetchListing();
    } catch (err) {
      console.error("Error saving edits:", err);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this tree? This cannot be undone.")) return;
    try {
      const res = await fetch(apiUrl(`/api/listings/${id}`), {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(errorText || `Delete failed (${res.status})`);
      }

      navigate("/database");
    } catch (err) {
      console.error("Error deleting listing:", err);
      alert(`Delete failed: ${err.message || "Unknown error"}`);
    }
  };

  const handleSetMain = async (photoId) => {
    try {
      await fetch(apiUrl(`/api/photos/${photoId}/main`), {
        method: "PATCH",
        headers: getStaffHeaders(),
      });
      fetchListing();
    } catch (err) {
      console.error("Error setting main photo:", err);
    }
  };

  const handleSetWinner = async (photoId) => {
    try {
      await fetch(apiUrl(`/api/photos/${photoId}/winner`), {
        method: "PATCH",
        headers: getStaffHeaders(),
      });
      fetchListing();
    } catch (err) {
      console.error("Error setting winner:", err);
    }
  };

  const handleDeletePhoto = async (photoId) => {
    if (!window.confirm("Delete this photo?")) return;
    try {
      await fetch(apiUrl(`/api/photos/${photoId}`), {
        method: "DELETE",
        headers: getStaffHeaders(),
      });
      fetchListing();
    } catch (err) {
      console.error("Error deleting photo:", err);
    }
  };

  const handleApprovePhoto = async (photoId) => {
    try {
      await fetch(apiUrl(`/api/photos/${photoId}/approve`), {
        method: "PATCH",
        headers: getStaffHeaders(),
      });
      fetchListing();
    } catch (err) {
      console.error("Error approving photo:", err);
    }
  };

  // Real AI handler: calls /api/ai/tree with listing + question
  const handleAskAi = async (e) => {
    e.preventDefault();
    if (!aiInput.trim() || !listing) return;

    const userMessage = { role: "user", text: aiInput.trim() };
    setAiMessages((prev) => [...prev, userMessage]);
    const question = aiInput.trim();
    setAiInput("");
    setAiLoading(true);

    try {
      const res = await fetch(apiUrl("/api/ai/tree"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          listing,
        }),
      });

      if (!res.ok) {
        console.error("AI request failed");
        setAiMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: "I had trouble reaching the AI service. Please try again in a moment.",
          },
        ]);
        setAiLoading(false);
        return;
      }

      const data = await res.json();
      const answer = data.answer || "I couldn't generate a response.";

      setAiMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: answer,
        },
      ]);
    } catch (err) {
      console.error("Error calling AI:", err);
      setAiMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Something went wrong while contacting ArborAI.",
        },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) return <div className="loading">Loading tree...</div>;

  if (!listing) {
    return (
      <div className="page tree-detail-page">
        <div className="empty-state">
          <div className="icon">🌳</div>
          <p>This tree hasn't been registered yet.</p>
          {isStaff ? (
            <button className="btn btn-primary" onClick={() => navigate(`/add?tag=${id}`)}>
              + Register This Tree
            </button>
          ) : (
            <p className="empty-hint">Check back soon — a staff member can register it.</p>
          )}
          <button className="btn btn-secondary" onClick={() => navigate("/")}>
            Home
          </button>
          <button className="btn btn-secondary" onClick={() => navigate("/database")}>
            Back to Database
          </button>
        </div>
      </div>
    );
  }

  const photos = listing.photos || [];
  const mainPhoto = photos.find((p) => p.is_main) || photos[0] || null;
  const winnerPhoto = photos.find((p) => p.winner) || null;
  const photoSummaries = Array.isArray(diagnostics?.photo_summaries) ? diagnostics.photo_summaries : [];
  const aboutThisTreeText =
    (typeof listing.description === "string" && listing.description.trim()) ||
    (typeof diagnostics?.public_about === "string" && diagnostics.public_about.trim()) ||
    "";
  const diagnosticsChipLabel = !isStaff
    ? "Public mode"
    : diagnosticsStatus === "loading"
    ? "Diagnostics loading"
    : diagnosticsStatus === "success"
    ? needsAttention
      ? "Needs human attention"
      : "Diagnostics ready"
    : diagnosticsStatus === "error"
    ? "Diagnostics failed"
    : "Diagnostics idle";

return (
  <div className="page tree-detail-page">
    {/* Top bar */}
    <div className="tree-detail-topbar">
      <button className="btn btn-secondary" onClick={() => navigate("/")}>
        Home
      </button>
      <button className="btn btn-secondary" onClick={() => navigate("/database")}>
        ← Back to Database
      </button>
      {isStaff && !editing && (
        <div className="topbar-actions">
          <span
            className={`diagnostics-chip diagnostics-chip-${diagnosticsStatus}`}
            title={diagnosticsError || diagnosticsChipLabel}
          >
            {diagnosticsChipLabel}
          </span>
          <button className="btn btn-secondary" onClick={() => setEditing(true)}>
            ✏️ Edit Details
          </button>
          <button className="btn btn-danger" onClick={handleDelete}>
            🗑️ Delete Tree
          </button>
        </div>
      )}
    </div>

    {/* Main layout */}
    <div className="tree-detail-layout">
      {/* Left column: core info + photos */}
      <div className="tree-detail-main">
        {/* Header / Edit */}
        <section className="card section-header">
          {editing ? (
            <div className="edit-form-grid">
              <div className="form-group">
                <label>Tree Name</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Location</label>
                <input
                  type="text"
                  value={editForm.location}
                  onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Latitude</label>
                <input
                  type="text"
                  value={editForm.latitude}
                  onChange={(e) => setEditForm({ ...editForm, latitude: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Longitude</label>
                <input
                  type="text"
                  value={editForm.longitude}
                  onChange={(e) => setEditForm({ ...editForm, longitude: e.target.value })}
                />
              </div>
              <div className="form-group form-group-full">
                <label>Description</label>
                <textarea
                  rows={4}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                />
              </div>
              <div className="form-actions form-group-full">
                <button className="btn btn-primary" onClick={handleSaveEdit}>
                  Save
                </button>
                <button className="btn btn-secondary" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="header-display">
              <h1 className="detail-title">{listing.title || "Untitled Tree"}</h1>
              <div className="header-meta">
                {listing.location && (
                  <p className="detail-location">📍 {listing.location}</p>
                )}
                {(listing.latitude || listing.longitude) && (
                  <p className="detail-coords">
                    🧭 {listing.latitude ?? "—"}, {listing.longitude ?? "—"}
                  </p>
                )}
              </div>
            </div>
          )}
        </section>

{/* Main photo + winner */}
<section className="card section-photos">
  <div className="section-header-row">
    <h2>Main Photo</h2>
    {mainPhoto && mainPhoto.photographer && (
      <span className="photo-credit">📸 {mainPhoto.photographer}</span>
    )}
  </div>

  {mainPhoto ? (
    <div className="main-photo-wrapper">
      <img src={mainPhoto.url} alt={listing.title} className="main-photo" />
    </div>
  ) : (
    <div className="detail-no-photo">
      <span>🌿</span>
      <p>No photos available yet</p>
    </div>
  )}

  {winnerPhoto && (
    <div className="winner-block">
      <div className="winner-badge">⭐ Photo Contest Winner</div>
      <div className="winner-photo-wrapper">
        <img src={winnerPhoto.url} alt="Winner" className="winner-photo" />
      </div>
      {winnerPhoto.photographer && (
        <p className="photo-credit">📸 {winnerPhoto.photographer}</p>
      )}
    </div>
  )}
</section>

{/* Dex‑mode Classification Panels */}
{isStaff && diagnostics && (
  <>
    {/* Species Identification */}
    <section className={`card section-classify ${needsAttention ? "needs-attention" : ""}`}>
      <h2>Species Identification</h2>
      <p>{diagnostics.species || "No species data available."}</p>
    </section>

    {/* Environmental Context */}
    <section className={`card section-classify ${needsAttention ? "needs-attention" : ""}`}>
      <h2>Environmental Context</h2>
      <p>{diagnostics.environment || "No environmental data available."}</p>
    </section>

    {/* Overall Summary */}
    <section className={`card section-classify ${needsAttention ? "needs-attention" : ""}`}>
      <h2>Overall Summary</h2>
      <p>{diagnostics.summary || "No summary available."}</p>
    </section>

    {/* Recommended Actions */}
    <section className={`card section-classify ${needsAttention ? "needs-attention" : ""}`}>
      <h2>Recommended Actions</h2>
      {diagnostics.recommendations?.length ? (
        <ul className="recommend-list">
          {diagnostics.recommendations.map((rec, i) => (
            <li key={i}>{rec}</li>
          ))}
        </ul>
      ) : (
        <p>No recommendations available.</p>
      )}
    </section>

    {/* Per‑Photo Summaries */}
    {photoSummaries.length > 0 && (
      <section className={`card section-classify ${needsAttention ? "needs-attention" : ""}`}>
        <h2>Per‑Photo Summaries</h2>
        <div className="photo-summary-list">
          {photoSummaries.map((item, i) => (
            <div key={i} className="photo-summary-item">
              <h3>Photo {i + 1}</h3>
              <p>{item}</p>
            </div>
          ))}
        </div>
      </section>
    )}
  </>
)}

{/* Description */}
{aboutThisTreeText && (
  <section className="card section-description">
    <h2>About This Tree</h2>
    <p>{aboutThisTreeText}</p>
  </section>
)}

{diagnosticsLogs.length > 0 && (
  <section className="card section-description">
    <h2>Diagnostics Log</h2>
    {diagnosticsLogs.map((entry) => (
      <div key={entry.id} style={{ marginBottom: "0.9rem" }}>
        <p>
          <strong>Run At:</strong>{" "}
          {entry.run_at ? new Date(entry.run_at).toLocaleString() : "Unknown"}
        </p>
        {entry.source && (
          <p>
            <strong>Source:</strong> {entry.source}
          </p>
        )}
        {entry.notes && <p>{entry.notes}</p>}
      </div>
    ))}
  </section>
)}

{/* Coordinates (main column) */}
{(listing.latitude || listing.longitude) && (
  <section className="card section-coordinates">
    <h2>Location Coordinates</h2>

    <div className="coord-row">
      {listing.latitude && (
        <p><strong>Latitude:</strong> {listing.latitude}</p>
      )}
      {listing.longitude && (
        <p><strong>Longitude:</strong> {listing.longitude}</p>
      )}
    </div>

    <button
      className="btn btn-primary"
      onClick={() =>
        window.open(
          `https://www.google.com/maps?q=${listing.latitude},${listing.longitude}`,
          "_blank"
        )
      }
    >
      View on Map
    </button>
  </section>
)}

{/* Gallery */}
{photos.length > 1 && (
  <section className="card section-gallery">
    <div className="section-header-row">
      <h2>Photo Gallery</h2>
      <span className="gallery-count">{photos.length} photos</span>
    </div>
    <div className="gallery-grid">
      {photos.map((photo, idx) => (
        <div key={photo.id} className="gallery-card">
          <img src={photo.url} alt="Gallery" className="gallery-image" />
          <div className="gallery-meta">
            {photo.photographer && (
              <p className="photo-credit">📸 {photo.photographer}</p>
            )}
            <div className="badge-row">
              {photo.is_main && <span className="badge">Main</span>}
              {photo.winner && <span className="badge badge-warn">⭐ Winner</span>}
              {photo.staff_uploaded === false && <span className="badge badge-warn">Pending</span>}
            </div>
            {photoSummaries[idx] && (
              <details className="gallery-ai-summary">
                <summary>AI Summary</summary>
                <p>{photoSummaries[idx]}</p>
              </details>
            )}
          </div>
          {isStaff && (
            <div className="gallery-card-actions">
              {!photo.is_main && (
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => handleSetMain(photo.id)}
                >
                  Set Main
                </button>
              )}
              {!photo.winner && (
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => handleSetWinner(photo.id)}
                >
                  Set Winner
                </button>
              )}
              {photo.staff_uploaded === false && (
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => handleApprovePhoto(photo.id)}
                >
                  Approve
                </button>
              )}
              <button
                className="btn btn-sm btn-danger"
                onClick={() => handleDeletePhoto(photo.id)}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  </section>
)}
</div>

{/* Right column: QR, AI, staff info */}
<div className="tree-detail-sidebar">

  {/* ⭐ NEW: Dex‑mode Diagnostic Panels */}
  {isStaff && diagnostics && (
    <>
      {/* Alerts */}
      {diagnostics.alerts?.length > 0 && (
        <section className={`card section-alerts ${needsAttention ? "needs-attention" : ""}`}>
          <h2>Alerts</h2>
          <ul className="alert-list">
            {diagnostics.alerts.map((alert, i) => (
              <li key={i} className="alert-item">{alert}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Health Score */}
      <section className={`card section-health ${needsAttention ? "needs-attention" : ""}`}>
        <h2>Health Status</h2>
        <p className="health-score">
          {diagnostics.health_score ?? "No score available"}
        </p>
      </section>

      {/* Confidence */}
      <section className={`card section-confidence ${needsAttention ? "needs-attention" : ""}`}>
        <h2>Confidence Rating</h2>
        <p className="confidence-value">
          {diagnostics.confidence ?? "No confidence rating"}
        </p>
      </section>

      {/* Risk Flags */}
      {diagnostics.risk_flags?.length > 0 && (
        <section className={`card section-risks ${needsAttention ? "needs-attention" : ""}`}>
          <h2>Risk Flags</h2>
          <ul className="risk-list">
            {diagnostics.risk_flags.map((flag, i) => (
              <li key={i} className="risk-item">{flag}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  )}

  {/* QR section */}
  {listing.qr_url && (
    <section className="card section-qr">
      <h2>QR Code</h2>
      <p className="qr-hint">
        Scan this code on-site to open this tree’s page in ArborTag.
      </p>
      <div className="qr-wrapper">
        <img
          src={listing.qr_url}
          alt="Tree QR Code"
          className="qr-image"
        />
      </div>
    </section>
  )}

  {/* Sidebar coordinates (quick view) */}
  <section className="card section-coordinates">
    <h2>Location Coordinates</h2>

    <p><strong>Latitude:</strong> {listing?.latitude}</p>
    <p><strong>Longitude:</strong> {listing?.longitude}</p>

    <button
      className="btn btn-primary"
      onClick={() =>
        window.open(
          `https://www.google.com/maps?q=${listing?.latitude},${listing?.longitude}`,
          "_blank"
        )
      }
    >
      View on Map
    </button>
  </section>

  {/* AI Assistant */}
  <section className="card section-ai">
    <h2>ArborAI Assistant</h2>
    <p className="ai-subtitle">
      Ask questions about this tree’s health, environment, or care.  
      (This chat is specific to this tree and its photos.)
    </p>
    <div className="ai-chat-window">
      {aiMessages.map((msg, idx) => (
        <div
          key={idx}
          className={
            msg.role === "user"
              ? "ai-message ai-message-user"
              : msg.role === "assistant"
              ? "ai-message ai-message-assistant"
              : "ai-message ai-message-system"
          }
        >
          <div className="ai-message-label">
            {msg.role === "user"
              ? "You"
              : msg.role === "assistant"
              ? "ArborAI"
              : "Info"}
          </div>
          <div className="ai-message-text">{msg.text}</div>
        </div>
      ))}
      {aiLoading && (
        <div className="ai-message ai-message-assistant">
          <div className="ai-message-label">ArborAI</div>
          <div className="ai-message-text">Thinking…</div>
        </div>
      )}
    </div>
    <form className="ai-input-row" onSubmit={handleAskAi}>
      <input
        type="text"
        placeholder="Ask ArborAI about this tree..."
        value={aiInput}
        onChange={(e) => setAiInput(e.target.value)}
      />
      <button className="btn btn-primary" type="submit" disabled={aiLoading}>
        Send
      </button>
    </form>
  </section>

  {/* Staff info */}
  {isStaff && (
    <section className="card section-staff">
      <h2>Staff Info</h2>
      <div className="staff-info-grid">
        <div>
          <span className="label">Listing ID</span>
          <span className="value mono">{listing.id}</span>
        </div>
        <div>
          <span className="label">Total Photos</span>
          <span className="value">{photos.length}</span>
        </div>
        {listing.latitude && (
          <div>
            <span className="label">Latitude</span>
            <span className="value">{listing.latitude}</span>
          </div>
        )}
        {listing.longitude && (
          <div>
            <span className="label">Longitude</span>
            <span className="value">{listing.longitude}</span>
          </div>
        )}
      </div>
    </section>
  )}

        </div> {/* end sidebar */}
      </div> {/* end layout */}
    </div>
  );
}




