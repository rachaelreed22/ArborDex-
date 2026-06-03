import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiUrl } from "../utils/apiUrl";
import { getStaffHeaders } from "../utils/staffAuth";
import { normalizeParkText } from "../utils/parkText";
import "./PendingPhotos.css";

const PHOTO_CAP = 5;
const CLOUD_API_BASE = "https://arbordex.onrender.com";

export default function PendingPhotos() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [usingCloudFallback, setUsingCloudFallback] = useState(false);
  const [expandedKey, setExpandedKey] = useState(null);
  const [actionMsg, setActionMsg] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionBusyPhotoId, setActionBusyPhotoId] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const selectedParkId = (localStorage.getItem("selectedParkId") || "").toString().trim();
  const selectedParkName = (localStorage.getItem("selectedParkName") || "").toString().trim();

  function apiUrlFromBase(path, base = "") {
    return `${base}${path}`;
  }

  function canUseCloudFallback() {
    return import.meta.env.DEV && window.location.hostname === "localhost";
  }

  useEffect(() => {
    loadPending();
  }, []);

  async function loadPending() {
    try {
      setLoadError("");
      setLoading(true);
      const headers = getStaffHeaders();
      const candidateBases = [""];
      if (canUseCloudFallback()) candidateBases.push(CLOUD_API_BASE);

      const fetchPending = async (parkId = "", parkName = "", base = "") => {
        const qs = parkId
          ? `?parkId=${encodeURIComponent(parkId)}${parkName ? `&parkName=${encodeURIComponent(parkName)}` : ""}`
          : parkName
            ? `?parkName=${encodeURIComponent(parkName)}`
            : "";
        const path = `/api/photos/pending${qs}`;
        const endpoint = base ? apiUrlFromBase(path, base) : apiUrl(path);
        const res = await fetch(endpoint, { headers });
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      };

      let pendingGroups = [];
      let lastError = null;
      let resolvedBase = "";

      for (const base of candidateBases) {
        try {
          pendingGroups = await fetchPending(selectedParkId, selectedParkName, base);
          resolvedBase = base;
          break;
        } catch (err) {
          lastError = err;
          pendingGroups = [];
          continue;
        }
      }

      if (!resolvedBase && lastError) {
        throw lastError;
      }

      setUsingCloudFallback(Boolean(resolvedBase));
      setGroups(pendingGroups);
    } catch (err) {
      console.error("Failed to load pending photos:", err);
      setLoadError("Failed to load pending photos. Check your staff login.");
      setGroups([]);
      setUsingCloudFallback(false);
    } finally {
      setLoading(false);
    }
  }

  function endpoint(path) {
    return usingCloudFallback ? apiUrlFromBase(path, CLOUD_API_BASE) : apiUrl(path);
  }

  async function doAction(url, method, successMsg) {
    try {
      setActionBusy(true);
      const res = await fetch(endpoint(url), { method, headers: getStaffHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setActionMsg(err?.error || "Action failed.");
        return { ok: false, data: err || null };
      }
      const data = await res.json().catch(() => null);
      setActionMsg(successMsg);
      setTimeout(() => setActionMsg(""), 3000);
      return { ok: true, data };
    } catch {
      setActionMsg("Unexpected error.");
      return { ok: false, data: null };
    } finally {
      setActionBusy(false);
      setActionBusyPhotoId(null);
    }
  }

  async function handleSetMain(photoId) {
    setActionBusyPhotoId(photoId);
    const result = await doAction(`/api/photos/${photoId}/main`, "PATCH", "Main photo updated.");
    if (result.ok) loadPending();
  }

  async function handleSetWinner(photoId) {
    setActionBusyPhotoId(photoId);
    const result = await doAction(`/api/photos/${photoId}/winner`, "PATCH", "Marked as winner.");
    if (result.ok) {
      const emailStatus = result.data?.winner_email;
      if (emailStatus?.sent === true) {
        setActionMsg("Marked as winner. Winner email sent.");
      } else if (emailStatus?.reason === "smtp_not_configured") {
        setActionMsg("Marked as winner. Email not sent: SMTP is not configured yet.");
      } else if (emailStatus?.reason === "missing_recipient") {
        setActionMsg("Marked as winner. Email not sent: this upload has no recipient email.");
      }
      loadPending();
    }
  }

  async function handleDelete(photoId) {
    if (!window.confirm("Delete this photo permanently?")) return;
    setActionBusyPhotoId(photoId);
    const result = await doAction(`/api/photos/${photoId}`, "DELETE", "Photo deleted.");
    if (result.ok) loadPending();
  }

  async function handleImplementAll(group) {
    if (!window.confirm(`Move all ${group.photos.length} photo(s) from this submission to the tree profile?`)) return;
    setActionBusy(true);
    setActionMsg("Implementing photos...");
    let failed = 0;
    for (const photo of group.photos) {
      const res = await fetch(endpoint(`/api/photos/${photo.id}/approve`), {
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
    setActionBusy(false);
    setActionBusyPhotoId(null);
    loadPending();
  }

  async function handleImplementOne(photoId) {
    setActionBusyPhotoId(photoId);
    const result = await doAction(`/api/photos/${photoId}/approve`, "PATCH", "Photo added to tree profile.");
    if (result.ok) loadPending();
  }

  function groupKey(group) {
    return `${group.listingId}__${group.photographer}`;
  }

  function toggleExpand(key) {
    setExpandedKey((prev) => (prev === key ? null : key));
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
              ? `Review uploads for ${normalizeParkText(selectedParkName)}.`
              : "Review uploads waiting for staff approval."}
          </p>
          {usingCloudFallback && (
            <p className="pending-photos-subtitle">Local API is offline. Connected to cloud API fallback.</p>
          )}
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
                      <span className="pending-card-location">{normalizeParkText(group.listingLocation)}</span>
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
                              disabled={actionBusy && actionBusyPhotoId === photo.id}
                            >
                              {actionBusy && actionBusyPhotoId === photo.id ? "Saving..." : "Make Main"}
                            </button>
                            <button
                              className="btn btn-xs btn-warning"
                              onClick={() => handleSetWinner(photo.id)}
                              disabled={actionBusy && actionBusyPhotoId === photo.id}
                            >
                              {actionBusy && actionBusyPhotoId === photo.id ? "Saving..." : "Winner"}
                            </button>
                            <button
                              className="btn btn-xs btn-primary"
                              onClick={() => handleImplementOne(photo.id)}
                              disabled={actionBusy && actionBusyPhotoId === photo.id}
                            >
                              {actionBusy && actionBusyPhotoId === photo.id ? "Saving..." : "Implement"}
                            </button>
                            <button
                              className="btn btn-xs btn-danger"
                              onClick={() => handleDelete(photo.id)}
                              disabled={actionBusy && actionBusyPhotoId === photo.id}
                            >
                              {actionBusy && actionBusyPhotoId === photo.id ? "Saving..." : "Discard"}
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
