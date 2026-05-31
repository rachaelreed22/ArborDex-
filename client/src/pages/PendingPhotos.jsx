import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiUrl } from "../utils/apiUrl";
import { getStaffHeaders } from "../utils/staffAuth";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import "./PendingPhotos.css";

export default function PendingPhotos() {
  const navigate = useNavigate();
  const [pendingItems, setPendingItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const selectedParkName = (localStorage.getItem("selectedParkName") || "").toString().trim();

  useEffect(() => {
    loadPendingPhotos();
  }, []);

  async function loadPendingPhotos() {
    try {
      setLoadError("");
      const endpoint = selectedParkName
        ? `/api/listings?parkName=${encodeURIComponent(selectedParkName)}`
        : "/api/listings";
      const res = await fetchWithTimeout(apiUrl(endpoint), {}, 15000);
      const data = await res.json();
      const listings = Array.isArray(data) ? data : [];

      const flattened = listings.flatMap((listing) => {
        const photos = Array.isArray(listing.photos) ? listing.photos : [];
        return photos
          .filter((photo) => photo && photo.staff_uploaded === false)
          .map((photo) => ({
            listingId: listing.id,
            listingTitle: listing.title || "Untitled Tree",
            photo,
          }));
      });

      setPendingItems(flattened);
    } catch (err) {
      console.error("Failed to load pending photos:", err);
      if (err?.name === "AbortError") {
        setLoadError("Pending photos request timed out. Please try again.");
      } else {
        setLoadError("Failed to load pending photos.");
      }
      setPendingItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function approvePhoto(photoId) {
    try {
      await fetch(apiUrl(`/api/photos/${photoId}/approve`), {
        method: "PATCH",
        headers: getStaffHeaders(),
      });
      loadPendingPhotos();
    } catch (err) {
      console.error("Failed to approve photo:", err);
    }
  }

  async function rejectPhoto(photoId) {
    if (!window.confirm("Delete this pending photo?")) return;
    try {
      await fetch(apiUrl(`/api/photos/${photoId}`), {
        method: "DELETE",
        headers: getStaffHeaders(),
      });
      loadPendingPhotos();
    } catch (err) {
      console.error("Failed to delete pending photo:", err);
    }
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

      {loadError ? (
        <div className="empty-list">
          <p>{loadError}</p>
        </div>
      ) : null}

      {pendingItems.length === 0 ? (
        <div className="empty-list">
          <p>No pending photos right now.</p>
        </div>
      ) : (
        <div className="tree-grid">
          {pendingItems.map(({ listingId, listingTitle, photo }) => (
            <div key={photo.id} className="tree-card">
              <div className="tree-card-photo-wrapper">
                <img src={photo.url} alt={listingTitle} className="tree-card-photo" />
              </div>
              <div className="tree-card-info">
                <h3 className="tree-card-title">{listingTitle}</h3>
                <p className="tree-card-meta">Listing: {listingId}</p>
                {photo.photographer && (
                  <p className="tree-card-meta">Photographer: {photo.photographer}</p>
                )}
              </div>
              <div className="tree-card-actions">
                <button className="btn btn-sm btn-primary" onClick={() => approvePhoto(photo.id)}>
                  Approve
                </button>
                <button className="btn btn-sm btn-secondary" onClick={() => navigate(`/listing/${listingId}`)}>
                  Open Tree
                </button>
                <button className="btn btn-sm btn-danger" onClick={() => rejectPhoto(photo.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
