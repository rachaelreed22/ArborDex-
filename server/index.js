 // server/index.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const crypto = require('crypto');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { fileTypeFromBuffer } = require('file-type');
const { imageSize } = require('image-size');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const supabase = require('./db');
const multer = require('multer');
const fetch = require('node-fetch');
const nodemailer = require('nodemailer');
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// QR routes
const qrRoutes = require("./qrRoutes");
app.use("/", qrRoutes);

// Multer setup
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
});

const ALLOWED_PUBLIC_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const IMAGE_EXTENSION_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_IMAGE_WIDTH = 8000;
const MAX_IMAGE_HEIGHT = 8000;
const MAX_IMAGE_PIXELS = 32000000;

function getRateLimitKey(req) {
  const forwardedFor = (req.headers['x-forwarded-for'] || '').toString();
  const firstForwardedIp = forwardedFor.split(',')[0].trim();
  const candidateIp = firstForwardedIp || req.ip || '';
  return ipKeyGenerator(candidateIp);
}

const publicPhotoUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  message: { error: 'Too many upload attempts. Please wait and try again.' },
});

const publicAiAskLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  message: { error: 'Too many ArborAI requests. Please wait and try again.' },
});

const publicContactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  message: { error: 'Too many contact requests. Please wait and try again.' },
});

function normalizeStoragePrefix(value, fallback = 'upload') {
  const normalized = (value || '')
    .toString()
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80);

  return normalized || fallback;
}

function buildGeneratedObjectPath(prefix, mimeType) {
  const ext = IMAGE_EXTENSION_BY_MIME[mimeType] || 'jpg';
  return `${normalizeStoragePrefix(prefix)}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
}

function buildQrImageUrl(payload) {
  const data = (payload || '').toString().trim();
  if (!data) return '';
  return `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(data)}`;
}

async function validateRasterImageFile(file) {
  if (!file?.buffer || !Buffer.isBuffer(file.buffer)) {
    throw new Error('Invalid upload payload');
  }

  const detectedType = await fileTypeFromBuffer(file.buffer);
  const detectedMime = detectedType?.mime || '';

  if (!ALLOWED_PUBLIC_IMAGE_MIME.has(detectedMime)) {
    throw new Error('Only JPEG, PNG, and WEBP images are allowed');
  }

  const declaredMime = (file.mimetype || '').toString().trim().toLowerCase();
  if (declaredMime && !ALLOWED_PUBLIC_IMAGE_MIME.has(declaredMime)) {
    throw new Error('Invalid image MIME type');
  }

  let dimensions;
  try {
    dimensions = imageSize(file.buffer);
  } catch {
    throw new Error('Unable to read image dimensions');
  }

  const width = Number(dimensions?.width || 0);
  const height = Number(dimensions?.height || 0);
  if (!width || !height) {
    throw new Error('Image dimensions are required');
  }

  if (width > MAX_IMAGE_WIDTH || height > MAX_IMAGE_HEIGHT || width * height > MAX_IMAGE_PIXELS) {
    throw new Error('Image dimensions exceed allowed limits');
  }

  return {
    mimeType: detectedMime,
    width,
    height,
  };
}

const PHOTO_BUCKET = process.env.SUPABASE_PHOTO_BUCKET || 'tree-photos';
const ASK_ARBORAI_BUCKET = process.env.SUPABASE_ASK_ARBORAI_BUCKET || PHOTO_BUCKET;
const PORT = process.env.PORT || 5000;
const CLIENT_URL = (process.env.CLIENT_URL || 'https://localhost:5173').toString().trim();

const STRIPE_MODE = (process.env.STRIPE_MODE || '').toString().trim().toLowerCase();

function normalizeStripeMode(value) {
  const normalized = (value || '').toString().trim().toLowerCase();
  if (normalized === 'test' || normalized === 'live') return normalized;
  return 'live';
}

function readStripeSetting(baseName, mode = STRIPE_MODE) {
  const resolvedMode = normalizeStripeMode(mode);
  const modeSpecificKey = `${baseName}_${resolvedMode.toUpperCase()}`;
  const modeSpecificValue = (process.env[modeSpecificKey] || '').toString().trim();
  if (modeSpecificValue) return modeSpecificValue;

  const sharedValue = (process.env[baseName] || '').toString().trim();
  return sharedValue;
}

function getStripeConfig(mode = STRIPE_MODE) {
  const resolvedMode = normalizeStripeMode(mode);
  return {
    mode: resolvedMode,
    secretKey: readStripeSetting('STRIPE_SECRET_KEY', resolvedMode),
    webhookSecret: readStripeSetting('STRIPE_WEBHOOK_SECRET', resolvedMode),
    priceGardener: readStripeSetting('STRIPE_PRICE_GARDENER', resolvedMode),
    priceEstate: readStripeSetting('STRIPE_PRICE_ESTATE', resolvedMode),
  };
}

const STRIPE_CONFIG = getStripeConfig();
const STRIPE_SECRET_KEY = STRIPE_CONFIG.secretKey;
const STRIPE_WEBHOOK_SECRET = STRIPE_CONFIG.webhookSecret;
const STRIPE_PRICE_GARDENER = STRIPE_CONFIG.priceGardener;
const STRIPE_PRICE_ESTATE = STRIPE_CONFIG.priceEstate;

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

// ============================================================
// ORCHARD PLANT KNOWLEDGE — Apple, Peach, Strawberry, Blueberry
// Add new plants by appending a new section following this pattern.
// ============================================================
const ORCHARD_PLANT_KNOWLEDGE = `
ORCHARD PLANT IDENTIFICATION AND DIAGNOSTICS KNOWLEDGE BASE
Region: Southwestern Missouri, USA (zones 5b-6b)

--- APPLE (Malus domestica) ---
Common Cultivars in MO: Honeycrisp, Gala, Jonathan, Arkansas Black, Liberty, Enterprise, Gold Rush, Fuji, Grimes Golden.
Visual ID: Alternate ovate leaves with serrated margins, 5-petaled white-pink blossoms in spring, pome fruits (round, firm, red/yellow/green), gray furrowed bark on mature trees.
Adjacent/Lookalike Species: Crabapple (Malus sylvestris — smaller tart fruit <2in), Serviceberry (Amelanchier — smoother bark, earlier bloom, small dark berries), Pear (Pyrus — oval leaves, grainy flesh).
Key Pests (visual symptoms):
  - Codling moth: small round entry hole at blossom end of fruit, frass/webbing inside; caterpillar tunnels through core.
  - Apple maggot (Rhagoletis pomonella): brown streaking inside flesh, dimpled skin surface with tiny punctures.
  - Japanese beetle (Popillia japonica): skeletonized leaves (lace-like, veins remain), metallic green/bronze adult beetles visible.
  - European red mite: bronze-stippled upper leaf surface, silky webbing on leaf undersides, premature leaf drop.
  - Aphids (Aphis pomi): curled/cupped young leaves, sticky honeydew residue, soft clustered insects on new growth.
  - Wooly apple aphid: white cottony masses on branches, pruning wounds, and roots.
Key Diseases (visual symptoms):
  - Fire blight (Erwinia amylovora): shepherd's crook wilting of shoot tips, water-soaked then blackened/brown blossoms and shoots, bacterial ooze in humidity; HIGHEST PRIORITY disease in MO.
  - Cedar-apple rust (Gymnosporangium juniperi-virginianae): bright orange-yellow circular spots on upper leaf surface, tube-like spore structures on leaf undersides; requires Eastern Red Cedar as alternate host — CRITICAL in MO where cedars are common.
  - Apple scab (Venturia inaequalis): olive-green to brown velvety lesions on leaves and fruit; lesions crack as fruit matures.
  - Powdery mildew: white powdery coating on young leaves/shoots, distortion of new growth.
  - Brown rot (Monilinia fructicola): tan-brown rapidly spreading rot on fruit, concentric rings of gray-tan spore masses.
  - Bitter rot (Colletotrichum acutatum): sunken water-soaked tan-brown spots on fruit, often with salmon-pink spore masses in wet weather.
Health indicators: Full leaf canopy, firm fruit without lesions, no shoot dieback, no bark cankers.

--- PEACH (Prunus persica) ---
Common Cultivars in MO: Reliance, Contender, Redhaven, Loring, Harken, Madison, Veteran.
Visual ID: Long lanceolate leaves with finely serrated margins, pink 5-petaled single blossoms in early spring (before leaves), fuzzy skin drupes (fruit), reddish-brown scaly bark on mature trees.
Adjacent/Lookalike Species: Nectarine (Prunus persica var. nucipersica — smooth skinned, same tree), Plum (Prunus domestica/americana — rounder fruit, less furry, different leaf shape), Almond (Prunus dulcis — similar blossom but not fruiting in MO), Cherry (Prunus avium/cerasus — smaller rounder fruit, different bark).
Key Pests (visual symptoms):
  - Peach tree borer (Synanthedon exitiosa): gummosis (amber jelly-like sap) at base of trunk near soil line, frass + gum mass at crown; larvae girdle cambium.
  - Oriental fruit moth (Grapholita molesta): wilted shoot tips with entry holes (first generation), internal worm tunnels in fruit near pit (later generations).
  - Plum curculio (Conotrachelus nenuphar): crescent-shaped egg-laying scars on young fruit, misshapen/dropped fruit with curved larval tunnels.
  - Tarnished plant bug: small corky deformed areas on fruit skin, catfacing (puckered scars) at blossom end.
  - European red mite / Two-spotted spider mite: bronzing and stippling of leaf surface, webbing on undersides, early leaf drop in summer.
  - Stink bugs: hard corky tissue patches inside fruit (cat-facing), dimpled surface.
Key Diseases (visual symptoms):
  - Peach leaf curl (Taphrina deformans): red-pink puckered blistered/curled new leaves in spring, leaves thicken and pucker before turning yellow-gray and dropping — VERY COMMON and visually dramatic.
  - Brown rot (Monilinia fructicola): tan-brown spreading rot on ripening fruit, fuzzy gray-tan spore rings; also kills blossoms and small shoots (blossom blight).
  - Bacterial spot (Xanthomonas arboricola): angular water-soaked spots on leaves turning brown with yellow halos, shot-hole appearance; dark sunken lesions on fruit.
  - Cytospora canker (Leucostoma persoonii): gummosis on scaffold branches/trunk, bark dies and sunken cankers appear; associated with winter injury.
  - Powdery mildew: white powdery growth on young leaves and fruit surface.
Health indicators: Upright vigorous shoot growth, full green canopy, no gummosis, clean fruit skin.

--- STRAWBERRY (Fragaria × ananassa) ---
Common Types in MO: June-bearing (Earliglow, Allstar, Honeoye), Everbearing (Quinault, Fort Laramie), Day-neutral (Seascape, Albion).
Visual ID: Low-growing rosette plant with trifoliate leaves (3 oval toothed leaflets), white 5-petaled flowers with yellow centers, red aggregate accessory fruits at ground level, runners (stolons) spreading horizontally.
Adjacent/Lookalike Species: Wild strawberry (Fragaria virginiana — smaller fruit, smaller leaflets, native MO), Mock strawberry (Duchesnea indica — yellow flowers, tasteless fruit, no fragrance), Potentilla (similar leaves but no fruit runners).
Key Pests (visual symptoms):
  - Tarnished plant bug (Lygus lineolaris): misshapen/seedy/nubbly fruit ("button berries"), bronze stippling on leaves.
  - Spotted wing drosophila (Drosophila suzukii): small internal maggots in ripe fruit, accelerated soft rot on harvest.
  - Two-spotted spider mite: yellow stippling on upper leaf surface, fine webbing on undersides, bronzed appearance in hot dry weather.
  - Strawberry clipper weevil (Anthonomus signatus): clipped flower buds hanging by single thread; buds fall before blooming.
  - Cyclamen mite: stunted distorted leaves at crown, bronze/brown coloring on new growth.
  - Aphids: curled leaves, honeydew residue, colonies on undersides.
Key Diseases (visual symptoms):
  - Gray mold / Botrytis (Botrytis cinerea): fuzzy gray spore masses on ripe or damaged fruit; tan lesions on blossoms, stems, and leaves; most damaging in cool wet spring — HIGHEST PRIORITY MO disease.
  - Angular leaf spot (Xanthomonas fragariae): angular water-soaked spots on leaf undersides, white bacterial exudate visible in morning; spots turn reddish-brown.
  - Powdery mildew (Podosphaera aphanis): white powdery coating on leaf undersides, upward leaf curl at margins, purple blotching on upper surface.
  - Red stele (Phytophthora fragariae): wilted stunted plants, roots turn brick-red inside when cut; associated with wet poorly-drained soils.
  - Crown rot (Phytophthora cactorum): sudden plant collapse, brown rot at crown/base, white mycelium sometimes visible.
  - Leaf scorch (Diplocarpon earlianum): irregular purple-red spots on leaves with tan-gray centers.
Health indicators: Bright green trifoliate leaves, firm plump fruit, vigorous runner production, white clean roots.

