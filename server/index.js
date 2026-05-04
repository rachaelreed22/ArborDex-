 // server/index.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const supabase = require('./db');
const multer = require('multer');
const fetch = require('node-fetch');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// QR routes
const qrRoutes = require("./qrRoutes");
app.use("/", qrRoutes);

// Multer setup
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
});

const PHOTO_BUCKET = process.env.SUPABASE_PHOTO_BUCKET || 'tree-photos';
const ASK_ARBORAI_BUCKET = process.env.SUPABASE_ASK_ARBORAI_BUCKET || PHOTO_BUCKET;
const PORT = process.env.PORT || 5000;

const ASK_ARBORAI_BUCKET_CANDIDATES = Array.from(
  new Set(
    [
      ASK_ARBORAI_BUCKET,
      PHOTO_BUCKET,
      process.env.SUPABASE_BUCKET,
      'tree-photos',
      'photos',
    ].filter(Boolean)
  )
);

const ARBORAI_REGIONAL_SCOPE = `You are ArborAI, a diagnostic and identification assistant specialized in trees and woody plants found in the Southwestern region of Missouri, USA. All identifications, health assessments, care recommendations, and species suggestions must be grounded in the ecology, climate, soil types, and native or commonly planted species of this region.

When identifying a tree:
- Prioritize species native or naturalized in Southwestern Missouri.
- Only consider out-of-region species if the photos strongly support it.
- Use local climate patterns, pests, diseases, and soil conditions in all reasoning.
- If a species is unlikely for this region, state that clearly and provide the closest regional match.

When giving care recommendations:
- Use Missouri-specific timing for pruning, fertilization, watering, and disease management.
- Reference pests and diseases common to Missouri (for example: emerald ash borer, oak wilt, cedar-apple rust).
- Avoid recommending treatments or species that do not apply to this region.

If more information is needed:
- Ask for additional photos (bark, leaves, buds, branching pattern, full tree silhouette).
- Suggest angles that are most useful for Missouri species differentiation.

Your knowledge base is restricted to the trees, shrubs, and woody plants found in Southwestern Missouri.`;

const HAS_SERVICE_ROLE = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STAFF_API_KEY = (process.env.STAFF_API_KEY || '').toString().trim();

function requireStaffAction(req, res, next) {
  if (!STAFF_API_KEY) return next();

  const incomingKey = (req.headers['x-staff-key'] || '').toString().trim();
  if (!incomingKey || incomingKey !== STAFF_API_KEY) {
    return res.status(403).json({ error: 'Forbidden: staff authorization required' });
  }

  return next();
}

const SMTP_HOST = (process.env.SMTP_HOST || '').toString().trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = (process.env.SMTP_USER || '').toString().trim();
const SMTP_PASS = (process.env.SMTP_PASS || '').toString().trim();
const SMTP_FROM = (process.env.SMTP_FROM || SMTP_USER || '').toString().trim();

const hasEmailConfig = Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && SMTP_FROM);
const mailTransporter = hasEmailConfig
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    })
  : null;

function extractLikelyEmail(photo) {
  const direct = [
    photo?.photographer_email,
    photo?.email,
  ].find((value) => typeof value === 'string' && value.includes('@'));

  if (direct) return direct.trim();

  const photographer = (photo?.photographer || '').toString().trim();
  if (photographer.includes('@')) {
    const angleMatch = photographer.match(/<([^>]+@[^>]+)>/);
    if (angleMatch?.[1]) return angleMatch[1].trim();
    return photographer;
  }

  return '';
}

function stripOptionalPhotographerFields(row) {
  const {
    photographer_first,
    photographer_last,
    photographer_email,
    ...legacyRow
  } = row;

  return legacyRow;
}

async function sendWinnerNotificationEmail({ toEmail, listingTitle, listingId }) {
  if (!mailTransporter) {
    console.warn('Winner email not sent: SMTP configuration is missing.');
    return { sent: false, reason: 'smtp_not_configured' };
  }

  if (!toEmail) {
    return { sent: false, reason: 'missing_recipient' };
  }

  const subject = `You won the ArborTag seasonal photo challenge for ${listingTitle || 'a tree'}!`;
  const text = [
    'Congratulations from ArborTag!',
    '',
    `Your photo was selected as the seasonal winner for ${listingTitle || 'a tree'} (${listingId}).`,
    'Your winning photo is now featured as the main display image.',
    '',
    'Thank you for participating in the community challenge.',
  ].join('\n');

  await mailTransporter.sendMail({
    from: SMTP_FROM,
    to: toEmail,
    subject,
    text,
  });

  return { sent: true };
}

const writeSupabase =
  HAS_SERVICE_ROLE
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : supabase;

// ===========================
// API ROUTER
// ===========================
const api = express.Router();

// Health check
api.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ArborDex API',
    has_service_role: HAS_SERVICE_ROLE,
    staff_guard_enabled: Boolean(STAFF_API_KEY),
    winner_email_enabled: Boolean(mailTransporter),
  });
});

