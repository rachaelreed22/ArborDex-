import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiUrl } from "../utils/apiUrl";
import { getStaffHeaders } from "../utils/staffAuth";
import "./PendingPhotos.css";

const PHOTO_CAP = 5;

export default function PendingPhotos() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [expandedKey, setExpandedKey] = useState(null);
  const [actionMsg, setActionMsg] = useState("");
  const [lightbox, setLightbox] = useState(null);
  const selectedParkName = (localStorage.getItem("selectedParkName") || "").toString().trim();

  useEffect(() => {
    loadPending();
  }, []);

  async function loadPending() {
    try {
      setLoadError("");
      setLoading(true);
      const qs = selectedParkName ? `?parkName=${encodeURIComponent(selectedParkName)}` : "";
      const res = await fetch(apiUrl(`/api/photos/pending${qs}`), {
        headers: getStaffHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setGroups(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load pending photos:", err);
      setLoadError("Failed to load pending photos. Check your staff login.");
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }

  function groupKey(group) {
    return `${group.listingId}__${group.photographer}`;
  }

  function toggleExpand(key) {
    setExpandedKey((prev) => (prev === key ? null : key));
  }

  async function doAction(url, method, successMsg) {
    try {
      const res = await fetch(apiUrl(url), { method, headers: getStaffHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setActionMsg(err?.error || "Action failed.");
        return false;
      }
      setActionMsg(successMsg);
      setTimeout(() => setActionMsg(""), 3000);
      return true;
    } catch {
      setActionMsg("Unexpected error.");
      return false;
    }
  }

  async function handleSetMain(photoId) {
    const ok = await doAction(`/api/photos/${photoId}/main`, "PATCH", "Set as main photo.");
    if (ok) loadPending();
  }

  async function handleSetWinner(photoId) {
    const ok = await doAction(`/api/photos/${photoId}/winner`, "PATCH", "Marked as winner!");
    if (ok) loadPending();
  }

  async function handleDelete(photoId) {
    if (!window.confirm("Delete this photo permanently?")) return;
    const ok = await doAction(`/api/photos/${photoId}`, "DELETE", "Photo deleted.");
    if (ok) loadPending();
  }

  async function handleImplementAll(group) {
    if (!window.confirm(`Move all ${group.photos.length} photo(s) from this submission to the tree profile?`)) return;
    setActionMsg("Implementing photos...");
    let failed = 0;
    for (const photo of group.photos) {
      const res = await fetch(apiUrl(`/api/photos/${photo.id}/approve`), {
        method: "PATCH",
        headers: getStaffHeaders(),
      });
      if (!res.ok) failed++;
    }
    if (failed > 0) {
      setActionMsg(`${failed} photo(s) failed to implement.`);
    } else {
      setActionMsg("All photos moved to tree profile.");
      setTimeout(() => setActionMsg(""), 3000);
    }
    loadPending();
  }

  async function handleImplementOne(photoId) {
    const ok = await doAction(`/api/photos/${photoId}/approve`, "PATCH", "Photo added to tree profile.");
    if (ok) loadPending();
  }

  if (loading) {
    return <div className="loading">Loading pending photos...</div>;
  }

  return (
    <div className="page tree-list-page">
      <section className="pending-photos-flow">
        <div>
          <p className="pending-photos-kicker">Photo Moderation</p>
          <h1>Pending Photos</h1>
          <p className="pending-photos-subtitle">
            {selectedParkName
              ? `Review uploads for ${selectedParkName}.`
              : "Review uploads waiting for staff approval."}
          </p>
        </div>
      </section>

      <div className="tree-list-topbar">
        <div className="topbar-actions">
          <button className="btn btn-secondary" onClick={() => navigate("/parks")}>
            Change Park
          </button>
          <button className="btn btn-secondary" onClick={() => navigate("/database")}>
            Back to Database
          </button>
        </div>
      </div>

      {actionMsg && (
        <div className="pending-action-msg">{actionMsg}</div>
      )}

      {loadError ? (
        <div className="empty-list"><p>{loadError}</p></div>
      ) : null}

      {!loadError && groups.length === 0 ? (
        <div className="empty-list">
          <p>No pending photos right now.</p>
        </div>
      ) : (
        <div className="pending-submissions-list">
          {groups.map((group) => {
            const key = groupKey(group);
            const isExpanded = expandedKey === key;
            const overCap = group.approvedCount >= PHOTO_CAP;
            const nearCap = !overCap && group.approvedCount >= PHOTO_CAP - 1;

            return (
              <div key={key} className={`pending-submission-card${isExpanded ? " expanded" : ""}`}>
                <button
                  className="pending-card-header"
                  onClick={() => toggleExpand(key)}
                  aria-expanded={isExpanded}
                >
                  <div className="pending-card-thumbs">
                    {group.photos.slice(0, 3).map((p) => (
                      <img key={p.id} src={p.url} alt="" className="pending-thumb-sm" />
                    ))}
                    {group.photos.length > 3 && (
                      <span className="pending-thumb-overflow">+{group.photos.length - 3}</span>
                    )}
                  </div>

                  <div className="pending-card-meta">
                    <span className="pending-card-tree">{group.listingTitle}</span>
                    {group.listingLocation && (
                      <span className="pending-card-location">{group.listingLocation}</span>
                    )}
                    <span className="pending-card-id">Tree ID: {group.listingId}</span>
                    <span className="pending-card-uploader">
                      {group.photographerFirst && group.photographerLast
                        ? `${group.photographerFirst} ${group.photographerLast}`
                        : group.photographer}
                      {group.photographerEmail ? ` · ${group.photographerEmail}` : ""}
                    </span>
                    <span className="pending-card-count">
                      {group.photos.length} photo{group.photos.length !== 1 ? "s" : ""}
                      {" · "}
                      {new Date(group.latestDate).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="pending-card-badges">
                    {overCap && (
                      <span className="pending-badge pending-badge-over">
                        ⚠ Tree at {PHOTO_CAP}-photo limit
                      </span>
                    )}
                    {nearCap && (
                      <span className="pending-badge pending-badge-near">
                        {group.approvedCount}/{PHOTO_CAP} approved
                      </span>
                    )}
                    <span className="pending-expand-arrow">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="pending-card-detail">
                    <div className="pending-cap-notice">
                      <strong>Note:</strong> Tree profiles should have no more than {PHOTO_CAP} photos.
                      This tree currently has <strong>{group.approvedCount}</strong> approved photo{group.approvedCount !== 1 ? "s" : ""}.
                      {overCap && " This tree is already at capacity — consider discarding instead of implementing."}
                    </div>

                    <div className="pending-bulk-actions">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => navigate(`/listing/${group.listingId}`)}
                      >
                        View Tree Profile
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleImplementAll(group)}
                      >
                        Implement All to Tree
                      </button>
                    </div>

                    <div className="pending-photos-grid">
                      {group.photos.map((photo) => (
                        <div key={photo.id} className="pending-photo-item">
                          <img
                            src={photo.url}
                            alt=""
                            className="pending-photo-img pending-photo-clickable"
                            onClick={() => setLightbox(photo)}
                          />
                          <div className="pending-photo-actions">
                            <button
                              className="btn btn-xs btn-secondary"
                              onClick={() => handleSetMain(photo.id)}
                            >
                              Make Main
                            </button>
                            <button
                              className="btn btn-xs btn-warning"
                              onClick={() => handleSetWinner(photo.id)}
                            >
                              Winner
                            </button>
                            <button
                              className="btn btn-xs btn-primary"
                              onClick={() => handleImplementOne(photo.id)}
                            >
                              Implement
                            </button>
                            <button
                              className="btn btn-xs btn-danger"
                              onClick={() => handleDelete(photo.id)}
                            >
                              Discard
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {lightbox && (
        <div className="lightbox-overlay" onClick={() => setLightbox(null)}>
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setLightbox(null)}>x</button>
            <img src={lightbox.url} alt="Enlarged" className="lightbox-img" />
          </div>
        </div>
      )}
    </div>
  );
}
