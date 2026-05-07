// server/qrRoutes.js
const express = require("express");
const router = express.Router();
const generateQrForTree = require("./utils/generateQrForTree");

// Generate QR for a tree
router.get("/qr/generate/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const qrUrl = await generateQrForTree(id);

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
