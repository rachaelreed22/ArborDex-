// server/index.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const supabase = require('./db');
const multer = require("multer");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
});

const PHOTO_BUCKET = process.env.SUPABASE_PHOTO_BUCKET || "tree-photos";
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'ArborDex API' });
});

/**
 * LISTINGS
 */

// Create a listing
app.post('/listings', async (req, res) => {
  try {
    const { title, description, location } = req.body;

    const { data, error } = await supabase
      .from('listings')
      .insert([{ title, description, location }])
      .select()
      .single();

    if (error) {
      console.error('Error creating listing:', error);
      return res.status(500).json({ error: 'Failed to create listing' });
    }

    res.status(201).json(data);
  } catch (err) {
    console.error('Unexpected error creating listing:', err);
    res.status(500).json({ error: 'Unexpected error' });
  }
});

// Get all listings with photos
app.get('/listings', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('listings')
      .select(`
        id,
        title,
        description,
        location,
        created_at,
        photos (
          id,
          url,
          photographer,
          is_main,
          winner,
          created_at
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching listings:', error);
      return res.status(500).json({ error: 'Failed to fetch listings' });
    }

    res.json(data || []);
  } catch (err) {
    console.error('Unexpected error fetching listings:', err);
    res.status(500).json({ error: 'Unexpected error' });
  }
});

// Get a single listing with photos
app.get('/listings/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('listings')
      .select(`
        id,
        title,
        description,
        location,
        created_at,
        photos (
          id,
          url,
          photographer,
          is_main,
          winner,
          created_at
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching listing:', error);
      return res.status(404).json({ error: 'Listing not found' });
    }

    res.json(data);
  } catch (err) {
    console.error('Unexpected error fetching listing:', err);
    res.status(500).json({ error: 'Unexpected error' });
  }
});

/**
 * PHOTOS (metadata only – file already uploaded from frontend)
 */

