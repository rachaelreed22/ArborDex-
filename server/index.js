 // server/index.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config();

const supabase = require('./db');
const multer = require('multer');

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
// API ROUTES
// ===========================
const api = express.Router();

// Health check
api.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'ArborDex API' });
});

// CREATE LISTING (with QR generation + photo upload)
api.post("/listings", upload.array("photos"), async (req, res) => {
  try {
    const { title, description, location, latitude, longitude } = req.body;

    // 1. Insert listing into Supabase
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

    // 2. Generate QR code and get PUBLIC PNG URL
    const generateQrForTree = require("./utils/generateQrForTree");
    const qrUrl = await generateQrForTree(listing.id);

    // 3. Save QR URL to the listing
    await supabase
      .from("listings")
      .update({ qr_url: qrUrl })
      .eq("id", listing.id);

    // 4. Upload photos (if any)
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

    // 5. Return the listing INCLUDING the QR URL
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
// UPDATE LISTING (PATCH)
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

    // 1. Delete all photos for this listing
    await supabase
      .from('photos')
      .delete()
      .eq('listing_id', id);

    // 2. Delete the listing itself
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
// PHOTO ROUTES (unchanged)
// ===========================

// Add photo
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

// Set main photo
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
