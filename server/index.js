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
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use((req, res, next) => {
  if (req.originalUrl === '/api/stripe/webhook') return next();
  return express.json()(req, res, next);
});

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
const CLIENT_URL = (process.env.CLIENT_URL || 'https://localhost:5173').toString().trim();

const STRIPE_SECRET_KEY = (process.env.STRIPE_SECRET_KEY || '').toString().trim();
const STRIPE_WEBHOOK_SECRET = (process.env.STRIPE_WEBHOOK_SECRET || '').toString().trim();
const STRIPE_PRICE_GARDENER = (process.env.STRIPE_PRICE_GARDENER || '').toString().trim();
const STRIPE_PRICE_ESTATE = (process.env.STRIPE_PRICE_ESTATE || '').toString().trim();

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
  : null;

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

const ARBORAI_REGIONAL_SCOPE = `You are ArborAI, an identification and diagnostics assistant for trees, shrubs, houseplants, and common garden plants found in Southwestern Missouri, USA. Your knowledge must reflect the ecology, climate, soils, pests, and species typical of this region.

ArborAI has two output modes depending on the user context:

1. Forestry Mode (Professional / Municipal Use)
Triggered when the user is staff, logged in, or viewing an official tree record.

Tone:
Professional, concise, field-ready, TRAQ-aligned.

Required Structure:
- Overall Condition — 1-2 sentences
- Key Observations — bullet points
- Potential Risks — bullet points
- Recommended Actions — bullet points
- Urgency Level — Low / Moderate / High / Critical

Rules:
- No speculation beyond what is visible
- No emotional language
- No homeowner-style advice
- Keep under 180 words
- Use Missouri-specific pests/diseases (EAB, oak wilt, cedar-apple rust, etc.)

2. Public Mode (Visitors, Homeowners, Gardeners)
Triggered when the user is not logged in, scans a QR code, or uploads a plant photo.

Tone:
Friendly, simple, educational, encouraging.

Required Structure:
- Likely Identification
- Key Features Noticed
- Care or Interesting Facts
- Common Issues to Watch For

Rules:
- Avoid technical jargon
- No TRAQ-style risk language
- No municipal liability language
- Keep under 150 words
- Include indoor/outdoor garden plants, ornamentals, and houseplants
- Provide Missouri-appropriate care guidance

General Identification Rules (Both Modes):
- Prioritize species native or common in SW Missouri
- Only suggest out-of-region species if the photo strongly supports it
- If uncertain, provide the closest likely match and ask for specific additional photos
- Never give medical, legal, or chemical-treatment advice`;

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

function parseDateBoundary(value, endOfDay = false) {
  const raw = (value || '').toString().trim();
  if (!raw) return null;

  const maybeDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const isoText = maybeDateOnly
    ? `${raw}${endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'}`
    : raw;

  const parsed = new Date(isoText);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

const HAZARD_SIGNAL_KEYWORDS = [
  'decay',
  'decaying',
  'rot',
  'rotting',
  'hollow',
  'cavity',
  'deadwood',
  'dead wood',
  'fungal conk',
  'fungus',
  'split trunk',
  'crack',
  'cracked',
  'fracture',
  'lean',
  'uproot',
  'root failure',
  'structural',
  'instability',
  'collapse',
  'fall risk',
  'unsafe',
  'hazard',
  'basal decay',
  'trunk rot',
  'root rot',
];

const HAZARD_OBSERVED_EVIDENCE_PATTERNS = [
  /\b(observed|visible|detected|identified|present|showing|shows|evidence)\b/i,
  /\b(signs?\s+of|symptoms?\s+of)\b/i,
  /\b(active|advanced|severe|ongoing|current(?:ly)?)\b/i,
  /\b(needs\s+human\s+inspection)\b/i,
];

const HAZARD_ADVISORY_ONLY_PATTERNS = [
  /\b(avoid|prevent|preventing|to\s+prevent)\b/i,
  /\b(risk\s+of|chance\s+of|potential\s+for|can\s+cause|could\s+cause|may\s+cause|can\s+lead\s+to)\b/i,
  /\b(susceptible\s+to|prone\s+to|watch\s+for|monitor\s+for|look\s+out\s+for)\b/i,
  /\b(if\s+left\s+untreated|in\s+some\s+cases)\b/i,
];

function normalizeStringList(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => (item == null ? '' : item.toString().trim()))
    .filter(Boolean);
}

function hasObservedHazardEvidence(text = '') {
  const sample = (text || '').toString();
  if (!sample.trim()) return false;

  const lower = sample.toLowerCase();
  const hasHazardSignal = HAZARD_SIGNAL_KEYWORDS.some((keyword) => lower.includes(keyword));
  if (!hasHazardSignal) return false;

  const hasObservedLanguage = HAZARD_OBSERVED_EVIDENCE_PATTERNS.some((pattern) => pattern.test(sample));
  const hasAdvisoryLanguage = HAZARD_ADVISORY_ONLY_PATTERNS.some((pattern) => pattern.test(sample));

  // Purely preventative wording (for example, "avoid root rot") should not count as active evidence.
  if (hasAdvisoryLanguage && !hasObservedLanguage) return false;

  return hasObservedLanguage;
}

function inferHazardDetailsFromTextSignals(signalTexts) {
  const normalizedSignals = normalizeStringList(signalTexts);
  const inferred = [];

  for (const text of normalizedSignals) {
    const lower = text.toLowerCase();
    const hasNegatedHazardPhrase =
      /(no|not|without|none)\s+(clear\s+)?(signs?\s+of\s+)?(hazards?|decay|rot|structural\s+issues?|cavity|hollow|instability)/i.test(lower);

    if (hasNegatedHazardPhrase) continue;

    const hasHazardSignal = HAZARD_SIGNAL_KEYWORDS.some((keyword) => lower.includes(keyword));
    if (!hasHazardSignal) continue;

    if (!hasObservedHazardEvidence(text)) continue;

    inferred.push(text);
  }

  const combined = normalizedSignals.join(' | ').toLowerCase();
  const hasTreeContext = /(tree|trunk|stem|canopy|root)/i.test(combined);
  const hasBasalOrTrunkZone = /(base|basal|trunk|root\s*flare|root\s*collar|buttress)/i.test(combined);
  const hasDecaySignal = /(decay|decaying|rot|rotting|hollow|cavity|punky|structural\s+instability)/i.test(combined);
  const hasNegatedDecay = /(no|not|without)\s+(clear\s+)?(signs?\s+of\s+)?(decay|rot|hollow|cavity|structural\s+instability)/i.test(combined);
  const hasObservedEvidence = normalizedSignals.some((text) => hasObservedHazardEvidence(text));

  // Strict rule: trunk/base decay language always escalates to a hazard finding.
  if (hasTreeContext && hasBasalOrTrunkZone && hasDecaySignal && hasObservedEvidence && !hasNegatedDecay) {
    inferred.push('Basal/trunk decay suggests elevated structural failure risk and needs human inspection.');
  }

  return Array.from(new Set(inferred));
}

function resolveHazardClassification({ hazardsDetectedRaw, hazardDetails, signalTexts }) {
  const explicitDetails = normalizeStringList(hazardDetails);
  const inferredDetails = inferHazardDetailsFromTextSignals(signalTexts);
  const mergedDetails = Array.from(new Set([...explicitDetails, ...inferredDetails]));

  const raw = (hazardsDetectedRaw || '').toString().trim().toLowerCase();
  const explicitYes = raw === 'yes' || raw === 'y' || raw === 'true';
  const explicitNo = raw === 'no' || raw === 'n' || raw === 'false';

  const inferredYes = mergedDetails.length > 0;
  const hazardsDetected = explicitYes || inferredYes
    ? 'Yes'
    : explicitNo
      ? 'No'
      : 'No';

  return {
    hazards_detected: hazardsDetected,
    hazard_details: mergedDetails,
  };
}

function enforceHumanInspectionAlertSignals(payload = {}) {
  const next = { ...payload };
  const hasHazards = (next.hazards_detected || '').toString().trim().toLowerCase() === 'yes';
  const alerts = normalizeStringList(next.alerts);

  if (hasHazards) {
    if (!alerts.some((item) => item.toLowerCase().includes('needs human inspection'))) {
      alerts.unshift('Needs human inspection');
    }

    const urgency = (next.urgency_level || '').toString().trim().toLowerCase();
    if (!urgency || urgency === 'low') {
      next.urgency_level = 'Moderate';
    }

    next.needs_human_inspection = true;
  } else {
    next.needs_human_inspection = false;
  }

  next.alerts = Array.from(new Set(alerts));
  return next;
}