// ===========================
// CREATE LISTING
// ===========================
api.post("/listings", upload.array("photos"), async (req, res) => {
  try {
    const {
      title,
      description,
      location,
      latitude,
      longitude,
      qr_mode,
      scanned_qr_url,
      custom_id,
    } = req.body;

    const qrMode = qr_mode === 'scanned' ? 'scanned' : 'generate';
    const customId = (custom_id || '').toString().trim();
    const scannedQrUrl = (scanned_qr_url || '').toString().trim();

    if (!title || !title.toString().trim()) {
      return res.status(400).json({ error: "Tree name is required" });
    }

    const listingInsert = {
      title: title.toString().trim(),
      description,
      location,
      latitude: latitude ? Number(latitude) : null,
      longitude: longitude ? Number(longitude) : null,
    };

    if (qrMode === 'scanned' && customId) {
      listingInsert.id = customId;
    }

    const { data: listing, error: insertError } = await writeSupabase
      .from("listings")
      .insert([listingInsert])
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return res.status(500).json({
        error: insertError.message || "Failed to create listing",
        hint: "Check Supabase write permissions and server env keys.",
      });
    }

    let qrUrl = null;
    if (qrMode === 'generate') {
      const generateQrForTree = require("./utils/generateQrForTree");
      qrUrl = await generateQrForTree(listing.id);

      await writeSupabase
        .from("listings")
        .update({ qr_url: qrUrl })
        .eq("id", listing.id);
    } else {
      qrUrl = scannedQrUrl || null;
      if (!qrUrl) {
        const appBaseUrl = (process.env.APP_BASE_URL || '').toString().trim();
        if (appBaseUrl) {
          qrUrl = `${appBaseUrl.replace(/\/$/, '')}/tag/${listing.id}`;
        }
      }

      if (qrUrl) {
        await writeSupabase
          .from("listings")
          .update({ qr_url: qrUrl })
          .eq("id", listing.id);
      }
    }

    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const filePath = `${listing.id}/${file.originalname}`;

        const { error: uploadError } = await writeSupabase.storage
          .from(PHOTO_BUCKET)
          .upload(filePath, file.buffer, {
            contentType: file.mimetype,
            upsert: true,
          });

        if (!uploadError) {
          const { data: publicUrlData } = writeSupabase.storage
            .from(PHOTO_BUCKET)
            .getPublicUrl(filePath);

          await writeSupabase.from("photos").insert([
            {
              listing_id: listing.id,
              url: publicUrlData.publicUrl,
              is_main: i === 0,
              staff_uploaded: true,
            },
          ]);
        }
      }
    }

    res.status(201).json({ ...listing, qr_url: qrUrl });

  } catch (err) {
    console.error("Unexpected error:", err);
    res.status(500).json({ error: "Unexpected error" });
  }
});

// ===========================
// DIAGNOSTICS LOGS
// ===========================
api.get('/listings/:id/diagnostics-logs', async (req, res) => {
  try {
    const id = req.params.id;

    const { data, error } = await writeSupabase
      .from('tree_diagnostics_logs')
      .select('id, listing_id, run_at, source, diagnostics, notes, created_at')
      .eq('listing_id', id)
      .order('run_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Diagnostics log fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch diagnostics logs' });
    }

    return res.json(Array.isArray(data) ? data : []);
  } catch (err) {
    console.error('Unexpected diagnostics log fetch error:', err);
    return res.status(500).json({ error: 'Unexpected diagnostics log fetch error' });
  }
});

api.post('/listings/:id/diagnostics-log', requireStaffAction, async (req, res) => {
  try {
    const listingId = req.params.id;
    const {
      run_at,
      source,
      diagnostics,
      notes,
    } = req.body || {};

    const payload = {
      listing_id: listingId,
      run_at: run_at || new Date().toISOString(),
      source: (source || 'manual').toString(),
      diagnostics: diagnostics || {},
      notes: notes || null,
    };

    const { data, error } = await writeSupabase
      .from('tree_diagnostics_logs')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      console.error('Diagnostics log insert error:', error);
      return res.status(500).json({ error: 'Failed to store diagnostics log' });
    }

    return res.status(201).json(data);
  } catch (err) {
    console.error('Unexpected diagnostics log insert error:', err);
    return res.status(500).json({ error: 'Unexpected diagnostics log insert error' });
  }
});

