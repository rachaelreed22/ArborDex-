import { useRef, useState } from "react";
import jsQR from "jsqr";
import { useNavigate } from "react-router-dom";

export default function Scan() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationRef = useRef(null);

  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  const startCamera = async () => {
    setMessage("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      streamRef.current = stream;

      const video = videoRef.current;
      video.srcObject = stream;
      video.setAttribute("playsinline", true);
      await video.play();

      setScanning(true);
      animationRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.error("Camera error:", err);
      setMessage("Unable to access camera.");
    }
  };

  const stopCamera = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setScanning(false);
  };

  const tick = () => {
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
        const match = scanned.match(/\/tree\/(\d+)/);

        if (match) {
          const treeId = match[1];
          stopCamera();
          navigate(`/tree/${treeId}`);
          return;
        }

        setMessage("QR code detected, but it is not a valid ArborTag code.");
      }
    }

    animationRef.current = requestAnimationFrame(tick);
  };

  const handleUploadClick = () => {
    alert("Identify me — Scan my QR code");
  };

  return (
    <div className="scan-page">
      <h2>ArborTag Scan</h2>

      <section className="photo-gallery-section">
        <h3>Your Photo Gallery</h3>
        <p>
          Photos uploaded after scanning a valid ArborTag QR code will appear here.
        </p>

        <div className="photo-gallery-placeholder">
          No photos uploaded yet.
        </div>

        <button type="button" onClick={handleUploadClick}>
          Upload Photo
        </button>
      </section>

      <section className="qr-scan-section">
        <h3>Scan Tree QR Code</h3>
        <p>Scan the ArborTag QR code on a tree before uploading photos.</p>

        {!scanning ? (
          <button type="button" onClick={startCamera}>
            Scan QR
          </button>
        ) : (
          <button type="button" onClick={stopCamera}>
            Stop Camera
          </button>
        )}

        {message && <p>{message}</p>}

        {scanning && (
          <div className="scanner-box">
            <video ref={videoRef} className="scan-video" />
            <canvas ref={canvasRef} className="scan-canvas" />
          </div>
        )}
      </section>
    </div>
  );
}