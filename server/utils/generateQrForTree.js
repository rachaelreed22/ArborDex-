// server/utils/generateQrForTree.js
const QRCode = require("qrcode");
const supabase = require("../db");
const { createClient } = require("@supabase/supabase-js");
const { v4: uuidv4 } = require("uuid");

const writeSupabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : supabase;

function buildFallbackQrUrl(qrData) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(qrData)}`;
}

async function generateQrForTree(id) {
  try {
    const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:5173";
    const qrData = `${appBaseUrl.replace(/\/$/, "")}/tag/${id}`;
    const fallbackQrUrl = buildFallbackQrUrl(qrData);

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
      console.error("QR upload error, using fallback URL:", uploadError);
      const { error: fallbackUpdateError } = await writeSupabase
        .from("listings")
        .update({ qr_url: fallbackQrUrl })
        .eq("id", id);

      if (fallbackUpdateError) {
        console.error("Fallback QR DB update error:", fallbackUpdateError);
        return null;
      }

      return fallbackQrUrl;
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
      console.error("QR DB update error, using fallback URL:", updateError);

      const { error: fallbackUpdateError } = await writeSupabase
        .from("listings")
        .update({ qr_url: fallbackQrUrl })
        .eq("id", id);

      if (fallbackUpdateError) {
        console.error("Fallback QR DB update error:", fallbackUpdateError);
        return null;
      }

      return fallbackQrUrl;
    }

    return qrUrl;
  } catch (err) {
    console.error("QR generation error:", err);
    return null;
  }
}

module.exports = generateQrForTree;
