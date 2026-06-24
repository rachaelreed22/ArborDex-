const DEMO_GARDEN_STORAGE_KEY = 'arbordex-demo-garden-plants';

const DEFAULT_DEMO_PLANTS = [
  {
    id: 'demo-plant-fern-01',
    name: 'Front Porch Fern',
    species: 'Boston Fern',
    room_or_bed: 'indoor',
    bed_number: null,
    row_section_id: 'A1',
    notes: 'This is how your homeowner plant profile cards will look and flow.',
    photos: ['/images/RedMaple4ATag.jpg'],
    last_diagnostics: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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
    last_diagnostics: null,
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
    last_diagnostics: plant?.last_diagnostics || null,
    created_at: plant?.created_at || new Date().toISOString(),
    updated_at: plant?.updated_at || new Date().toISOString(),
  };

  if (!Number.isInteger(normalized.bed_number)) {
    normalized.bed_number = null;
  }

  return normalized;
}

export function loadDemoGardenPlants() {
  const raw = window.localStorage.getItem(DEMO_GARDEN_STORAGE_KEY);
  const parsed = safeParse(raw || '');

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return DEFAULT_DEMO_PLANTS.map(normalizePlant);
  }

  return parsed.map(normalizePlant);
}

export function saveDemoGardenPlants(plants) {
  const normalized = (Array.isArray(plants) ? plants : []).map(normalizePlant);
  window.localStorage.setItem(DEMO_GARDEN_STORAGE_KEY, JSON.stringify(normalized));
}

export function getDemoPlantById(plantId) {
  const plants = loadDemoGardenPlants();
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
