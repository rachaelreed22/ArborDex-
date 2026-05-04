import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import jsQR from "jsqr";
import { useMode } from "../context/ModeContext";
import { apiUrl } from "../utils/apiUrl";
import "./AddTree.css";

export default function AddTree() {
  const { mode } = useMode();
  const location = useLocation();
  const navigate = useNavigate();
  const isStaff = mode === "dex";

  const scanPrefill = location.state?.fromScan || null;
  const isScanFlow = Boolean(scanPrefill && isStaff);

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
  const [step, setStep] = useState(isScanFlow ? 2 : 1);

  const [qrChoice, setQrChoice] = useState("generate");
  const [scanTarget, setScanTarget] = useState("new");
  const [scanning, setScanning] = useState(false);
  const [scannedId, setScannedId] = useState("");
  const [scannedQrUrl, setScannedQrUrl] = useState("");
  const [scanMessage, setScanMessage] = useState("");

  const [listings, setListings] = useState([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [selectedAttachListingId, setSelectedAttachListingId] = useState("");

  const [diagnosticsConfirmed, setDiagnosticsConfirmed] = useState(false);
  const [diagnosticsRunAt, setDiagnosticsRunAt] = useState("");
  const [confirmingDiagnostics, setConfirmingDiagnostics] = useState(false);
  const [confirmedDiagnostics, setConfirmedDiagnostics] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    if (!scanPrefill) return;

    setForm((prev) => ({
      ...prev,
      title: scanPrefill.title || prev.title,
      description: scanPrefill.description || prev.description,
    }));

    if (Array.isArray(scanPrefill.photos) && scanPrefill.photos.length > 0) {
      setPhotos(scanPrefill.photos);
      setPreviews(
        scanPrefill.photos.map((file) => ({
          name: file.name,
          url: URL.createObjectURL(file),
        }))
      );
    }
  }, [location.state]);

  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      previews.forEach((preview) => {
        if (typeof preview.url === "string" && preview.url.startsWith("blob:")) {
          URL.revokeObjectURL(preview.url);
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isScanFlow) return;
    if (step !== 3) return;
    if (qrChoice !== "attach") return;
    if (listings.length > 0 || listingsLoading) return;

    const loadListings = async () => {
      setListingsLoading(true);
      try {
        const response = await fetch(apiUrl("/api/listings"));
        const data = await response.json().catch(() => []);
        const normalized = Array.isArray(data) ? data : [];
        setListings(normalized);
        if (normalized[0]?.id && !selectedAttachListingId) {
          setSelectedAttachListingId(normalized[0].id);
        }
      } catch {
        setListings([]);
      } finally {
        setListingsLoading(false);
      }
    };

    loadListings();
  }, [isScanFlow, step, qrChoice, listings.length, listingsLoading, selectedAttachListingId]);

  if (!isStaff) {
    return (
      <div className="page">
        <div className="empty-state">
          <div className="icon">🔒</div>
          <p>Staff access required to add trees.</p>
          <button className="btn btn-primary" onClick={() => navigate("/database")}>
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

  const stopCamera = () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  const scanTick = (onDetect) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.height = video.videoHeight;
      canvas.width = video.videoWidth;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, canvas.width, canvas.height);

      if (code?.data) {
        const scanned = code.data.trim();
        const match = scanned.match(/\/(?:tag|tree)\/([A-Za-z0-9-]+)/);

        if (match?.[1]) {
          stopCamera();
          onDetect({ id: match[1], raw: scanned });
          return;
        }

        setScanMessage("QR detected, but ArborTag ID was not found.");
      }
    }

    animationRef.current = requestAnimationFrame(() => scanTick(onDetect));
  };

  const startCameraScan = async () => {
    setScanMessage("");
    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      video.setAttribute("playsinline", true);
      await video.play();

      setScanning(true);
      animationRef.current = requestAnimationFrame(() =>
        scanTick(({ id, raw }) => {
          setScannedId(id);
          setScannedQrUrl(raw);
          setScanMessage(`Scanned tree ID: ${id}`);
          if (scanTarget === "attach") {
            setSelectedAttachListingId(id);
          }
        })
      );
    } catch (scanError) {
      setScanMessage(scanError?.message || "Unable to access camera for scan.");
      setScanning(false);
    }
  };

  const clearStep3 = () => {
    setQrChoice("generate");
    setScanTarget("new");
    setScannedId("");
    setScannedQrUrl("");
    setScanMessage("");
    setSelectedAttachListingId("");
    setDiagnosticsConfirmed(false);
    setDiagnosticsRunAt("");
    setConfirmedDiagnostics(null);
    stopCamera();
  };

  const confirmDiagnostics = async () => {
    setError("");
    setConfirmingDiagnostics(true);

    try {
      const formData = new FormData();
      const diagnosticPrompt = [
        "Run final review diagnostics for this tree draft before database add.",
        `Title: ${form.title || "Untitled Tree"}`,
        `Location: ${form.location || "Unknown"}`,
        `Latitude: ${form.latitude || "Unknown"}`,
        `Longitude: ${form.longitude || "Unknown"}`,
        `Description: ${form.description || "None provided"}`,
      ].join("\n");

      formData.append("question", diagnosticPrompt);

      photos.forEach((photo) => {
        formData.append("photos", photo);
      });

      const response = await fetch(apiUrl("/api/ai/ask-arborai"), {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Final diagnostics run failed.");
      }

      const stamp = new Date().toISOString();
      setDiagnosticsRunAt(stamp);
      setDiagnosticsConfirmed(true);
      setConfirmedDiagnostics({
        ...data,
        review_context: {
          title: form.title,
          location: form.location,
          latitude: form.latitude,
          longitude: form.longitude,
          description: form.description,
          qr_choice: qrChoice,
        },
      });
    } catch (runError) {
      setDiagnosticsConfirmed(false);
      setDiagnosticsRunAt("");
      setConfirmedDiagnostics(null);
      setError(runError?.message || "Could not confirm diagnostics.");
    } finally {
      setConfirmingDiagnostics(false);
    }
  };

  const appendDiagnosticsLog = async (listingId) => {
    const diagnosticsPayload = confirmedDiagnostics || scanPrefill?.scanPayload;
    if (!diagnosticsPayload) return;

    await fetch(apiUrl(`/api/listings/${listingId}/diagnostics-log`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        run_at: diagnosticsRunAt || new Date().toISOString(),
        source: "ask-arborai",
        diagnostics: diagnosticsPayload,
        notes: scanPrefill.assistantText || "",
      }),
    }).catch(() => null);
  };

  const handleScanFlowSubmit = async () => {
    setError("");

    if (!form.title.trim()) {
      setError("Tree name is required before continuing.");
      return;
    }

    if (step === 2) {
      setStep(3);
      return;
    }

    if (!diagnosticsConfirmed) {
      setError("Select Review, Confirm before adding to database.");
      return;
    }

    if (qrChoice === "attach" && !selectedAttachListingId) {
      setError("Select or scan an existing tree before attaching.");
      return;
    }

    if (qrChoice === "scan-new" && !scannedQrUrl) {
      setError("Scan the new tree QR code before adding.");
      return;
    }

    setSubmitting(true);

    try {
      if (qrChoice === "attach") {
        const response = await fetch(apiUrl("/api/ai/attach-scan-to-tree"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listing_id: selectedAttachListingId,
            ...(scanPrefill?.scanPayload || {}),
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.error || "Failed to attach scan to existing tree.");
        }

        await appendDiagnosticsLog(data.listing_id || selectedAttachListingId);
        navigate(`/listing/${data.listing_id || selectedAttachListingId}`);
        return;
      }

      const formData = new FormData();
      formData.append("title", form.title.trim());
      formData.append("description", form.description.trim());
      formData.append("location", form.location.trim());
      formData.append("latitude", form.latitude.trim());
      formData.append("longitude", form.longitude.trim());
      formData.append("qr_mode", qrChoice === "scan-new" ? "scanned" : "generate");

      if (qrChoice === "scan-new") {
        formData.append("scanned_qr_url", scannedQrUrl);
        formData.append("custom_id", scannedId);
      }

      photos.forEach((photo) => {
        formData.append("photos", photo);
      });

      const res = await fetch(apiUrl("/api/listings"), {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to create listing");
      }

      if (data?.id) {
        await appendDiagnosticsLog(data.id);
        navigate(`/listing/${data.id}`);
      } else {
        navigate("/database");
      }
    } catch (err) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isScanFlow) {
      await handleScanFlowSubmit();
      return;
    }

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

      const res = await fetch(apiUrl("/api/listings"), {
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
        navigate("/database");
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
      <button className="btn btn-secondary back-btn" onClick={() => navigate("/database")}>
        ← Back to Database
      </button>

      <h1 className="addtree-title">Add New Tree</h1>
      <p className="addtree-subtitle">
        {isScanFlow
          ? "Step 2: Review and edit details before continuing to confirmation."
          : "Fill in the details to add a tree to the database."}
      </p>

      {isScanFlow && (
        <div className="scan-step-banner">
          <span className={`step-chip ${step === 2 ? "active" : "done"}`}>Step 2: Review</span>
          <span className={`step-chip ${step === 3 ? "active" : ""}`}>Step 3: Confirm</span>
        </div>
      )}

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
            {submitting
              ? "Working..."
              : isScanFlow && step === 2
              ? "Continue to Step 3"
              : isScanFlow
              ? "Add to Database"
              : "🌳 Add Tree"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/database")}>
            Cancel
          </button>
        </div>

        {isScanFlow && step === 3 && (
          <section className="full-width addtree-phase-card">
            <h2>Step 3: Review, Confirm</h2>
            <p>Choose how to handle this tree record before final database add.</p>

            <div className="qr-choice-grid">
              <label className="qr-choice-item">
                <input
                  type="radio"
                  name="qr-choice"
                  value="generate"
                  checked={qrChoice === "generate"}
                  onChange={() => setQrChoice("generate")}
                />
                Generate New QR Code
              </label>

              <label className="qr-choice-item">
                <input
                  type="radio"
                  name="qr-choice"
                  value="scan-new"
                  checked={qrChoice === "scan-new"}
                  onChange={() => {
                    setQrChoice("scan-new");
                    setScanTarget("new");
                  }}
                />
                Scan Existing QR for New Tree
              </label>

              <label className="qr-choice-item">
                <input
                  type="radio"
                  name="qr-choice"
                  value="attach"
                  checked={qrChoice === "attach"}
                  onChange={() => {
                    setQrChoice("attach");
                    setScanTarget("attach");
                  }}
                />
                Add This Scan to Existing Tree
              </label>
            </div>

            {(qrChoice === "scan-new" || qrChoice === "attach") && (
              <div className="phase-scan-block">
                <div className="phase-scan-actions">
                  {!scanning ? (
                    <button type="button" className="btn btn-secondary" onClick={startCameraScan}>
                      Scan QR
                    </button>
                  ) : (
                    <button type="button" className="btn btn-danger" onClick={stopCamera}>
                      Stop Scan
                    </button>
                  )}

                  <button type="button" className="btn btn-secondary" onClick={clearStep3}>
                    Clear Step 3
                  </button>
                </div>

                {scanning && (
                  <div className="phase-scanner-view">
                    <video ref={videoRef} className="phase-scanner-video" />
                    <canvas ref={canvasRef} style={{ display: "none" }} />
                  </div>
                )}

                {(scanMessage || scannedId) && (
                  <p className="phase-scan-message">
                    {scanMessage || `Scanned ID: ${scannedId}`}
                  </p>
                )}
              </div>
            )}

            {qrChoice === "attach" && (
              <div className="phase-attach-block">
                <label htmlFor="attach-listing-select">Attach to existing tree</label>
                <select
                  id="attach-listing-select"
                  value={selectedAttachListingId}
                  onChange={(event) => setSelectedAttachListingId(event.target.value)}
                >
                  {!listingsLoading && listings.length === 0 && <option value="">No trees available</option>}
                  {listings.map((listing) => (
                    <option key={listing.id} value={listing.id}>
                      {listing.title || "Untitled Tree"} ({listing.id})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="phase-confirm-row">
              <button
                type="button"
                className="btn btn-primary"
                onClick={confirmDiagnostics}
                disabled={confirmingDiagnostics || submitting}
              >
                {confirmingDiagnostics ? "Running Diagnostics..." : "Review, Confirm"}
              </button>
              <span className="phase-confirm-status">
                {diagnosticsConfirmed
                  ? `Diagnostics confirmed at ${new Date(diagnosticsRunAt).toLocaleString()}`
                  : "Diagnostics will not run until Review, Confirm is selected."}
              </span>
            </div>
          </section>
        )}
      </form>
    </div>
  );
}
