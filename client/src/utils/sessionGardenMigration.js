import { apiUrl } from './apiUrl';
import { getDemoGardenDraftSnapshot, clearDemoGardenSessionData } from './demoGardenStore';

const ONBOARDING_DRAFT_KEY = 'arbordex-onboarding-draft-v1';

function dataUrlToFile(dataUrl, fileName) {
  const match = /^data:(.+);base64,(.*)$/.exec((dataUrl || '').toString());
  if (!match) return null;
  const mimeType = match[1] || 'image/jpeg';
  const binary = atob(match[2] || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName, { type: mimeType });
}

export function saveOnboardingDraftSnapshot() {
  const snapshot = getDemoGardenDraftSnapshot();
  window.sessionStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(snapshot));
  return snapshot;
}

export function readOnboardingDraftSnapshot() {
  try {
    const raw = window.sessionStorage.getItem(ONBOARDING_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function clearOnboardingDraftSnapshot() {
  window.sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
}

export async function migrateOnboardingDraftToHomeowner({ token }) {
  const draft = readOnboardingDraftSnapshot();
  if (!draft) {
    return { imported: false, reason: 'no-draft' };
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  if (draft.garden_name) {
    await fetch(apiUrl('/api/homeowners/garden-companion/name'), {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ garden_name: draft.garden_name }),
    }).catch(() => null);
  }

  if (draft.layout?.image_url) {
    const formData = new FormData();
    const image = (draft.layout.image_url || '').toString();
    const layoutNotes = (draft.layout.notes || '').toString();

    const dataFile = image.startsWith('data:') ? dataUrlToFile(image, 'session-layout.jpg') : null;
    if (dataFile) {
      formData.append('layout_image', dataFile);
      formData.append('notes', layoutNotes);
      await fetch(apiUrl('/api/homeowners/garden-companion/layout'), {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      }).catch(() => null);
    }
  }

  const plants = Array.isArray(draft.plants) ? draft.plants : [];

  for (let index = 0; index < plants.length; index += 1) {
    const plant = plants[index] || {};
    const createRes = await fetch(apiUrl('/api/homeowners/plants'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: (plant.name || '').toString().trim() || `Imported Plant ${index + 1}`,
        species: (plant.species || '').toString(),
        room_or_bed: (plant.room_or_bed || '').toString(),
        bed_number: plant.bed_number ?? null,
        row_section_id: (plant.row_section_id || '').toString(),
      }),
    }).catch(() => null);

    if (!createRes || !createRes.ok) continue;

    const createdPayload = await createRes.json().catch(() => ({}));
    const newPlantId = createdPayload?.plant?.id;
    if (!newPlantId) continue;

    const journals = Array.isArray(plant.journal_entries) ? plant.journal_entries : [];
    for (const entry of journals) {
      await fetch(apiUrl(`/api/homeowners/plants/${newPlantId}/journal`), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          event_type: (entry?.event_type || 'note').toString(),
          occurred_at: entry?.occurred_at || new Date().toISOString(),
          notes: (entry?.notes || '').toString(),
        }),
      }).catch(() => null);
    }

    const photos = Array.isArray(plant.photos) ? plant.photos : [];
    for (let photoIndex = 0; photoIndex < photos.length; photoIndex += 1) {
      const photo = (photos[photoIndex] || '').toString();
      const file = photo.startsWith('data:') ? dataUrlToFile(photo, `session-photo-${photoIndex + 1}.jpg`) : null;
      if (!file) continue;

      const photoData = new FormData();
      photoData.append('photo', file);
      await fetch(apiUrl(`/api/homeowners/plants/${newPlantId}/photos`), {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: photoData,
      }).catch(() => null);
    }
  }

  clearOnboardingDraftSnapshot();
  clearDemoGardenSessionData();
  return { imported: true, reason: 'ok' };
}