// ===========================
// GET ALL LISTINGS
// ===========================
api.get('/listings', async (req, res) => {
  try {
    const { data, error } = await writeSupabase
      .from('listings')
      .select(`
        id,
        title,
        description,
        location,
        latitude,
        longitude,
        qr_url,
        photos(*)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error fetching listings:", error);
      return res.status(500).json({ error: "Failed to fetch listings" });
    }

    res.json(data || []);
  } catch (err) {
    console.error("Unexpected error fetching listings:", err);
    res.status(500).json({ error: "Unexpected error" });
  }
});

// ===========================
// GET SINGLE LISTING
// ===========================
api.get('/listings/:id', async (req, res) => {
  try {
    const id = req.params.id;

    const { data, error } = await writeSupabase
      .from('listings')
      .select(`
        id,
        title,
        description,
        location,
        latitude,
        longitude,
        qr_url,
        photos(*)
      `)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error("Error fetching listing:", error);
      return res.status(404).json({ error: "Listing not found" });
    }

    if (!data) {
      return res.status(404).json({ error: "Listing not found" });
    }

    res.json(data);
  } catch (err) {
    console.error("Unexpected error fetching listing:", err);
    res.status(500).json({ error: "Unexpected error" });
  }
});

// ===========================
// UPDATE LISTING
// ===========================
api.patch('/listings/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { title, description, location, latitude, longitude } = req.body;

    const updateData = {
      title: title ?? null,
      description: description ?? null,
      location: location ?? null,
      latitude: latitude ? Number(latitude) : null,
      longitude: longitude ? Number(longitude) : null,
    };

    const { data, error } = await writeSupabase
      .from('listings')
      .update(updateData)
      .eq('id', id)
      .select(`
        id,
        title,
        description,
        location,
        latitude,
        longitude,
        qr_url,
        photos(*)
      `)
      .single();

    if (error) {
      console.error("Error updating listing:", error);
      return res.status(500).json({ error: "Failed to update listing" });
    }

    res.json(data);
  } catch (err) {
    console.error("Unexpected error updating listing:", err);
    res.status(500).json({ error: "Unexpected error" });
  }
});

// ===========================
// DELETE LISTING
// ===========================
api.delete('/listings/:id', async (req, res) => {
  try {
    if (!HAS_SERVICE_ROLE) {
      return res.status(500).json({
        error: 'SUPABASE_SERVICE_ROLE_KEY is missing on backend; delete is disabled.',
      });
    }

    const id = decodeURIComponent((req.params.id || '').toString()).trim();

    if (!id) {
      return res.status(400).json({ error: 'Listing id is required' });
    }

    const { data: existingListing, error: readError } = await writeSupabase
      .from('listings')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (readError) {
      console.error('Error checking listing before delete:', readError);
      return res.status(500).json({ error: 'Failed to verify listing before delete' });
    }

    if (!existingListing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    await writeSupabase
      .from('photos')
      .delete()
      .eq('listing_id', id);

    const { error } = await writeSupabase
      .from('listings')
      .delete()
      .eq('id', id);

    if (error) {
      console.error("Error deleting listing:", error);
      return res.status(500).json({ error: "Failed to delete listing" });
    }

    const { data: postDeleteCheck, error: postDeleteError } = await writeSupabase
      .from('listings')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (postDeleteError) {
      console.error('Error verifying delete:', postDeleteError);
      return res.status(500).json({ error: 'Delete verification failed' });
    }

    if (postDeleteCheck) {
      return res.status(500).json({
        error: 'Delete reported success but listing still exists. Verify Supabase RLS and service-role key configuration.',
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Unexpected error deleting listing:", err);
    res.status(500).json({ error: "Unexpected error" });
  }
});

// ===========================
// PHOTO ROUTES
// ===========================
api.post('/photos/upload', upload.array('photos', 10), async (req, res) => {
  try {
    const listingId = decodeURIComponent((req.body?.listingId || '').toString()).trim();
    const files = Array.isArray(req.files) ? req.files : [];

    if (!listingId) {
      return res.status(400).json({ error: 'listingId is required' });
    }

    if (files.length === 0) {
      return res.status(400).json({ error: 'At least one photo is required' });
    }

    const { data: listing, error: listingError } = await writeSupabase
      .from('listings')
      .select('id')
      .eq('id', listingId)
      .maybeSingle();

    if (listingError) {
      console.error('Error verifying listing for upload:', listingError);
      return res.status(500).json({ error: 'Failed to verify listing' });
    }

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const { data: existingMain, error: existingMainError } = await writeSupabase
      .from('photos')
      .select('id')
      .eq('listing_id', listingId)
      .eq('is_main', true)
      .limit(1);

    if (existingMainError) {
      console.error('Error checking existing main photo:', existingMainError);
      return res.status(500).json({ error: 'Failed to validate existing photos' });
    }

    const hasMainPhoto = Array.isArray(existingMain) && existingMain.length > 0;
    const staffUploaded = req.body?.staffUploaded === true || req.body?.staffUploaded === 'true';
    const firstName = (req.body?.firstName || '').toString().trim();
    const lastName = (req.body?.lastName || '').toString().trim();
    const email = (req.body?.email || '').toString().trim();
    const photographerName = [firstName, lastName].filter(Boolean).join(' ').trim();
    const photographer = photographerName && email
      ? `${photographerName} <${email}>`
      : (photographerName || email || null);

    const insertRows = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const safeName = (file.originalname || 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${listingId}/${Date.now()}-${Math.random().toString(16).slice(2)}-${safeName}`;

      const { error: uploadError } = await writeSupabase.storage
        .from(PHOTO_BUCKET)
        .upload(filePath, file.buffer, {
          contentType: file.mimetype || 'image/jpeg',
          upsert: false,
        });

      if (uploadError) {
        console.error('Photo storage upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload photo to storage' });
      }

      const { data: publicUrlData } = writeSupabase.storage
        .from(PHOTO_BUCKET)
        .getPublicUrl(filePath);

      insertRows.push({
        listing_id: listingId,
        url: publicUrlData?.publicUrl,
        is_main: !hasMainPhoto && i === 0,
        staff_uploaded: staffUploaded,
        photographer,
        photographer_first: firstName || null,
        photographer_last: lastName || null,
        photographer_email: email || null,
      });
    }

    let { data: savedPhotos, error: insertError } = await writeSupabase
      .from('photos')
      .insert(insertRows)
      .select('*');

    if (insertError && /photographer_(first|last|email)/i.test(insertError.message || '')) {
      const legacyRows = insertRows.map(stripOptionalPhotographerFields);
      const retryResult = await writeSupabase
        .from('photos')
        .insert(legacyRows)
        .select('*');

      savedPhotos = retryResult.data;
      insertError = retryResult.error;
    }

    if (insertError) {
      console.error('Photo DB insert error:', insertError);
      return res.status(500).json({ error: 'Failed to save photo records' });
    }

    return res.status(201).json({ uploaded: savedPhotos?.length || 0, photos: savedPhotos || [] });
  } catch (err) {
    console.error('Unexpected photos/upload error:', err);
    return res.status(500).json({ error: 'Unexpected upload error' });
  }
});