--- BLUEBERRY (Vaccinium corymbosum / V. angustifolium) ---
Common Types in MO: Northern highbush (Bluecrop, Duke, Jersey, Patriot), Southern highbush (O'Neal, Sunshine Blue), Lowbush (Vaccinium angustifolium — wild type).
Visual ID: Woody shrub with oval alternate leaves (smooth edges or fine serration), white urn-shaped drooping flower clusters in spring, dark blue-black fruit with powdery bloom and star-shaped calyx end, reddish-orange fall color.
Adjacent/Lookalike Species: Huckleberry (Gaylussacia baccata — resinous dots on leaf undersides, 10-seeded fruit), Serviceberry (Amelanchier — larger tree/shrub, white clustered blossoms, not urn-shaped flowers), Privet (Ligustrum — opposite leaves, no edible fruit), Elderberry (Sambucus — pinnately compound leaves, very different structure).
Key Pests (visual symptoms):
  - Spotted wing drosophila (Drosophila suzukii): internal maggots in ripening fruit, collapsed soft spots, accelerated fruit drop.
  - Blueberry maggot (Rhagoletis mendax): infested fruit collapses/wrinkles, internal white maggot present.
  - Aphids: distorted curled leaves, honeydew and sooty mold on stems.
  - Blueberry tip borer (Hendecaneura shawiana): wilted shoot tips (flagging), small larvae inside stem.
  - Japanese beetle: skeletonized leaves, adult beetles feeding on ripe fruit.
  - Cranberry fruitworm / Cherry fruitworm: webbed clusters of fruit with entry holes, internal larvae.
Key Diseases (visual symptoms):
  - Mummy berry (Monilinia vaccinii-corymbosi): shriveled gray-tan "mummy" fruits remaining on plant through fall/winter; shoots wilt and turn brown in spring (shoot blight phase) before fruiting; MO-COMMON.
  - Stem blight (Botryosphaeria dothidea): sudden wilting and browning of individual canes starting at tips, tan-brown discoloration inside stem when cut.
  - Anthracnose (Colletotrichum acutatum): salmon-pink spore masses on fruit, sunken lesions; worse in warm wet harvests.
  - Botrytis blight (Botrytis cinerea): gray fuzzy spore masses on blossoms and young fruit in cool wet spring.
  - Phytophthora root rot: sudden plant decline, wilting despite adequate moisture, brown roots.
  - Powdery mildew: white powdery coating on leaves and young shoots.
Health indicators: Vigorous multi-stem growth, deep green foliage, abundant flower/fruit set, no stem dieback.
`;

// ============================================================
// REGIONAL HARDWOOD KNOWLEDGE — Missouri Parks + Landscape Trees
// Add new species by appending to the relevant section.
// ============================================================
const REGIONAL_HARDWOOD_KNOWLEDGE = `
MISSOURI HARDWOOD AND COMMON LANDSCAPE TREE IDENTIFICATION KNOWLEDGE BASE
Region: Southwestern Missouri, USA (zones 5b-6b)

--- CRITICAL LOOKALIKE CORRECTIONS ---

Eastern Red Cedar (Juniperus virginiana) vs Eastern Hemlock (Tsuga canadensis):
  These are NOT the same species and should NEVER be confused.
  EASTERN RED CEDAR: Scale-like or awl-like overlapping foliage (not needles in flat sprays), dense columnar/pyramidal form, blue-gray berry-like cones (0.25in) at branch tips, reddish-brown shredding fibrous bark, extremely common in MO — most common landscape/windbreak/pasture evergreen in SW Missouri.
  EASTERN HEMLOCK: Flat feathery sprays of short soft needles with white stripe undersides, small hanging oval cones (0.75in), graceful drooping branch tips, thin furrowed bark; NOT common in SW Missouri — rare, would be a notable landscape planting if present.
  RULE: In SW Missouri, an unidentified small to medium evergreen is FAR more likely Eastern Red Cedar than Eastern Hemlock. If scale-like foliage is visible, it is NOT hemlock. Only identify as Hemlock if flat soft spray needles with white bands are clearly visible.

Common MO Conifers / Evergreens:
  - Eastern Red Cedar (Juniperus virginiana): most common MO evergreen, scale-like foliage, blue berries, shredding bark.
  - Shortleaf Pine (Pinus echinata): 2-needle bundles (~3-4in), rough plated bark, small spiny cones; native to Ozarks.
  - Eastern White Pine (Pinus strobus): 5-needle bundles (soft, flexible), long cylindrical cones; planted ornamental.
  - Norway Spruce (Picea abies): sharp 4-sided single needles, large hanging cones, pendulous branches; planted ornamental.
  - Blue Spruce (Picea pungens): stiff silver-blue sharp needles; planted ornamental.

--- COMMON MISSOURI HARDWOODS (Parks and Urban Landscapes) ---

Oak Family (Quercus):
  - White Oak (Q. alba): rounded smooth-lobed leaves, light gray blocky bark, acorn with warty cap covering 1/4 of nut; dominant MO forest species.
  - Red Oak (Q. rubra): pointed-lobe leaves with bristle tips, dark furrowed upper bark / lighter gray lower, large flat-topped acorn cap; very common.
  - Pin Oak (Q. palustris): deeply cut pointed-lobe leaves, lower branches drooping, small round acorn; common urban/park tree.
  - Bur Oak (Q. macrocarpa): mossy-fringed acorn cap covering more than half the nut, deeply furrowed corky bark; open savanna indicator species in MO.
  - Chinkapin Oak (Q. muehlenbergii): toothed (not lobed) leaves resembling American chestnut, gray flaky bark on ridge tops.
  - Blackjack Oak (Q. marilandica): distinctive spatula/duck-foot shaped leaves, gnarled small tree on dry rocky soils.
  Key Oak Pests/Diseases: Oak wilt (Ceratocystis fagacearum — wilting from crown down, brown streaking in sapwood, spreads through root grafts; CRITICAL in red oak group), Two-lined chestnut borer (D-shaped exit holes), Gypsy moth (defoliation), Spongy moth (defoliation), Bacterial leaf scorch (marginal leaf browning), Hypoxylon canker (silvery-gray bark patches on dying wood).

Maple Family (Acer):
  - Silver Maple (A. saccharinum): deeply cut 5-lobed leaves, pale silver leaf undersides, shaggy gray bark, weedy-fast grower near water.
  - Sugar Maple (A. saccharum): classic 5-lobed leaf, gray furrowed bark, brilliant orange-red fall color, slow-growing.
  - Red Maple (A. rubrum): 3-5 lobed leaf with whitish underside, red flowers/samaras in early spring, red fall color.
  - Box Elder (A. negundo): compound pinnate leaves (looks unlike typical maple), green twigs, weedy near streams.
  Key Maple Pests/Diseases: Verticillium wilt (sudden dieback of individual branches, olive-green streaking in sapwood), Anthracnose (irregular brown patches on leaves in spring, worse in wet years), Cottony maple scale (white cottony masses on branches), Asian longhorned beetle (round exit holes in bark, NOT YET common in MO but monitor), Phyllosticta leaf spot.

Elm Family (Ulmus):
  - American Elm (U. americana): asymmetric leaf base, doubly serrated oval leaves, vase-shaped form, corky ridged bark.
  - Siberian/Chinese Elm (U. pumila): smaller smoother leaves, round papery samaras, planted ornamental.
  Key Elm Pests/Diseases: Dutch elm disease (DED — Ophiostoma ulmi/novo-ulmi; wilting from crown, elm bark beetle galleries under bark), Elm leaf beetle (notched/skeletonized leaves), Elm yellows (phytoplasma; buttery-yellow fall color out of season then rapid death).

Ash Family (Fraxinus):
  - White Ash (F. americana): opposite pinnately compound leaves (5-9 leaflets), diamond-patterned bark, oar-shaped samaras, purple fall color.
  - Green Ash (F. pennsylvanica): similar to white, but leaflet undersides often slightly hairy, more common in wet sites.
  Key Ash Pests/Diseases: Emerald ash borer (EAB — Agrilus planipennis; S-shaped larval galleries under bark, D-shaped exit holes, epicormic sprouting from trunk, crown dieback; MOST CRITICAL MO ash threat — assume EAB if any ash shows dieback), Ash anthracnose, Lilac/ash borer.

Other Key Missouri Trees:
  - Eastern Redbud (Cercis canadensis): small tree, heart-shaped leaves, magenta pea-flowers directly on bark in spring before leaves, flat seed pods; native MO, extremely common ornamental.
  - Flowering Dogwood (Cornus florida): opposite simple leaves, distinctive 4 large white bracts (not petals) in spring, red drupes in clusters, blocky alligator-hide bark; native understory tree. Susceptible to: dogwood anthracnose (Discula destructiva), powdery mildew.
  - Black Walnut (Juglans nigra): large alternate pinnately compound leaves (15-23 leaflets), large round green aromatic husked fruit, deeply furrowed dark bark; native MO. Toxic allelopathic roots kill some nearby plants. Pests: walnut caterpillar (mass defoliation), walnut husk fly.
  - Hackberry (Celtis occidentalis): corky warty bark (very distinctive), asymmetric simple toothed leaves, small dark purple drupes; very common MO urban/park tree, often confused with elm.
  - Sycamore (Platanus occidentalis): distinctive white/tan/green mottled exfoliating bark (most distinctive of any MO tree), large 3-5 lobed maple-like leaves, ball-shaped hanging seed clusters; common near water.
  - Honey Locust (Gleditsia triacanthos): pinnate/bipinnate compound leaves, large branched thorns on trunk (wild form), long twisted tan seed pods; common urban/park tree.
  - Osage Orange (Maclura pomifera): large rough bumpy green fruit ("hedge apple"), milky sap, stout thorns, native MO hedge/windbreak.
  - Persimmon (Diospyros virginiana): blocky square-patterned dark bark (like alligator hide), oval simple alternate leaves, orange-tan persimmon fruit after frost; native MO.

--- COMMON CITY PARK SHRUBS (SW Missouri) ---
  - Eastern Red Cedar (juvenile): common as shrub in open/disturbed areas before growing into tree form.
  - Wild Plum (Prunus americana): thicket-forming, white blossoms in early spring, small red-yellow plums, thorny branches.
  - Elderberry (Sambucus canadensis): opposite pinnately compound leaves, flat-topped white flower clusters, purple-black berry clusters; very common MO shrub near water and edges.
  - Spicebush (Lindera benzoin): alternate simple oval leaves, aromatic when crushed, small yellow flowers on bare stems in spring, red drupes in fall; native understory shrub.
  - Roughleaf Dogwood (Cornus drummondii): opposite simple rough-textured leaves, white flat-topped flower clusters, white berries; very common MO thicket shrub.
`;

const ARBORAI_REGIONAL_SCOPE = `You are ArborAI, an identification and diagnostics assistant for trees, shrubs, houseplants, and common garden plants found in Southwestern Missouri, USA. Your knowledge must reflect the ecology, climate, soils, pests, and species typical of this region.

You have access to detailed regional knowledge for:
- ORCHARD PLANTS: Apple, Peach, Strawberry, and Blueberry — including cultivar ID, pests, and diseases specific to SW Missouri.
- MISSOURI HARDWOODS AND LANDSCAPE TREES: Including critical lookalike corrections (e.g. Eastern Red Cedar vs Eastern Hemlock), oak wilt, EAB, and common park species.

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
- Keep under 200 words
- Use Missouri-specific pests/diseases (EAB, oak wilt, cedar-apple rust, fire blight, Botrytis, mummy berry, etc.)
- For orchard plants: always consider and name cultivar if identifiable, and cite specific pest/disease by common + scientific name.

2. Public Mode (Visitors, Homeowners, Gardeners, Orchard Visitors)
Triggered when the user is not logged in, scans a QR code, or uploads a plant photo.

Tone:
Friendly, simple, educational, encouraging.

Required Structure:
- Likely Identification (include cultivar guess if visible)
- Key Features Noticed
- Care or Interesting Facts
- Common Issues to Watch For (name real pests/diseases, not generic advice)

Rules:
- Avoid technical jargon
- No TRAQ-style risk language
- No municipal liability language
- Keep under 200 words
- Include indoor/outdoor garden plants, ornamentals, and houseplants
- Provide Missouri-appropriate care guidance

General Identification Rules (Both Modes):
- Prioritize species native or common in SW Missouri
- For orchard fruit trees and berry plants: use the ORCHARD PLANT KNOWLEDGE BASE for ID, cultivar, pest, and disease calls.
- For landscape, park, and hardwood trees: use the REGIONAL HARDWOOD KNOWLEDGE BASE for ID and lookalike corrections.
- CRITICAL: In SW Missouri, unidentified evergreens are almost always Eastern Red Cedar (Juniperus virginiana), NOT Eastern Hemlock. Only identify as Hemlock if flat spray needles with white bands are clearly and unmistakably visible.
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
const SUPPORT_CONTACT_EMAIL = (process.env.SUPPORT_CONTACT_EMAIL || 'arbortag_support@rrtech.dev').toString().trim();

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

function getRequestOrigin(req) {
  const forwardedProto = (req.headers['x-forwarded-proto'] || '').toString().split(',')[0].trim();
  const forwardedHost = (req.headers['x-forwarded-host'] || '').toString().split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'http';
  const host = forwardedHost || req.get('host') || '';
  return host ? `${protocol}://${host}` : '';
}

function cleanContactField(value, maxLength = 5000) {
  return (value || '')
    .toString()
    .replace(/\r/g, '')
    .trim()
    .slice(0, maxLength);
}

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

function normalizeStaffMeasurements(input = {}) {
  const trunkDiameterInchesRaw = Number(input?.trunk_diameter_inches);
  const heightEstimateFeetRaw = Number(input?.height_estimate_feet);

  const trunk_diameter_inches = Number.isFinite(trunkDiameterInchesRaw) && trunkDiameterInchesRaw > 0
    ? Number(trunkDiameterInchesRaw.toFixed(2))
    : null;

  const height_estimate_feet = Number.isFinite(heightEstimateFeetRaw) && heightEstimateFeetRaw > 0
    ? Number(heightEstimateFeetRaw.toFixed(2))
    : null;

  return {
    trunk_diameter_inches,
    height_estimate_feet,
  };
}

async function getLatestStaffMeasurementsForListing(listingId) {
  const { data, error } = await writeSupabase
    .from('tree_diagnostics_logs')
    .select('diagnostics, run_at, created_at')
    .eq('listing_id', listingId)
    .eq('source', 'staff-measurements')
    .order('run_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Failed to fetch latest staff measurements:', error);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.diagnostics || typeof row.diagnostics !== 'object') {
    return null;
  }

  const normalized = normalizeStaffMeasurements(row.diagnostics.staff_measurements || row.diagnostics);
  if (!normalized.trunk_diameter_inches && !normalized.height_estimate_feet) {
    return null;
  }

  return normalized;
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

function parseBooleanFlag(value, defaultValue = false) {
  if (value == null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;

  const normalized = value.toString().trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function normalizeReportScope(value) {
  const normalized = (value || '').toString().trim().toLowerCase();
  if (normalized === 'system-wide' || normalized === 'system' || normalized === 'global') {
    return 'system-wide';
  }
  return 'park';
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

function isAdvisoryOnlyHazardDetail(text = '') {
  const sample = (text || '').toString().trim();
  if (!sample) return false;

  const lower = sample.toLowerCase();
  const hasHazardSignal = HAZARD_SIGNAL_KEYWORDS.some((keyword) => lower.includes(keyword));
  if (!hasHazardSignal) return false;

  const hasObservedEvidence = hasObservedHazardEvidence(sample);
  const hasAdvisoryLanguage = HAZARD_ADVISORY_ONLY_PATTERNS.some((pattern) => pattern.test(sample));

  return hasAdvisoryLanguage && !hasObservedEvidence;
}

function resolveHazardClassification({ hazardsDetectedRaw, hazardDetails, signalTexts }) {
  const explicitDetails = normalizeStringList(hazardDetails);
  const inferredDetails = inferHazardDetailsFromTextSignals(signalTexts);
  const nonAdvisoryExplicitDetails = explicitDetails.filter((detail) => !isAdvisoryOnlyHazardDetail(detail));
  const mergedDetails = Array.from(new Set([...nonAdvisoryExplicitDetails, ...inferredDetails]));

  const raw = (hazardsDetectedRaw || '').toString().trim().toLowerCase();
  const explicitYes = raw === 'yes' || raw === 'y' || raw === 'true';
  const explicitNo = raw === 'no' || raw === 'n' || raw === 'false';

  const advisoryOnlyExplicitYes =
    explicitYes
    && nonAdvisoryExplicitDetails.length === 0
    && inferredDetails.length === 0
    && explicitDetails.length > 0;

  const inferredYes = mergedDetails.length > 0;
  const hazardsDetected = advisoryOnlyExplicitYes
    ? 'No'
    : explicitYes || inferredYes
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
    next.alerts = alerts.filter((item) => !/needs\s+human\s+inspection/i.test(item));
  }

  if (hasHazards) {
    next.alerts = Array.from(new Set(alerts));
  }
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

function normalizeConfidenceTier(value) {
  const raw = (value || '').toString().trim().toLowerCase();
  if (!raw) return 'Low';
  if (raw.includes('high')) return 'High';
  if (raw.includes('medium') || raw.includes('moderate')) return 'Medium';
  if (raw.includes('low')) return 'Low';
  return 'Low';
}

function capConfidenceTier(currentValue, maxTier = 'Medium') {
  const order = { Low: 1, Medium: 2, High: 3 };
  const current = normalizeConfidenceTier(currentValue);
  const max = normalizeConfidenceTier(maxTier);
  return order[current] > order[max] ? max : current;
}

function normalizeStringArrayField(value) {
  return Array.isArray(value)
    ? value.map((item) => (item == null ? '' : item.toString().trim())).filter(Boolean)
    : [];
}

function enforceToxicLookalikeSafety(payload = {}) {
  const next = { ...payload };

  const identificationText = [next.species, next.likely_identification]
    .filter(Boolean)
    .join(' | ')
    .toLowerCase();

  const signalText = [
    next.summary,
    next.raw_ai_message,
    next.toxicity_info,
    ...(Array.isArray(next.photo_summaries) ? next.photo_summaries : []),
    ...(Array.isArray(next.key_features_noticed) ? next.key_features_noticed : []),
    ...(Array.isArray(next.primary_concerns) ? next.primary_concerns : []),
    ...(Array.isArray(next.warning_signs) ? next.warning_signs : []),
    ...(Array.isArray(next.risks) ? next.risks : []),
    ...(Array.isArray(next.recommendations) ? next.recommendations : []),
    ...(Array.isArray(next.hazard_details) ? next.hazard_details : []),
  ]
    .map((item) => (item == null ? '' : item.toString().toLowerCase()))
    .join(' | ');

  const combined = `${identificationText} | ${signalText}`;

  const hasApiaceae = /(apiaceae|umbel|umbellifer|queen anne'?s lace|wild carrot|daucus\s+carota|hemlock|conium\s+maculatum|cicuta|water hemlock|fool'?s parsley)/i.test(combined);
  const hasHemlockNamed = /(poison hemlock|conium\s+maculatum|water hemlock|cicuta)/i.test(combined);
  const hasWildCarrotNamed = /(queen anne'?s lace|wild carrot|daucus\s+carota)/i.test(combined);
  const identifiesWildCarrot = /(queen anne'?s lace|wild carrot|daucus\s+carota)/i.test(identificationText);
  const hasToxicLanguage = /(poison|poisonous|toxic|danger|fatal|neurotoxin|do not ingest|do not touch)/i.test(combined);

  const stemBlotchCue = /(purple\s*(blotch|spot|mottl)|blotch(ed)?\s+stem|purple[-\s]?spotted\s+stem|reddish[-\s]?purple\s+blotch)/i.test(combined);
  const smoothHairlessCue = /(smooth\s+stem|hairless\s+stem|glabrous\s+stem)/i.test(combined);
  const hollowStemCue = /(hollow\s+stem)/i.test(combined);
  const hairyStemCue = /(hairy\s+stem|bristly\s+stem|fuzzy\s+stem)/i.test(combined);

  const hemlockStemPattern = (stemBlotchCue || smoothHairlessCue || hollowStemCue) && !hairyStemCue;
  const hemlockEvidence = hasHemlockNamed || hemlockStemPattern;
  const toxicLookalikeRisk = hasApiaceae && (hemlockEvidence || (hasWildCarrotNamed && hasToxicLanguage));

  if (!toxicLookalikeRisk) {
    return next;
  }

  const toxicWarning = 'Potential poisonous Apiaceae lookalike detected (possible Poison Hemlock). Do not ingest or handle without protection; seek expert verification.';
  const stemCheckPrompt = 'Verify stem traits: purple blotching, smooth hairless surface, and hollow stem strongly favor Poison Hemlock over Wild Carrot.';
  const differentialComparison = 'Qualifier check: Poison Hemlock often has smooth hairless stems with purple blotches and can be highly toxic; Wild Carrot (Queen Anne\'s Lace) typically has hairy/bristly stems and is less hazardous. If uncertain, treat as Poison Hemlock risk first.';
  const toxicFirstLabel = 'Potential Poison Hemlock risk (verify vs Wild Carrot)';

  if (typeof next.confidence !== 'undefined') {
    next.confidence = capConfidenceTier(next.confidence, 'Medium');
  }

  if (identifiesWildCarrot && (hemlockEvidence || hasToxicLanguage)) {
    if (typeof next.species !== 'undefined') {
      next.species = toxicFirstLabel;
    }
    if (typeof next.likely_identification !== 'undefined') {
      next.likely_identification = toxicFirstLabel;
    }
    if (typeof next.confidence !== 'undefined') {
      next.confidence = capConfidenceTier(next.confidence, 'Low');
    }
  }

  if (typeof next.species !== 'undefined' && !next.species) {
    next.species = toxicFirstLabel;
  }

  if (typeof next.likely_identification !== 'undefined' && !next.likely_identification) {
    next.likely_identification = toxicFirstLabel;
  }

  const hazardDetails = normalizeStringArrayField(next.hazard_details);
  if (!hazardDetails.some((item) => /poisonous apiaceae lookalike|poison hemlock/i.test(item))) {
    hazardDetails.unshift(toxicWarning);
  }
  next.hazard_details = Array.from(new Set(hazardDetails));
  next.hazards_detected = 'Yes';
  next.needs_human_inspection = true;

  const recommendations = normalizeStringArrayField(next.recommendations);
  if (!recommendations.some((item) => /verify stem traits|purple blotch|hairless|hollow stem/i.test(item))) {
    recommendations.unshift(stemCheckPrompt);
  }
  if (!recommendations.some((item) => /poison hemlock often has smooth hairless stems|wild carrot|queen anne/i.test(item))) {
    recommendations.unshift(differentialComparison);
  }
  next.recommendations = Array.from(new Set(recommendations));

  const careNotes = normalizeStringArrayField(next.care_notes);
  if (!careNotes.some((item) => /do not ingest|expert verification|poison/i.test(item))) {
    careNotes.unshift('Potentially poisonous lookalike: avoid ingestion and direct handling until expert identification confirms species.');
  }
  if (careNotes.length > 0) {
    next.care_notes = Array.from(new Set(careNotes));
  }

  const warningSigns = normalizeStringArrayField(next.warning_signs);
  if (!warningSigns.some((item) => /poisonous apiaceae|poison hemlock|purple blotch/i.test(item))) {
    warningSigns.unshift('Poisonous Apiaceae lookalike risk (possible Poison Hemlock).');
  }
  if (!warningSigns.some((item) => /wild carrot|queen anne|hairy\/bristly stems/i.test(item))) {
    warningSigns.unshift(differentialComparison);
  }
  if (warningSigns.length > 0) {
    next.warning_signs = Array.from(new Set(warningSigns));
  }

  const risks = normalizeStringArrayField(next.risks);
  if (!risks.some((item) => /poisonous|toxic|hemlock/i.test(item))) {
    risks.unshift('Possible poisonous lookalike (Poison Hemlock risk).');
  }
  if (risks.length > 0) {
    next.risks = Array.from(new Set(risks));
  }

  if (typeof next.toxicity_info !== 'undefined') {
    const toxicity = (next.toxicity_info || '').toString().trim();
    if (!/poisonous|toxic|hemlock/i.test(toxicity)) {
      next.toxicity_info = `${toxicity ? `${toxicity} ` : ''}${toxicWarning}`.trim();
    }
  }

  if (typeof next.raw_ai_message !== 'undefined') {
    const rawMessage = (next.raw_ai_message || '').toString().trim();
    if (!/do not ingest|poisonous|hemlock/i.test(rawMessage)) {
      next.raw_ai_message = `${toxicWarning} ${differentialComparison} ${rawMessage}`.trim();
    } else if (!/wild carrot|queen anne|hairy\/bristly stems/i.test(rawMessage)) {
      next.raw_ai_message = `${rawMessage} ${differentialComparison}`.trim();
    }
  }

  if (typeof next.summary !== 'undefined') {
    const summary = (next.summary || '').toString().trim();
    if (!/poison hemlock|wild carrot|queen anne|hairy\/bristly stems|purple blotch/i.test(summary)) {
      next.summary = `${summary ? `${summary} ` : ''}${differentialComparison}`.trim();
    }
  }

  const dataQualityFlags = normalizeStringArrayField(next.data_quality_flags);
  if (!dataQualityFlags.some((item) => /toxic lookalike|apiaceae|hemlock/i.test(item))) {
    dataQualityFlags.unshift('Toxic lookalike guardrail applied: confidence reduced until stem evidence is confirmed.');
  }
  if (dataQualityFlags.length > 0) {
    next.data_quality_flags = Array.from(new Set(dataQualityFlags));
  }

  if (typeof next.urgency_level !== 'undefined') {
    const urgency = (next.urgency_level || '').toString().trim().toLowerCase();
    if (!urgency || urgency === 'low' || urgency === 'moderate') {
      next.urgency_level = 'High';
    }
  }

  return next;
}

// ============================================================
// GUARDRAIL — Orchard plant and hardwood ID accuracy enforcement
// Add new correction rules here as new species are onboarded.
// ============================================================
function enforceOrchardAndHardwoodIDAccuracy(payload = {}) {
  const next = { ...payload };

  const identificationText = [
    next.species,
    next.likely_identification,
  ]
    .filter(Boolean)
    .map((v) => v.toString().toLowerCase())
    .join(' | ');

  const signalText = [
    next.summary,
    next.raw_ai_message,
    ...(Array.isArray(next.photo_summaries) ? next.photo_summaries : []),
    ...(Array.isArray(next.key_features_noticed) ? next.key_features_noticed : []),
    ...(Array.isArray(next.primary_concerns) ? next.primary_concerns : []),
    ...(Array.isArray(next.risks) ? next.risks : []),
    ...(Array.isArray(next.recommendations) ? next.recommendations : []),
    ...(Array.isArray(next.hazard_details) ? next.hazard_details : []),
  ]
    .map((item) => (item == null ? '' : item.toString().toLowerCase()))
    .join(' | ');

  const combined = `${identificationText} | ${signalText}`;

  // --- RULE 1: Eastern Red Cedar vs Eastern Hemlock ---
  // In SW Missouri, unidentified evergreens are almost always Eastern Red Cedar.
  // Correct model if it identifies hemlock when cedar visual cues are present.
  const identifiesHemlock = /(eastern hemlock|tsuga canadensis|tsuga)/i.test(identificationText);
  const identifiesCedar = /(eastern red cedar|juniperus virginiana|juniperus|red cedar)/i.test(identificationText);
  const hasCedarCues = /(scale[- ]like|awl[- ]like|scaly foliage|blue.{0,10}berr|shredding bark|fibrous bark|columnar|windbreak|cedar gall|cedar.apple)/i.test(combined);
  const hasHamlockCues = /(flat.{0,10}spray|white band|needle.{0,10}underside|drooping tip|graceful|tsuga)/i.test(combined);
  const misidentifiedHemlock = identifiesHemlock && (hasCedarCues || !hasHamlockCues);

  if (misidentifiedHemlock) {
    const correction = 'ID corrected: Eastern Hemlock is rare in SW Missouri. Visual evidence matches Eastern Red Cedar (Juniperus virginiana) — scale-like or awl-like foliage, blue-gray berries, shredding bark. Only identify as Hemlock if flat soft spray needles with white bands are clearly visible.';
    const correctedId = 'Eastern Red Cedar (Juniperus virginiana) — likely misidentified as Eastern Hemlock';
    if (typeof next.species !== 'undefined') next.species = correctedId;
    if (typeof next.likely_identification !== 'undefined') next.likely_identification = correctedId;
    if (typeof next.confidence !== 'undefined') next.confidence = capConfidenceTier(next.confidence, 'Medium');
    const flags = normalizeStringArrayField(next.data_quality_flags);
    if (!flags.some((f) => /hemlock.*cedar|cedar.*hemlock|id corrected/i.test(f))) {
      flags.unshift(correction);
    }
    next.data_quality_flags = Array.from(new Set(flags));
    const recs = normalizeStringArrayField(next.recommendations);
    if (!recs.some((r) => /eastern red cedar|scale.like|juniperus/i.test(r))) {
      recs.unshift('Verify foliage type: Eastern Red Cedar has scale-like or awl-like foliage (not needle sprays). Look for blue-gray berry-like cones and shredding reddish-brown bark.');
    }
    next.recommendations = Array.from(new Set(recs));
  }

  // --- RULE 2: Cedar-Apple Rust on Apple ---
  // If apple + cedar-apple rust is mentioned, always surface Eastern Red Cedar as the alternate host.
  const isApple = /(malus|apple|crabapple)/i.test(identificationText);
  const hasCedarAppleRust = /(cedar.apple rust|gymnosporangium)/i.test(combined);
  if (isApple && hasCedarAppleRust) {
    const rustNote = 'Cedar-apple rust requires Eastern Red Cedar as its alternate host. If Eastern Red Cedars are present nearby, this disease risk is elevated. Removing nearby cedars or selecting rust-resistant apple cultivars (Liberty, Enterprise, Redfree) is the most effective long-term management.';
    const recs = normalizeStringArrayField(next.recommendations);
    if (!recs.some((r) => /cedar.apple rust.*alternate host|alternate host.*cedar|resistant.*cultivar/i.test(r))) {
      recs.unshift(rustNote);
    }
    next.recommendations = Array.from(new Set(recs));
  }

  // --- RULE 3: Fire Blight on Apple or Pear ---
  // Surface urgency and specific shepherd's crook visual cue if fire blight detected.
  const isAppleOrPear = /(malus|apple|pear|pyrus)/i.test(identificationText);
  const hasFireBlightMention = /(fire blight|erwinia amylovora)/i.test(combined);
  const hasFireBlightObservedSymptoms = /(shepherd.{0,5}crook|shoot.*wilting.*blacken|blacken.*shoot|blossom blight|bacterial ooze|blackened blossoms?)/i.test(combined);
  const hasFireBlightAdvisoryOnly = /(watch\s+for|monitor\s+for|risk\s+of|susceptible\s+to|can\s+cause|could\s+cause|may\s+cause|inspect\s+for\s+signs?)/i.test(combined) && !hasFireBlightObservedSymptoms;

  if (isAppleOrPear && hasFireBlightMention && hasFireBlightObservedSymptoms && !hasFireBlightAdvisoryOnly) {
    const urgency = (next.urgency_level || '').toString().trim().toLowerCase();
    if (!urgency || urgency === 'low') next.urgency_level = 'High';
    const hazardDetails = normalizeStringArrayField(next.hazard_details);
    if (!hazardDetails.some((d) => /fire blight/i.test(d))) {
      hazardDetails.unshift('Fire blight detected (Erwinia amylovora): prune 12+ inches below visible infection, sterilize tools between cuts, avoid high-nitrogen fertilizer which promotes susceptible new growth.');
    }
    next.hazard_details = Array.from(new Set(hazardDetails));
    next.hazards_detected = 'Yes';
    next.needs_human_inspection = true;
  }

  // --- RULE 4: Peach Leaf Curl ---
  // If peach + leaf curl is present, ensure it's correctly named and visualized.
  const isPeach = /(prunus persica|peach|nectarine)/i.test(identificationText);
  const hasPeachLeafCurl = /(leaf curl|taphrina|puckered|blistered.{0,20}leaf|red.{0,10}curled)/i.test(combined);
  if (isPeach && hasPeachLeafCurl) {
    const recs = normalizeStringArrayField(next.recommendations);
    if (!recs.some((r) => /taphrina|leaf curl|copper fungicide|dormant spray/i.test(r))) {
      recs.unshift('Peach leaf curl (Taphrina deformans): apply copper fungicide or lime-sulfur as a dormant spray in late winter before buds swell. Once leaves are curled in spring, fungicide is no longer effective for that season.');
    }
    next.recommendations = Array.from(new Set(recs));
  }

  // --- RULE 5: Emerald Ash Borer (EAB) ---
  // Any ash showing dieback should flag EAB as the primary suspect in Missouri.
  const isAsh = /(fraxinus|white ash|green ash|ash tree)/i.test(identificationText);
  const hasDieback = /(dieback|crown.*die|dying|decline|dead.*branch|branch.*dead|d.shaped exit|serpentine|gallery)/i.test(combined);
  const hasEAB = /(emerald ash borer|agrilus planipennis|\beab\b)/i.test(combined);
  if (isAsh && hasDieback && !hasEAB) {
    const eabWarning = 'PRIORITY: Ash dieback in Missouri must be assumed to be Emerald Ash Borer (Agrilus planipennis / EAB) until ruled out by inspection. Look for D-shaped exit holes (3-4mm) in bark, S-shaped larval galleries under bark, and epicormic sprouting from trunk base. EAB is confirmed throughout Missouri and has devastated ash populations.';
    const hazardDetails = normalizeStringArrayField(next.hazard_details);
    if (!hazardDetails.some((d) => /emerald ash borer|\beab\b/i.test(d))) {
      hazardDetails.unshift(eabWarning);
    }
    next.hazard_details = Array.from(new Set(hazardDetails));
    next.hazards_detected = 'Yes';
    next.needs_human_inspection = true;
    const urgency = (next.urgency_level || '').toString().trim().toLowerCase();
    if (!urgency || urgency === 'low' || urgency === 'moderate') next.urgency_level = 'High';
  }

  // --- RULE 6: Oak Wilt ---
  // Oak showing wilt/dieback from crown should flag oak wilt as a suspect in Missouri.
  const isRedOakGroup = /(red oak|pin oak|scarlet oak|black oak|quercus rubra|quercus palustris|quercus velutina)/i.test(identificationText);
  const hasWilt = /(wilt|flagging|brown.*crown|crown.*brown|vascular|sapwood.*streak|rapid.*decline)/i.test(combined);
  const hasOakWilt = /(oak wilt|ceratocystis)/i.test(combined);
  if (isRedOakGroup && hasWilt && !hasOakWilt) {
    const oakWiltWarning = 'PRIORITY: Crown wilt or dieback in the red oak group must be evaluated for oak wilt (Ceratocystis fagacearum). Oak wilt spreads rapidly through root grafts and kills red oaks within weeks of symptom onset in Missouri. Do not prune oaks between April and July. Contact a certified arborist immediately for sapwood streak evaluation.';
    const hazardDetails = normalizeStringArrayField(next.hazard_details);
    if (!hazardDetails.some((d) => /oak wilt|ceratocystis/i.test(d))) {
      hazardDetails.unshift(oakWiltWarning);
    }
    next.hazard_details = Array.from(new Set(hazardDetails));
    next.hazards_detected = 'Yes';
    next.needs_human_inspection = true;
    const urgency = (next.urgency_level || '').toString().trim().toLowerCase();
    if (!urgency || urgency === 'low' || urgency === 'moderate') next.urgency_level = 'High';
  }

  // --- RULE 7: Mummy Berry on Blueberry ---
  const isBlueberry = /(vaccinium|blueberry|highbush|lowbush)/i.test(identificationText);
  const hasMummyBerry = /(mummy berry|monilinia vaccinii|shriveled.*fruit.*remain|gray.*mummy)/i.test(combined);
  const hasDrainageOrBlightCue = /(stem blight|botryosphaeria|wilting.*cane|tip.*brown|cane.*die)/i.test(combined);
  if (isBlueberry && (hasMummyBerry || hasDrainageOrBlightCue)) {
    const recs = normalizeStringArrayField(next.recommendations);
    if (hasMummyBerry && !recs.some((r) => /mummy berry|monilinia|rake.*mummies/i.test(r))) {
      recs.unshift('Mummy berry (Monilinia vaccinii-corymbosi): remove and destroy all mummified fruits on the plant and ground before spring. Apply a layer of fresh mulch to block spore release. Fungicide applications at early bloom (captan or azoxystrobin) can reduce shoot blight phase.');
    }
    if (hasDrainageOrBlightCue && !recs.some((r) => /stem blight|prune.*cane|botryosphaeria/i.test(r))) {
      recs.unshift('Stem blight (Botryosphaeria): prune affected canes 6+ inches below the brown discoloration. Sterilize pruners between cuts. Improve air circulation by not over-crowding plants.');
    }
    next.recommendations = Array.from(new Set(recs));
  }

  // --- RULE 8: Strawberry Botrytis ---
  const isStrawberry = /(fragaria|strawberry)/i.test(identificationText);
  const hasBotrytis = /(botrytis|gray mold|grey mold|fuzzy.*gray.*fruit|gray.*fuzz)/i.test(combined);
  if (isStrawberry && hasBotrytis) {
    const recs = normalizeStringArrayField(next.recommendations);
    if (!recs.some((r) => /botrytis|gray mold|air circulation|harvest.*promptly/i.test(r))) {
      recs.unshift('Gray mold / Botrytis (Botrytis cinerea): harvest ripe fruit promptly, remove all infected fruit from the planting, improve air circulation by managing row covers and plant density, avoid overhead irrigation. Fungicide applications (captan, thiram, or Elevate) at bloom and early fruit development reduce losses.');
    }
    next.recommendations = Array.from(new Set(recs));
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

const HOMEOWNER_PLANT_SELECT = 'id, user_id, name, species, room_or_bed, bed_number, row_section_id, qr_code_token, photos, last_diagnostics, created_at, updated_at';
const HOMEOWNER_PLANT_PUBLIC_SELECT = 'id, name, species, room_or_bed, bed_number, row_section_id, qr_code_token, photos, last_diagnostics, created_at, updated_at';
const HOMEOWNER_JOURNAL_EVENT_TYPES = new Set(['planted', 'harvested', 'fertilized', 'watered', 'note']);
const DEMO_GARDEN_STORAGE_OBJECT = 'demo-garden/state.json';
const DEMO_GARDEN_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function buildDemoGardenDiagnostics({ commonName, scientificName, condition }) {
  return {
    likely_identification: `${commonName} (${scientificName})`,
    confidence: 'High',
    overall_condition: condition,
    summary: `${commonName} appears healthy with active growth and no urgent care threats in the current photos.`,
    key_features_noticed: ['Leaf color and shape align with expected traits', 'Growth habit appears stable', 'No active pest clustering observed'],
    primary_concerns: ['Monitor moisture consistency to avoid stress swings'],
    care_notes: ['Rotate plant periodically for even light exposure', 'Inspect leaves weekly for early pest signs'],
    common_issues_to_watch_for: ['Overwatering root stress', 'Leaf scorch from direct midday sun'],
    watering_frequency_summer: 'Water when top inch of soil is dry; usually 1-2 times per week.',
    watering_frequency_winter: 'Reduce watering cadence; typically every 7-14 days depending on indoor heat.',
    under_over_watering_signs: ['Drooping with dry soil may indicate under-watering', 'Yellowing lower leaves with wet soil may indicate over-watering'],
    light_requirements: 'Bright, indirect light for most of the day.',
    temp_humidity_preferences: '65-80F with moderate humidity and good airflow.',
    potting_soil_requirements: 'Well-draining potting mix with organic matter.',
    warning_signs: ['Rapid leaf drop', 'Dark mushy stem/base tissue', 'Persistent foul soil odor'],
    toxicity_info: 'Verify species-specific toxicity if pets or children have access.',
    maintenance_requirements: 'Low to moderate maintenance with regular pruning and seasonal feeding.',
    estimated_growth_rate: 'Moderate',
    growing_difficulty_score: '3/10',
    native_habitat: 'Humid woodland and understory regions.',
    propagation_method: 'Division or stem cuttings depending on species.',
    medicinal_qualities: 'No medicinal use claims included in this demo profile.',
    uses_throughout_history: ['Popular ornamental in homes and conservatories'],
    fun_facts: ['This profile demonstrates homeowner-style diagnostics layout.'],
    hazards_detected: 'N',
    hazard_details: [],
    data_quality_flags: [],
    photo_summaries: ['Photo set is clear enough for broad care guidance.'],
  };
}

function buildDefaultDemoGardenPlants() {
  const now = new Date().toISOString();
  return [
    {
      id: 'demo-plant-fern-01',
      name: 'Front Porch Fern',
      species: 'Boston Fern',
      room_or_bed: 'indoor',
      bed_number: null,
      row_section_id: 'A1',
      notes: 'This is how your homeowner plant profile cards will look and flow.',
      photos: ['/images/RedMaple4ATag.jpg'],
      last_diagnostics: buildDemoGardenDiagnostics({
        commonName: 'Boston Fern',
        scientificName: 'Nephrolepis exaltata',
        condition: 'Healthy',
      }),
      journal_entries: [
        {
          id: 'demo-journal-fern-1',
          event_type: 'watered',
          occurred_at: new Date(Date.now() - 3 * 86400000).toISOString(),
          notes: 'Watered after topsoil dried to about 1 inch depth.',
        },
        {
          id: 'demo-journal-fern-2',
          event_type: 'fertilized',
          occurred_at: new Date(Date.now() - 10 * 86400000).toISOString(),
          notes: 'Applied diluted balanced fertilizer.',
        },
      ],
      created_at: now,
      updated_at: now,
    },
    {
      id: 'demo-plant-herbs-02',
      name: 'Kitchen Herb Cluster',
      species: 'Mixed Culinary Herbs',
      room_or_bed: 'indoor',
      bed_number: null,
      row_section_id: 'B3',
      notes: 'Tap into a profile to see full-page details, gallery, and editing flow.',
      photos: [],
      last_diagnostics: buildDemoGardenDiagnostics({
        commonName: 'Herb Mix Cluster',
        scientificName: 'Ocimum basilicum / Mentha spp.',
        condition: 'Good',
      }),
      journal_entries: [
        {
          id: 'demo-journal-herbs-1',
          event_type: 'planted',
          occurred_at: new Date(Date.now() - 14 * 86400000).toISOString(),
          notes: 'Started basil and mint together in shared container.',
        },
      ],
      created_at: now,
      updated_at: now,
    },
  ];
}

function normalizeDemoGardenJournalEntry(entry) {
  return {
    id: (entry?.id || `demo-journal-${crypto.randomUUID()}`).toString(),
    event_type: (entry?.event_type || 'note').toString(),
    occurred_at: entry?.occurred_at || new Date().toISOString(),
    notes: (entry?.notes || '').toString(),
  };
}

function inferDemoGardenDiagnostics(plant) {
  const commonName = (plant?.species || plant?.name || 'Demo Plant').toString().trim() || 'Demo Plant';
  const scientificName = (plant?.species || 'Species not provided').toString().trim() || 'Species not provided';
  return buildDemoGardenDiagnostics({ commonName, scientificName, condition: 'Good' });
}

function normalizeDemoGardenPlant(plant) {
  const normalized = {
    ...plant,
    id: (plant?.id || `demo-plant-${crypto.randomUUID()}`).toString(),
    name: (plant?.name || '').toString(),
    species: (plant?.species || '').toString(),
    room_or_bed: (plant?.room_or_bed || '').toString(),
    bed_number: plant?.bed_number == null || plant?.bed_number === '' ? null : Number.parseInt(plant.bed_number, 10),
    row_section_id: (plant?.row_section_id || '').toString(),
    notes: (plant?.notes || '').toString(),
    photos: Array.isArray(plant?.photos) ? plant.photos.filter(Boolean) : [],
    last_diagnostics: plant?.last_diagnostics && typeof plant.last_diagnostics === 'object'
      ? { ...inferDemoGardenDiagnostics(plant), ...plant.last_diagnostics }
      : inferDemoGardenDiagnostics(plant),
    journal_entries: Array.isArray(plant?.journal_entries)
      ? plant.journal_entries.map(normalizeDemoGardenJournalEntry)
      : [],
    created_at: plant?.created_at || new Date().toISOString(),
    updated_at: plant?.updated_at || new Date().toISOString(),
  };

  if (!Number.isInteger(normalized.bed_number)) {
    normalized.bed_number = null;
  }

  return normalized;
}

function getQueensPassConfig() {
  return {
    email: (process.env.QUEENS_PASS_EMAIL || 'rachaelr@rrtech.dev').toString().trim().toLowerCase(),
    passId: (process.env.QUEENS_PASS_ID || '').toString().trim(),
  };
}

function createDemoGardenEditToken(email) {
  const { passId } = getQueensPassConfig();
  const payload = Buffer.from(
    JSON.stringify({
      email,
      exp: Date.now() + DEMO_GARDEN_TOKEN_TTL_MS,
    })
  ).toString('base64url');
  const signature = crypto.createHmac('sha256', passId).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyDemoGardenEditToken(token) {
  const { email: configuredEmail, passId } = getQueensPassConfig();
  if (!passId || !token) return false;

  const [payload, signature] = token.toString().split('.');
  if (!payload || !signature) return false;

  const expectedSignature = crypto.createHmac('sha256', passId).update(payload).digest('base64url');
  if (signature !== expectedSignature) return false;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!decoded?.exp || Number(decoded.exp) < Date.now()) return false;
    return (decoded.email || '').toString().trim().toLowerCase() === configuredEmail;
  } catch {
    return false;
  }
}

async function readDemoGardenPlants() {
  const fallback = buildDefaultDemoGardenPlants().map(normalizeDemoGardenPlant);

  try {
    const { data, error } = await writeSupabase.storage.from(PHOTO_BUCKET).download(DEMO_GARDEN_STORAGE_OBJECT);
    if (error || !data) {
      return { plants: fallback, source: 'default' };
    }

    const raw = await data.text();
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { plants: fallback, source: 'default' };
    }

    return { plants: parsed.map(normalizeDemoGardenPlant), source: 'storage' };
  } catch {
    return { plants: fallback, source: 'default' };
  }
}

async function writeDemoGardenPlants(plants) {
  const normalizedPlants = (Array.isArray(plants) ? plants : []).map(normalizeDemoGardenPlant);
  const payload = JSON.stringify(normalizedPlants, null, 2);
  const { error } = await writeSupabase.storage.from(PHOTO_BUCKET).upload(DEMO_GARDEN_STORAGE_OBJECT, payload, {
    contentType: 'application/json',
    upsert: true,
  });

  if (error) {
    throw new Error(error.message || 'Failed to save demo garden state');
  }

  return normalizedPlants;
}

function getHomeownerTierLimit(tier) {
  return HOMEOWNER_TIER_LIMITS[tier] || HOMEOWNER_TIER_LIMITS.free;
}

function getPriceIdFromTier(tier) {
  if (tier === 'gardener') return STRIPE_PRICE_GARDENER;
  if (tier === 'estate') return STRIPE_PRICE_ESTATE;
  return null;
}

function formatMoneyFromMinorUnits(amountMinor, currency = 'usd') {
  const amount = Number(amountMinor || 0) / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency || 'usd').toString().toUpperCase(),
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function normalizeAppBaseUrl(value) {
  const candidate = (value || '').toString().trim();
  if (!candidate) return 'http://localhost:5173';
  return candidate.replace(/\/$/, '');
}

function createHomeownerQrToken() {
  return crypto.randomBytes(12).toString('hex');
}

function buildHomeownerPlantQrPayload(qrToken) {
  const token = (qrToken || '').toString().trim();
  if (!token) return '';
  const appBaseUrl = normalizeAppBaseUrl(process.env.APP_BASE_URL || CLIENT_URL);
  return `${appBaseUrl}/homeowners/plant-tag/${encodeURIComponent(token)}`;
}

function normalizeBedNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    return { error: 'Bed # must be an integer between 1 and 100.' };
  }
  return { value: parsed };
}

function normalizeRowSectionId(value) {
  if (value == null || value === '') return null;
  const normalized = (value || '').toString().trim().toUpperCase().replace(/\s+/g, '');
  if (!normalized) return null;
  if (!/^[A-Z](100|[1-9][0-9]?)$/.test(normalized)) {
    return { error: 'Row/Section ID must follow Letter+Number format like A1 through Z100.' };
  }
  return { value: normalized };
}

function serializeHomeownerPlant(plant) {
  if (!plant || typeof plant !== 'object') return plant;
  const qrToken = (plant.qr_code_token || '').toString().trim() || null;
  const qrPayload = qrToken ? buildHomeownerPlantQrPayload(qrToken) : null;
  return {
    ...plant,
    qr_code_token: qrToken,
    qr_code_payload: qrPayload,
    qr_code_image_url: qrPayload ? buildQrImageUrl(qrPayload) : null,
  };
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
    .select('id, user_id, tier, stripe_customer_id')
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

async function getHomeownerPlantAccessState(userId) {
  const status = await getHomeownerTierAndCount(userId);
  if (status.error) {
    return {
      ...status,
      orderedPlantIds: [],
      accessiblePlantIds: new Set(),
      lockedCount: 0,
    };
  }

  const { data: orderedPlants, error: orderedError } = await writeSupabase
    .from('homeowner_plants')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (orderedError) {
    return {
      ...status,
      error: orderedError,
      orderedPlantIds: [],
      accessiblePlantIds: new Set(),
      lockedCount: 0,
    };
  }

  const orderedPlantIds = Array.isArray(orderedPlants)
    ? orderedPlants.map((plant) => plant.id).filter(Boolean)
    : [];

  const accessibleCount = Math.max(0, Math.min(status.profileLimit, orderedPlantIds.length));
  const accessiblePlantIds = new Set(orderedPlantIds.slice(0, accessibleCount));
  const lockedCount = Math.max(orderedPlantIds.length - accessibleCount, 0);

  return {
    ...status,
    error: null,
    orderedPlantIds,
    accessiblePlantIds,
    lockedCount,
  };
}

function isHomeownerPlantLocked(plantId, accessState) {
  if (!accessState || !plantId) return false;
  if ((accessState.activeProfiles || 0) <= (accessState.profileLimit || 0)) return false;
  return !accessState.accessiblePlantIds.has(plantId);
}

function buildLockedPlantResponse(accessState) {
  return {
    error: 'This plant profile is locked for your current tier. Upgrade to unlock it.',
    tier: accessState.tier,
    profile_limit: accessState.profileLimit,
    active_profiles: accessState.activeProfiles,
    locked_profiles: accessState.lockedCount || 0,
  };
}

async function getOwnedHomeownerPlant(userId, plantId) {
  const { data: plant, error } = await writeSupabase
    .from('homeowner_plants')
    .select(HOMEOWNER_PLANT_SELECT)
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
    stripe_mode: STRIPE_CONFIG.mode,
    stripe_configured: Boolean(STRIPE_SECRET_KEY && STRIPE_WEBHOOK_SECRET),
    stripe_prices_configured: {
      gardener: Boolean(STRIPE_PRICE_GARDENER),
      estate: Boolean(STRIPE_PRICE_ESTATE),
    },
  });
});

api.post('/contact', publicContactLimiter, async (req, res) => {
  if (!mailTransporter) {
    return res.status(503).json({ error: 'Contact email is not configured on the server' });
  }

  const name = cleanContactField(req.body?.name, 120);
  const email = cleanContactField(req.body?.email, 254).toLowerCase();
  const organization = cleanContactField(req.body?.organization, 160);
  const subject = cleanContactField(req.body?.subject, 180);
  const message = cleanContactField(req.body?.message, 5000);

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'Name, email, subject, and message are required' });
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }

  const supportText = [
    'New ArborTag support request',
    '',
    `Name: ${name}`,
    `Email: ${email}`,
    `Organization / City / Park: ${organization || 'Not provided'}`,
    `Subject: ${subject}`,
    '',
    'Message:',
    message,
  ].join('\n');

  const confirmationText = [
    `Hi ${name},`,
    '',
    'Thank you for contacting ArborTag support.',
    'We received your message and will respond as quickly as possible.',
    '',
    '— ArborTag Support',
    'RR Tech',
  ].join('\n');

  try {
    await mailTransporter.sendMail({
      from: SMTP_FROM,
      to: SUPPORT_CONTACT_EMAIL,
      replyTo: email,
      subject: `[Support] ${subject}`,
      text: supportText,
    });

    let confirmationSent = true;
    try {
      await mailTransporter.sendMail({
        from: SMTP_FROM,
        to: email,
        subject: 'We received your ArborTag support message',
        text: confirmationText,
      });
    } catch (confirmationError) {
      confirmationSent = false;
      console.error('Failed to send contact confirmation email:', confirmationError);
    }

    return res.status(201).json({ success: true, confirmationSent });
  } catch (error) {
    console.error('Failed to send contact request email:', error);
    return res.status(500).json({ error: 'Failed to send your message. Please try again later.' });
  }
});

