import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { useNavigate } from "react-router-dom";
import { useMode } from "../context/ModeContext";
import { apiUrl } from "../utils/apiUrl";
import "./Scan.css";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_ANYWHERE_PATTERN = /([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i;

function extractArborTagListingId(rawValue) {
  const raw = (rawValue || "").toString().trim();
  if (!raw) return "";

  const pathMatch = raw.match(/\/(?:tag|tree|listing)\/([A-Za-z0-9-]{8,})/i);
  const uuidMatch = raw.match(UUID_ANYWHERE_PATTERN);
  const candidate = (pathMatch?.[1] || uuidMatch?.[1] || raw).trim();
  return UUID_PATTERN.test(candidate) ? candidate : "";
}

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
  const [qrUploadDecoding, setQrUploadDecoding] = useState(false);

  const [photographerInfo, setPhotographerInfo] = useState({
    firstName: "",
    lastName: "",
    email: "",
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState("");

  useEffect(() => {
    if (!modalOpen || modalType !== "qr") return undefined;

    const timer = setTimeout(() => {
      setModalOpen(false);
    }, 3500);

    return () => clearTimeout(timer);
  }, [modalOpen, modalType]);

  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  /* CAMERA + QR LOGIC */
  const startCamera = async (callback) => {
    setMessage("");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMessage("Camera API is unavailable in this browser. Use HTTPS or a supported mobile browser.");
        return;
      }

      let stream;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      streamRef.current = stream;

      const video = videoRef.current;
      video.srcObject = stream;
      video.muted = true;
      video.autoplay = true;
      video.setAttribute("muted", "true");
      video.setAttribute("playsinline", true);
      await video.play();

      setScanning(true);
      animationRef.current = requestAnimationFrame(() => tick(callback));
    } catch (err) {
      console.error("Camera error:", err);

      if (err?.name === "NotAllowedError") {
        setMessage("Camera access was denied. Allow camera permission for this site and try again.");
        return;
      }

      if (err?.name === "NotFoundError") {
        setMessage("No camera device was found on this device.");
        return;
      }

      if (err?.name === "NotReadableError") {
        setMessage("Camera is busy in another app/tab. Close other camera apps and try again.");
        return;
      }

      if (window.isSecureContext === false) {
        setMessage("Camera scanning requires a secure context (HTTPS). Open the secure site URL and try again.");
        return;
      }

      setMessage("Unable to access camera. You can use Upload QR Image as a fallback.");
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

    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      if (!video.videoWidth || !video.videoHeight) {
        animationRef.current = requestAnimationFrame(() => tick(callback));
        return;
      }

      canvas.height = video.videoHeight;
      canvas.width = video.videoWidth;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, canvas.width, canvas.height, {
        inversionAttempts: "attemptBoth",
      });

      if (code) {
        const scanned = code.data.trim();
        const id = extractArborTagListingId(scanned);

        if (id) {
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
      navigate(`/tag/${id}`);
    });
  };

  const decodeQrFromImageFile = async (file) => {
    const imageUrl = URL.createObjectURL(file);

    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = imageUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, canvas.width, canvas.height);
      if (!code?.data) return "";

      return extractArborTagListingId(code.data);
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  };

  const handleQrImageSelect = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setQrUploadDecoding(true);
    try {
      const decodedId = await decodeQrFromImageFile(file);
      if (!decodedId) {
        setMessage("QR image was read, but no valid ArborTag tree ID was found.");
        return;
      }

      setListingId(decodedId);
      setMessage(`Tree identified from image: #${decodedId}`);
    } catch (err) {
      console.error("QR image decode error:", err);
      setMessage("Could not decode QR from image.");
    } finally {
      setQrUploadDecoding(false);
    }
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
      <div className="modal-overlay" onClick={() => setModalOpen(false)}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          {modalType === "qr" && (
            <>
              <h3>Identify This Tree</h3>
              <p>Scan my QR code.</p>
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
        <p className="scan-tip">
          If the QR code is displayed on this same phone, use Upload QR Image with a screenshot.
        </p>
        <div className="scan-actions">
          <button className="btn btn-primary" onClick={handleScanForUpload}>
            Scan QR for Upload
          </button>
          <button className="btn btn-secondary" onClick={handleScanNewTree}>
            Scan to View Tree
          </button>
          <label className="btn btn-secondary file-btn" htmlFor="qr-image-input">
            {qrUploadDecoding ? "Reading QR Image..." : "Upload QR Image"}
          </label>
          <input
            id="qr-image-input"
            type="file"
            accept="image/*"
            onChange={handleQrImageSelect}
            hidden
          />
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
          onClick={handleUploadClick}
        >
          Upload Photos
        </button>
      </section>

      {renderModal()}
    </div>
  );
}
