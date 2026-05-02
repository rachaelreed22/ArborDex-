import { useRef, useState } from "react";
import jsQR from "jsqr";
import { useNavigate } from "react-router-dom";
import { useMode } from "../context/ModeContext";
import { apiUrl } from "../utils/apiUrl";
import "./Scan.css";

export default function Scan() {
  const { mode } = useMode();
  const isStaff = mode === "dex";

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationRef = useRef(null);

  const navigate = useNavigate();

  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState("");
  const [listingId, setListingId] = useState(null);

  const [selectedPhotos, setSelectedPhotos] = useState([]);

  const [photographerInfo, setPhotographerInfo] = useState({
    firstName: "",
    lastName: "",
    email: "",
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState("");

  /* CAMERA + QR LOGIC */
  const startCamera = async (callback) => {
    setMessage("");

    try {
      let stream;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      streamRef.current = stream;

      const video = videoRef.current;
      video.srcObject = stream;
      video.setAttribute("playsinline", true);
      await video.play();

      setScanning(true);
      animationRef.current = requestAnimationFrame(() => tick(callback));
    } catch (err) {
      console.error("Camera error:", err);
      setMessage("Unable to access camera.");
    }
  };

  const stopCamera = () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setScanning(false);
  };

  const tick = (callback) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d");

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.height = video.videoHeight;
      canvas.width = video.videoWidth;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, canvas.width, canvas.height);

      if (code) {
        const scanned = code.data.trim();
        const match = scanned.match(/\/(?:tag|tree)\/([A-Za-z0-9-]+)/);

        if (match) {
          const id = match[1];
          stopCamera();
          callback(id);
          return;
        }

        setMessage("QR detected, but not a valid ArborTag code.");
      }
    }

    animationRef.current = requestAnimationFrame(() => tick(callback));
  };

  /* BUTTON ACTIONS */
  const handleScanForUpload = () => {
    startCamera((id) => {
      setListingId(id);
      setMessage("Tree identified: #" + id);
    });
  };

  const handleScanNewTree = () => {
    startCamera((id) => {
      navigate("/tree/" + id);
    });
  };

  /* PHOTO SELECTION */
  const handlePhotoSelect = (e) => {
    const files = Array.from(e.target.files);
    setSelectedPhotos((prev) => [...prev, ...files]);
  };

  const removePhoto = (index) => {
    setSelectedPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const clearAllPhotos = () => {
    setSelectedPhotos([]);
  };

  /* UPLOAD LOGIC */
  const handleUploadClick = () => {
    if (!listingId) {
      setModalType("qr");
      setModalOpen(true);
      return;
    }

    if (!isStaff) {
      if (
        !photographerInfo.firstName ||
        !photographerInfo.lastName ||
        !photographerInfo.email
      ) {
        setModalType("info");
        setModalOpen(true);
        return;
      }
    }

    uploadPhotos();
  };

  const uploadPhotos = async () => {
    if (selectedPhotos.length === 0) {
      alert("Please select at least one photo.");
      return;
    }

    const formData = new FormData();
    formData.append("listingId", listingId);

    if (!isStaff) {
      formData.append("firstName", photographerInfo.firstName);
      formData.append("lastName", photographerInfo.lastName);
      formData.append("email", photographerInfo.email);
      formData.append("staffUploaded", "false");
    } else {
      formData.append("firstName", "Staff");
      formData.append("lastName", "User");
      formData.append("email", "staff@rrtech.dev");
      formData.append("staffUploaded", "true");
    }

    selectedPhotos.forEach((file) => {
      formData.append("photos", file);
    });

    try {
      const res = await fetch(apiUrl("/api/photos/upload"), {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        alert(err?.error || "Upload failed.");
        return;
      }

      alert("Photos uploaded successfully!");
      setSelectedPhotos([]);
    } catch (err) {
      console.error("Upload error:", err);
      alert("Unexpected upload error.");
    }
  };

  /* MODAL */
  const renderModal = () => {
    if (!modalOpen) return null;

    return (
      <div className="modal-overlay">
        <div className="modal-card">
          {modalType === "qr" && (
            <>
              <h3>Scan Required</h3>
              <p>Please scan the tree’s QR code before uploading photos.</p>
              <button className="btn btn-primary" onClick={() => setModalOpen(false)}>
                OK
              </button>
            </>
          )}

          {modalType === "info" && (
            <>
              <h3>Photographer Info</h3>
              <p>Please enter your information for contest notifications.</p>

              <input
                type="text"
                placeholder="First Name"
                value={photographerInfo.firstName}
                onChange={(e) =>
                  setPhotographerInfo({ ...photographerInfo, firstName: e.target.value })
                }
              />

              <input
                type="text"
                placeholder="Last Name"
                value={photographerInfo.lastName}
                onChange={(e) =>
                  setPhotographerInfo({ ...photographerInfo, lastName: e.target.value })
                }
              />

              <input
                type="email"
                placeholder="Email"
                value={photographerInfo.email}
                onChange={(e) =>
                  setPhotographerInfo({ ...photographerInfo, email: e.target.value })
                }
              />

              <button className="btn btn-primary" onClick={() => setModalOpen(false)}>
                Save
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  /* RENDER */
  return (
    <div className="scan-page">
      <h1 className="scan-title">Scan & Upload</h1>

      {/* ACTIONS */}
      <section className="scan-card">
        <h2>Scan Actions</h2>
        <div className="scan-actions">
          <button className="btn btn-primary" onClick={handleScanForUpload}>
            Scan QR for Upload
          </button>
          <button className="btn btn-secondary" onClick={handleScanNewTree}>
            Scan to View Tree
          </button>
        </div>
      </section>

      {/* CAMERA */}
        <section className="scan-card" style={{ display: scanning ? "block" : "none" }}>
        <h2>Camera Scanner</h2>

        <div className="scanner-box">
            <video ref={videoRef} className="scan-video" />
            <canvas ref={canvasRef} style={{ display: "none" }} />
        </div>

        <button className="btn btn-danger" onClick={stopCamera}>
            Cancel Scan
        </button>
        </section>

        {message && <p className="scan-message">{message}</p>}

      {/* PHOTO GALLERY */}
      <section className="scan-card">
        <h2>Your Photos</h2>

        <label className="btn btn-secondary file-btn">
          Choose Photos
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handlePhotoSelect}
            hidden
          />
        </label>

        {selectedPhotos.length > 0 && (
          <button className="btn btn-warning clear-all-btn" onClick={clearAllPhotos}>
            Clear All ({selectedPhotos.length})
          </button>
        )}

        <div className="photo-gallery">
          {selectedPhotos.length === 0 && <p>No photos selected.</p>}

          {selectedPhotos.map((file, idx) => (
            <div className="photo-thumb-wrapper" key={idx}>
              <img
                src={URL.createObjectURL(file)}
                alt="preview"
                className="photo-thumb"
              />
              <button
                className="btn btn-danger btn-sm photo-remove-btn"
                onClick={() => removePhoto(idx)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* UPLOAD */}
      <section className="scan-card">
        <h2>Upload</h2>

        {!isStaff && (
          <div className="photographer-info">
            <h3>Your Info</h3>

            <input
              type="text"
              placeholder="First Name"
              value={photographerInfo.firstName}
              onChange={(e) =>
                setPhotographerInfo({ ...photographerInfo, firstName: e.target.value })
              }
            />

            <input
              type="text"
              placeholder="Last Name"
              value={photographerInfo.lastName}
              onChange={(e) =>
                setPhotographerInfo({ ...photographerInfo, lastName: e.target.value })
              }
            />

            <input
              type="email"
              placeholder="Email"
              value={photographerInfo.email}
              onChange={(e) =>
                setPhotographerInfo({ ...photographerInfo, email: e.target.value })
              }
            />
          </div>
        )}

        <button
          className="btn btn-primary upload-btn"
          disabled={selectedPhotos.length === 0}
          onClick={handleUploadClick}
        >
          Upload Photos
        </button>
      </section>

      {renderModal()}
    </div>
  );
}
