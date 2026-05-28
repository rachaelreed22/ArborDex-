// server/qrRoutes.js
const express = require("express");
const router = express.Router();
const generateQrForTree = require("./utils/generateQrForTree");

// Generate QR for a tree
router.get("/qr/generate/:id", async (req, res) => {
  const { id } = req.params;
  const forwardedProto = (req.headers['x-forwarded-proto'] || '').toString().split(',')[0].trim();
  const forwardedHost = (req.headers['x-forwarded-host'] || '').toString().split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'http';
  const host = forwardedHost || req.get('host') || '';
  const requestOrigin = host ? `${protocol}://${host}` : '';

  try {
    const qrUrl = await generateQrForTree(id, {
      appBaseUrl: process.env.APP_BASE_URL || process.env.CLIENT_URL || requestOrigin,
    });

    if (!qrUrl) {
      return res.status(500).json({ error: "QR generation failed." });
    }

    res.json({ success: true, qr_url: qrUrl });
  } catch (err) {
    console.error("QR generation error:", err);
    res.status(500).json({ error: "QR generation failed." });
  }
});

module.exports = router;