function enforceCriticalDecayFailSafe(payload = {}) {
  const next = { ...payload };
  const signalSnippets = [
    next.summary,
    next.raw_ai_message,
    ...(Array.isArray(next.risks) ? next.risks : []),
    ...(Array.isArray(next.recommendations) ? next.recommendations : []),
    ...(Array.isArray(next.photo_summaries) ? next.photo_summaries : []),
    ...(Array.isArray(next.hazard_details) ? next.hazard_details : []),
  ];

  const textBlob = signalSnippets
    .map((item) => (item == null ? '' : item.toString().toLowerCase()))
    .join(' | ');

  const hasDecay = /(decay|decaying|rot|rotting|hollow|cavity|loss\s+of\s+integrity)/i.test(textBlob);
  const hasStructuralRisk = /(instability|structural|failure|compromised|fall\s+risk|collapse|unsafe|consider\s+removal)/i.test(textBlob);
  const hasTrunkBaseRoot = /(trunk|base|basal|root|root\s*flare|root\s*collar)/i.test(textBlob);
  const hasNegatedRisk = /(no|not|without)\s+(clear\s+)?(signs?\s+of\s+)?(hazards?|risk|decay|rot|instability|failure)/i.test(textBlob);
  const hasObservedEvidence = normalizeStringList(signalSnippets).some((snippet) => hasObservedHazardEvidence(snippet));

  if (
    hasObservedEvidence
    && (
      (hasDecay && hasStructuralRisk && hasTrunkBaseRoot && !hasNegatedRisk)
      || (hasDecay && hasTrunkBaseRoot && !hasNegatedRisk)
    )
  ) {
    next.hazards_detected = 'Yes';

    const details = normalizeStringList(next.hazard_details);
    const standard = 'Critical trunk/base decay indicators detected; needs human inspection.';
    if (!details.some((item) => item.toLowerCase().includes('critical trunk/base decay indicators detected'))) {
      details.unshift(standard);
    }
    next.hazard_details = Array.from(new Set(details));
  }

  return next;
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

function getTierFromPriceId(priceId) {
  if (!priceId) return 'free';
  if (priceId === STRIPE_PRICE_GARDENER) return 'gardener';
  if (priceId === STRIPE_PRICE_ESTATE) return 'estate';
  return 'free';
}

const HOMEOWNER_TIER_LIMITS = {
  free: 3,
  gardener: 40,
  estate: 65,
};

function getHomeownerTierLimit(tier) {
  return HOMEOWNER_TIER_LIMITS[tier] || HOMEOWNER_TIER_LIMITS.free;
}

function getPriceIdFromTier(tier) {
  if (tier === 'gardener') return STRIPE_PRICE_GARDENER;
  if (tier === 'estate') return STRIPE_PRICE_ESTATE;
  return null;
}

function normalizeStripeCustomerId(value) {
  const normalized = (value || '').toString().trim();
  if (!normalized) return null;
  if (normalized.toLowerCase() === 'null' || normalized.toLowerCase() === 'none') return null;
  return normalized;
}

function getStorageObjectPathFromPublicUrl(publicUrl, bucketName) {
  if (typeof publicUrl !== 'string' || !publicUrl) return null;
  const marker = `/storage/v1/object/public/${bucketName}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(publicUrl.slice(idx + marker.length));
}

async function ensureHomeownerProfileExists(userId) {
  // Check if profile exists
  const { data: existing, error: checkError } = await writeSupabase
    .from('homeowner_profiles')
    .select('id')
    .eq('user_id', userId)
    .limit(1);

  if (!checkError && Array.isArray(existing) && existing.length > 0) {
    return { profile: existing[0], created: false };
  }

  // Profile doesn't exist, create default one
  const { data: newProfile, error: insertError } = await writeSupabase
    .from('homeowner_profiles')
    .insert([
      {
        user_id: userId,
        tier: 'free',
        stripe_customer_id: null,
      },
    ])
    .select('id, user_id, tier, stripe_customer_id')
    .limit(1);

  if (insertError) {
    console.error('Failed to create homeowner profile:', insertError.message || insertError);
    return { profile: null, created: false, error: insertError };
  }

  return {
    profile: Array.isArray(newProfile) ? newProfile[0] : newProfile,
    created: true,
  };
}

async function updateHomeownerProfileBy(column, value, payload) {
  const { error } = await writeSupabase
    .from('homeowner_profiles')
    .update(payload)
    .eq(column, value);

  if (!error) return null;

  const missingSubscriptionColumn =
    Object.prototype.hasOwnProperty.call(payload, 'stripe_subscription_id')
    && (error.message || '').toLowerCase().includes('stripe_subscription_id');

  if (!missingSubscriptionColumn) return error;

  const fallbackPayload = { ...payload };
  delete fallbackPayload.stripe_subscription_id;

  const { error: fallbackError } = await writeSupabase
    .from('homeowner_profiles')
    .update(fallbackPayload)
    .eq(column, value);

  return fallbackError || null;
}

function getBearerToken(req) {
  const auth = (req.headers.authorization || '').toString();
  if (!auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim();
}

async function requireHomeownerAuth(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });

    const { data, error } = await writeSupabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid auth token' });
    }

    req.homeownerUser = data.user;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

async function getHomeownerTierAndCount(userId) {
  const { data: profiles, error: profileError } = await writeSupabase
    .from('homeowner_profiles')
    .select('tier')
    .eq('user_id', userId)
    .limit(1);

  if (profileError) {
    console.error('Homeowner profile lookup error, defaulting to free tier:', profileError.message || profileError);
  }

  const profile = Array.isArray(profiles) ? (profiles[0] || null) : null;
  const tier = (profile?.tier || 'free').toString().trim().toLowerCase();
  const profileLimit = getHomeownerTierLimit(tier);

  const { count, error: countError } = await writeSupabase
    .from('homeowner_plants')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (countError) {
    console.error('Homeowner plant count lookup error:', countError.message || countError);
    return {
      tier,
      profileLimit,
      activeProfiles: 0,
      error: countError,
    };
  }

  return {
    tier,
    profileLimit,
    activeProfiles: count || 0,
    error: null,
  };
}

async function getOwnedHomeownerPlant(userId, plantId) {
  const { data: plant, error } = await writeSupabase
    .from('homeowner_plants')
    .select('id, user_id, name, species, room_or_bed, photos, last_diagnostics, created_at, updated_at')
    .eq('id', plantId)
    .eq('user_id', userId)
    .single();

  if (error || !plant) {
    return { plant: null, error: error || new Error('Plant profile not found') };
  }

  return { plant, error: null };
}

function buildHomeownerNoPhotoDiagnostics(plant) {
  const displayName = plant?.name || 'This plant';
  return {
    likely_identification: plant?.species || displayName,
    confidence: 'Low',
    overall_condition: 'Unable to assess yet',
    summary: 'No photos are available for diagnostics yet.',
    key_features_noticed: ['No plant photos uploaded yet.'],
    primary_concerns: [],
    care_notes: [
      'Upload at least one clear photo in good lighting.',
      'Include a close-up of leaves and a full-plant photo if possible.',
    ],
    common_issues_to_watch_for: ['Visible leaf spots, yellowing, browning, wilting, or pest damage.'],
    uses_throughout_history: [],
    medicinal_qualities: 'Unknown until photos are provided and diagnosis is more reliable.',
    watering_frequency_summer: 'Not enough information yet.',
    watering_frequency_winter: 'Not enough information yet.',
    under_over_watering_signs: [],
    light_requirements: 'Not enough information yet.',
    temp_humidity_preferences: 'Not enough information yet.',
    potting_soil_requirements: 'Not enough information yet.',
    warning_signs: [],
    estimated_growth_rate: 'Not enough information yet.',
    maintenance_requirements: 'Not enough information yet.',
    toxicity_info: 'Unknown. Keep away from pets and children until identified with higher confidence.',
    native_habitat: 'Unknown until identified with higher confidence.',
    propagation_method: 'Unknown until identified with higher confidence.',
    growing_difficulty_score: 'Unknown',
    fun_facts: [],
    data_quality_flags: ['No photos available for analysis.'],
    photo_summaries: [],
    hazards_detected: 'No',
    hazard_details: [],
    updated_at: new Date().toISOString(),
  };
}

function buildHomeownerDiagnosticsFromScan(scan = {}) {
  const species = (scan.species || 'Unknown').toString().trim() || 'Unknown';
  const confidence = (scan.confidence || 'Low').toString().trim() || 'Low';
  const summary = (scan.summary || scan.raw_ai_message || 'Created from Ask ArborAI scan.').toString().trim();
  const healthScore = Number.isFinite(Number(scan.health_score))
    ? Math.max(0, Math.min(100, Number(scan.health_score)))
    : null;
  const risks = Array.isArray(scan.risks) ? scan.risks.map((item) => item?.toString().trim()).filter(Boolean) : [];
  const recommendations = Array.isArray(scan.recommendations)
    ? scan.recommendations.map((item) => item?.toString().trim()).filter(Boolean)
    : [];
  const photoSummaries = Array.isArray(scan.photo_summaries)
    ? scan.photo_summaries.map((item) => item?.toString().trim()).filter(Boolean)
    : [];
  const hazardDetails = Array.isArray(scan.hazard_details)
    ? scan.hazard_details.map((item) => item?.toString().trim()).filter(Boolean)
    : [];

  const signalTexts = [
    summary,
    scan.raw_ai_message,
    ...risks,
    ...recommendations,
    ...photoSummaries,
    ...hazardDetails,
  ];

  const hazardDecision = resolveHazardClassification({
    hazardsDetectedRaw: scan.hazards_detected ?? scan.hazard_detected,
    hazardDetails,
    signalTexts,
  });

  let overallCondition = 'Needs review';
  if (healthScore !== null) {
    if (healthScore >= 80) overallCondition = 'Generally healthy';
    else if (healthScore >= 60) overallCondition = 'Stable with some concerns';
    else if (healthScore >= 40) overallCondition = 'Needs attention';
    else overallCondition = 'High concern';
  }

  return {
    likely_identification: species,
    confidence,
    overall_condition: overallCondition,
    summary: summary || 'Created from Ask ArborAI scan.',
    key_features_noticed: photoSummaries.length > 0 ? photoSummaries.slice(0, 3) : ['Created from Ask ArborAI scan photos.'],
    primary_concerns: risks,
    care_notes: recommendations.length > 0 ? recommendations : ['Run full diagnostics on the plant detail page for more detailed care guidance.'],
    common_issues_to_watch_for: risks,
    uses_throughout_history: [],
    medicinal_qualities: 'Run full diagnostics for expanded plant background and care details.',
    watering_frequency_summer: 'Run full diagnostics for plant-specific watering guidance.',
    watering_frequency_winter: 'Run full diagnostics for plant-specific watering guidance.',
    under_over_watering_signs: [],
    light_requirements: 'Run full diagnostics for plant-specific light guidance.',
    temp_humidity_preferences: 'Run full diagnostics for plant-specific temperature and humidity guidance.',
    potting_soil_requirements: 'Run full diagnostics for plant-specific soil guidance.',
    warning_signs: risks,
    estimated_growth_rate: 'Run full diagnostics for plant-specific growth estimates.',
    maintenance_requirements: 'Run full diagnostics for expanded maintenance guidance.',
    toxicity_info: 'Run full diagnostics for toxicity details if available.',
    native_habitat: 'Run full diagnostics for native habitat details if available.',
    propagation_method: 'Run full diagnostics for propagation guidance if available.',
    growing_difficulty_score: 'Unknown',
    fun_facts: [],
    data_quality_flags: [],
    photo_summaries: photoSummaries,
    hazards_detected: hazardDecision.hazards_detected,
    hazard_details: hazardDecision.hazard_details,
    updated_at: new Date().toISOString(),
  };
}

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
// HOMEOWNER BILLING (STRIPE)
// ===========================
api.post('/stripe/create-checkout-session', requireHomeownerAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe is not configured on the server' });
    }

    const tier = (req.body?.tier || '').toString().trim().toLowerCase();
    const user = req.homeownerUser;
    const priceId = getPriceIdFromTier(tier);

    if (!priceId) {
      return res.status(400).json({ error: 'Tier must be gardener or estate for checkout' });
    }

    // Ensure profile exists before querying
    const { profile, error: profileCreateError } = await ensureHomeownerProfileExists(user.id);
    if (profileCreateError) {
      console.error('Failed to ensure homeowner profile:', profileCreateError.message || profileCreateError);
      return res.status(500).json({ error: 'Failed to set up homeowner account' });
    }

    let stripeCustomerId = normalizeStripeCustomerId(profile?.stripe_customer_id);
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      stripeCustomerId = customer.id;

      const updateError = await updateHomeownerProfileBy('user_id', user.id, {
        stripe_customer_id: stripeCustomerId,
      });
      if (updateError) {
        console.error('Failed to store Stripe customer ID:', updateError.message || updateError);
        return res.status(500).json({ error: 'Failed to save Stripe customer record' });
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${CLIENT_URL}/homeowners/account?checkout=success`,
      cancel_url: `${CLIENT_URL}/homeowners/tiers?checkout=cancelled`,
      metadata: {
        supabase_user_id: user.id,
        requested_tier: tier,
      },
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout session error:', err);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

api.post('/stripe/create-portal-session', requireHomeownerAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe is not configured on the server' });
    }

    const user = req.homeownerUser;

    // Ensure profile exists before querying
    const { profile, error: profileCreateError } = await ensureHomeownerProfileExists(user.id);
    if (profileCreateError) {
      console.error('Failed to ensure homeowner profile:', profileCreateError.message || profileCreateError);
      return res.status(500).json({ error: 'Failed to set up homeowner account' });
    }

    const stripeCustomerId = normalizeStripeCustomerId(profile?.stripe_customer_id);

    if (!stripeCustomerId) {
      return res.status(400).json({ error: 'No Stripe customer found for this account' });
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${CLIENT_URL}/homeowners/account`,
    });

    return res.json({ url: portal.url });
  } catch (err) {
    console.error('Stripe portal session error:', err);
    return res.status(500).json({ error: 'Failed to create portal session' });
  }
});

// ===========================
// HOMEOWNER PLANTS
// ===========================
api.get('/homeowners/plants', requireHomeownerAuth, async (req, res) => {
  try {
    const userId = req.homeownerUser.id;

    const { data: plants, error: plantsError } = await writeSupabase
      .from('homeowner_plants')
      .select('id, name, species, room_or_bed, photos, last_diagnostics, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (plantsError) {
      console.error('Homeowner plants lookup error, returning empty list:', plantsError.message || plantsError);
    }

    const status = await getHomeownerTierAndCount(userId);
    if (status.error) {
      console.error('Homeowner tier/count error, returning safe defaults:', status.error.message || status.error);
      return res.json({
        plants: plantsError ? [] : (plants || []),
        tier: 'free',
        profile_limit: getHomeownerTierLimit('free'),
        active_profiles: Array.isArray(plants) ? plants.length : 0,
      });
    }

    return res.json({
      plants: plantsError ? [] : (plants || []),
      tier: status.tier,
      profile_limit: status.profileLimit,
      active_profiles: status.activeProfiles,
    });
  } catch (err) {
    console.error('Unexpected homeowner plants error, returning safe defaults:', err?.message || err);
    return res.json({
      plants: [],
      tier: 'free',
      profile_limit: getHomeownerTierLimit('free'),
      active_profiles: 0,
    });
  }
});

api.get('/homeowners/plants/:id', requireHomeownerAuth, async (req, res) => {
  try {
    const userId = req.homeownerUser.id;
    const id = (req.params.id || '').toString().trim();
    const { plant, error } = await getOwnedHomeownerPlant(userId, id);

    if (error || !plant) {
      return res.status(404).json({ error: 'Plant profile not found' });
    }

    return res.json({ plant });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch plant profile' });
  }
});

api.post('/homeowners/plants', requireHomeownerAuth, async (req, res) => {
  try {
    const userId = req.homeownerUser.id;
    const name = (req.body?.name || '').toString().trim();
    const species = (req.body?.species || '').toString().trim();
    const roomOrBed = (req.body?.room_or_bed || '').toString().trim();

    if (!name) {
      return res.status(400).json({ error: 'Plant name is required' });
    }

    const status = await getHomeownerTierAndCount(userId);
    if (status.error) {
      return res.status(500).json({ error: status.error.message || 'Failed to check tier limits' });
    }

    if (status.activeProfiles >= status.profileLimit) {
      return res.status(403).json({
        error: 'Profile limit reached for current tier',
        tier: status.tier,
        profile_limit: status.profileLimit,
        active_profiles: status.activeProfiles,
      });
    }

    const { data: plant, error: insertError } = await writeSupabase
      .from('homeowner_plants')
      .insert([
        {
          user_id: userId,
          name,
          species: species || null,
          room_or_bed: roomOrBed || null,
          photos: [],
        },
      ])
      .select('id, name, species, room_or_bed, photos, last_diagnostics, created_at, updated_at')
      .single();

    if (insertError) {
      return res.status(500).json({ error: insertError.message || 'Failed to create plant profile' });
    }

    return res.status(201).json({ plant });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create homeowner plant' });
  }
});

api.patch('/homeowners/plants/:id', requireHomeownerAuth, async (req, res) => {
  try {
    const userId = req.homeownerUser.id;
    const id = (req.params.id || '').toString().trim();

    const nextName = req.body?.name;
    const nextSpecies = req.body?.species;
    const nextRoomOrBed = req.body?.room_or_bed;

    const updateData = {};
    if (typeof nextName === 'string') {
      const trimmedName = nextName.trim();
      if (!trimmedName) {
        return res.status(400).json({ error: 'Plant name cannot be empty' });
      }
      updateData.name = trimmedName;
    }
    if (typeof nextSpecies === 'string') {
      updateData.species = nextSpecies.trim() || null;
    }
    if (typeof nextRoomOrBed === 'string') {
      updateData.room_or_bed = nextRoomOrBed.trim() || null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { data: plant, error: updateError } = await writeSupabase
      .from('homeowner_plants')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select('id, name, species, room_or_bed, photos, last_diagnostics, created_at, updated_at')
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message || 'Failed to update plant profile' });
    }

    if (!plant) {
      return res.status(404).json({ error: 'Plant profile not found' });
    }

    return res.json({ plant });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update homeowner plant' });
  }
});

api.delete('/homeowners/plants/:id', requireHomeownerAuth, async (req, res) => {
  try {
    const userId = req.homeownerUser.id;
    const id = (req.params.id || '').toString().trim();

    const { data: plant, error: findError } = await writeSupabase
      .from('homeowner_plants')
      .select('id, photos')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (findError || !plant) {
      return res.status(404).json({ error: 'Plant profile not found' });
    }

    const photos = Array.isArray(plant.photos) ? plant.photos : [];
    for (const url of photos) {
      const objectPath = getStorageObjectPathFromPublicUrl(url, PHOTO_BUCKET);
      if (!objectPath) continue;
      await writeSupabase.storage.from(PHOTO_BUCKET).remove([objectPath]);
    }

    const { error: deleteError } = await writeSupabase
      .from('homeowner_plants')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (deleteError) {
      return res.status(500).json({ error: deleteError.message || 'Failed to delete plant profile' });
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete homeowner plant' });
  }
});

api.post('/homeowners/plants/:id/photos', requireHomeownerAuth, upload.single('photo'), async (req, res) => {
  try {
    const userId = req.homeownerUser.id;
    const id = (req.params.id || '').toString().trim();

    if (!req.file) {
      return res.status(400).json({ error: 'Photo file is required' });
    }

    const { data: plant, error: findError } = await writeSupabase
      .from('homeowner_plants')
      .select('id, photos')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (findError || !plant) {
      return res.status(404).json({ error: 'Plant profile not found' });
    }

    const existingPhotos = Array.isArray(plant.photos) ? plant.photos : [];
    if (existingPhotos.length >= 5) {
      return res.status(400).json({ error: 'Maximum 5 photos allowed per plant profile' });
    }

    const ext = path.extname(req.file.originalname || '').toLowerCase() || '.jpg';
    const objectPath = `homeowner-plants/${userId}/${id}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;

    const { error: uploadError } = await writeSupabase.storage
      .from(PHOTO_BUCKET)
      .upload(objectPath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      return res.status(500).json({ error: uploadError.message || 'Failed to upload photo' });
    }

    const { data: publicUrlData } = writeSupabase.storage.from(PHOTO_BUCKET).getPublicUrl(objectPath);
    const nextPhotos = [...existingPhotos, publicUrlData.publicUrl];

    const { data: updatedPlant, error: updateError } = await writeSupabase
      .from('homeowner_plants')
      .update({ photos: nextPhotos })
      .eq('id', id)
      .eq('user_id', userId)
      .select('id, name, species, room_or_bed, photos, last_diagnostics, created_at, updated_at')
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message || 'Failed to save photo on profile' });
    }

    return res.status(201).json({ plant: updatedPlant });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to upload homeowner plant photo' });
  }
});

