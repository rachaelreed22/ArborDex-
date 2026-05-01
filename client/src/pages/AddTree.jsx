import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMode } from "../context/ModeContext";
import "./AddTree.css";

export default function AddTree() {
  const { mode } = useMode();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: "",
    description: "",
    location: "",
    latitude: "",
    longitude: "",
  });

  const [photos, setPhotos] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isStaff = mode === "dex";

  if (!isStaff) {
    return (
      <div className="page">
        <div className="empty-state">
          <div className="icon">🔒</div>
          <p>Staff access required to add trees.</p>
          <button className="btn btn-primary" onClick={() => navigate("/")}>
            Back to Database
          </button>
        </div>
      </div>
    );
  }

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handlePhotoSelect = (e) => {
    const files = Array.from(e.target.files);
    setPhotos((prev) => [...prev, ...files]);

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviews((prev) => [...prev, { name: file.name, url: reader.result }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.title.trim()) {
      setError("Tree name is required.");
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("title", form.title.trim());
      formData.append("description", form.description.trim());
      formData.append("location", form.location.trim());
      formData.append("latitude", form.latitude.trim());
      formData.append("longitude", form.longitude.trim());

      photos.forEach((photo) => {
        formData.append("photos", photo);
      });

      const res = await fetch("/api/listings", {
        method: "POST",
        body: formData,
      });

      const contentType = res.headers.get("content-type") || "";
      let data = {};
      let rawText = "";

      if (contentType.includes("application/json")) {
        data = await res.json().catch(() => ({}));
      } else {
        rawText = await res.text().catch(() => "");
      }

      if (!res.ok) {
        const serverError = data?.error || rawText || res.statusText || "Failed to create listing";
        throw new Error(`Add Tree failed (${res.status}): ${serverError}`);
      }

      // Navigate to the new listing page
      if (data?.id) {
        navigate(`/listing/${data.id}`);
      } else {
        navigate("/");
      }
    } catch (err) {
      console.error("Error creating listing:", err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Something went wrong. Please try again.");
    }

    setSubmitting(false);
  };

  return (
    <div className="page addtree-page">
      <button className="btn btn-secondary back-btn" onClick={() => navigate("/")}>
        ← Back to Database
      </button>

      <h1 className="addtree-title">Add New Tree</h1>
      <p className="addtree-subtitle">Fill in the details to add a tree to the database.</p>

      {error && <div className="form-error">{error}</div>}

      <form className="addtree-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="title">Tree Name *</label>
          <input
            id="title"
            name="title"
            type="text"
            placeholder="e.g. White Oak, Japanese Maple..."
            value={form.title}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label htmlFor="location">Location</label>
          <input
            id="location"
            name="location"
            type="text"
            placeholder="e.g. Japanese Stroll Gardens"
            value={form.location}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label htmlFor="latitude">Latitude</label>
          <input
            id="latitude"
            name="latitude"
            type="text"
            placeholder="e.g. 36.7420"
            value={form.latitude}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label htmlFor="longitude">Longitude</label>
          <input
            id="longitude"
            name="longitude"
            type="text"
            placeholder="e.g. -93.2925"
            value={form.longitude}
            onChange={handleChange}
          />
        </div>

        <div className="form-group full-width">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            placeholder="Age, species info, notable features..."
            value={form.description}
            onChange={handleChange}
            rows={4}
          />
        </div>

        <div className="form-group full-width">
          <label>Photos</label>
          <div className="photo-upload-area">
            <label className="upload-btn" htmlFor="photo-input">
              📸 Choose Photos
            </label>
            <input
              id="photo-input"
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoSelect}
              hidden
            />
            <span className="upload-hint">
              {photos.length === 0
                ? "No photos selected"
                : `${photos.length} photo${photos.length !== 1 ? "s" : ""} selected`}
            </span>
          </div>

          {previews.length > 0 && (
            <div className="photo-previews">
              {previews.map((preview, i) => (
                <div key={i} className="preview-card">
                  <img src={preview.url} alt={preview.name} />
                  <button
                    type="button"
                    className="preview-remove"
                    onClick={() => removePhoto(i)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="form-actions full-width">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Adding Tree..." : "🌳 Add Tree"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/")}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
