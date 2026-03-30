const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'arbordex.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS trees (
    id TEXT PRIMARY KEY,
    common_name TEXT NOT NULL,
    scientific_name TEXT,
    species TEXT,
    family TEXT,
    description TEXT,
    height_ft REAL,
    diameter_in REAL,
    age_years INTEGER,
    condition TEXT,
    gps_lat REAL,
    gps_lng REAL,
    location_description TEXT,
    treatment_notes TEXT,
    last_treatment_date TEXT,
    date_planted TEXT,
    date_added TEXT NOT NULL,
    date_updated TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    tree_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    photographer_name TEXT,
    photographer_email TEXT,
    caption TEXT,
    season TEXT,
    uploaded_at TEXT NOT NULL,
    FOREIGN KEY (tree_id) REFERENCES trees(id) ON DELETE CASCADE
  );
`);

module.exports = db;