api.post('/demo-garden/queens-pass/verify', async (req, res) => {
  const { email: configuredEmail, passId: configuredPassId } = getQueensPassConfig();

  if (!configuredPassId) {
    return res.status(503).json({ error: 'Queen\'s Pass is not configured on the server yet.' });
  }

  const email = (req.body?.email || '').toString().trim().toLowerCase();
  const passId = (req.body?.pass_id || '').toString().trim();

  if (!email || !passId) {
    return res.status(400).json({ error: 'Both email and pass_id are required.' });
  }

  const isMatch = email === configuredEmail && passId === configuredPassId;
  if (!isMatch) {
    return res.status(401).json({ error: 'Queen\'s Pass validation failed.' });
  }

  return res.json({ ok: true, token: createDemoGardenEditToken(email) });
});

api.get('/demo-garden/plants', async (_req, res) => {
  try {
    const state = await readDemoGardenPlants();
    return res.json(state);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Failed to load demo garden state.' });
  }
});

api.put('/demo-garden/plants', async (req, res) => {
  try {
    if (!HAS_SERVICE_ROLE) {
      return res.status(503).json({ error: 'Demo garden persistence is not configured on the server.' });
    }

    const token = (req.headers['x-demo-queens-pass-token'] || '').toString().trim();
    if (!verifyDemoGardenEditToken(token)) {
      return res.status(401).json({ error: 'Queen\'s Pass authorization is required for demo edits.' });
    }

    const plants = Array.isArray(req.body?.plants) ? req.body.plants : null;
    if (!plants) {
      return res.status(400).json({ error: 'plants must be an array.' });
    }

    const savedPlants = await writeDemoGardenPlants(plants);
    return res.json({ plants: savedPlants });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Failed to save demo garden state.' });
  }
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
    console.error('Stripe checkout session error:', {
      type: err?.type,
      code: err?.code,
      param: err?.param,
      message: err?.message,
      requestId: err?.requestId,
    });

    // Most common production failure: wrong mode for price ID (test price with live key).
    if (err?.code === 'resource_missing' && /price/i.test((err?.param || '').toString())) {
      return res.status(500).json({
        error: 'Stripe price not found for current mode. Verify live STRIPE_PRICE_GARDENER_LIVE and STRIPE_PRICE_ESTATE_LIVE values.',
      });
    }

    if (err?.type === 'StripeAuthenticationError') {
      return res.status(500).json({
        error: 'Stripe authentication failed. Verify STRIPE_SECRET_KEY_LIVE and STRIPE_MODE=live.',
      });
    }

    return res.status(500).json({ error: err?.message || 'Failed to create checkout session' });
  }
});