api.post('/homeowners/plants/:id/diagnostics', requireHomeownerAuth, async (req, res) => {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY is not set' });
    }

    const userId = req.homeownerUser.id;
    const id = (req.params.id || '').toString().trim();
    const { plant, error } = await getOwnedHomeownerPlant(userId, id);

    if (error || !plant) {
      return res.status(404).json({ error: 'Plant profile not found' });
    }

    const photos = Array.isArray(plant.photos) ? plant.photos.filter(Boolean) : [];
    if (photos.length === 0) {
      const fallbackDiagnostics = buildHomeownerNoPhotoDiagnostics(plant);
      const { data: updatedPlant, error: updateError } = await writeSupabase
        .from('homeowner_plants')
        .update({ last_diagnostics: fallbackDiagnostics })
        .eq('id', id)
        .eq('user_id', userId)
        .select('id, user_id, name, species, room_or_bed, photos, last_diagnostics, created_at, updated_at')
        .single();

      if (updateError) {
        return res.status(500).json({ error: updateError.message || 'Failed to store diagnostics' });
      }

      return res.json({ diagnostics: fallbackDiagnostics, plant: updatedPlant });
    }

    const diagnosticsPrompt = `${ARBORAI_REGIONAL_SCOPE}

  Analyze the provided homeowner plant profile and photos. The plant name is a user label or nickname, NOT authoritative identification. The species field is only a weak user hint and may be wrong. Prioritize what is visually present in the photos over user-entered text.

  Critical rules:
  - Inspect every photo independently before forming a combined conclusion.
  - If photos appear to show different plants, unrelated scenes, or conflicting species, do NOT force a single confident identification.
  - In mixed or conflicting photo sets, explicitly say so, lower confidence, and include data quality or mismatch warnings.
  - If one photo shows disease or damage, mention that specific issue instead of generic care advice.
  - Do not describe the plant as healthy unless the visible evidence clearly supports that.
  - Do not let the plant name override the images.
  - If evidence is weak or contradictory, say the result is uncertain.

  Respond ONLY with a valid JSON object using these exact keys:
  - likely_identification: string
  - confidence: string
  - overall_condition: string
  - summary: string
  - key_features_noticed: array of strings
  - primary_concerns: array of strings
  - care_notes: array of strings
  - common_issues_to_watch_for: array of strings
  - uses_throughout_history: array of strings
  - medicinal_qualities: string
  - watering_frequency_summer: string
  - watering_frequency_winter: string
  - under_over_watering_signs: array of strings
  - light_requirements: string
  - temp_humidity_preferences: string
  - potting_soil_requirements: string
  - warning_signs: array of strings
  - estimated_growth_rate: string
  - maintenance_requirements: string
  - toxicity_info: string
  - native_habitat: string
  - propagation_method: string
  - growing_difficulty_score: string
  - fun_facts: array of strings
  - data_quality_flags: array of strings
  - photo_summaries: array of strings

  Keep the language friendly, simple, and specific to a homeowner or gardener. IMPORTANT: photo_summaries must contain exactly ${photos.length} non-empty items in the same order as the provided photos.`;

    const userContent = [
      {
        type: 'text',
        text: [
          `Plant name: ${plant.name || 'Unknown'}`,
          `Species field (weak hint, may be wrong): ${plant.species || 'Not provided'}`,
          `Indoor or outdoor: ${plant.room_or_bed || 'Not provided'}`,
          `Return categories tailored for a homeowner detail page.`,
          `Call out photo mismatches, unrelated images, disease signs, or uncertainty when present.`,
        ].join('\n'),
      },
      ...photos.map((_, index) => ({ type: 'text', text: `Photo ${index + 1}` })),
      ...photos.map((url) => ({ type: 'image_url', image_url: { url } })),
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
          { role: 'system', content: diagnosticsPrompt },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1400,
      }),
    });

    let diagnostics;
    if (!response.ok) {
      const reasonText = await response.text().catch(() => 'AI provider error');
      diagnostics = {
        likely_identification: plant.species || plant.name,
        confidence: 'Low',
        overall_condition: 'Temporarily unavailable',
        summary: 'Diagnostics are temporarily unavailable. Please try again shortly.',
        key_features_noticed: ['AI service was unavailable for this run.'],
        primary_concerns: [],
        care_notes: ['Try diagnostics again in a moment.'],
        common_issues_to_watch_for: ['Visible wilting, spotting, yellowing, or pest damage.'],
        uses_throughout_history: [],
        medicinal_qualities: 'Unavailable for this run.',
        watering_frequency_summer: 'Unavailable for this run.',
        watering_frequency_winter: 'Unavailable for this run.',
        under_over_watering_signs: [],
        light_requirements: 'Unavailable for this run.',
        temp_humidity_preferences: 'Unavailable for this run.',
        potting_soil_requirements: 'Unavailable for this run.',
        warning_signs: [],
        estimated_growth_rate: 'Unavailable for this run.',
        maintenance_requirements: 'Unavailable for this run.',
        toxicity_info: 'Unavailable for this run.',
        native_habitat: 'Unavailable for this run.',
        propagation_method: 'Unavailable for this run.',
        growing_difficulty_score: 'Unknown',
        fun_facts: [],
        data_quality_flags: [],
        photo_summaries: photos.map((_, index) => `Photo ${index + 1}: Diagnostics unavailable for this run.`),
        hazards_detected: 'No',
        hazard_details: [],
        provider_note: reasonText.slice(0, 280),
        updated_at: new Date().toISOString(),
      };
    } else {
      const aiData = await response.json();
      const raw = aiData?.choices?.[0]?.message?.content || '{}';
      try {
        diagnostics = JSON.parse(raw);
      } catch {
        diagnostics = {
          likely_identification: plant.species || plant.name,
          confidence: 'Low',
          overall_condition: 'Format error',
          summary: 'Diagnostics completed with an invalid AI response format. Please run again.',
          key_features_noticed: ['AI response could not be parsed.'],
          primary_concerns: [],
          care_notes: ['Run diagnostics again for a fresh result.'],
          common_issues_to_watch_for: ['Visible wilting, spotting, yellowing, or pest damage.'],
          uses_throughout_history: [],
          medicinal_qualities: 'Unavailable due to response format issue.',
          watering_frequency_summer: 'Unavailable due to response format issue.',
          watering_frequency_winter: 'Unavailable due to response format issue.',
          under_over_watering_signs: [],
          light_requirements: 'Unavailable due to response format issue.',
          temp_humidity_preferences: 'Unavailable due to response format issue.',
          potting_soil_requirements: 'Unavailable due to response format issue.',
          warning_signs: [],
          estimated_growth_rate: 'Unavailable due to response format issue.',
          maintenance_requirements: 'Unavailable due to response format issue.',
          toxicity_info: 'Unavailable due to response format issue.',
          native_habitat: 'Unavailable due to response format issue.',
          propagation_method: 'Unavailable due to response format issue.',
          growing_difficulty_score: 'Unknown',
          fun_facts: [],
          data_quality_flags: ['AI response format was invalid.'],
          photo_summaries: photos.map((_, index) => `Photo ${index + 1}: No parsed summary returned.`),
          hazards_detected: 'No',
          hazard_details: [],
          updated_at: new Date().toISOString(),
        };
      }
    }

    const normalized = {
      likely_identification: (diagnostics?.likely_identification || plant.species || 'Uncertain').toString().trim(),
      confidence: (diagnostics?.confidence || 'Medium').toString().trim(),
      overall_condition: (diagnostics?.overall_condition || 'Needs review').toString().trim(),
      summary: (diagnostics?.summary || 'No summary available.').toString().trim(),
      key_features_noticed: Array.isArray(diagnostics?.key_features_noticed) ? diagnostics.key_features_noticed.filter(Boolean) : [],
      primary_concerns: Array.isArray(diagnostics?.primary_concerns) ? diagnostics.primary_concerns.filter(Boolean) : [],
      care_notes: Array.isArray(diagnostics?.care_notes) ? diagnostics.care_notes.filter(Boolean) : [],
      common_issues_to_watch_for: Array.isArray(diagnostics?.common_issues_to_watch_for) ? diagnostics.common_issues_to_watch_for.filter(Boolean) : [],
      uses_throughout_history: Array.isArray(diagnostics?.uses_throughout_history) ? diagnostics.uses_throughout_history.filter(Boolean) : [],
      medicinal_qualities: (diagnostics?.medicinal_qualities || 'Not provided.').toString().trim(),
      watering_frequency_summer: (diagnostics?.watering_frequency_summer || 'Not provided.').toString().trim(),
      watering_frequency_winter: (diagnostics?.watering_frequency_winter || 'Not provided.').toString().trim(),
      under_over_watering_signs: Array.isArray(diagnostics?.under_over_watering_signs) ? diagnostics.under_over_watering_signs.filter(Boolean) : [],
      light_requirements: (diagnostics?.light_requirements || 'Not provided.').toString().trim(),
      temp_humidity_preferences: (diagnostics?.temp_humidity_preferences || 'Not provided.').toString().trim(),
      potting_soil_requirements: (diagnostics?.potting_soil_requirements || 'Not provided.').toString().trim(),
      warning_signs: Array.isArray(diagnostics?.warning_signs) ? diagnostics.warning_signs.filter(Boolean) : [],
      estimated_growth_rate: (diagnostics?.estimated_growth_rate || 'Not provided.').toString().trim(),
      maintenance_requirements: (diagnostics?.maintenance_requirements || 'Not provided.').toString().trim(),
      toxicity_info: (diagnostics?.toxicity_info || 'Not provided.').toString().trim(),
      native_habitat: (diagnostics?.native_habitat || 'Not provided.').toString().trim(),
      propagation_method: (diagnostics?.propagation_method || 'Not provided.').toString().trim(),
      growing_difficulty_score: (diagnostics?.growing_difficulty_score || 'Unknown').toString().trim(),
      fun_facts: Array.isArray(diagnostics?.fun_facts) ? diagnostics.fun_facts.filter(Boolean) : [],
      data_quality_flags: Array.isArray(diagnostics?.data_quality_flags) ? diagnostics.data_quality_flags.filter(Boolean) : [],
      photo_summaries: Array.isArray(diagnostics?.photo_summaries) ? diagnostics.photo_summaries.slice(0, photos.length).map((item, index) => {
        const text = (item || '').toString().trim();
        return text || `Photo ${index + 1}: No summary returned.`;
      }) : photos.map((_, index) => `Photo ${index + 1}: No summary returned.`),
      updated_at: new Date().toISOString(),
    };

    const hazardDecision = resolveHazardClassification({
      hazardsDetectedRaw: diagnostics?.hazards_detected ?? diagnostics?.hazard_detected,
      hazardDetails: Array.isArray(diagnostics?.hazard_details) ? diagnostics.hazard_details : [],
      signalTexts: [
        normalized.summary,
        ...normalized.primary_concerns,
        ...normalized.care_notes,
        ...normalized.common_issues_to_watch_for,
        ...normalized.warning_signs,
        ...normalized.photo_summaries,
      ],
    });

    normalized.hazards_detected = hazardDecision.hazards_detected;
    normalized.hazard_details = hazardDecision.hazard_details;
    Object.assign(normalized, enforceCriticalDecayFailSafe(normalized));
    Object.assign(normalized, enforceHumanInspectionAlertSignals(normalized));

    while (normalized.photo_summaries.length < photos.length) {
      normalized.photo_summaries.push(`Photo ${normalized.photo_summaries.length + 1}: No summary returned.`);
    }

    const photoSummaryText = normalized.photo_summaries.join(' ').toLowerCase();
    const mismatchDetected = [
      'unrelated',
      'different plant',
      'different species',
      'not the same plant',
      'mismatch',
      'tree',
      'fall foliage',
      'unrelated image',
    ].some((term) => photoSummaryText.includes(term));

    if (mismatchDetected) {
      normalized.confidence = 'Low';
      normalized.likely_identification = 'Uncertain due to conflicting photos';
      normalized.overall_condition = 'Cannot assess reliably from mixed photo set';
      normalized.summary = 'The uploaded photos do not appear to show the same plant consistently, so this result should not be treated as a reliable identification or diagnosis yet.';
      normalized.data_quality_flags = [
        'Conflicting or unrelated photos were detected in this profile.',
        ...normalized.data_quality_flags,
      ].filter(Boolean);
      normalized.primary_concerns = [
        'At least one uploaded photo appears unrelated to the main plant being diagnosed.',
        ...normalized.primary_concerns,
      ].filter(Boolean);
      normalized.care_notes = [
        'Remove unrelated photos and rerun diagnostics with close-up and full-plant images of the same plant only.',
        ...normalized.care_notes,
      ].filter(Boolean);
    }

    const { data: updatedPlant, error: updateError } = await writeSupabase
      .from('homeowner_plants')
      .update({ last_diagnostics: normalized })
      .eq('id', id)
      .eq('user_id', userId)
      .select('id, user_id, name, species, room_or_bed, photos, last_diagnostics, created_at, updated_at')
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message || 'Failed to store diagnostics' });
    }

    return res.json({ diagnostics: normalized, plant: updatedPlant });
  } catch (err) {
    console.error('Homeowner diagnostics error:', err);
    return res.status(500).json({ error: 'Failed to run homeowner diagnostics' });
  }
});

