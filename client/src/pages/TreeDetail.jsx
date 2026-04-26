import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMode } from "../context/ModeContext";
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

  const isStaff = mode === "dex";

  useEffect(() => {
    fetchListing();
  }, [id]);

  async function fetchListing() {
    try {
      const res = await fetch(`/api/listings/${id}`);
      if (!res.ok) {
        setListing(null);
        setLoading(false);
        return;
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
    } catch (err) {
      console.error("Error fetching listing:", err);
    }
    setLoading(false);
  }

  // Staff: save edits
  const handleSaveEdit = async () => {
    try {
      await fetch(`/api/listings/${id}`, {
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

  // Staff: delete entire listing
  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this tree? This cannot be undone.")) return;
    try {
      await fetch(`/api/listings/${id}`, { method: "DELETE" });
      navigate("/");
    } catch (err) {
      console.error("Error deleting listing:", err);
    }
  };

  // Staff: set main photo
  const handleSetMain = async (photoId) => {
    try {
      await fetch(`/api/photos/${photoId}/main`, { method: "PATCH" });
      fetchListing();
    } catch (err) {
      console.error("Error setting main photo:", err);
    }
  };

  // Staff: set winner photo
  const handleSetWinner = async (photoId) => {
    try {
      await fetch(`/api/photos/${photoId}/winner`, { method: "PATCH" });
      fetchListing();
    } catch (err) {
      console.error("Error setting winner:", err);
    }
  };

  // Staff: delete a photo
  const handleDeletePhoto = async (photoId) => {
    if (!window.confirm("Delete this photo?")) return;
    try {
      await fetch(`/api/photos/${photoId}`, { method: "DELETE" });
      fetchListing();
    } catch (err) {
      console.error("Error deleting photo:", err);
    }
  };

  if (loading) return <div className="loading">Loading tree...</div>;

  // No tree found — redirect to AddTree if staff, show message if public
  if (!listing) {
    return (
      <div className="page">
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
            Back to Database
          </button>
        </div>
      </div>
    );
  }

  const photos = listing.photos || [];
  const mainPhoto = photos.find((p) => p.is_main) || photos[0] || null;
  const winnerPhoto = photos.find((p) => p.winner) || null;

  return (
    <div className="page tree-detail-page">
      {/* Back */}
      <button className="btn btn-secondary back-btn" onClick={() => navigate("/")}>
        ← Back to Database
      </button>

      {/* Header — view or edit */}
      <div className="detail-header">
        {editing ? (
          <div className="edit-form">
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
            <div className="form-group full-width">
              <label>Description</label>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows={4}
              />
            </div>
            <div className="form-actions full-width">
              <button className="btn btn-primary" onClick={handleSaveEdit}>Save</button>
              <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <h1 className="detail-title">{listing.title}</h1>
            {listing.location && (
              <p className="detail-location">📍 {listing.location}</p>
            )}
            {(listing.latitude || listing.longitude) && (
              <p className="detail-coords">
                🧭 {listing.latitude}, {listing.longitude}
              </p>
            )}
          </>
        )}
      </div>

      {/* Main Photo */}
      {mainPhoto ? (
        <div className="detail-main-photo">
          <img src={mainPhoto.url} alt={listing.title} />
          {mainPhoto.photographer && (
            <p className="photo-credit">📸 {mainPhoto.photographer}</p>
          )}
        </div>
      ) : (
        <div className="detail-no-photo">
          <span>🌿</span>
          <p>No photos available yet</p>
        </div>
      )}

      {/* Winner Badge */}
      {winnerPhoto && (
        <div className="detail-winner">
          <div className="winner-badge">⭐ Photo Contest Winner</div>
          <img src={winnerPhoto.url} alt="Winner" />
          {winnerPhoto.photographer && (
            <p className="photo-credit">📸 {winnerPhoto.photographer}</p>
          )}
        </div>
      )}

      {/* Description */}
      {listing.description && (
        <div className="detail-description">
          <h3>About This Tree</h3>
          <p>{listing.description}</p>
        </div>
      )}

      {/* Staff Actions */}
      {isStaff && !editing && (
        <div className="staff-actions">
          <button className="btn btn-secondary" onClick={() => setEditing(true)}>
            ✏️ Edit Details
          </button>
          <button className="btn btn-danger" onClick={handleDelete}>
            🗑️ Delete Tree
          </button>
        </div>
      )}
        {listing.qr_url && (
        <div className="qr-section">
            <h3>QR Code</h3>
            <img 
            src={listing.qr_url} 
            alt="Tree QR Code" 
            className="qr-image"
            />
        </div>
        )}

      {/* Photo Gallery */}
      {photos.length > 1 && (
        <div className="detail-gallery">
          <h3>Photo Gallery</h3>
          <div className="gallery-grid">
            {photos.map((photo) => (
              <div key={photo.id} className="gallery-card">
                <img src={photo.url} alt="Gallery" />
                {photo.photographer && (
                  <p className="photo-credit">📸 {photo.photographer}</p>
                )}
                {photo.is_main && <span className="badge">Main Photo</span>}
                {photo.winner && <span className="badge badge-warn">⭐ Winner</span>}

                {isStaff && (
                  <div className="gallery-card-actions">
                    {!photo.is_main && (
                      <button className="btn btn-sm btn-secondary" onClick={() => handleSetMain(photo.id)}>
                        Set Main
                      </button>
                    )}
                    {!photo.winner && (
                      <button className="btn btn-sm btn-secondary" onClick={() => handleSetWinner(photo.id)}>
                        Set Winner
                      </button>
                    )}
                    <button className="btn btn-sm btn-danger" onClick={() => handleDeletePhoto(photo.id)}>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Staff Info Panel */}
      {isStaff && (
        <div className="staff-info">
          <h4>Staff Info</h4>
          <p><strong>Listing ID:</strong> {listing.id}</p>
          <p><strong>Total Photos:</strong> {photos.length}</p>
          {listing.latitude && <p><strong>Lat:</strong> {listing.latitude}</p>}
          {listing.longitude && <p><strong>Lng:</strong> {listing.longitude}</p>}
        </div>
      )}
    </div>
  );
}