api.post('/stripe/checkout-preview', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe is not configured on the server' });
    }

    const tier = (req.body?.tier || '').toString().trim().toLowerCase();
    const priceId = getPriceIdFromTier(tier);

    if (!priceId) {
      return res.status(400).json({ error: 'Tier must be gardener or estate for checkout' });
    }

    const price = await stripe.prices.retrieve(priceId);

    const subtotalMinor = Number(price?.unit_amount || 0);
    const discountMinor = 0;
    const totalMinor = subtotalMinor;

    return res.json({
      tier,
      currency: (price?.currency || 'usd').toString().toUpperCase(),
      subtotal_minor: subtotalMinor,
      discount_minor: discountMinor,
      total_minor: totalMinor,
      subtotal_display: formatMoneyFromMinorUnits(subtotalMinor, price?.currency || 'usd'),
      discount_display: formatMoneyFromMinorUnits(discountMinor, price?.currency || 'usd'),
      total_display: formatMoneyFromMinorUnits(totalMinor, price?.currency || 'usd'),
    });
  } catch (err) {
    console.error('Stripe checkout preview error:', err?.message || err);
    return res.status(500).json({ error: err?.message || 'Failed to preview checkout total' });
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

api.delete('/homeowners/account', requireHomeownerAuth, async (req, res) => {
  try {
    if (!HAS_SERVICE_ROLE) {
      return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is missing on backend; account delete is disabled.' });
    }

    const userId = req.homeownerUser.id;

    const { profile, error: profileCreateError } = await ensureHomeownerProfileExists(userId);
    if (profileCreateError) {
      return res.status(500).json({ error: profileCreateError.message || 'Failed to load homeowner profile' });
    }

    const stripeCustomerId = normalizeStripeCustomerId(profile?.stripe_customer_id);

    if (stripe && stripeCustomerId) {
      try {
        const subs = await stripe.subscriptions.list({ customer: stripeCustomerId, status: 'all', limit: 100 });
        for (const sub of subs?.data || []) {
          const status = (sub?.status || '').toString();
          if (status === 'canceled' || status === 'incomplete_expired') continue;
          await stripe.subscriptions.cancel(sub.id);
        }
      } catch (stripeErr) {
        console.error('Failed to cancel Stripe subscriptions during account delete:', stripeErr?.message || stripeErr);
        return res.status(500).json({ error: 'Failed to cancel active subscription. Please try again.' });
      }
    }

    const { data: plants, error: plantsError } = await writeSupabase
      .from('homeowner_plants')
      .select('id, photos')
      .eq('user_id', userId);

    if (plantsError) {
      return res.status(500).json({ error: plantsError.message || 'Failed to load plant profiles for delete' });
    }

    const storagePaths = [];
    for (const plant of plants || []) {
      for (const url of Array.isArray(plant?.photos) ? plant.photos : []) {
        const objectPath = getStorageObjectPathFromPublicUrl(url, PHOTO_BUCKET);
        if (objectPath) storagePaths.push(objectPath);
      }
    }

    if (storagePaths.length > 0) {
      const uniquePaths = Array.from(new Set(storagePaths));
      const { error: storageError } = await writeSupabase.storage.from(PHOTO_BUCKET).remove(uniquePaths);
      if (storageError) {
        console.error('Failed to remove homeowner storage files during account delete:', storageError.message || storageError);
      }
    }

    const { error: deletePlantsError } = await writeSupabase
      .from('homeowner_plants')
      .delete()
      .eq('user_id', userId);

    if (deletePlantsError) {
      return res.status(500).json({ error: deletePlantsError.message || 'Failed to delete plant profiles' });
    }

    const { error: deleteProfileError } = await writeSupabase
      .from('homeowner_profiles')
      .delete()
      .eq('user_id', userId);

    if (deleteProfileError) {
      return res.status(500).json({ error: deleteProfileError.message || 'Failed to delete homeowner profile' });
    }

    const { error: deleteUserError } = await writeSupabase.auth.admin.deleteUser(userId);
    if (deleteUserError) {
      return res.status(500).json({ error: deleteUserError.message || 'Failed to delete account user' });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('Homeowner account delete error:', err);
    return res.status(500).json({ error: 'Failed to delete account' });
  }
});

// ===========================
// HOMEOWNER PLANTS
// ===========================
api.get('/homeowners/qr-tag-orders', requireHomeownerAuth, async (req, res) => {
  try {
    const userId = req.homeownerUser.id;
    const { data: orders, error } = await writeSupabase
      .from('homeowner_qr_tag_orders')
      .select('id, user_id, quantity, tag_material, notes, status, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message || 'Failed to load QR tag orders' });
    }

    return res.json({
      coming_soon: true,
      orders: orders || [],
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load QR tag orders' });
  }
});

api.post('/homeowners/qr-tag-orders', requireHomeownerAuth, async (req, res) => {
  try {
    const userId = req.homeownerUser.id;
    const quantity = Number.parseInt(req.body?.quantity, 10);
    const tagMaterial = (req.body?.tag_material || '').toString().trim();
    const notes = (req.body?.notes || '').toString().trim();

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
      return res.status(400).json({ error: 'Quantity must be between 1 and 500.' });
    }

    const { data: order, error } = await writeSupabase
      .from('homeowner_qr_tag_orders')
      .insert([
        {
          user_id: userId,
          quantity,
          tag_material: tagMaterial || null,
          notes: notes || null,
          status: 'coming_soon',
        },
      ])
      .select('id, user_id, quantity, tag_material, notes, status, created_at, updated_at')
      .single();

    if (error || !order) {
      return res.status(500).json({ error: error?.message || 'Failed to save QR tag order request' });
    }

    return res.status(201).json({
      coming_soon: true,
      message: 'QR tag ordering is coming soon. Your request has been saved.',
      order,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save QR tag order request' });
  }
});

api.get('/homeowners/plants', requireHomeownerAuth, async (req, res) => {
  try {
    const userId = req.homeownerUser.id;

    const { data: plants, error: plantsError } = await writeSupabase
      .from('homeowner_plants')
      .select(HOMEOWNER_PLANT_PUBLIC_SELECT)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (plantsError) {
      console.error('Homeowner plants lookup error, returning empty list:', plantsError.message || plantsError);
    }

    const accessState = await getHomeownerPlantAccessState(userId);
    if (accessState.error) {
      console.error('Homeowner tier/count error, returning safe defaults:', accessState.error.message || accessState.error);
      return res.json({
        plants: (plantsError ? [] : (plants || [])).map((plant) => ({ ...serializeHomeownerPlant(plant), is_locked: false })),
        tier: 'free',
        profile_limit: getHomeownerTierLimit('free'),
        active_profiles: Array.isArray(plants) ? plants.length : 0,
        locked_profiles: 0,
      });
    }

    const serializedPlants = (plantsError ? [] : (plants || [])).map((plant) => ({
      ...serializeHomeownerPlant(plant),
      is_locked: isHomeownerPlantLocked(plant.id, accessState),
    }));

    return res.json({
      plants: serializedPlants,
      tier: accessState.tier,
      profile_limit: accessState.profileLimit,
      active_profiles: accessState.activeProfiles,
      locked_profiles: accessState.lockedCount,
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

    const accessState = await getHomeownerPlantAccessState(userId);
    if (accessState.error) {
      return res.status(500).json({ error: accessState.error.message || 'Failed to verify plan access' });
    }

    if (isHomeownerPlantLocked(id, accessState)) {
      return res.status(403).json(buildLockedPlantResponse(accessState));
    }

    return res.json({ plant: serializeHomeownerPlant(plant) });
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
    const normalizedBedNumber = normalizeBedNumber(req.body?.bed_number);
    const normalizedRowSectionId = normalizeRowSectionId(req.body?.row_section_id);

    if (!name) {
      return res.status(400).json({ error: 'Plant name is required' });
    }

    if (normalizedBedNumber?.error) {
      return res.status(400).json({ error: normalizedBedNumber.error });
    }

    if (normalizedRowSectionId?.error) {
      return res.status(400).json({ error: normalizedRowSectionId.error });
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
          bed_number: normalizedBedNumber?.value ?? null,
          row_section_id: normalizedRowSectionId?.value ?? null,
          qr_code_token: createHomeownerQrToken(),
          photos: [],
        },
      ])
      .select(HOMEOWNER_PLANT_PUBLIC_SELECT)
      .single();

    if (insertError) {
      return res.status(500).json({ error: insertError.message || 'Failed to create plant profile' });
    }

    return res.status(201).json({ plant: serializeHomeownerPlant(plant) });
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
    const nextBedNumber = req.body?.bed_number;
    const nextRowSectionId = req.body?.row_section_id;

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
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'bed_number')) {
      const normalizedBedNumber = normalizeBedNumber(nextBedNumber);
      if (normalizedBedNumber?.error) {
        return res.status(400).json({ error: normalizedBedNumber.error });
      }
      updateData.bed_number = normalizedBedNumber?.value ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'row_section_id')) {
      const normalizedRowSectionId = normalizeRowSectionId(nextRowSectionId);
      if (normalizedRowSectionId?.error) {
        return res.status(400).json({ error: normalizedRowSectionId.error });
      }
      updateData.row_section_id = normalizedRowSectionId?.value ?? null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { plant: existingPlant, error: existingError } = await getOwnedHomeownerPlant(userId, id);
    if (existingError || !existingPlant) {
      return res.status(404).json({ error: 'Plant profile not found' });
    }

    const accessState = await getHomeownerPlantAccessState(userId);
    if (accessState.error) {
      return res.status(500).json({ error: accessState.error.message || 'Failed to verify plan access' });
    }

    if (isHomeownerPlantLocked(id, accessState)) {
      return res.status(403).json(buildLockedPlantResponse(accessState));
    }

    const { data: plant, error: updateError } = await writeSupabase
      .from('homeowner_plants')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select(HOMEOWNER_PLANT_PUBLIC_SELECT)
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message || 'Failed to update plant profile' });
    }

    if (!plant) {
      return res.status(404).json({ error: 'Plant profile not found' });
    }

    return res.json({ plant: serializeHomeownerPlant(plant) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update homeowner plant' });
  }
});

api.get('/homeowners/plants/:id/journal', requireHomeownerAuth, async (req, res) => {
  try {
    const userId = req.homeownerUser.id;
    const id = (req.params.id || '').toString().trim();
    const { plant, error } = await getOwnedHomeownerPlant(userId, id);

    if (error || !plant) {
      return res.status(404).json({ error: 'Plant profile not found' });
    }

    const accessState = await getHomeownerPlantAccessState(userId);
    if (accessState.error) {
      return res.status(500).json({ error: accessState.error.message || 'Failed to verify plan access' });
    }

    if (isHomeownerPlantLocked(id, accessState)) {
      return res.status(403).json(buildLockedPlantResponse(accessState));
    }

    const { data: entries, error: journalError } = await writeSupabase
      .from('homeowner_plant_journal_entries')
      .select('id, plant_id, user_id, event_type, occurred_at, notes, created_at, updated_at')
      .eq('plant_id', id)
      .eq('user_id', userId)
      .order('occurred_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (journalError) {
      return res.status(500).json({ error: journalError.message || 'Failed to fetch plant journal' });
    }

    return res.json({ entries: entries || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load plant journal entries' });
  }
});

api.post('/homeowners/plants/:id/journal', requireHomeownerAuth, async (req, res) => {
  try {
    const userId = req.homeownerUser.id;
    const id = (req.params.id || '').toString().trim();
    const { plant, error } = await getOwnedHomeownerPlant(userId, id);

    if (error || !plant) {
      return res.status(404).json({ error: 'Plant profile not found' });
    }

    const accessState = await getHomeownerPlantAccessState(userId);
    if (accessState.error) {
      return res.status(500).json({ error: accessState.error.message || 'Failed to verify plan access' });
    }

    if (isHomeownerPlantLocked(id, accessState)) {
      return res.status(403).json(buildLockedPlantResponse(accessState));
    }

    const eventType = (req.body?.event_type || '').toString().trim().toLowerCase();
    const notes = (req.body?.notes || '').toString().trim();
    const occurredAtRaw = req.body?.occurred_at;

    if (!HOMEOWNER_JOURNAL_EVENT_TYPES.has(eventType)) {
      return res.status(400).json({ error: 'event_type must be planted, harvested, fertilized, watered, or note.' });
    }

    const occurredAtDate = occurredAtRaw ? new Date(occurredAtRaw) : new Date();
    if (Number.isNaN(occurredAtDate.getTime())) {
      return res.status(400).json({ error: 'occurred_at must be a valid date-time value.' });
    }

    const { data: entry, error: insertError } = await writeSupabase
      .from('homeowner_plant_journal_entries')
      .insert([
        {
          plant_id: id,
          user_id: userId,
          event_type: eventType,
          occurred_at: occurredAtDate.toISOString(),
          notes: notes || null,
        },
      ])
      .select('id, plant_id, user_id, event_type, occurred_at, notes, created_at, updated_at')
      .single();

    if (insertError) {
      return res.status(500).json({ error: insertError.message || 'Failed to create journal entry' });
    }

    return res.status(201).json({ entry });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create plant journal entry' });
  }
});

api.patch('/homeowners/plants/:id/journal/:entryId', requireHomeownerAuth, async (req, res) => {
  try {
    const userId = req.homeownerUser.id;
    const id = (req.params.id || '').toString().trim();
    const entryId = (req.params.entryId || '').toString().trim();
    const { plant, error } = await getOwnedHomeownerPlant(userId, id);

    if (error || !plant) {
      return res.status(404).json({ error: 'Plant profile not found' });
    }

    const accessState = await getHomeownerPlantAccessState(userId);
    if (accessState.error) {
      return res.status(500).json({ error: accessState.error.message || 'Failed to verify plan access' });
    }

    if (isHomeownerPlantLocked(id, accessState)) {
      return res.status(403).json(buildLockedPlantResponse(accessState));
    }

    const updateData = {};
    if (typeof req.body?.event_type === 'string') {
      const eventType = req.body.event_type.trim().toLowerCase();
      if (!HOMEOWNER_JOURNAL_EVENT_TYPES.has(eventType)) {
        return res.status(400).json({ error: 'event_type must be planted, harvested, fertilized, watered, or note.' });
      }
      updateData.event_type = eventType;
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'notes')) {
      const notes = (req.body?.notes || '').toString().trim();
      updateData.notes = notes || null;
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'occurred_at')) {
      const occurredAtDate = new Date(req.body?.occurred_at);
      if (Number.isNaN(occurredAtDate.getTime())) {
        return res.status(400).json({ error: 'occurred_at must be a valid date-time value.' });
      }
      updateData.occurred_at = occurredAtDate.toISOString();
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update.' });
    }

    const { data: entry, error: updateError } = await writeSupabase
      .from('homeowner_plant_journal_entries')
      .update(updateData)
      .eq('id', entryId)
      .eq('plant_id', id)
      .eq('user_id', userId)
      .select('id, plant_id, user_id, event_type, occurred_at, notes, created_at, updated_at')
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message || 'Failed to update journal entry' });
    }

    if (!entry) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }

    return res.json({ entry });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update plant journal entry' });
  }
});

