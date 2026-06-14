require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE_URL or key in environment variables.');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

function looksLikeQrImageUrl(value) {
  const s = (value || '').toString().trim().toLowerCase();
  if (!s) return false;
  return (
    s.includes('api.qrserver.com/v1/create-qr-code')
    || /\.(png|jpg|jpeg|webp|gif|svg)(\?|$)/i.test(s)
  );
}

function buildQrImageUrl(payload) {
  const data = (payload || '').toString().trim();
  if (!data) return '';
  return `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(data)}`;
}

async function run() {
  const { data, error } = await supabase
    .from('listings')
    .select('id, qr_url')
    .not('qr_url', 'is', null);

  if (error) {
    console.error('Fetch error:', error.message || error);
    process.exit(1);
  }

  const rows = Array.isArray(data) ? data : [];
  let changed = 0;
  let skipped = 0;

  for (const row of rows) {
    const original = (row.qr_url || '').toString().trim();

    if (!original || looksLikeQrImageUrl(original)) {
      skipped += 1;
      continue;
    }

    const next = buildQrImageUrl(original);
    if (!next) {
      skipped += 1;
      continue;
    }

    const { error: updateError } = await supabase
      .from('listings')
      .update({ qr_url: next })
      .eq('id', row.id);

    if (updateError) {
      console.error(`Update failed for ${row.id}:`, updateError.message || updateError);
      continue;
    }

    changed += 1;
  }

  console.log(
    JSON.stringify(
      {
        totalRows: rows.length,
        changed,
        skipped,
      },
      null,
      2,
    ),
  );
}

run().catch((err) => {
  console.error('Unexpected backfill error:', err?.message || err);
  process.exit(1);
});