api.post('/photos', async (req, res) => {
  try {
    const {
      listingId,
      url,
      photographer,
      staffUploaded,
      firstName,
      lastName,
      email,
    } = req.body;

    if (!listingId || !url) {
      return res.status(400).json({ error: 'listingId and url are required' });
    }

    const insertPayload = {
      listing_id: listingId,
      url,
      photographer: photographer || null,
      staff_uploaded: staffUploaded === true || staffUploaded === 'true',
      photographer_first: firstName || null,
      photographer_last: lastName || null,
      photographer_email: email || null,
    };

    let { data, error } = await writeSupabase
      .from('photos')
      .insert([insertPayload])
      .select()
      .single();

    if (error && /photographer_(first|last|email)/i.test(error.message || '')) {
      const retry = await writeSupabase
        .from('photos')
        .insert([stripOptionalPhotographerFields(insertPayload)])
        .select()
        .single();

      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('Error creating photo:', error);
      return res.status(500).json({ error: 'Failed to create photo' });
    }

    res.status(201).json(data);
  } catch (err) {
    console.error('Unexpected error creating photo:', err);
    res.status(500).json({ error: 'Unexpected error' });
  }
});

api.patch('/photos/:id/main', requireStaffAction, async (req, res) => {
  try {
    const id = req.params.id;

    const { data: photo, error: photoError } = await writeSupabase
      .from('photos')
      .select('id, listing_id')
      .eq('id', id)
      .single();

    if (photoError || !photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    const listingId = photo.listing_id;

    await writeSupabase.from('photos').update({ is_main: false }).eq('listing_id', listingId);

    const { data: updated, error: setError } = await writeSupabase
      .from('photos')
      .update({ is_main: true })
      .eq('id', id)
      .select()
      .single();

    if (setError) {
      return res.status(500).json({ error: 'Failed to set main photo' });
    }

    res.json(updated);
  } catch (err) {
    console.error('Unexpected error setting main photo:', err);
    res.status(500).json({ error: 'Unexpected error' });
  }
});

api.patch('/photos/:id/winner', requireStaffAction, async (req, res) => {
  try {
    const id = req.params.id;

    const { data: photo, error: photoError } = await writeSupabase
      .from('photos')
      .select('*')
      .eq('id', id)
      .single();

    if (photoError || !photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    const listingId = photo.listing_id;

    await writeSupabase.from('photos').update({ winner: false }).eq('listing_id', listingId);
    await writeSupabase.from('photos').update({ is_main: false }).eq('listing_id', listingId);

    const { data: updated, error: setError } = await writeSupabase
      .from('photos')
      .update({ winner: true, is_main: true })
      .eq('id', id)
      .select()
      .single();

    if (setError) {
      return res.status(500).json({ error: 'Failed to set winner photo' });
    }

    const { data: listingInfo } = await writeSupabase
      .from('listings')
      .select('id, title')
      .eq('id', listingId)
      .maybeSingle();

    const toEmail = extractLikelyEmail(photo);
    let emailResult = { sent: false, reason: 'not_attempted' };

    try {
      emailResult = await sendWinnerNotificationEmail({
        toEmail,
        listingTitle: listingInfo?.title || '',
        listingId,
      });
    } catch (mailErr) {
      console.error('Winner notification email failed:', mailErr);
      emailResult = { sent: false, reason: 'send_failed' };
    }

    res.json({ ...updated, winner_email: emailResult });
  } catch (err) {
    console.error('Unexpected error setting winner photo:', err);
    res.status(500).json({ error: 'Unexpected error' });
  }
});

api.patch('/photos/:id/approve', requireStaffAction, async (req, res) => {
  try {
    const id = req.params.id;

    const { data: updated, error } = await writeSupabase
      .from('photos')
      .update({ staff_uploaded: true })
      .eq('id', id)
      .select()
      .single();

    if (error || !updated) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    res.json(updated);
  } catch (err) {
    console.error('Unexpected error approving photo:', err);
    res.status(500).json({ error: 'Unexpected error' });
  }
});

api.delete('/photos/:id', requireStaffAction, async (req, res) => {
  try {
    const id = req.params.id;

    const { error } = await writeSupabase
      .from('photos')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(500).json({ error: 'Failed to delete photo' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Unexpected error deleting photo:', err);
    res.status(500).json({ error: 'Unexpected error' });
  }
});

// ===========================
// AI ROUTE — Analyze Tree (Dex mode diagnostics)
// ===========================
api.get('/ai/analyze-tree/:id', async (req, res) => {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
    }

    const id = req.params.id;
    console.log(`[AI Diagnostics] analyze-tree hit for listing ${id}`);

    const { data: listing, error } = await writeSupabase
      .from('listings')
      .select('id, title, description, location, latitude, longitude')
      .eq('id', id)
      .single();

    if (error || !listing) {
      return res.status(404).json({ error: "Listing not found" });
    }

    const { data: photoRows, error: photoError } = await writeSupabase
      .from('photos')
      .select('id, url, is_main, created_at')
      .eq('listing_id', id)
      .order('is_main', { ascending: false })
      .order('created_at', { ascending: true });

    if (photoError) {
      console.error('Error fetching photos for diagnostics:', photoError);
      return res.status(500).json({ error: 'Failed to fetch photos for diagnostics' });
    }

    const photos = Array.isArray(photoRows) ? photoRows.filter((p) => p?.url) : [];
    const uniquePhotos = Array.from(new Map(photos.map((p) => [p.url, p])).values());

    if (uniquePhotos.length === 0) {
      return res.json({
        species: 'Unknown',
        environment: null,
        summary: 'No photos available for diagnostics.',
        recommendations: ['Upload at least one clear tree photo.'],
        public_about: 'This tree is waiting for its first photo and identification. Once photos are uploaded, ArborAI will add a friendly public description here.',
        photo_summaries: [],
        alerts: ['No photos available'],
        health_score: '0/10',
        confidence: 'Low',
        risk_flags: []
      });
    }

    // Analyze all photos when fewer than 3 exist, else analyze at least 3 (up to 5).
    const photosToAnalyzeCount = uniquePhotos.length >= 3
      ? Math.min(uniquePhotos.length, 5)
      : uniquePhotos.length;
    const photosToAnalyze = uniquePhotos.slice(0, photosToAnalyzeCount);

    const treeSummary = `
Tree ID: ${listing.id}
Title: ${listing.title || "Untitled"}
Location: ${listing.location || "Unknown"}
Latitude: ${listing.latitude ?? "Unknown"}
Longitude: ${listing.longitude ?? "Unknown"}
Description: ${listing.description || "No description provided."}
Total Photos: ${photos.length}
Photos Sent For AI Analysis: ${photosToAnalyze.length}
    `.trim();

    const hasExistingDescription = typeof listing.description === 'string' && listing.description.trim().length > 0;
    const speciesGuess = listing.title && listing.title !== 'Untitled Tree' && listing.title !== 'Untitled'
      ? listing.title
      : 'This tree';

    function buildFallbackDiagnostics(reasonText) {
      const publicAbout = `${speciesGuess} is a wonderful part of this landscape. While ArborAI is temporarily busy, this tree appears to be a healthy and valuable part of the local environment. Fun fact: mature trees help cool surrounding areas and support local wildlife.`;

      return {
        species: speciesGuess,
        environment: listing.location || 'a maintained landscape setting',
        summary: `Automated diagnostics are temporarily limited. ${reasonText}`,
        recommendations: [
          'Continue routine watering and seasonal tree care.',
          'Inspect leaves and branches regularly for visible stress.',
          'Re-run diagnostics shortly for detailed species and health insights.'
        ],
        public_about: publicAbout,
        photo_summaries: photosToAnalyze.map((_, index) => `Photo ${index + 1}: AI photo insight is temporarily unavailable due to service limits.`),
        alerts: ['Diagnostics temporarily unavailable'],
        health_score: 'Pending',
        confidence: 'Low',
        risk_flags: []
      };
    }

    async function persistPublicAboutIfMissing(publicAboutText) {
      if (hasExistingDescription || !publicAboutText) return;
      const { error: updateDescriptionError } = await writeSupabase
        .from('listings')
        .update({ description: publicAboutText })
        .eq('id', id);

      if (updateDescriptionError) {
        console.error('Failed to persist public about text:', updateDescriptionError);
      }
    }

    const systemPrompt = `${ARBORAI_REGIONAL_SCOPE}

  Analyze the provided tree data and photos and respond ONLY with a valid JSON object (no markdown, no explanation) with these exact keys:
- species: string (identified species or best guess)
- environment: string (description of the surrounding environment)
- summary: string (overall assessment of the tree)
- recommendations: array of strings (actionable care steps)
- public_about: string (friendly, upbeat, non-technical public-facing description with one fun fact)
- photo_summaries: array of strings (one brief observation per photo)
- alerts: array of strings (urgent issues, empty array if none)
- health_score: string (e.g. "Good", "Fair", "Poor", or a score like "7/10")
- confidence: string (e.g. "High", "Medium", "Low")
  - risk_flags: array of strings (potential hazards, empty array if none)
  IMPORTANT: photo_summaries must contain exactly ${photosToAnalyze.length} non-empty items, in the same order as the provided photos.`;

    const userContent = [
      {
        type: "text",
        text: `Analyze this tree:\n\n${treeSummary}\n\nProvide one short summary for each photo in order.`
      },
      ...photosToAnalyze.map((p, index) => ({
        type: "text",
        text: `Photo ${index + 1}`
      })),
      ...photosToAnalyze.map(p => ({
        type: "image_url",
        image_url: { url: p.url }
      }))
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ],
        response_format: { type: "json_object" },
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI error:", errText);

      const isRateLimit = errText.includes('rate_limit_exceeded');
      const fallbackDiagnostics = buildFallbackDiagnostics(
        isRateLimit
          ? 'OpenAI rate limits were reached during this request.'
          : 'The AI provider returned an error during analysis.'
      );

      await persistPublicAboutIfMissing(fallbackDiagnostics.public_about);
      return res.status(200).json(fallbackDiagnostics);
    }

    const aiData = await response.json();
    const raw = aiData.choices?.[0]?.message?.content || "{}";

    let diagnostics;
    try {
      diagnostics = JSON.parse(raw);
    } catch {
      console.error("Failed to parse AI JSON:", raw);
      const fallbackDiagnostics = buildFallbackDiagnostics('The AI response format was invalid for this request.');
      await persistPublicAboutIfMissing(fallbackDiagnostics.public_about);
      return res.status(200).json(fallbackDiagnostics);
    }

    const rawPhotoSummaries = Array.isArray(diagnostics.photo_summaries)
      ? diagnostics.photo_summaries
      : [];

    const normalizedPhotoSummaries = rawPhotoSummaries
      .slice(0, photosToAnalyze.length)
      .map((item, index) => {
        if (typeof item === 'string') {
          const text = item.trim();
          return text || `Photo ${index + 1}: No summary returned.`;
        }

        if (item && typeof item === 'object') {
          const text = (item.summary || item.text || item.description || '').toString().trim();
          return text || `Photo ${index + 1}: No summary returned.`;
        }

        return `Photo ${index + 1}: No summary returned.`;
      });

    while (normalizedPhotoSummaries.length < photosToAnalyze.length) {
      normalizedPhotoSummaries.push(`Photo ${normalizedPhotoSummaries.length + 1}: No summary returned.`);
    }

    diagnostics.photo_summaries = normalizedPhotoSummaries;

    const speciesName = diagnostics?.species && diagnostics.species !== 'Unknown'
      ? diagnostics.species
      : (listing.title || 'this tree');

    const summaryText = (diagnostics?.summary || '').toString().trim();
    const environmentText = (diagnostics?.environment || '').toString().trim();
    const firstRecommendation = Array.isArray(diagnostics?.recommendations)
      ? (diagnostics.recommendations.find((r) => typeof r === 'string' && r.trim()) || '')
      : '';

    let publicAbout = (diagnostics?.public_about || '').toString().trim();
    if (!publicAbout) {
      const summarySentence = summaryText || `${speciesName} appears healthy and is a great example of local tree life.`;
      const environmentSentence = environmentText
        ? `It is growing in ${environmentText.toLowerCase()}.`
        : 'It is a valuable part of its local ecosystem.';
      const careSentence = firstRecommendation
        ? `A simple care tip: ${firstRecommendation}`
        : 'With regular seasonal care, this tree can continue to thrive for years.';
      publicAbout = `${speciesName} is an amazing tree to have in this area. ${summarySentence} ${environmentSentence} ${careSentence}`;
    }

    diagnostics.public_about = publicAbout;

    await persistPublicAboutIfMissing(publicAbout);

    res.json(diagnostics);

  } catch (err) {
    console.error("Unexpected error in analyze-tree:", err);
    res.status(500).json({ error: "Unexpected error" });
  }
});

// ===========================
// AI ROUTE — Ask ArborAI (Public scanner + chat)
// ===========================
api.post('/ai/ask-arborai', upload.array('photos', 6), async (req, res) => {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY is not set' });
    }

    const question = (req.body?.question || '').toString().trim();
    const files = Array.isArray(req.files) ? req.files : [];

    const uploadedPhotoUrls = [];
    const aiImageUrls = [];
    for (const file of files) {
      const safeName = (file.originalname || 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `ask-arborai/${Date.now()}-${Math.random().toString(16).slice(2)}-${safeName}`;

      let uploadedBucket = null;
      for (const bucketName of ASK_ARBORAI_BUCKET_CANDIDATES) {
        const { error: uploadError } = await writeSupabase.storage
          .from(bucketName)
          .upload(filePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          });

        if (!uploadError) {
          uploadedBucket = bucketName;
          break;
        }

        if (uploadError?.statusCode !== '404') {
          console.error(`Ask ArborAI storage upload error (${bucketName}):`, uploadError);
        }
      }

      if (!uploadedBucket) {
        console.error('Ask ArborAI storage upload failed for all candidate buckets.');
        // Fallback: still send the image to the vision model as inline data URL.
        const base64 = file.buffer.toString('base64');
        aiImageUrls.push(`data:${file.mimetype || 'image/jpeg'};base64,${base64}`);
        continue;
      }

      const { data: publicData } = writeSupabase.storage
        .from(uploadedBucket)
        .getPublicUrl(filePath);

      if (publicData?.publicUrl) {
        uploadedPhotoUrls.push(publicData.publicUrl);
        aiImageUrls.push(publicData.publicUrl);
      }
    }

    if (!question && aiImageUrls.length === 0) {
      return res.status(400).json({ error: 'Provide a question or at least one photo.' });
    }

    const systemPrompt = `${ARBORAI_REGIONAL_SCOPE}

  Respond ONLY as valid JSON with these exact keys:
- species: string
- confidence: string
- health_score: number (0-100)
- summary: string
- risks: array of strings
- recommendations: array of strings
- photo_summaries: array of strings
- raw_ai_message: string (friendly conversational chat response)
If information is uncertain, state best estimate and keep raw_ai_message supportive and non-technical.`;

    const userContent = [
      {
        type: 'text',
        text: `User question: ${question || 'Please analyze these tree photos and provide identification and diagnostics.'}`,
      },
      ...aiImageUrls.map((url, index) => ({
        type: 'text',
        text: `Photo ${index + 1}`,
      })),
      ...aiImageUrls.map((url) => ({
        type: 'image_url',
        image_url: { url },
      })),
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 900,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Ask ArborAI OpenAI error:', errText);
      return res.status(502).json({ error: 'AI request failed' });
    }

    const openAiData = await response.json();
    const rawContent = openAiData?.choices?.[0]?.message?.content || '{}';

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      parsed = {};
    }

    const payload = {
      species: (parsed.species || 'Unknown').toString(),
      confidence: (parsed.confidence || 'Low').toString(),
      health_score: Number.isFinite(Number(parsed.health_score))
        ? Math.max(0, Math.min(100, Number(parsed.health_score)))
        : 0,
      summary: (parsed.summary || 'ArborAI could not produce a detailed summary for this scan.').toString(),
      risks: Array.isArray(parsed.risks)
        ? parsed.risks.map((item) => item.toString()).filter(Boolean)
        : [],
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.map((item) => item.toString()).filter(Boolean)
        : [],
      photo_summaries: Array.isArray(parsed.photo_summaries)
        ? parsed.photo_summaries.map((item) => item.toString()).filter(Boolean)
        : [],
      raw_ai_message: (parsed.raw_ai_message || 'Here is your scan summary from ArborAI.').toString(),
      photo_urls: uploadedPhotoUrls,
    };

    res.json(payload);
  } catch (err) {
    console.error('Unexpected Ask ArborAI error:', err);
    res.status(500).json({ error: 'Unexpected Ask ArborAI error' });
  }
});

