require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const rateLimit = require('express-rate-limit');
const Busboy = require('busboy');
const { createClient } = require('@supabase/supabase-js');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// --- Supabase setup ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'tree-photos';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many uploads, please try again later.' },
});

const staticLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', apiLimiter);

// --- Helper: build public URL for a photo ---
function buildPhotoUrl(filename) {
  if (!filename) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${filename}`;
}

// --- Trees ---

// GET all trees
app.get('/api/trees', (req, res) => {
  const trees = db.prepare('SELECT * FROM trees ORDER BY date_added DESC').all();
  res.json(trees);
});

// GET single tree
app.get('/api/trees/:id', (req, res) => {
  const tree = db.prepare('SELECT * FROM trees WHERE id = ?').get(req.params.id);
  if (!tree) return res.status(404).json({ error: 'Tree not found' });
  res.json(tree);
});

// POST create tree
app.post('/api/trees', (req, res) => {
  const id = uuidv4();
  const now = new Date().toISOString();
  const {
    common_name, scientific_name, species, family, description,
    height_ft, diameter_in, age_years, condition,
    gps_lat, gps_lng, location_description,
    treatment_notes, last_treatment_date, date_planted,
  } = req.body;

  if (!common_name) return res.status(400).json({ error: 'common_name is required' });

  db.prepare(`INSERT INTO trees (
    id, common_name, scientific_name, species, family, description,
    height_ft, diameter_in, age_years, condition,
    gps_lat, gps_lng, location_description,
    treatment_notes, last_treatment_date, date_planted,
    date_added, date_updated
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, common_name, scientific_name || null, species || null, family || null, description || null,
    height_ft || null, diameter_in || null, age_years || null, condition || null,
    gps_lat || null, gps_lng || null, location_description || null,
    treatment_notes || null, last_treatment_date || null, date_planted || null,
    now, now,
  );

  const tree = db.prepare('SELECT * FROM trees WHERE id = ?').get(id);
  res.status(201).json(tree);
});

// PUT update tree
app.put('/api/trees/:id', (req, res) => {
  const tree = db.prepare('SELECT * FROM trees WHERE id = ?').get(req.params.id);
  if (!tree) return res.status(404).json({ error: 'Tree not found' });

  const now = new Date().toISOString();
  const {
    common_name, scientific_name, species, family, description,
    height_ft, diameter_in, age_years, condition,
    gps_lat, gps_lng, location_description,
    treatment_notes, last_treatment_date, date_planted,
  } = req.body;

  if (!common_name) return res.status(400).json({ error: 'common_name is required' });

  db.prepare(`UPDATE trees SET
    common_name = ?, scientific_name = ?, species = ?, family = ?, description = ?,
    height_ft = ?, diameter_in = ?, age_years = ?, condition = ?,
    gps_lat = ?, gps_lng = ?, location_description = ?,
    treatment_notes = ?, last_treatment_date = ?, date_planted = ?,
    date_updated = ?
  WHERE id = ?`).run(
    common_name, scientific_name || null, species || null, family || null, description || null,
    height_ft || null, diameter_in || null, age_years || null, condition || null,
    gps_lat || null, gps_lng || null, location_description || null,
    treatment_notes || null, last_treatment_date || null, date_planted || null,
    now, req.params.id,
  );

  const updated = db.prepare('SELECT * FROM trees WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE tree
app.delete('/api/trees/:id', (req, res) => {
  const tree = db.prepare('SELECT * FROM trees WHERE id = ?').get(req.params.id);
  if (!tree) return res.status(404).json({ error: 'Tree not found' });
  db.prepare('DELETE FROM trees WHERE id = ?').run(req.params.id);
  res.json({ message: 'Tree deleted' });
});

// GET QR code
app.get('/api/trees/:id/qrcode', async (req, res) => {
  const tree = db.prepare('SELECT * FROM trees WHERE id = ?').get(req.params.id);
  if (!tree) return res.status(404).json({ error: 'Tree not found' });

  const visitorUrl = `${process.env.PUBLIC_URL || `http://localhost:3000`}/tag/${req.params.id}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(visitorUrl, { width: 300, margin: 2 });
    res.json({ qrcode: qrDataUrl, url: visitorUrl });
  } catch (err) {
    res.status(500).json({ error: 'QR code generation failed' });
  }
});

// --- Photos ---

// GET approved photos for a tree (primary first)
app.get('/api/trees/:id/photos', (req, res) => {
  const photos = db.prepare(
    `SELECT * FROM photos
     WHERE tree_id = ? AND status = 'approved'
     ORDER BY is_primary DESC, uploaded_at DESC`
  ).all(req.params.id);

  const withUrls = photos.map(p => ({
    ...p,
    url: buildPhotoUrl(p.filename),
  }));

  res.json(withUrls);
});

// POST upload photo
app.post('/api/trees/:id/photos', uploadLimiter, async (req, res) => {
  const tree = db.prepare('SELECT * FROM trees WHERE id = ?').get(req.params.id);
  if (!tree) return res.status(404).json({ error: 'Tree not found' });

  const busboy = Busboy({ headers: req.headers });
  let fileBuffer = null;
  let fileExt = null;
  let mimeType = null;

  const fields = {
    photographer_name: null,
    photographer_email: null,
    caption: null,
    season: null,
  };

  busboy.on('file', (fieldname, file, info) => {
    const { filename, mimeType: mt } = info;
    mimeType = mt;
    const ext = path.extname(filename || '').toLowerCase();
    fileExt = ext || '.jpg';

    const chunks = [];
    file.on('data', (data) => chunks.push(data));
    file.on('end', () => {
      fileBuffer = Buffer.concat(chunks);
    });
  });

  busboy.on('field', (fieldname, val) => {
    if (Object.prototype.hasOwnProperty.call(fields, fieldname)) {
      fields[fieldname] = val || null;
    }
  });

  busboy.on('finish', async () => {
    try {
      if (!fileBuffer) {
        return res.status(400).json({ error: 'Photo file is required' });
      }

      const id = uuidv4();
      const now = new Date().toISOString();
      const objectPath = `${req.params.id}/${id}${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .upload(objectPath, fileBuffer, {
          contentType: mimeType || 'image/jpeg',
          upsert: false,
        });

      if (uploadError) {
        console.error('Supabase upload error:', uploadError);
        return res.status(500).json({ error: 'Photo upload failed' });
      }

      db.prepare(
        `INSERT INTO photos (
          id, tree_id, filename, photographer_name, photographer_email,
          caption, season, uploaded_at, status, is_primary
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        req.params.id,
        objectPath,
        fields.photographer_name,
        fields.photographer_email,
        fields.caption,
        fields.season,
        now,
        'pending',
        0
      );

      const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(id);
      const withUrl = { ...photo, url: buildPhotoUrl(photo.filename) };

      res.status(201).json(withUrl);
    } catch (err) {
      console.error('Upload handler error:', err);
      res.status(500).json({ error: 'Upload failed. Please try again.' });
    }
  });

  req.pipe(busboy);
});

// DELETE photo
app.delete('/api/photos/:id', async (req, res) => {
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  try {
    if (photo.filename) {
      await supabase.storage
        .from(SUPABASE_BUCKET)
        .remove([photo.filename]);
    }

    db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.id);
    res.json({ message: 'Photo deleted' });
  } catch (err) {
    console.error('Delete photo error:', err);
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});


// Serve React app in production
if (process.env.NODE_ENV === 'production') {
  const clientBuild = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientBuild));
  app.get('*', staticLimiter, (req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`ArborDex server running on port ${PORT}`);
  });
}

module.exports = app;
