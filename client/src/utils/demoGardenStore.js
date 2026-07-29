const DEMO_GARDEN_STORAGE_KEY = 'arbordex-demo-garden-plants';
const DEMO_GARDEN_STORAGE_TS_KEY = 'arbordex-demo-garden-plants-ts';
const DEMO_GARDEN_SESSION_TTL_MS = 3 * 60 * 60 * 1000;
const DEMO_GARDEN_LAYOUT_KEY = 'arbordex-demo-garden-layout-v1';
const DEMO_GARDEN_COMPANION_KEY = 'arbordex-demo-garden-companion-v1';
const DEMO_GARDEN_DOCS_KEY = 'arbordex-demo-garden-docs-v1';
const DEMO_FERN_ID = 'demo-plant-fern-01';
const DEMO_HERBS_ID = 'demo-plant-herbs-02';
const DEMO_FERN_IMAGE = '/images/FrontPorchFern.png';
const DEMO_HERBS_IMAGE = '/images/HerbCluster.png';

function buildDemoDiagnostics({ commonName, scientificName, condition }) {
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

function normalizeJournalEntry(entry) {
  return {
    id: (entry?.id || `demo-journal-${Math.random().toString(36).slice(2, 10)}`).toString(),
    event_type: (entry?.event_type || 'note').toString(),
    occurred_at: entry?.occurred_at || new Date().toISOString(),
    notes: (entry?.notes || '').toString(),
  };
}

function inferDefaultDiagnostics(plant) {
  const commonName = (plant?.species || plant?.name || 'Demo Plant').toString().trim() || 'Demo Plant';
  const scientificName = (plant?.species || 'Species not provided').toString().trim() || 'Species not provided';
  return buildDemoDiagnostics({
    commonName,
    scientificName,
    condition: 'Good',
  });
}

const DEFAULT_DEMO_PLANTS = [
  {
    id: DEMO_FERN_ID,
    name: 'Front Porch Fern',
    species: 'Boston Fern',
    room_or_bed: 'indoor',
    bed_number: null,
    row_section_id: 'A1',
    notes: 'This is how your homeowner plant profile cards will look and flow.',
    photos: [DEMO_FERN_IMAGE],
    last_diagnostics: buildDemoDiagnostics({
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: DEMO_HERBS_ID,
    name: 'Kitchen Herb Cluster',
    species: 'Mixed Culinary Herbs',
    room_or_bed: 'indoor',
    bed_number: null,
    row_section_id: 'B3',
    notes: 'Tap into a profile to see full-page details, gallery, and editing flow.',
    photos: [DEMO_HERBS_IMAGE],
    last_diagnostics: buildDemoDiagnostics({
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizePlant(plant) {
  const normalized = {
    ...plant,
    id: (plant?.id || `demo-plant-${Math.random().toString(36).slice(2, 10)}`).toString(),
    name: (plant?.name || '').toString(),
    species: (plant?.species || '').toString(),
    room_or_bed: (plant?.room_or_bed || '').toString(),
    bed_number: plant?.bed_number == null || plant?.bed_number === '' ? null : Number.parseInt(plant.bed_number, 10),
    row_section_id: (plant?.row_section_id || '').toString(),
    notes: (plant?.notes || '').toString(),
    photos: Array.isArray(plant?.photos) ? plant.photos.filter(Boolean) : [],
    last_diagnostics: plant?.last_diagnostics && typeof plant.last_diagnostics === 'object'
      ? { ...inferDefaultDiagnostics(plant), ...plant.last_diagnostics }
      : inferDefaultDiagnostics(plant),
    journal_entries: Array.isArray(plant?.journal_entries)
      ? plant.journal_entries.map(normalizeJournalEntry)
      : [],
    created_at: plant?.created_at || new Date().toISOString(),
    updated_at: plant?.updated_at || new Date().toISOString(),
  };

  if (!Number.isInteger(normalized.bed_number)) {
    normalized.bed_number = null;
  }

  return normalized;
}

function applySeedPhotoBackfill(plants) {
  const rows = Array.isArray(plants) ? plants : [];
  return rows.map((plant) => {
    if (!plant || typeof plant !== 'object') return plant;

    if (plant.id === DEMO_FERN_ID) {
      const firstPhoto = Array.isArray(plant.photos) ? (plant.photos[0] || '').toString() : '';
      if (!firstPhoto || firstPhoto === '/images/RedMaple4ATag.jpg') {
        return {
          ...plant,
          photos: [DEMO_FERN_IMAGE],
          updated_at: new Date().toISOString(),
        };
      }
    }

    if (plant.id === DEMO_HERBS_ID) {
      const hasPhotos = Array.isArray(plant.photos) && plant.photos.length > 0;
      if (!hasPhotos) {
        return {
          ...plant,
          photos: [DEMO_HERBS_IMAGE],
          updated_at: new Date().toISOString(),
        };
      }
    }

    return plant;
  });
}

export function getCachedDemoGardenPlants() {
  const tsRaw = window.sessionStorage.getItem(DEMO_GARDEN_STORAGE_TS_KEY);
  const ts = Number.parseInt((tsRaw || '').toString(), 10);
  if (!Number.isFinite(ts) || Date.now() - ts > DEMO_GARDEN_SESSION_TTL_MS) {
    window.sessionStorage.removeItem(DEMO_GARDEN_STORAGE_KEY);
    window.sessionStorage.removeItem(DEMO_GARDEN_STORAGE_TS_KEY);
  }

  const raw = window.sessionStorage.getItem(DEMO_GARDEN_STORAGE_KEY);
  const parsed = safeParse(raw || '');

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return [];
  }

  return applySeedPhotoBackfill(parsed.map(normalizePlant));
}

export function cacheDemoGardenPlants(plants) {
  const normalized = applySeedPhotoBackfill((Array.isArray(plants) ? plants : []).map(normalizePlant));
  window.sessionStorage.setItem(DEMO_GARDEN_STORAGE_KEY, JSON.stringify(normalized));
  window.sessionStorage.setItem(DEMO_GARDEN_STORAGE_TS_KEY, Date.now().toString());
  return normalized;
}

export async function fetchDemoGardenPlants() {
  const cachedPlants = getCachedDemoGardenPlants();
  if (Array.isArray(cachedPlants) && cachedPlants.length > 0) {
    return cachedPlants;
  }

  return cacheDemoGardenPlants(DEFAULT_DEMO_PLANTS);
}

export async function saveDemoGardenPlants(plants) {
  const normalizedPlants = (Array.isArray(plants) ? plants : []).map(normalizePlant);

  const tooLargePhoto = normalizedPlants.some((plant) =>
    Array.isArray(plant.photos) && plant.photos.some((photo) => typeof photo === 'string' && photo.length > 8_000_000)
  );
  if (tooLargePhoto) {
    throw new Error('Photo is too large to save. Please use a smaller image and try again.');
  }

  return cacheDemoGardenPlants(normalizedPlants);
}

export async function getDemoPlantById(plantId) {
  const plants = await fetchDemoGardenPlants();
  return plants.find((plant) => plant.id === plantId) || null;
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result || '').toString());
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

function safeParseJson(raw, fallback) {
  try {
    const parsed = JSON.parse(raw || '');
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

export function getDemoGardenDraftSnapshot() {
  const plants = getCachedDemoGardenPlants();
  const companionState = safeParseJson(window.sessionStorage.getItem(DEMO_GARDEN_COMPANION_KEY), {});
  const documentedNotes = safeParseJson(window.sessionStorage.getItem(DEMO_GARDEN_DOCS_KEY), []);
  const layout = safeParseJson(window.sessionStorage.getItem(DEMO_GARDEN_LAYOUT_KEY), null);

  const gardenName = (companionState?.garden_name || '').toString().trim();
  return {
    garden_name: gardenName,
    plants,
    companion_messages: Array.isArray(companionState?.messages) ? companionState.messages : [],
    documented_notes: Array.isArray(documentedNotes) ? documentedNotes : [],
    layout,
    captured_at: new Date().toISOString(),
  };
}

export function clearDemoGardenSessionData() {
  const keys = [
    DEMO_GARDEN_STORAGE_KEY,
    DEMO_GARDEN_STORAGE_TS_KEY,
    DEMO_GARDEN_LAYOUT_KEY,
    DEMO_GARDEN_COMPANION_KEY,
    DEMO_GARDEN_DOCS_KEY,
    'arbordex-demo-onboarding-v1',
    'arbordex-onboarding-draft-v1',
  ];

  keys.forEach((key) => {
    window.sessionStorage.removeItem(key);
  });
}

export function saveDemoGardenLayoutSession(layout) {
  const payload = layout && typeof layout === 'object' ? layout : null;
  if (!payload) {
    window.sessionStorage.removeItem(DEMO_GARDEN_LAYOUT_KEY);
    return null;
  }

  window.sessionStorage.setItem(DEMO_GARDEN_LAYOUT_KEY, JSON.stringify(payload));
  return payload;
}

export function readDemoGardenLayoutSession() {
  return safeParseJson(window.sessionStorage.getItem(DEMO_GARDEN_LAYOUT_KEY), null);
}
