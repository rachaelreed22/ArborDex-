// server/utils/generateQrForTree.js
const QRCode = require("qrcode");
const supabase = require("../db");
const { v4: uuidv4 } = require("uuid");

async function generateQrForTree(id) {
  try {
    const qrData = `http://localhost:5173/tree/${id}`;

    const qrBuffer = await QRCode.toBuffer(qrData, {
      type: "png",
      width: 600,
      margin: 2,
    });

    const fileName = `qr-codes/${id}-${uuidv4()}.png`;

    const { error: uploadError } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .upload(fileName, qrBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("QR upload error:", uploadError);
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .getPublicUrl(fileName);

    const qrUrl = publicUrlData.publicUrl;

    const { error: updateError } = await supabase
      .from("listings")
      .update({ qr_url: qrUrl })
      .eq("id", id);

    if (updateError) {
      console.error("QR DB update error:", updateError);
      return null;
    }

    return qrUrl;
  } catch (err) {
    console.error("QR generation error:", err);
    return null;
  }
}

module.exports = generateQrForTree;