// Add a photo record after upload
app.post('/photos', async (req, res) => {
  try {
    const { listingId, url, photographer } = req.body;

    if (!listingId || !url) {
      return res.status(400).json({ error: 'listingId and url are required' });
    }

    // Insert photo
    const { data, error } = await supabase
      .from('photos')
      .insert([
        {
          listing_id: listingId,
          url,
          photographer: photographer || null,
        },
      ])
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

// Set a photo as main for its listing
app.patch('/photos/:id/main', async (req, res) => {
  try {
    const { id } = req.params;

    // Get the photo to know its listing_id
    const { data: photo, error: photoError } = await supabase
      .from('photos')
      .select('id, listing_id')
      .eq('id', id)
      .single();

    if (photoError || !photo) {
      console.error('Photo not found:', photoError);
      return res.status(404).json({ error: 'Photo not found' });
    }

    const listingId = photo.listing_id;

    // Clear existing main photo for this listing
    const { error: clearError } = await supabase
      .from('photos')
      .update({ is_main: false })
      .eq('listing_id', listingId);

    if (clearError) {
      console.error('Error clearing main photo:', clearError);
      return res.status(500).json({ error: 'Failed to clear main photo' });
    }

    // Set this photo as main
    const { data: updated, error: setError } = await supabase
      .from('photos')
      .update({ is_main: true })
      .eq('id', id)
      .select()
      .single();

    if (setError) {
      console.error('Error setting main photo:', setError);
      return res.status(500).json({ error: 'Failed to set main photo' });
    }

    res.json(updated);
  } catch (err) {
    console.error('Unexpected error setting main photo:', err);
    res.status(500).json({ error: 'Unexpected error' });
  }
});

// Set a photo as winner for its listing
app.patch('/photos/:id/winner', async (req, res) => {
  try {
    const { id } = req.params;

    // Get the photo to know its listing_id
    const { data: photo, error: photoError } = await supabase
      .from('photos')
      .select('id, listing_id')
      .eq('id', id)
      .single();

    if (photoError || !photo) {
      console.error('Photo not found:', photoError);
      return res.status(404).json({ error: 'Photo not found' });
    }

    const listingId = photo.listing_id;

    // Clear existing winner for this listing
    const { error: clearError } = await supabase
      .from('photos')
      .update({ winner: false })
      .eq('listing_id', listingId);

    if (clearError) {
      console.error('Error clearing winner:', clearError);
      return res.status(500).json({ error: 'Failed to clear winner' });
    }

    // Set this photo as winner
    const { data: updated, error: setError } = await supabase
      .from('photos')
      .update({ winner: true })
      .eq('id', id)
      .select()
      .single();

    if (setError) {
      console.error('Error setting winner:', setError);
      return res.status(500).json({ error: 'Failed to set winner' });
    }

    res.json(updated);
  } catch (err) {
    console.error('Unexpected error setting winner:', err);
    res.status(500).json({ error: 'Unexpected error' });
  }
});

/**
 * STAFF REVIEWS
 */

// Create a staff review (usually starts as pending)
app.post('/reviews', async (req, res) => {
  try {
    const { photoId, status, reviewedBy } = req.body;

    if (!photoId) {
      return res.status(400).json({ error: 'photoId is required' });
    }

    const reviewStatus = status || 'pending';

    const { data, error } = await supabase
      .from('staff_reviews')
      .insert([
        {
          photo_id: photoId,
          status: reviewStatus,
          reviewed_by: reviewedBy || null,
          reviewed_at: reviewedBy ? new Date().toISOString() : null,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating review:', error);
      return res.status(500).json({ error: 'Failed to create review' });
    }

    res.status(201).json(data);
  } catch (err) {
    console.error('Unexpected error creating review:', err);
    res.status(500).json({ error: 'Unexpected error' });
  }
});

// Update a staff review (approve/reject)
app.patch('/reviews/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewedBy } = req.body;

    if (!status || !['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const { data, error } = await supabase
      .from('staff_reviews')
      .update({
        status,
        reviewed_by: reviewedBy || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating review:', error);
      return res.status(500).json({ error: 'Failed to update review' });
    }

    res.json(data);
  } catch (err) {
    console.error('Unexpected error updating review:', err);
    res.status(500).json({ error: 'Unexpected error' });
  }
});

// Get all pending reviews with photo + listing context
app.get('/reviews/pending', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('staff_reviews')
      .select(`
        id,
        status,
        reviewed_by,
        reviewed_at,
        photo:photos (
          id,
          url,
          photographer,
          listing:listings (
            id,
            title,
            description,
            location
          )
        )
      `)
      .eq('status', 'pending')
      .order('id', { ascending: true });

    if (error) {
      console.error('Error fetching pending reviews:', error);
      return res.status(500).json({ error: 'Failed to fetch pending reviews' });
    }

    res.json(data || []);
  } catch (err) {
    console.error('Unexpected error fetching pending reviews:', err);
    res.status(500).json({ error: 'Unexpected error' });
  }
});
// Upload photos to Supabase Storage and save photo records
app.post("/photos/upload", upload.array("photos", 10), async (req, res) => {
  try {
    const { listingId, firstName, lastName, email, staffUploaded } = req.body;
    const files = req.files;

    if (!listingId) {
      return res.status(400).json({ error: "listingId is required" });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "At least one photo is required" });
    }

    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: "Photographer info is required" });
    }

    const photographer = `${firstName} ${lastName}`.trim();
    const uploadedPhotos = [];

    for (const file of files) {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
      const filePath = `listings/${listingId}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        console.error("Supabase storage upload error:", uploadError);
        return res.status(500).json({ error: "Failed to upload photo" });
      }

      const { data: publicUrlData } = supabase.storage
        .from(PHOTO_BUCKET)
        .getPublicUrl(filePath);

      const { data: photoRecord, error: photoError } = await supabase
        .from("photos")
        .insert([
          {
            listing_id: listingId,
            url: publicUrlData.publicUrl,
            photographer,
            photographer_first: firstName,
            photographer_last: lastName,
            photographer_email: email,
            staff_uploaded: staffUploaded === "true",
          },
        ])
        .select()
        .single();

      if (photoError) {
        console.error("Error saving photo record:", photoError);
        return res.status(500).json({ error: "Failed to save photo record" });
      }

      uploadedPhotos.push(photoRecord);
    }

    res.status(201).json(uploadedPhotos);
  } catch (err) {
    console.error("Unexpected photo upload error:", err);
    res.status(500).json({ error: "Unexpected upload error" });
  }
});
app.listen(PORT, () => {
  console.log(`ArborDex API running on port ${PORT}`);
});
