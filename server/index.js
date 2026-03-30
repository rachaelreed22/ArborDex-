const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const QRCode = require('qrcode');
const rateLimit = require('express-rate-limit');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many uploads, please try again later.' },
});

const staticLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', apiLimiter);

// Serve uploaded photos
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Multer config for photo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});
const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp/;
  if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

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

// GET QR code for a tree (returns PNG data URL)
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

// GET photos for a tree
app.get('/api/trees/:id/photos', (req, res) => {
  const photos = db.prepare('SELECT * FROM photos WHERE tree_id = ? ORDER BY uploaded_at DESC').all(req.params.id);
  res.json(photos);
});

// POST upload photo for a tree
app.post('/api/trees/:id/photos', uploadLimiter, upload.single('photo'), (req, res) => {
  const tree = db.prepare('SELECT * FROM trees WHERE id = ?').get(req.params.id);
  if (!tree) return res.status(404).json({ error: 'Tree not found' });
  if (!req.file) return res.status(400).json({ error: 'Photo file is required' });

  const id = uuidv4();
  const now = new Date().toISOString();
  const { photographer_name, photographer_email, caption, season } = req.body;

  db.prepare(`INSERT INTO photos (id, tree_id, filename, photographer_name, photographer_email, caption, season, uploaded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, req.params.id, req.file.filename,
    photographer_name || null, photographer_email || null,
    caption || null, season || null, now,
  );

  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(id);
  res.status(201).json(photo);
});

// DELETE photo
app.delete('/api/photos/:id', (req, res) => {
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  const filePath = path.join(uploadsDir, photo.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.id);
  res.json({ message: 'Photo deleted' });
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
