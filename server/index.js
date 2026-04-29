 // server/index.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config();

const supabase = require('./db');
const multer = require('multer');
const fetch = require('node-fetch');

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
const PORT = process.env.PORT || 5000;

// ===========================
// API ROUTER
// ===========================
const api = express.Router();

// Health check
api.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'ArborDex API' });
});

// ===========================
// CREATE LISTING
// ===========================
api.post("/listings", upload.array("photos"), async (req, res) => {
  try {
    const { title, description, location, latitude, longitude } = req.body;

    const { data: listing, error: insertError } = await supabase
      .from("listings")
      .insert([
        {
          title,
          description,
          location,
          latitude: latitude ? Number(latitude) : null,
          longitude: longitude ? Number(longitude) : null,
        }
      ])
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return res.status(500).json({ error: "Failed to create listing" });
    }

    const generateQrForTree = require("./utils/generateQrForTree");
    const qrUrl = await generateQrForTree(listing.id);

    await supabase
      .from("listings")
      .update({ qr_url: qrUrl })
      .eq("id", listing.id);

    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const filePath = `${listing.id}/${file.originalname}`;

        const { error: uploadError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(filePath, file.buffer, {
            contentType: file.mimetype,
            upsert: true,
          });

        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage
            .from(PHOTO_BUCKET)
            .getPublicUrl(filePath);

          await supabase.from("photos").insert([
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
// GET ALL LISTINGS
// ===========================
api.get('/listings', async (req, res) => {
  try {
    const { data, error } = await supabase
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

    const { data, error } = await supabase
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
      .single();

    if (error) {
      console.error("Error fetching listing:", error);
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

    const { data, error } = await supabase
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
    const id = req.params.id;

    await supabase
      .from('photos')
      .delete()
      .eq('listing_id', id);

    const { error } = await supabase
      .from('listings')
      .delete()
      .eq('id', id);

    if (error) {
      console.error("Error deleting listing:", error);
      return res.status(500).json({ error: "Failed to delete listing" });
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
api.post('/photos', async (req, res) => {
  try {
    const { listingId, url, photographer } = req.body;

    if (!listingId || !url) {
      return res.status(400).json({ error: 'listingId and url are required' });
    }

    const { data, error } = await supabase
      .from('photos')
      .insert([{
        listing_id: listingId,
        url,
        photographer: photographer || null,
      }])
      .select()
      .single();

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

api.patch('/photos/:id/main', async (req, res) => {
  try {
    const id = req.params.id;

    const { data: photo, error: photoError } = await supabase
      .from('photos')
      .select('id, listing_id')
      .eq('id', id)
      .single();

    if (photoError || !photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    const listingId = photo.listing_id;

    await supabase.from('photos').update({ is_main: false }).eq('listing_id', listingId);

    const { data: updated, error: setError } = await supabase
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
You are ArborAI, a tree-focused assistant.

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
        content: "You are ArborAI, a helpful assistant that analyzes trees and photos."
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

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));

  app.use((req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
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
