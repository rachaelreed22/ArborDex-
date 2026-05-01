// server/utils/generateQrForTree.js
const QRCode = require("qrcode");
const supabase = require("../db");
const { createClient } = require("@supabase/supabase-js");
const { v4: uuidv4 } = require("uuid");

const writeSupabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : supabase;

async function generateQrForTree(id) {
  try {
    const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:5173";
    const qrData = `${appBaseUrl.replace(/\/$/, "")}/tag/${id}`;

    const qrBuffer = await QRCode.toBuffer(qrData, {
      type: "png",
      width: 600,
      margin: 2,
    });

    const fileName = `qr-codes/${id}-${uuidv4()}.png`;

    const { error: uploadError } = await writeSupabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .upload(fileName, qrBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("QR upload error:", uploadError);
      return null;
    }

    const { data: publicUrlData } = writeSupabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .getPublicUrl(fileName);

    const qrUrl = publicUrlData.publicUrl;

    const { error: updateError } = await writeSupabase
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
