// server/qrRoutes.js
const express = require("express");
const router = express.Router();
const QRCode = require("qrcode");
const supabase = require("./db");
const { v4: uuidv4 } = require("uuid");

// Generate QR for a tree
router.get("/qr/generate/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // 1. URL encoded inside the QR
    const qrData = `http://localhost:5173/tree/${id}`;

    // 2. Generate QR PNG buffer
    const qrBuffer = await QRCode.toBuffer(qrData, {
      type: "png",
      width: 600,
      margin: 2,
    });

    // 3. Upload to Supabase Storage
    const fileName = `qr-codes/${id}-${uuidv4()}.png`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .upload(fileName, qrBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("QR upload error:", uploadError);
      return res.status(500).json({ error: "Failed to upload QR code." });
    }

    // 4. Get public URL
    const { data: publicUrlData } = supabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .getPublicUrl(fileName);

    const qrUrl = publicUrlData.publicUrl;

    // 5. Save QR URL to database
    const { error: updateError } = await supabase
      .from("listings")
      .update({ qr_url: qrUrl })
      .eq("id", id);

    if (updateError) {
      console.error("QR DB update error:", updateError);
      return res.status(500).json({ error: "Failed to save QR URL." });
    }

    res.json({ success: true, qr_url: qrUrl });
  } catch (err) {
    console.error("QR generation error:", err);
    res.status(500).json({ error: "QR generation failed." });
  }
});

module.exports = router;
