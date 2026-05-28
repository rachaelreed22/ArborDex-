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

function isValidHttpUrl(value) {
  try {
    const parsed = new URL((value || '').toString().trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_err) {
    return false;
  }
}

function resolveQrBaseUrl(explicitBaseUrl) {
  const candidates = [
    explicitBaseUrl,
    process.env.APP_BASE_URL,
    process.env.PUBLIC_APP_URL,
    process.env.CLIENT_URL,
  ];

  for (const candidate of candidates) {
    const next = (candidate || '').toString().trim();
    if (!next) continue;
    if (isValidHttpUrl(next)) return next.replace(/\/$/, '');
  }

  return 'http://localhost:5173';
}

async function generateQrForTree(id, options = {}) {
  try {
    const appBaseUrl = resolveQrBaseUrl(options.appBaseUrl);
    const qrData = `${appBaseUrl}/tag/${id}`;
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