api.delete('/homeowners/plants/:id/journal/:entryId', requireHomeownerAuth, async (req, res) => {
  try {
    const userId = req.homeownerUser.id;
    const id = (req.params.id || '').toString().trim();
    const entryId = (req.params.entryId || '').toString().trim();
    const { plant, error } = await getOwnedHomeownerPlant(userId, id);

    if (error || !plant) {
      return res.status(404).json({ error: 'Plant profile not found' });
    }

    const accessState = await getHomeownerPlantAccessState(userId);
    if (accessState.error) {
      return res.status(500).json({ error: accessState.error.message || 'Failed to verify plan access' });
    }

    if (isHomeownerPlantLocked(id, accessState)) {
      return res.status(403).json(buildLockedPlantResponse(accessState));
    }

    const { error: deleteError } = await writeSupabase
      .from('homeowner_plant_journal_entries')
      .delete()
      .eq('id', entryId)
      .eq('plant_id', id)
      .eq('user_id', userId);

    if (deleteError) {
      return res.status(500).json({ error: deleteError.message || 'Failed to delete journal entry' });
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete plant journal entry' });
  }
});

api.get('/homeowners/qr/:token/resolve', requireHomeownerAuth, async (req, res) => {
  try {
    const userId = req.homeownerUser.id;
    const token = (req.params.token || '').toString().trim();

    if (!token) {
      return res.status(400).json({ error: 'QR token is required.' });
    }

    const { data: plant, error } = await writeSupabase
      .from('homeowner_plants')
      .select('id, name')
      .eq('user_id', userId)
      .eq('qr_code_token', token)
      .single();

    if (error || !plant) {
      return res.status(404).json({ error: 'No plant was found for this QR token.' });
    }

    return res.json({ plant });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to resolve homeowner QR token' });
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

    const accessState = await getHomeownerPlantAccessState(userId);
    if (accessState.error) {
      return res.status(500).json({ error: accessState.error.message || 'Failed to verify plan access' });
    }

    if (isHomeownerPlantLocked(id, accessState)) {
      return res.status(403).json(buildLockedPlantResponse(accessState));
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

    const accessState = await getHomeownerPlantAccessState(userId);
    if (accessState.error) {
      return res.status(500).json({ error: accessState.error.message || 'Failed to verify plan access' });
    }

    if (isHomeownerPlantLocked(id, accessState)) {
      return res.status(403).json(buildLockedPlantResponse(accessState));
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
      .select(HOMEOWNER_PLANT_PUBLIC_SELECT)
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message || 'Failed to save photo on profile' });
    }

    return res.status(201).json({ plant: serializeHomeownerPlant(updatedPlant) });
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

    const accessState = await getHomeownerPlantAccessState(userId);
    if (accessState.error) {
      return res.status(500).json({ error: accessState.error.message || 'Failed to verify plan access' });
    }

    if (isHomeownerPlantLocked(id, accessState)) {
      return res.status(403).json(buildLockedPlantResponse(accessState));
    }

    const photos = Array.isArray(plant.photos) ? plant.photos.filter(Boolean) : [];
    if (photos.length === 0) {
      const fallbackDiagnostics = buildHomeownerNoPhotoDiagnostics(plant);
      const { data: updatedPlant, error: updateError } = await writeSupabase
        .from('homeowner_plants')
        .update({ last_diagnostics: fallbackDiagnostics })
        .eq('id', id)
        .eq('user_id', userId)
        .select(HOMEOWNER_PLANT_SELECT)
        .single();

      if (updateError) {
        return res.status(500).json({ error: updateError.message || 'Failed to store diagnostics' });
      }

      return res.json({ diagnostics: fallbackDiagnostics, plant: serializeHomeownerPlant(updatedPlant) });
    }

    const diagnosticsPrompt = `${ARBORAI_REGIONAL_SCOPE}

  Analyze the provided homeowner plant profile and photos. The plant name is a user label or nickname, NOT authoritative identification. The species field is only a weak user hint and may be wrong. Prioritize what is visually present in the photos over user-entered text.

  Critical rules:
  - Inspect every photo independently before forming a combined conclusion.
  - If photos appear to show different plants, unrelated scenes, or conflicting species, do NOT force a single confident identification.
  - In mixed or conflicting photo sets, explicitly say so, lower confidence, and include data quality or mismatch warnings.
  - For Apiaceae/umbel flowers, explicitly evaluate Poison Hemlock vs Wild Carrot cues from stems. Purple-blotched smooth/hairless stems and hollow stems are dangerous hemlock signals.
  - If a poisonous lookalike cannot be ruled out, do not return High confidence and add a clear warning in warning_signs and toxicity_info.
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
    Object.assign(normalized, enforceToxicLookalikeSafety(normalized));
    Object.assign(normalized, enforceOrchardAndHardwoodIDAccuracy(normalized));
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
      .select(HOMEOWNER_PLANT_SELECT)
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message || 'Failed to store diagnostics' });
    }

    return res.json({ diagnostics: normalized, plant: serializeHomeownerPlant(updatedPlant) });
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
      .select(HOMEOWNER_PLANT_PUBLIC_SELECT)
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (findError || !plant) {
      return res.status(404).json({ error: 'Plant profile not found' });
    }

    const accessState = await getHomeownerPlantAccessState(userId);
    if (accessState.error) {
      return res.status(500).json({ error: accessState.error.message || 'Failed to verify plan access' });
    }

    if (isHomeownerPlantLocked(id, accessState)) {
      return res.status(403).json(buildLockedPlantResponse(accessState));
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
      .select(HOMEOWNER_PLANT_PUBLIC_SELECT)
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message || 'Failed to remove photo from profile' });
    }

    const objectPath = getStorageObjectPathFromPublicUrl(removedUrl, PHOTO_BUCKET);
    if (objectPath) {
      await writeSupabase.storage.from(PHOTO_BUCKET).remove([objectPath]);
    }

    return res.json({ plant: serializeHomeownerPlant(updatedPlant) });
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
      .select(HOMEOWNER_PLANT_PUBLIC_SELECT)
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (findError || !plant) {
      return res.status(404).json({ error: 'Plant profile not found' });
    }

    const accessState = await getHomeownerPlantAccessState(userId);
    if (accessState.error) {
      return res.status(500).json({ error: accessState.error.message || 'Failed to verify plan access' });
    }

    if (isHomeownerPlantLocked(id, accessState)) {
      return res.status(403).json(buildLockedPlantResponse(accessState));
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
      .select(HOMEOWNER_PLANT_PUBLIC_SELECT)
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message || 'Failed to save replacement photo' });
    }

    const oldObjectPath = getStorageObjectPathFromPublicUrl(oldUrl, PHOTO_BUCKET);
    if (oldObjectPath) {
      await writeSupabase.storage.from(PHOTO_BUCKET).remove([oldObjectPath]);
    }

    return res.json({ plant: serializeHomeownerPlant(updatedPlant) });
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
          bed_number: null,
          row_section_id: null,
          qr_code_token: createHomeownerQrToken(),
          photos: normalizedUrls,
          last_diagnostics: diagnostics,
        },
      ])
      .select(HOMEOWNER_PLANT_SELECT)
      .single();

    if (insertError || !plant) {
      return res.status(500).json({ error: insertError?.message || 'Failed to create plant from scan' });
    }

    return res.status(201).json({ plant: serializeHomeownerPlant(plant), added_photos: normalizedUrls.length });
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
      .select(HOMEOWNER_PLANT_SELECT)
      .single();

    if (updateError || !updatedPlant) {
      return res.status(500).json({ error: updateError?.message || 'Failed to attach scan to plant' });
    }

    return res.json({ plant: serializeHomeownerPlant(updatedPlant), added_photos: urlsToAdd.length });
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
      trunk_diameter_inches,
      height_estimate_feet,
      tree_added_at,
      tree_id,
      managed_by,
      inspection_status,
    } = req.body;

    const qrMode = qr_mode === 'scanned' ? 'scanned' : 'generate';
    const customId = (custom_id || '').toString().trim();
    const scannedQrUrl = (scanned_qr_url || '').toString().trim();

    if (!title || !title.toString().trim()) {
      return res.status(400).json({ error: "Tree name is required" });
    }

    const trunkRaw = (trunk_diameter_inches || '').toString().trim();
    const heightRaw = (height_estimate_feet || '').toString().trim();
    const trunkValue = trunkRaw ? Number(trunkRaw) : null;
    const heightValue = heightRaw ? Number(heightRaw) : null;

    if ((trunkRaw && !Number.isFinite(trunkValue)) || (heightRaw && !Number.isFinite(heightValue))) {
      return res.status(400).json({ error: 'Measurements must be valid numbers' });
    }

    if ((trunkValue !== null && trunkValue <= 0) || (heightValue !== null && heightValue <= 0)) {
      return res.status(400).json({ error: 'Measurements must be greater than zero' });
    }

    const treeAddedRaw = (tree_added_at || '').toString().trim();
    const parsedTreeAddedAt = treeAddedRaw ? new Date(treeAddedRaw) : null;
    if (treeAddedRaw && Number.isNaN(parsedTreeAddedAt.getTime())) {
      return res.status(400).json({ error: 'Tree Added date must be valid' });
    }

    const treeIdValue = (tree_id || '').toString().trim() || null;
    const managedByValue = (managed_by || '').toString().trim() || null;
    const inspectionStatusValue = (inspection_status || '').toString().trim() || null;

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
      qrUrl = await generateQrForTree(listing.id, {
        appBaseUrl: process.env.APP_BASE_URL || process.env.CLIENT_URL || getRequestOrigin(req),
      });

      await writeSupabase
        .from("listings")
        .update({ qr_url: qrUrl })
        .eq("id", listing.id);
    } else {
      const qrPayload = scannedQrUrl || null;
      let finalPayload = qrPayload;

      if (!finalPayload) {
        const appBaseUrl = (process.env.APP_BASE_URL || '').toString().trim();
        if (appBaseUrl) {
          finalPayload = `${appBaseUrl.replace(/\/$/, '')}/tag/${listing.id}`;
        }
      }

      qrUrl = finalPayload ? buildQrImageUrl(finalPayload) : null;

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

    const logRows = [];

    if (trunkValue !== null || heightValue !== null) {
      logRows.push({
        listing_id: listing.id,
        run_at: new Date().toISOString(),
        source: 'staff-measurements',
        diagnostics: {
          staff_measurements: {
            trunk_diameter_inches: trunkValue,
            height_estimate_feet: heightValue,
          },
        },
        notes: 'Initial measurements captured during Add Tree.',
      });
    }

    if (treeIdValue || managedByValue || inspectionStatusValue || treeAddedRaw) {
      logRows.push({
        listing_id: listing.id,
        run_at: new Date().toISOString(),
        source: 'record-metadata',
        diagnostics: {
          record_metadata: {
            tree_id: treeIdValue,
            managed_by: managedByValue,
            inspection_status: inspectionStatusValue,
            tree_added_at: parsedTreeAddedAt ? parsedTreeAddedAt.toISOString() : null,
            last_updated_at: new Date().toISOString(),
          },
        },
        notes: 'Initial tree record metadata captured during Add Tree.',
      });
    }

    if (logRows.length > 0) {
      const { error: logInsertError } = await writeSupabase
        .from('tree_diagnostics_logs')
        .insert(logRows);

      if (logInsertError) {
        console.error('Failed to create initial tree diagnostics logs:', logInsertError);
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
    const parkId = (req.query?.parkId || req.query?.park_id || '').toString().trim();
    const parkName = (req.query?.parkName || '').toString().trim();

    const mergeUniqueRows = (rows = [], key = 'id') => {
      const merged = [];
      const seen = new Set();

      for (const row of Array.isArray(rows) ? rows : []) {
        const rowKey = (row?.[key] ?? '').toString();
        if (!rowKey || seen.has(rowKey)) continue;
        seen.add(rowKey);
        merged.push(row);
      }

      return merged;
    };

    const runListingsQuery = async (filterMode = 'none') => {
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

      if (filterMode === 'parkId' && parkId) {
        query = query.eq('park_id', parkId);
      } else if (filterMode === 'parkName' && parkName) {
        query = query.ilike('location', `%${parkName}%`);
      }

      return query;
    };

    let data = [];
    let error = null;

    if (parkId && parkName) {
      const byIdResult = await runListingsQuery('parkId');
      const byNameResult = await runListingsQuery('parkName');

      const byIdData = Array.isArray(byIdResult.data) ? byIdResult.data : [];
      const byNameData = Array.isArray(byNameResult.data) ? byNameResult.data : [];
      data = mergeUniqueRows([...byIdData, ...byNameData], 'id');

      if (byIdResult.error && byNameResult.error) {
        error = byIdResult.error;
      } else {
        if (byIdResult.error) {
          console.warn('park_id listing filter failed during merge; returning parkName-filtered listings:', byIdResult.error.message || byIdResult.error);
        }
        if (byNameResult.error) {
          console.warn('parkName listing filter failed during merge; returning park_id-filtered listings:', byNameResult.error.message || byNameResult.error);
        }
        error = null;
      }
    } else if (parkId) {
      ({ data, error } = await runListingsQuery('parkId'));

      // Compatibility fallback for environments where listings.park_id is not migrated yet.
      if (error && parkName) {
        console.warn('park_id listing filter failed, falling back to parkName filter:', error.message || error);
        ({ data, error } = await runListingsQuery('parkName'));
      }
    } else if (parkName) {
      ({ data, error } = await runListingsQuery('parkName'));
    } else {
      ({ data, error } = await runListingsQuery('none'));
    }

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
        *,
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

// GET /api/photos/pending — returns all pending (staff_uploaded=false) photos grouped by listing+photographer
api.get('/photos/pending', requireStaffAction, async (req, res) => {
  try {
    const parkId = (req.query?.parkId || req.query?.park_id || '').toString().trim();
    const parkName = (req.query?.parkName || '').toString().trim();

    const mergeUniqueRows = (rows = [], key = 'id') => {
      const merged = [];
      const seen = new Set();

      for (const row of Array.isArray(rows) ? rows : []) {
        const rowKey = (row?.[key] ?? '').toString();
        if (!rowKey || seen.has(rowKey)) continue;
        seen.add(rowKey);
        merged.push(row);
      }

      return merged;
    };

    const runPendingQuery = async (filterMode = 'none') => {
      let query = writeSupabase
        .from('photos')
        .select(`
          id,
          listing_id,
          url,
          is_main,
          winner,
          staff_uploaded,
          photographer,
          photographer_first,
          photographer_last,
          photographer_email,
          created_at,
          listings!inner(id, title, location)
        `)
        .eq('staff_uploaded', false)
        .order('created_at', { ascending: false });

      if (filterMode === 'parkId' && parkId) {
        query = query.eq('listings.park_id', parkId);
      } else if (filterMode === 'parkName' && parkName) {
        query = query.ilike('listings.location', `%${parkName}%`);
      }

      return query;
    };

    let data = [];
    let error = null;

    if (parkId && parkName) {
      const byIdResult = await runPendingQuery('parkId');
      const byNameResult = await runPendingQuery('parkName');

      const byIdData = Array.isArray(byIdResult.data) ? byIdResult.data : [];
      const byNameData = Array.isArray(byNameResult.data) ? byNameResult.data : [];
      data = mergeUniqueRows([...byIdData, ...byNameData], 'id');

      if (byIdResult.error && byNameResult.error) {
        error = byIdResult.error;
      } else {
        if (byIdResult.error) {
          console.warn('park_id pending filter failed during merge; returning parkName-filtered pending photos:', byIdResult.error.message || byIdResult.error);
        }
        if (byNameResult.error) {
          console.warn('parkName pending filter failed during merge; returning park_id-filtered pending photos:', byNameResult.error.message || byNameResult.error);
        }
        error = null;
      }
    } else if (parkId) {
      ({ data, error } = await runPendingQuery('parkId'));

      // Compatibility fallback for environments where listings.park_id is not migrated yet.
      if (error && parkName) {
        console.warn('park_id pending filter failed, falling back to parkName filter:', error.message || error);
        ({ data, error } = await runPendingQuery('parkName'));
      }
    } else if (parkName) {
      ({ data, error } = await runPendingQuery('parkName'));
    } else {
      ({ data, error } = await runPendingQuery('none'));
    }

    if (error) {
      console.error('Error fetching pending photos:', error);
      return res.status(500).json({ error: 'Failed to fetch pending photos' });
    }

    const photos = Array.isArray(data) ? data : [];

    // Count total approved photos per listing to warn about 5-photo cap
    const listingIds = [...new Set(photos.map((p) => p.listing_id))];
    let approvedCountMap = {};
    if (listingIds.length > 0) {
      const { data: approvedRows } = await writeSupabase
        .from('photos')
        .select('listing_id')
        .in('listing_id', listingIds)
        .eq('staff_uploaded', true);
      if (Array.isArray(approvedRows)) {
        approvedRows.forEach((r) => {
          approvedCountMap[r.listing_id] = (approvedCountMap[r.listing_id] || 0) + 1;
        });
      }
    }

    // Group by listing_id + photographer key
    const groups = {};
    for (const photo of photos) {
      const photographerKey = photo.photographer || 'Unknown';
      const groupKey = `${photo.listing_id}__${photographerKey}`;
      if (!groups[groupKey]) {
        groups[groupKey] = {
          listingId: photo.listing_id,
          listingTitle: photo.listings?.title || 'Untitled Tree',
          listingLocation: photo.listings?.location || '',
          photographer: photographerKey,
          photographerFirst: photo.photographer_first || '',
          photographerLast: photo.photographer_last || '',
          photographerEmail: photo.photographer_email || '',
          approvedCount: approvedCountMap[photo.listing_id] || 0,
          photos: [],
          latestDate: photo.created_at,
        };
      }
      groups[groupKey].photos.push({
        id: photo.id,
        url: photo.url,
        is_main: photo.is_main,
        winner: photo.winner,
        created_at: photo.created_at,
      });
      if (photo.created_at > groups[groupKey].latestDate) {
        groups[groupKey].latestDate = photo.created_at;
      }
    }

    const result = Object.values(groups).sort((a, b) =>
      b.latestDate.localeCompare(a.latestDate)
    );

    res.json(result);
  } catch (err) {
    console.error('Unexpected error fetching pending photos:', err);
    res.status(500).json({ error: 'Unexpected error' });
  }
});

api.post('/photos/upload', publicPhotoUploadLimiter, upload.array('photos', 10), async (req, res) => {
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
      let validatedImage;
      try {
        validatedImage = await validateRasterImageFile(file);
      } catch (validationError) {
        return res.status(400).json({ error: validationError.message || 'Invalid image upload' });
      }

      const filePath = buildGeneratedObjectPath(listingId, validatedImage.mimeType);

      const { error: uploadError } = await writeSupabase.storage
        .from(PHOTO_BUCKET)
        .upload(filePath, file.buffer, {
          contentType: validatedImage.mimeType,
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
    const parkId = (req.body?.parkId || req.body?.park_id || '').toString().trim() || null;
    const startDateInput = (req.body?.startDate || req.body?.start_date || '').toString().trim();
    const endDateInput = (req.body?.endDate || req.body?.end_date || '').toString().trim();
    const adminGoal = (req.body?.adminGoal || '').toString().trim();
    const includePriorReports = parseBooleanFlag(req.body?.includePriorReports, false);
    const reportScope = normalizeReportScope(req.body?.reportScope);
    const adminUserId = (req.body?.adminUserId || req.headers['x-admin-user-id'] || '').toString().trim() || null;

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
    const listingIds = rows.map((row) => row?.id).filter(Boolean);

    let diagnosticsLogs = [];
    if (listingIds.length > 0) {
      const { data: diagnosticsRows, error: diagnosticsError } = await writeSupabase
        .from('tree_diagnostics_logs')
        .select('listing_id, run_at, created_at')
        .in('listing_id', listingIds)
        .limit(5000);

      if (diagnosticsError) {
        console.error('Park report diagnostics query error:', diagnosticsError);
      } else {
        diagnosticsLogs = Array.isArray(diagnosticsRows) ? diagnosticsRows : [];
      }
    }

    const treesWithConditionNotes = rows.filter((row) => (row?.description || '').toString().trim().length > 0).length;
    const diagnosticsRuns = diagnosticsLogs.length;
    const treesWithDiagnostics = new Set(diagnosticsLogs.map((row) => row?.listing_id).filter(Boolean)).size;

    const metrics = {
      total_trees: rows.length,
      trees_with_qr: rows.filter((row) => Boolean(row.qr_url)).length,
      trees_with_photos: rows.filter((row) => Array.isArray(row.photos) && row.photos.length > 0).length,
      total_photos: photoRows.length,
      pending_photo_submissions: photoRows.filter((photo) => photo?.staff_uploaded === false).length,
      winner_photos: photoRows.filter((photo) => Boolean(photo?.winner)).length,
      geotagged_trees: rows.filter((row) => row?.latitude !== null || row?.longitude !== null).length,
      trees_missing_location: rows.filter((row) => !(row?.location || '').toString().trim()).length,
      trees_with_condition_notes: treesWithConditionNotes,
      trees_with_diagnostics: treesWithDiagnostics,
      diagnostics_runs: diagnosticsRuns,
    };

    const insufficientOperationalData =
      metrics.total_trees === 0 ||
      (metrics.trees_with_photos === 0 && metrics.trees_with_diagnostics === 0 && metrics.trees_with_condition_notes === 0);

    let priorReports = [];
    if (includePriorReports) {
      let priorReportsQuery = writeSupabase
        .from('park_ai_reports')
        .select('id, generated_at, park_id, park_name, report_scope, report_type, metrics_json, report_json, include_prior_reports')
        .order('generated_at', { ascending: false })
        .limit(12);

      if (reportScope === 'park') {
        if (parkId) {
          priorReportsQuery = priorReportsQuery.eq('report_scope', 'park').eq('park_id', parkId);
        } else if (park) {
          priorReportsQuery = priorReportsQuery.eq('report_scope', 'park').eq('park_name', park);
        } else {
          priorReportsQuery = priorReportsQuery.eq('report_scope', 'park');
        }
      } else {
        priorReportsQuery = priorReportsQuery.eq('report_scope', 'system-wide');
      }

      const { data: previousRows, error: previousError } = await priorReportsQuery;
      if (previousError) {
        console.error('Park report history query error:', previousError);
      } else {
        priorReports = Array.isArray(previousRows)
          ? previousRows
              .filter((row) => row?.report_json && row?.generated_at)
              .map((row) => ({
                id: row.id,
                generated_at: row.generated_at,
                report_type: row.report_type || 'pilot-impact',
                report_scope: row.report_scope || 'park',
                park_id: row.park_id || null,
                park_name: row.park_name || null,
                include_prior_reports: Boolean(row.include_prior_reports),
                key_metrics: row.metrics_json || null,
                title: row.report_json?.title || null,
                executive_summary: row.report_json?.executive_summary || null,
                budget_justification: Array.isArray(row.report_json?.budget_justification) ? row.report_json.budget_justification.slice(0, 4) : [],
                pilot_period_findings: Array.isArray(row.report_json?.pilot_period_findings) ? row.report_json.pilot_period_findings.slice(0, 4) : [],
              }))
          : [];
      }
    }

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

    const reportType = insufficientOperationalData ? 'pre-pilot-readiness' : 'pilot-impact';

    if (insufficientOperationalData) {
      const report = {
        title: 'Pre-Pilot ArborTag Readiness Report',
        executive_summary: `This report establishes a starting framework for ${scopeLabel} before tree tagging begins. Because no tree records with diagnostics/photo/condition evidence are available yet, findings are limited to implementation planning, community value framing, and recommended first steps.`,
        kpi_snapshot: [
          {
            metric: 'Tree Inventory Coverage',
            value: `${metrics.total_trees}`,
            why_it_matters: 'No operational baseline exists until initial records are entered.',
          },
          {
            metric: 'Diagnostics Coverage',
            value: `${metrics.trees_with_diagnostics}`,
            why_it_matters: 'Risk-informed maintenance planning requires diagnostic records.',
          },
          {
            metric: 'Photo Documentation Coverage',
            value: `${metrics.trees_with_photos}`,
            why_it_matters: 'Photos are needed for auditability, public communication, and AI quality control.',
          },
        ],
        public_impact: [
          'Initial tagging creates public transparency for tree stewardship and local education.',
          'Early QR coverage turns environmental assets into visible community infrastructure.',
          'Community events can be linked to high-value tagged trees for measurable engagement.',
        ],
        operational_impact: [
          'A standardized inventory reduces manual tracking and one-off field documentation.',
          'Consistent diagnostics and photo capture establish defensible maintenance records.',
          'Baseline data quality controls should be set before scale-up.',
        ],
        budget_justification: [
          'Current cost savings are not yet measurable from recorded operations; baseline data collection is required first.',
          'Initial spend should be framed as implementation readiness to unlock future measurable efficiency gains.',
          'Funding can be justified as digital infrastructure for risk tracking, auditability, and service planning.',
        ],
        arborist_service_value: [
          'Arborist input is highest value when tied to tagged assets with repeatable condition history.',
          'Structured diagnostics reduce ambiguity in contracted service scope and follow-up verification.',
          'Arborist recommendations become more defensible when linked to geotagged records and images.',
        ],
        pilot_period_findings: [
          'No current operational findings are available because the pilot data baseline is incomplete.',
          'Primary finding: readiness actions are required before outcomes can be measured.',
        ],
        next_period_recommendations: [
          'Tag mature shade trees near pavilion/event areas first.',
          'Record photos, species, condition notes, and location for each priority tree.',
          'Use ArborAI reports after the first 10-20 trees are logged.',
          'Export PDF/CSV reports for council review, maintenance planning, and budget discussions.',
          'Track trees tied to public events like Howdy Neighbor Days as high community-value assets.',
        ],
        cautionary_notes: [
          'Any savings estimate before baseline data capture should be labeled not yet measurable.',
          'Do not use readiness-stage summaries as proof of performance outcomes.',
        ],
      };

      if (includePriorReports && priorReports.length > 0) {
        report.pilot_period_findings.unshift(
          `Trend mode included ${priorReports.length} prior report snapshot(s) for context; however, current-period readiness conditions still limit measurable findings.`
        );
      }

      const persistencePayload = {
        park_id: reportScope === 'park' ? parkId : null,
        park_name: reportScope === 'park' ? (park || null) : null,
        report_scope: reportScope,
        report_type: reportType,
        admin_user_id: adminUserId,
        include_prior_reports: includePriorReports,
        input_filters: {
          park: park || null,
          park_id: parkId,
          start_date: startDateInput || null,
          end_date: endDateInput || null,
          admin_goal: adminGoal || null,
          include_prior_reports: includePriorReports,
          report_scope: reportScope,
        },
        metrics_json: metrics,
        report_json: report,
      };

      const { error: persistenceError } = await writeSupabase
        .from('park_ai_reports')
        .insert([persistencePayload]);

      if (persistenceError) {
        console.error('Failed to persist park report history:', persistenceError);
      }

      return res.json({
        generated_at: new Date().toISOString(),
        filters: {
          park: park || null,
          park_id: parkId,
          start_date: startDateInput || null,
          end_date: endDateInput || null,
          report_scope: reportScope,
          include_prior_reports: includePriorReports,
        },
        report_type: reportType,
        readiness_mode: true,
        history_used_count: priorReports.length,
        metrics,
        report,
      });
    }

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

Rules:
- Use supplied data only. Never fabricate savings, avoided costs, or ROI.
- If a value cannot be quantified from supplied data, explicitly label it as "estimated", "not yet measurable", or "requires more data".
- Translate environmental assets into operational and community value with municipal language.
- Keep findings auditable and decision-ready for administrators.

The output should help a mayor or city administrator justify park expenses and contracted arbor services using the supplied data only.`;

    const reportContext = {
      scope: scopeLabel,
      timeframe: dateLabel,
      admin_goal: adminGoal || 'Evaluate pilot period value and budget justification for parks and arbor services.',
      metrics,
      tree_snapshot: treeSnapshot,
      trend_mode: includePriorReports,
      report_scope: reportScope,
      prior_reports: includePriorReports ? priorReports : [],
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

    const persistencePayload = {
      park_id: reportScope === 'park' ? parkId : null,
      park_name: reportScope === 'park' ? (park || null) : null,
      report_scope: reportScope,
      report_type: reportType,
      admin_user_id: adminUserId,
      include_prior_reports: includePriorReports,
      input_filters: {
        park: park || null,
        park_id: parkId,
        start_date: startDateInput || null,
        end_date: endDateInput || null,
        admin_goal: adminGoal || null,
        include_prior_reports: includePriorReports,
        report_scope: reportScope,
      },
      metrics_json: metrics,
      report_json: parsedReport,
    };

    const { error: persistenceError } = await writeSupabase
      .from('park_ai_reports')
      .insert([persistencePayload]);

    if (persistenceError) {
      console.error('Failed to persist park report history:', persistenceError);
    }

    return res.json({
      generated_at: new Date().toISOString(),
      filters: {
        park: park || null,
        park_id: parkId,
        start_date: startDateInput || null,
        end_date: endDateInput || null,
        report_scope: reportScope,
        include_prior_reports: includePriorReports,
      },
      report_type: reportType,
      readiness_mode: false,
      history_used_count: priorReports.length,
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
    const staffMeasurements = await getLatestStaffMeasurementsForListing(id);

    if (uniquePhotos.length === 0) {
      const noPhotoDiagnostics = {
        species: 'Unknown',
        environment: null,
        summary: 'No photos available for diagnostics.',
        recommendations: ['Upload at least one clear tree photo.'],
        public_about: 'This tree is waiting for its first photo and identification. Once photos are uploaded, ArborAI will add a friendly public description here.',
        uses_throughout_history: `${listing.title || 'This tree or plant'} has supported local landscapes over time by providing shade, habitat, and ecological value.`,
        growth_cycle_facts: `${listing.title || 'This tree or plant'} typically shows seasonal growth with active leaf and canopy expansion in warm months and slower dormancy in colder months.`,
        estimated_age: staffMeasurements?.trunk_diameter_inches
          ? `Best guess age is based on recorded measurements, including a trunk diameter of ${staffMeasurements.trunk_diameter_inches} inches${staffMeasurements?.height_estimate_feet ? ` and a height near ${staffMeasurements.height_estimate_feet} feet` : ''}. This remains an estimate rather than an exact age.`
          : 'Best guess age is currently broad because there are no photos yet. Adding photos, trunk diameter, and height estimate will improve accuracy.',
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
  Trunk Diameter (inches): ${staffMeasurements?.trunk_diameter_inches ?? "Unknown"}
  Height Estimate (feet): ${staffMeasurements?.height_estimate_feet ?? "Unknown"}
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
        growth_cycle_facts: `${speciesGuess} typically follows a seasonal cycle with active growth in spring and summer, gradual hardening in fall, and slower dormancy in winter while roots continue limited development.`,
        estimated_age: staffMeasurements?.trunk_diameter_inches
          ? `Best guess unavailable right now. Recorded trunk diameter is ${staffMeasurements.trunk_diameter_inches} inches${staffMeasurements?.height_estimate_feet ? ` and height is about ${staffMeasurements.height_estimate_feet} feet` : ''}.`
          : 'Best guess unavailable right now. Add trunk diameter and height estimate for a stronger age estimate.',
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
- growth_cycle_facts: string (public-facing interesting facts about the species growth cycle and seasonal development)
- estimated_age: string (best-guess age estimate using visible maturity plus any provided trunk diameter and height measurements; explain uncertainty briefly)
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
    diagnostics = enforceToxicLookalikeSafety(diagnostics);
    diagnostics = enforceOrchardAndHardwoodIDAccuracy(diagnostics);
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

    let growthCycleFacts = (diagnostics?.growth_cycle_facts || '').toString().trim();
    if (!growthCycleFacts) {
      growthCycleFacts = `${speciesName} follows a yearly growth rhythm: new leaf and shoot expansion in spring, stronger canopy and trunk growth through summer, and slower dormant behavior during colder months while root systems continue limited development.`;
    }

    diagnostics.growth_cycle_facts = growthCycleFacts;

    let estimatedAge = (diagnostics?.estimated_age || '').toString().trim();
    if (!estimatedAge) {
      if (staffMeasurements?.trunk_diameter_inches || staffMeasurements?.height_estimate_feet) {
        estimatedAge = `${speciesName} appears mature. Based on the recorded measurements${staffMeasurements?.trunk_diameter_inches ? `, including a trunk diameter of ${staffMeasurements.trunk_diameter_inches} inches` : ''}${staffMeasurements?.height_estimate_feet ? `${staffMeasurements?.trunk_diameter_inches ? ' and' : ', including'} a height of about ${staffMeasurements.height_estimate_feet} feet` : ''}, ArborAI should treat any age estimate as a best guess rather than an exact age.`;
      } else {
        estimatedAge = `ArborAI can make only a rough age estimate from photos alone. Adding trunk diameter and height estimate will improve this best guess.`;
      }
    }

    diagnostics.estimated_age = estimatedAge;
    diagnostics.staff_measurements = staffMeasurements || null;

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
api.post('/ai/ask-arborai', publicAiAskLimiter, upload.array('photos', 6), async (req, res) => {
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
      let validatedImage;
      try {
        validatedImage = await validateRasterImageFile(file);
      } catch (validationError) {
        return res.status(400).json({ error: validationError.message || 'Invalid image upload' });
      }

      const filePath = buildGeneratedObjectPath('ask-arborai', validatedImage.mimeType);

      let uploadedBucket = null;
      for (const bucketName of ASK_ARBORAI_BUCKET_CANDIDATES) {
        const { error: uploadError } = await writeSupabase.storage
          .from(bucketName)
          .upload(filePath, file.buffer, {
            contentType: validatedImage.mimeType,
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
        aiImageUrls.push(`data:${validatedImage.mimeType};base64,${base64}`);
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

    if (aiImageUrls.length === 0) {
      return res.json({
        species: 'Unknown',
        confidence: 'Low',
        health_score: 0,
        summary: 'No photos were provided, so image-based identification is not possible.',
        risks: [],
        recommendations: ['Upload at least one clear photo for image-first identification.'],
        photo_summaries: [],
        hazards_detected: 'No',
        hazard_details: [],
        raw_ai_message: question
          ? `You asked: "${question}". I need at least one clear photo before I can identify this safely.`
          : 'Upload at least one clear photo before asking for species identification.',
        photo_urls: uploadedPhotoUrls,
      });
    }

    const identificationSystemPrompt = `${ARBORAI_REGIONAL_SCOPE}

  You are performing IMAGE-FIRST identification and diagnostics.
  Ignore user wording biases such as "baby tree", named species guesses, or category assumptions.
  Use only visual evidence from the photos for species and hazard calls.

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
Critical safety rules:
- For Apiaceae/umbel plants, explicitly compare Poison Hemlock vs Wild Carrot using stem evidence.
- Purple-blotched smooth/hairless or hollow stems must trigger poisonous lookalike warnings.
- If poisonous lookalike risk exists, do NOT output High confidence and include clear do-not-ingest language in risks/recommendations/raw_ai_message.
If information is uncertain, state best estimate and keep raw_ai_message supportive and non-technical.`;

    const identificationUserContent = [
      {
        type: 'text',
        text: 'Perform image-first identification and diagnostics from the photos only. Do not use user phrasing to choose a species.',
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
          { role: 'system', content: identificationSystemPrompt },
          { role: 'user', content: identificationUserContent },
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
      enforceOrchardAndHardwoodIDAccuracy(
        enforceToxicLookalikeSafety(
          enforceCriticalDecayFailSafe(payload)
        )
      )
    );

    const questionText = (question || '').toString().trim();
    const questionLower = questionText.toLowerCase();
    const asksTreeCategory = /(baby\s+tree|sapling|seedling|what\s+tree|which\s+tree|\btree\b)/i.test(questionLower);
    const asksWalnut = /(walnut|juglans|black\s+walnut)/i.test(questionLower);

    const evidenceBlob = [
      normalizedPayload.species,
      normalizedPayload.summary,
      ...(Array.isArray(normalizedPayload.hazard_details) ? normalizedPayload.hazard_details : []),
      ...(Array.isArray(normalizedPayload.risks) ? normalizedPayload.risks : []),
      ...(Array.isArray(normalizedPayload.recommendations) ? normalizedPayload.recommendations : []),
    ]
      .map((item) => (item == null ? '' : item.toString().toLowerCase()))
      .join(' | ');

    const indicatesApiaceae = /(hemlock|wild carrot|queen anne|apiaceae|umbel|umbellifer|conium|cicuta|fool'?s parsley)/i.test(evidenceBlob);
    const indicatesWalnut = /(walnut|juglans)/i.test(evidenceBlob);
    const questionBiasDetected = (asksTreeCategory && indicatesApiaceae) || (asksWalnut && !indicatesWalnut);

    if (questionBiasDetected) {
      normalizedPayload.question_bias_detected = true;
      const dataQualityFlags = normalizeStringArrayField(normalizedPayload.data_quality_flags);
      if (!dataQualityFlags.some((item) => /question wording conflicted|prompt anchoring/i.test(item))) {
        dataQualityFlags.unshift('Question wording conflicted with image evidence; anti-anchoring rules were applied.');
      }
      normalizedPayload.data_quality_flags = dataQualityFlags;

      const recommendations = normalizeStringArrayField(normalizedPayload.recommendations);
      if (!recommendations.some((item) => /image-first|wording|anchoring/i.test(item))) {
        recommendations.unshift('Identification stayed image-first and was not changed by question wording.');
      }
      normalizedPayload.recommendations = recommendations;
    } else {
      normalizedPayload.question_bias_detected = false;
    }

    const confidenceLabel = normalizeConfidenceTier(normalizedPayload.confidence);
    const assistantParts = [
      `Image-first result: ${normalizedPayload.species || 'Unknown'} (confidence: ${confidenceLabel}).`,
    ];

    if (questionText) {
      assistantParts.push(`You asked: "${questionText}".`);
    }

    if (questionBiasDetected) {
      assistantParts.push('Your wording suggested a different category/species, but ArborAI kept identification locked to visual evidence to reduce hallucinations.');
    }

    if ((normalizedPayload.hazards_detected || '').toString().toLowerCase() === 'yes') {
      assistantParts.push('Safety note: potentially hazardous or toxic traits were detected, so treat this as potentially dangerous until expert verification.');
    }

    if (Array.isArray(normalizedPayload.recommendations) && normalizedPayload.recommendations.length > 0) {
      assistantParts.push(`Key qualifier: ${normalizedPayload.recommendations[0]}`);
    }

    normalizedPayload.raw_ai_message = assistantParts.join(' ').trim();

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
    const qrUrl = await generateQrForTree(listing.id, {
      appBaseUrl: process.env.APP_BASE_URL || process.env.CLIENT_URL || getRequestOrigin(req),
    });
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
app.post('/api/stripe/webhook', async (req, res) => {
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