api.delete('/homeowners/plants/:id/photos/:photoIndex', requireHomeownerAuth, async (req, res) => {
  try {
    const userId = req.homeownerUser.id;
    const id = (req.params.id || '').toString().trim();
    const photoIndex = Number.parseInt(req.params.photoIndex, 10);

    if (!Number.isInteger(photoIndex) || photoIndex < 0) {
      return res.status(400).json({ error: 'Invalid photo index' });
    }

    const { data: plant, error: findError } = await writeSupabase
      .from('homeowner_plants')
      .select('id, name, species, room_or_bed, photos, last_diagnostics, created_at, updated_at')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (findError || !plant) {
      return res.status(404).json({ error: 'Plant profile not found' });
    }

    const photos = Array.isArray(plant.photos) ? plant.photos : [];
    if (photoIndex >= photos.length) {
      return res.status(400).json({ error: 'Photo index out of range' });
    }

    const removedUrl = photos[photoIndex];
    const nextPhotos = photos.filter((_url, index) => index !== photoIndex);

    const { data: updatedPlant, error: updateError } = await writeSupabase
      .from('homeowner_plants')
      .update({ photos: nextPhotos })
      .eq('id', id)
      .eq('user_id', userId)
      .select('id, name, species, room_or_bed, photos, last_diagnostics, created_at, updated_at')
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message || 'Failed to remove photo from profile' });
    }

    const objectPath = getStorageObjectPathFromPublicUrl(removedUrl, PHOTO_BUCKET);
    if (objectPath) {
      await writeSupabase.storage.from(PHOTO_BUCKET).remove([objectPath]);
    }

    return res.json({ plant: updatedPlant });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete homeowner plant photo' });
  }
});