// ===========================
// AI ROUTE — Create Tree From Ask ArborAI Scan
// ===========================
api.post('/ai/create-tree-from-scan', async (req, res) => {
  try {
    const {
      species,
      summary,
      raw_ai_message,
      photo_urls,
      confidence,
      health_score,
      recommendations,
    } = req.body || {};

    const normalizedSpecies = (species || 'Untitled Tree').toString().trim();
    const title = normalizedSpecies || 'Untitled Tree';

    const descriptionParts = [
      typeof summary === 'string' ? summary.trim() : '',
      typeof raw_ai_message === 'string' ? raw_ai_message.trim() : '',
      confidence ? `Confidence: ${confidence}` : '',
      health_score !== undefined && health_score !== null ? `Health score: ${health_score}` : '',
      Array.isArray(recommendations) && recommendations.length > 0
        ? `Care tips: ${recommendations.slice(0, 2).join(' ')}`
        : '',
    ].filter(Boolean);

    const description = descriptionParts.join('\n\n') || 'Created from Ask ArborAI scan.';

    const { data: listing, error: insertError } = await writeSupabase
      .from('listings')
      .insert([
        {
          title,
          description,
          location: null,
          latitude: null,
          longitude: null,
        },
      ])
      .select('id, title, description')
      .single();

    if (insertError || !listing) {
      console.error('Create from scan listing insert error:', insertError);
      return res.status(500).json({ error: 'Failed to create listing from scan' });
    }

    const generateQrForTree = require('./utils/generateQrForTree');
    const qrUrl = await generateQrForTree(listing.id);
    await writeSupabase.from('listings').update({ qr_url: qrUrl }).eq('id', listing.id);

    const normalizedUrls = Array.from(
      new Set(
        (Array.isArray(photo_urls) ? photo_urls : [])
          .map((url) => (typeof url === 'string' ? url.trim() : ''))
          .filter((url) => /^https?:\/\//i.test(url))
      )
    );

    if (normalizedUrls.length > 0) {
      const photoRows = normalizedUrls.map((url, index) => ({
        listing_id: listing.id,
        url,
        is_main: index === 0,
        staff_uploaded: true,
        photographer: 'Ask ArborAI',
      }));

      const { error: photoInsertError } = await writeSupabase.from('photos').insert(photoRows);
      if (photoInsertError) {
        console.error('Create from scan photo insert error:', photoInsertError);
      }
    }

    return res.status(201).json({
      listing_id: listing.id,
      qr_url: qrUrl,
      added_photos: normalizedUrls.length,
    });
  } catch (err) {
    console.error('Unexpected create-tree-from-scan error:', err);
    return res.status(500).json({ error: 'Unexpected create-tree-from-scan error' });
  }
});

// ===========================
// AI ROUTE — Attach Ask ArborAI Scan To Existing Tree
// ===========================
api.post('/ai/attach-scan-to-tree', async (req, res) => {
  try {
    const { listing_id, photo_urls, summary, raw_ai_message } = req.body || {};

    if (!listing_id) {
      return res.status(400).json({ error: 'listing_id is required' });
    }

    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('id, description')
      .eq('id', listing_id)
      .single();

    if (listingError || !listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const incomingUrls = Array.from(
      new Set(
        (Array.isArray(photo_urls) ? photo_urls : [])
          .map((url) => (typeof url === 'string' ? url.trim() : ''))
          .filter((url) => /^https?:\/\//i.test(url))
      )
    );

    if (incomingUrls.length === 0) {
      return res.status(400).json({ error: 'No valid photo_urls provided for attach.' });
    }

    const { data: existingPhotos, error: existingPhotosError } = await supabase
      .from('photos')
      .select('id, url')
      .eq('listing_id', listing_id);

    if (existingPhotosError) {
      console.error('Attach scan existing photo lookup error:', existingPhotosError);
      return res.status(500).json({ error: 'Failed to check existing photos' });
    }

    const existingUrlSet = new Set((existingPhotos || []).map((photo) => photo.url));
    const urlsToInsert = incomingUrls.filter((url) => !existingUrlSet.has(url));

    if (urlsToInsert.length > 0) {
      const hasAnyExistingPhotos = Array.isArray(existingPhotos) && existingPhotos.length > 0;

      const insertRows = urlsToInsert.map((url, index) => ({
        listing_id,
        url,
        is_main: !hasAnyExistingPhotos && index === 0,
        staff_uploaded: true,
        photographer: 'Ask ArborAI',
      }));

      const { error: insertPhotoError } = await supabase.from('photos').insert(insertRows);
      if (insertPhotoError) {
        console.error('Attach scan insert photo error:', insertPhotoError);
        return res.status(500).json({ error: 'Failed to attach photos to listing' });
      }
    }

    const hasDescription = typeof listing.description === 'string' && listing.description.trim().length > 0;
    if (!hasDescription) {
      const attachDescription =
        (typeof raw_ai_message === 'string' && raw_ai_message.trim()) ||
        (typeof summary === 'string' && summary.trim()) ||
        '';

      if (attachDescription) {
        await supabase.from('listings').update({ description: attachDescription }).eq('id', listing_id);
      }
    }

    return res.json({
      listing_id,
      added_photos: urlsToInsert.length,
    });
  } catch (err) {
    console.error('Unexpected attach-scan-to-tree error:', err);
    return res.status(500).json({ error: 'Unexpected attach-scan-to-tree error' });
  }
});

// ===========================
// AI ROUTE — OpenAI Vision (CORRECT FORMAT)
// ===========================
api.post('/ai/tree', async (req, res) => {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
    }

    const { question, listing } = req.body;

    if (!question || !listing) {
      return res.status(400).json({ error: "question and listing are required" });
    }

    const photos = Array.isArray(listing.photos) ? listing.photos : [];

    const treeSummary = `
Tree ID: ${listing.id}
Title: ${listing.title || "Untitled"}
Location: ${listing.location || "Unknown"}
Latitude: ${listing.latitude ?? "Unknown"}
Longitude: ${listing.longitude ?? "Unknown"}
Description: ${listing.description || "No description provided."}
Total Photos: ${photos.length}
    `.trim();

    const prompt = `
  Analyze the provided tree photos and answer the user's question.

Tree data:
${treeSummary}

User question:
${question}
    `.trim();

    // Build messages correctly
    const messages = [
      {
        role: "system",
        content: `${ARBORAI_REGIONAL_SCOPE}\n\nYou are a helpful assistant that analyzes trees and photos.`
      },
      {
        role: "user",
        content: prompt
      },
      ...photos.slice(0, 5).map(p => ({
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: p.url }
          }
        ]
      }))
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI error:", errText);
      return res.status(500).json({ error: "AI request failed" });
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content || "I couldn't generate a response.";

    res.json({ answer });

  } catch (err) {
    console.error("Unexpected AI error:", err);
    res.status(500).json({ error: "Unexpected AI error" });
  }
});

// ===========================
// MOUNT API
// ===========================
app.use('/api', api);

// ===========================
// STATIC FILES + SPA FALLBACK
// ===========================
const distPath = path.join(__dirname, '..', 'client', 'dist');
const distIndexPath = path.join(distPath, 'index.html');
const distAssetsPath = path.join(distPath, 'assets');

if (fs.existsSync(distPath)) {
  if (fs.existsSync(distAssetsPath)) {
    app.use(
      '/assets',
      express.static(distAssetsPath, {
        maxAge: '1y',
        immutable: true,
      })
    );
  }

  app.use(
    express.static(distPath, {
      index: false,
      maxAge: 0,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-store');
        }
      },
    })
  );

  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();

    // Do not serve SPA shell for asset/file requests.
    if (path.extname(req.path)) {
      return res.status(404).end();
    }

    // Keep HTML uncached so new deploys pick up new hashed asset filenames.
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(distIndexPath);
  });
} else {
  console.warn('Frontend build not found at ' + distPath);
  console.warn('Run "cd client && npm run build" to create it.');
}

// ===========================
// START SERVER
// ===========================
app.listen(PORT, () => {
  console.log('ArborDex API running on port ' + PORT);
});
