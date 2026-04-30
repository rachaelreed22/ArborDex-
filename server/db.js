 // db.js — Supabase client (public backend, anon key)

const { createClient } = require('@supabase/supabase-js');

// Load environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Fail fast if missing
if (!SUPABASE_URL) {
  console.error("❌ Missing SUPABASE_URL in environment variables.");
  process.exit(1);
}

if (!SUPABASE_ANON_KEY) {
  console.error("❌ Missing SUPABASE_ANON_KEY in environment variables.");
  process.exit(1);
}

// Create client (safe for public backend)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false
  }
});

module.exports = supabase;
