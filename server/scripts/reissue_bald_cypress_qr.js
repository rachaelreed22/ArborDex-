require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const generateQrForTree = require('../utils/generateQrForTree');

const BALD_CYPRESS_LISTING_ID = 'ed693588-c42c-473b-acc4-f9a51e426d96';

async function run() {
  const baseUrl = (process.env.APP_BASE_URL || process.env.CLIENT_URL || 'https://arbordex.onrender.com').toString().trim();
  const qrUrl = await generateQrForTree(BALD_CYPRESS_LISTING_ID, { appBaseUrl: baseUrl });

  if (!qrUrl) {
    console.error('Failed to regenerate QR URL for the South Park Bald Cypress listing.');
    process.exit(1);
  }

  console.log(JSON.stringify({ listing_id: BALD_CYPRESS_LISTING_ID, new_qr_url: qrUrl }, null, 2));
}

run().catch((err) => {
  console.error('Unexpected QR regeneration error:', err?.message || err);
  process.exit(1);
});