api.post('/homeowners/plants/:id/photos/:photoIndex/replace', requireHomeownerAuth, upload.single('photo'), async (req, res) => {
  try {
    const userId = req.homeownerUser.id;
    const id = (req.params.id || '').toString().trim();
    const photoIndex = Number.parseInt(req.params.photoIndex, 10);

    if (!Number.isInteger(photoIndex) || photoIndex < 0) {
      return res.status(400).json({ error: 'Invalid photo index' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Photo file is required' });
    }

    const { data: plant, error: findError } = await writeSupabase
      .from('homeowner_plants')
      .select('id, name, species, room_or_bed, photos, last_diagnostics, created_at, updated_at')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (findError || !plant) {
      return res.status(404).json({ error: 'Plant profile not found' });
    }

    const photos = Array.isArray(plant.photos) ? plant.photos : [];
    if (photoIndex >= photos.length) {
      return res.status(400).json({ error: 'Photo index out of range' });
    }

    const ext = path.extname(req.file.originalname || '').toLowerCase() || '.jpg';
    const objectPath = `homeowner-plants/${userId}/${id}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;

    const { error: uploadError } = await writeSupabase.storage
      .from(PHOTO_BUCKET)
      .upload(objectPath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      return res.status(500).json({ error: uploadError.message || 'Failed to upload replacement photo' });
    }

    const { data: publicUrlData } = writeSupabase.storage.from(PHOTO_BUCKET).getPublicUrl(objectPath);
    const oldUrl = photos[photoIndex];
    const nextPhotos = [...photos];
    nextPhotos[photoIndex] = publicUrlData.publicUrl;

    const { data: updatedPlant, error: updateError } = await writeSupabase
      .from('homeowner_plants')
      .update({ photos: nextPhotos })
      .eq('id', id)
      .eq('user_id', userId)
      .select('id, name, species, room_or_bed, photos, last_diagnostics, created_at, updated_at')
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message || 'Failed to save replacement photo' });
    }

    const oldObjectPath = getStorageObjectPathFromPublicUrl(oldUrl, PHOTO_BUCKET);
    if (oldObjectPath) {
      await writeSupabase.storage.from(PHOTO_BUCKET).remove([oldObjectPath]);
    }

    return res.json({ plant: updatedPlant });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to replace homeowner plant photo' });
  }
});

api.post('/homeowners/ai/create-plant-from-scan', requireHomeownerAuth, async (req, res) => {
  try {
    const userId = req.homeownerUser.id;
    const { tier, profileLimit, activeProfiles, error: tierError } = await getHomeownerTierAndCount(userId);

    if (tierError) {
      return res.status(500).json({ error: tierError.message || 'Failed to verify tier limits' });
    }

    if (activeProfiles >= profileLimit) {
      return res.status(400).json({ error: `Profile limit reached for ${tier} tier` });
    }

    const normalizedSpecies = (req.body?.species || 'Untitled Plant').toString().trim() || 'Untitled Plant';
    const normalizedUrls = Array.from(
      new Set(
        (Array.isArray(req.body?.photo_urls) ? req.body.photo_urls : [])
          .map((url) => (typeof url === 'string' ? url.trim() : ''))
          .filter((url) => /^https?:\/\//i.test(url))
      )
    ).slice(0, 5);

    const diagnostics = buildHomeownerDiagnosticsFromScan(req.body || {});

    const { data: plant, error: insertError } = await writeSupabase
      .from('homeowner_plants')
      .insert([
        {
          user_id: userId,
          name: normalizedSpecies,
          species: normalizedSpecies,
          room_or_bed: null,
          photos: normalizedUrls,
          last_diagnostics: diagnostics,
        },
      ])
      .select('id, user_id, name, species, room_or_bed, photos, last_diagnostics, created_at, updated_at')
      .single();

    if (insertError || !plant) {
      return res.status(500).json({ error: insertError?.message || 'Failed to create plant from scan' });
    }

    return res.status(201).json({ plant, added_photos: normalizedUrls.length });
  } catch (err) {
    console.error('Unexpected homeowner create-plant-from-scan error:', err);
    return res.status(500).json({ error: 'Unexpected homeowner create-plant-from-scan error' });
  }
});

api.post('/homeowners/ai/attach-scan-to-plant', requireHomeownerAuth, async (req, res) => {
  try {
    const userId = req.homeownerUser.id;
    const plantId = (req.body?.plant_id || '').toString().trim();

    if (!plantId) {
      return res.status(400).json({ error: 'plant_id is required' });
    }

    const { plant, error } = await getOwnedHomeownerPlant(userId, plantId);
    if (error || !plant) {
      return res.status(404).json({ error: 'Plant profile not found' });
    }

    const existingPhotos = Array.isArray(plant.photos) ? plant.photos : [];
    const incomingUrls = Array.from(
      new Set(
        (Array.isArray(req.body?.photo_urls) ? req.body.photo_urls : [])
          .map((url) => (typeof url === 'string' ? url.trim() : ''))
          .filter((url) => /^https?:\/\//i.test(url))
      )
    );

    if (incomingUrls.length === 0) {
      return res.status(400).json({ error: 'No valid photo_urls provided for attach.' });
    }

    const existingUrlSet = new Set(existingPhotos);
    const urlsToAdd = incomingUrls.filter((url) => !existingUrlSet.has(url));
    const nextPhotos = [...existingPhotos, ...urlsToAdd];

    if (nextPhotos.length > 5) {
      return res.status(400).json({ error: 'Attaching this scan would exceed the 5 photo limit for this plant profile' });
    }

    const diagnostics = buildHomeownerDiagnosticsFromScan(req.body || {});

    const { data: updatedPlant, error: updateError } = await writeSupabase
      .from('homeowner_plants')
      .update({ photos: nextPhotos, last_diagnostics: diagnostics })
      .eq('id', plantId)
      .eq('user_id', userId)
      .select('id, user_id, name, species, room_or_bed, photos, last_diagnostics, created_at, updated_at')
      .single();

    if (updateError || !updatedPlant) {
      return res.status(500).json({ error: updateError?.message || 'Failed to attach scan to plant' });
    }

    return res.json({ plant: updatedPlant, added_photos: urlsToAdd.length });
  } catch (err) {
    console.error('Unexpected homeowner attach-scan-to-plant error:', err);
    return res.status(500).json({ error: 'Unexpected homeowner attach-scan-to-plant error' });
  }
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

// Bulk endpoint: returns latest diagnostics row per listing_id for an array of ids
// POST /api/diagnostics-logs/bulk-latest  body: { listingIds: [1, 2, ...] }
api.post('/diagnostics-logs/bulk-latest', async (req, res) => {
  try {
    const { listingIds } = req.body || {};
    if (!Array.isArray(listingIds) || listingIds.length === 0) {
      return res.json({});
    }

    const { data, error } = await writeSupabase
      .from('tree_diagnostics_logs')
      .select('listing_id, diagnostics, run_at, created_at')
      .in('listing_id', listingIds)
      .order('run_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Bulk diagnostics fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch diagnostics logs' });
    }

    // Keep only the first (latest) row per listing_id
    const latestByListing = {};
    for (const row of (data || [])) {
      const key = (row?.listing_id ?? '').toString();
      if (!key) continue;
      if (!(key in latestByListing)) {
        latestByListing[key] = row.diagnostics;
      }
    }

    return res.json(latestByListing);
  } catch (err) {
    console.error('Unexpected bulk diagnostics fetch error:', err);
    return res.status(500).json({ error: 'Unexpected error' });
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
    const parkName = (req.query?.parkName || '').toString().trim();

    let query = writeSupabase
      .from('listings')
      .select(`
        id,
        title,
        description,
        location,
        latitude,
        longitude,
        qr_url,
        photos(id, url, is_main, winner)
      `)
      .order('created_at', { ascending: false });

    if (parkName) {
      query = query.ilike('location', `%${parkName}%`);
    }

    const { data, error } = await query;

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
// AI ROUTE - Park Impact Report (Dex only)
// ===========================
api.post('/ai/park-report', requireStaffAction, async (req, res) => {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY is not set' });
    }

    const park = (req.body?.park || '').toString().trim();
    const startDateInput = (req.body?.startDate || req.body?.start_date || '').toString().trim();
    const endDateInput = (req.body?.endDate || req.body?.end_date || '').toString().trim();
    const adminGoal = (req.body?.adminGoal || '').toString().trim();

    const startIso = parseDateBoundary(startDateInput, false);
    const endIso = parseDateBoundary(endDateInput, true);

    if ((startDateInput && !startIso) || (endDateInput && !endIso)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD or a valid ISO date.' });
    }

    if (startIso && endIso && new Date(startIso) > new Date(endIso)) {
      return res.status(400).json({ error: 'startDate must be on or before endDate.' });
    }

    let listingsQuery = writeSupabase
      .from('listings')
      .select(`
        id,
        title,
        description,
        location,
        latitude,
        longitude,
        qr_url,
        created_at,
        photos(id, winner, staff_uploaded, created_at)
      `)
      .order('created_at', { ascending: true });

    if (park) {
      listingsQuery = listingsQuery.ilike('location', `%${park}%`);
    }
    if (startIso) {
      listingsQuery = listingsQuery.gte('created_at', startIso);
    }
    if (endIso) {
      listingsQuery = listingsQuery.lte('created_at', endIso);
    }

    const { data: listings, error: listingsError } = await listingsQuery;
    if (listingsError) {
      console.error('Park report listing query error:', listingsError);
      return res.status(500).json({ error: 'Failed to fetch listings for report' });
    }

    const rows = Array.isArray(listings) ? listings : [];
    const photoRows = rows.flatMap((row) => (Array.isArray(row.photos) ? row.photos : []));

    const metrics = {
      total_trees: rows.length,
      trees_with_qr: rows.filter((row) => Boolean(row.qr_url)).length,
      trees_with_photos: rows.filter((row) => Array.isArray(row.photos) && row.photos.length > 0).length,
      total_photos: photoRows.length,
      pending_photo_submissions: photoRows.filter((photo) => photo?.staff_uploaded === false).length,
      winner_photos: photoRows.filter((photo) => Boolean(photo?.winner)).length,
      geotagged_trees: rows.filter((row) => row?.latitude !== null || row?.longitude !== null).length,
      trees_missing_location: rows.filter((row) => !(row?.location || '').toString().trim()).length,
    };

    const treeSnapshot = rows.slice(0, 150).map((row) => ({
      id: row.id,
      title: row.title || 'Untitled Tree',
      location: row.location || 'Unknown',
      created_at: row.created_at || null,
      has_qr: Boolean(row.qr_url),
      photo_count: Array.isArray(row.photos) ? row.photos.length : 0,
      has_winner_photo: Array.isArray(row.photos) ? row.photos.some((photo) => Boolean(photo?.winner)) : false,
      pending_photos: Array.isArray(row.photos)
        ? row.photos.filter((photo) => photo?.staff_uploaded === false).length
        : 0,
    }));

    const scopeLabel = park || 'All tracked locations';
    const dateLabel = startDateInput || endDateInput
      ? `${startDateInput || 'beginning'} to ${endDateInput || 'present'}`
      : 'All-time records';

    const systemPrompt = `${ARBORAI_REGIONAL_SCOPE}

You are generating a municipal-grade performance report for ArborTag/ArborDex pilot evaluation.
Return ONLY valid JSON (no markdown) with these exact keys:
- title: string
- executive_summary: string
- kpi_snapshot: array of objects with keys metric, value, why_it_matters
- public_impact: array of strings
- operational_impact: array of strings
- budget_justification: array of strings
- arborist_service_value: array of strings
- pilot_period_findings: array of strings
- next_period_recommendations: array of strings
- cautionary_notes: array of strings

The output should help a mayor or city administrator justify park expenses and contracted arbor services using the supplied data only.`;

    const reportContext = {
      scope: scopeLabel,
      timeframe: dateLabel,
      admin_goal: adminGoal || 'Evaluate pilot period value and budget justification for parks and arbor services.',
      metrics,
      tree_snapshot: treeSnapshot,
    };

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
          {
            role: 'user',
            content: `Generate a park impact report from this JSON context:\n${JSON.stringify(reportContext)}`,
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1800,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Park report OpenAI error:', errText);
      return res.status(502).json({ error: 'AI report request failed' });
    }

    const aiData = await response.json();
    const rawContent = aiData?.choices?.[0]?.message?.content || '{}';

    let parsedReport;
    try {
      parsedReport = JSON.parse(rawContent);
    } catch {
      parsedReport = {
        title: 'ArborTag Pilot Impact Report',
        executive_summary: 'ArborAI returned an invalid format for this request.',
        kpi_snapshot: [],
        public_impact: [],
        operational_impact: [],
        budget_justification: [],
        arborist_service_value: [],
        pilot_period_findings: [],
        next_period_recommendations: [],
        cautionary_notes: ['AI response format was invalid. Re-run report generation.'],
      };
    }

    return res.json({
      generated_at: new Date().toISOString(),
      filters: {
        park: park || null,
        start_date: startDateInput || null,
        end_date: endDateInput || null,
      },
      metrics,
      report: parsedReport,
    });
  } catch (err) {
    console.error('Unexpected park report error:', err);
    return res.status(500).json({ error: 'Unexpected park report error' });
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
      const noPhotoDiagnostics = {
        species: 'Unknown',
        environment: null,
        summary: 'No photos available for diagnostics.',
        recommendations: ['Upload at least one clear tree photo.'],
        public_about: 'This tree is waiting for its first photo and identification. Once photos are uploaded, ArborAI will add a friendly public description here.',
        photo_summaries: [],
        alerts: ['No photos available'],
        health_score: '0/10',
        confidence: 'Low',
        risk_flags: [],
        hazards_detected: 'No',
        hazard_details: []
      };

      const { error: noPhotoLogError } = await writeSupabase
        .from('tree_diagnostics_logs')
        .insert([{
          listing_id: id,
          run_at: new Date().toISOString(),
          source: 'ai-auto',
          diagnostics: noPhotoDiagnostics,
          notes: 'No photos available',
        }]);
      if (noPhotoLogError) console.error('[analyze-tree] Failed to persist no-photo diagnostics log:', noPhotoLogError);

      return res.json(noPhotoDiagnostics);
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
        uses_throughout_history: `${speciesGuess} has long served communities through shade, habitat support, and practical material use. Historical uses vary by species, but many trees have been valued for woodworking, fuel, and cultural gathering places.`,
        photo_summaries: photosToAnalyze.map((_, index) => `Photo ${index + 1}: AI photo insight is temporarily unavailable due to service limits.`),
        alerts: ['Diagnostics temporarily unavailable'],
        health_score: 'Pending',
        confidence: 'Low',
        risk_flags: [],
        hazards_detected: 'No',
        hazard_details: []
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

    async function persistDiagnosticsLog(diagnosticsPayload, notes = null) {
      const { error: logError } = await writeSupabase
        .from('tree_diagnostics_logs')
        .insert([{
          listing_id: id,
          run_at: new Date().toISOString(),
          source: 'ai-auto',
          diagnostics: diagnosticsPayload || {},
          notes,
        }]);

      if (logError) {
        console.error('[analyze-tree] Failed to persist diagnostics log:', logError);
      }
    }

    const systemPrompt = `${ARBORAI_REGIONAL_SCOPE}

  Analyze the provided tree data and photos and respond ONLY with a valid JSON object (no markdown, no explanation) with these exact keys:
- species: string (identified species or best guess)
- environment: string (description of the surrounding environment)
- summary: string (overall assessment of the tree)
- recommendations: array of strings (actionable care steps)
- public_about: string (friendly, upbeat, non-technical public-facing description with one fun fact)
- uses_throughout_history: string (public-facing historical or cultural uses of this species, concise and educational)
- photo_summaries: array of strings (one brief observation per photo)
- alerts: array of strings (urgent issues requiring human attention, empty array if none)
- health_score: string (e.g. "Good", "Fair", "Poor", or a score like "7/10")
- confidence: string (e.g. "High", "Medium", "Low")
- risk_flags: array of strings (potential hazards or structural concerns, empty array if none)
- urgency_level: string (one of: "Low", "Moderate", "High", "Critical" — overall urgency for human follow-up)
- hazards_detected: string ("Yes" or "No")
- hazard_details: array of strings (specific hazard findings; empty array if none)
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
      await persistDiagnosticsLog(fallbackDiagnostics, isRateLimit ? 'OpenAI rate limit fallback' : 'OpenAI provider error fallback');
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
      await persistDiagnosticsLog(fallbackDiagnostics, 'AI JSON parse fallback');
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

    const hazardSignals = [
      diagnostics?.summary,
      diagnostics?.environment,
      diagnostics?.public_about,
      diagnostics?.uses_throughout_history,
      ...(Array.isArray(diagnostics?.recommendations) ? diagnostics.recommendations : []),
      ...(Array.isArray(diagnostics?.risk_flags) ? diagnostics.risk_flags : []),
      ...(Array.isArray(diagnostics?.alerts) ? diagnostics.alerts : []),
      ...(Array.isArray(diagnostics?.photo_summaries) ? diagnostics.photo_summaries : []),
    ];

    const hazardDecision = resolveHazardClassification({
      hazardsDetectedRaw: diagnostics?.hazards_detected ?? diagnostics?.hazard_detected,
      hazardDetails: Array.isArray(diagnostics?.hazard_details)
        ? diagnostics.hazard_details
        : Array.isArray(diagnostics?.hazards_details)
          ? diagnostics.hazards_details
          : [],
      signalTexts: hazardSignals,
    });

    diagnostics.hazards_detected = hazardDecision.hazards_detected;
    diagnostics.hazard_details = hazardDecision.hazard_details;
    diagnostics = enforceCriticalDecayFailSafe(diagnostics);
    diagnostics = enforceHumanInspectionAlertSignals(diagnostics);

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

    let historicalUses = (diagnostics?.uses_throughout_history || '').toString().trim();
    if (!historicalUses) {
      historicalUses = `${speciesName} and related tree species have historically supported communities with shade, wildlife habitat, and wood resources. In parks, they also play social and educational roles by connecting visitors to local ecology.`;
    }

    diagnostics.uses_throughout_history = historicalUses;

    await persistPublicAboutIfMissing(publicAbout);

    // Persist diagnostics to logs so the tree list can read attention flags
    // Must await so the record exists before the client navigates back to tree list
    await persistDiagnosticsLog(diagnostics, null);

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
- hazards_detected: string ("Yes" or "No")
- hazard_details: array of strings
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
      hazards_detected: (() => {
        const raw = (parsed.hazards_detected ?? parsed.hazard_detected ?? '').toString().trim().toLowerCase();
        return raw === 'yes' || raw === 'y' || raw === 'true' ? 'Yes' : 'No';
      })(),
      hazard_details: Array.isArray(parsed.hazard_details)
        ? parsed.hazard_details.map((item) => item.toString()).filter(Boolean)
        : Array.isArray(parsed.hazards_details)
          ? parsed.hazards_details.map((item) => item.toString()).filter(Boolean)
          : [],
      raw_ai_message: (parsed.raw_ai_message || 'Here is your scan summary from ArborAI.').toString(),
      photo_urls: uploadedPhotoUrls,
    };

    const hazardDecision = resolveHazardClassification({
      hazardsDetectedRaw: parsed.hazards_detected ?? parsed.hazard_detected,
      hazardDetails: payload.hazard_details,
      signalTexts: [
        payload.summary,
        payload.raw_ai_message,
        ...payload.risks,
        ...payload.recommendations,
        ...payload.photo_summaries,
      ],
    });

    payload.hazards_detected = hazardDecision.hazards_detected;
    payload.hazard_details = hazardDecision.hazard_details;
    const normalizedPayload = enforceHumanInspectionAlertSignals(
      enforceCriticalDecayFailSafe(payload)
    );

    res.json(normalizedPayload);
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
// STRIPE WEBHOOK
// ===========================
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return res.status(500).send('Stripe webhook not configured');
  }

  const signature = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const customerId = normalizeStripeCustomerId(session.customer?.toString());
      const subscriptionId = session.subscription?.toString() || null;

      let tier = 'free';
      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = sub?.items?.data?.[0]?.price?.id || null;
        tier = getTierFromPriceId(priceId);
      }

      const userId = session.metadata?.supabase_user_id || null;

      if (userId) {
        const updateError = await updateHomeownerProfileBy('user_id', userId, {
          tier,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
        });
        if (updateError) {
          console.error('Stripe webhook profile update error (user_id):', updateError.message || updateError);
        }
      } else if (customerId) {
        const updateError = await updateHomeownerProfileBy('stripe_customer_id', customerId, {
          tier,
          stripe_subscription_id: subscriptionId,
        });
        if (updateError) {
          console.error('Stripe webhook profile update error (stripe_customer_id):', updateError.message || updateError);
        }
      }
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const customerId = normalizeStripeCustomerId(subscription.customer?.toString());
      const subscriptionId = subscription.id?.toString() || null;
      const priceId = subscription?.items?.data?.[0]?.price?.id || null;

      let tier = getTierFromPriceId(priceId);
      if (event.type === 'customer.subscription.deleted') {
        tier = 'free';
      }

      if (customerId) {
        const updateError = await updateHomeownerProfileBy('stripe_customer_id', customerId, {
          tier,
          stripe_subscription_id: event.type === 'customer.subscription.deleted' ? null : subscriptionId,
        });
        if (updateError) {
          console.error('Stripe subscription webhook update error:', updateError.message || updateError);
        }
      }
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook handling error:', err);
    return res.status(500).send('Webhook handling failed');
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
if (require.main === module) {
  app.listen(PORT, () => {
    console.log('ArborDex API running on port ' + PORT);
  });
}

module.exports = app;
