import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiUrl } from "../utils/apiUrl";
import { getStaffHeaders } from "../utils/staffAuth";

export default function PendingPhotos() {
  const navigate = useNavigate();
  const [pendingItems, setPendingItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPendingPhotos();
  }, []);

  async function loadPendingPhotos() {
    try {
      const res = await fetch(apiUrl("/api/listings"));
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
      <div className="tree-list-topbar">
        <h1>Pending Photos</h1>
        <div className="topbar-actions">
          <button className="btn btn-secondary" onClick={() => navigate("/database")}>
            Back to Database
          </button>
        </div>
      </div>

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
