import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../utils/apiUrl';
import { getTierLabel, getTierLimit } from '../utils/homeownerTier';
import { useHomeownerAuth } from '../context/HomeownerAuthContext';
import './TreeList.css';
import './HomeownerPlants.css';
import './HomeownerTheme.css';

const EMPTY_FORM = {
  name: '',
  species: '',
  room_or_bed: '',
};

const LOCATION_OPTIONS = [
  { value: 'indoor', label: 'Indoor' },
  { value: 'outdoor', label: 'Outdoor' },
];

function getLocationLabel(value) {
  if (value === 'indoor') return 'Indoor';
  if (value === 'outdoor') return 'Outdoor';
  return 'Not set';
}

function hasObservedHazardEvidence(text) {
  const sample = (text || '').toString();
  if (!sample.trim()) return false;

  const hasHazardSignal = /(decay|decaying|rot|rotting|hollow|cavity|loss\s+of\s+integrity|instability|structural|failure|compromised|fall\s+risk|collapse|unsafe)/i.test(sample);
  if (!hasHazardSignal) return false;

  const hasObservedLanguage = /(observed|visible|detected|identified|present|showing|shows|evidence|signs?\s+of|symptoms?\s+of|active|advanced|severe|ongoing|needs\s+human\s+inspection)/i.test(sample);
  const hasAdvisoryLanguage = /(avoid|prevent|preventing|to\s+prevent|risk\s+of|chance\s+of|potential\s+for|can\s+cause|could\s+cause|may\s+cause|can\s+lead\s+to|susceptible\s+to|prone\s+to|watch\s+for|monitor\s+for|look\s+out\s+for)/i.test(sample);

  return hasObservedLanguage || !hasAdvisoryLanguage;
}

function inferHazardFromDiagnostics(diagnostics) {
  if (!diagnostics || typeof diagnostics !== 'object') {
    return false;
  }

  const explicitHazard = ['yes', 'y', 'true'].includes(
    (diagnostics.hazards_detected || diagnostics.hazard_detected || '').toString().trim().toLowerCase()
  );

  const hasDetails = Array.isArray(diagnostics.hazard_details) && diagnostics.hazard_details.length > 0;

  const signalItems = [
    diagnostics.summary,
    diagnostics.overall_condition,
    diagnostics.medicinal_qualities,
    ...(Array.isArray(diagnostics.primary_concerns) ? diagnostics.primary_concerns : []),
    ...(Array.isArray(diagnostics.common_issues_to_watch_for) ? diagnostics.common_issues_to_watch_for : []),
    ...(Array.isArray(diagnostics.warning_signs) ? diagnostics.warning_signs : []),
    ...(Array.isArray(diagnostics.photo_summaries) ? diagnostics.photo_summaries : []),
    ...(Array.isArray(diagnostics.hazard_details) ? diagnostics.hazard_details : []),
  ];

  const signals = signalItems
    .map((item) => (item == null ? '' : item.toString().toLowerCase()))
    .join(' | ');

  const hasDecay = /(decay|decaying|rot|rotting|hollow|cavity|loss\s+of\s+integrity)/i.test(signals);
  const hasStructuralRisk = /(instability|structural|failure|compromised|fall\s+risk|collapse|unsafe|consider\s+removal)/i.test(signals);
  const hasTrunkBaseRoot = /(trunk|base|basal|root|root\s*flare|root\s*collar)/i.test(signals);
  const hasNegatedRisk = /(no|not|without)\s+(clear\s+)?(signs?\s+of\s+)?(hazards?|risk|decay|rot|instability|failure)/i.test(signals);
  const hasObservedEvidence = signalItems.some((item) => hasObservedHazardEvidence(item));
  const inferredHazard = hasObservedEvidence && hasDecay && hasTrunkBaseRoot && !hasNegatedRisk && (hasStructuralRisk || hasDecay);

  return explicitHazard || hasDetails || inferredHazard;
}

export default function HomeownerPlants() {
  const navigate = useNavigate();
  const { getAccessToken, logout } = useHomeownerAuth();

  const [plants, setPlants] = useState([]);
  const [tier, setTier] = useState('free');
  const [profileLimit, setProfileLimit] = useState(getTierLimit('free'));
  const [activeProfiles, setActiveProfiles] = useState(0);
  const [lockedProfiles, setLockedProfiles] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingId, setUploadingId] = useState('');
  const [photoActionKey, setPhotoActionKey] = useState('');
  const [editingId, setEditingId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [editForm, setEditForm] = useState(EMPTY_FORM);

  const atLimit = useMemo(() => activeProfiles >= profileLimit, [activeProfiles, profileLimit]);

  async function authFetch(path, options = {}) {
    const token = await getAccessToken();
    const headers = {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const res = await fetch(apiUrl(path), {
      ...options,
      headers,
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload.error || 'Request failed');
    }

    return payload;
  }

  async function loadPlants() {
    try {
      setLoading(true);
      setError('');
      const payload = await authFetch('/api/homeowners/plants');
      setPlants(Array.isArray(payload.plants) ? payload.plants : []);
      setTier(payload.tier || 'free');
      setProfileLimit(payload.profile_limit || getTierLimit(payload.tier || 'free'));
      setActiveProfiles(payload.active_profiles || 0);
      setLockedProfiles(payload.locked_profiles || 0);
    } catch (err) {
      setError(err.message || 'Failed to load plant profiles');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPlants();
  }, []);

  async function handleCreatePlant(e) {
    e.preventDefault();

    if (atLimit) {
      setError(`Profile limit reached (${activeProfiles}/${profileLimit}). Delete a profile or upgrade tier to continue.`);
      return;
    }

    if (!createForm.name.trim()) {
      setError('Plant name is required');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      setSuccess('');

      await authFetch('/api/homeowners/plants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });

      setCreateForm(EMPTY_FORM);
      setSuccess('Plant profile created');
      await loadPlants();
    } catch (err) {
      const nextError = err.message || 'Failed to create plant profile';
      setError(nextError);
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(plant) {
    setEditingId(plant.id);
    setEditForm({
      name: plant.name || '',
      species: plant.species || '',
      room_or_bed: plant.room_or_bed || '',
    });
    setError('');
    setSuccess('');
  }

  function cancelEdit() {
    setEditingId('');
    setEditForm(EMPTY_FORM);
  }

  async function saveEdit(plantId) {
    if (!editForm.name.trim()) {
      setError('Plant name is required');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      setSuccess('');

      await authFetch(`/api/homeowners/plants/${plantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });

      setEditingId('');
      setEditForm(EMPTY_FORM);
      setSuccess('Plant profile updated');
      await loadPlants();
    } catch (err) {
      setError(err.message || 'Failed to update plant profile');
    } finally {
      setSubmitting(false);
    }
  }

  async function deletePlant(plantId) {
    const confirmed = window.confirm('Delete this plant profile?');
    if (!confirmed) return;

    try {
      setSubmitting(true);
      setError('');
      setSuccess('');

      await authFetch(`/api/homeowners/plants/${plantId}`, {
        method: 'DELETE',
      });

      setPlants((prev) => prev.filter((plant) => plant.id !== plantId));
      setSuccess('Plant profile deleted');
      await loadPlants();
    } catch (err) {
      setError(err.message || 'Failed to delete plant profile');
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadPhoto(plantId, file) {
    if (!file) return;

    try {
      setUploadingId(plantId);
      setError('');
      setSuccess('');

      const token = await getAccessToken();
      const formData = new FormData();
      formData.append('photo', file);

      const res = await fetch(apiUrl(`/api/homeowners/plants/${plantId}/photos`), {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || 'Failed to upload photo');

      setSuccess('Photo uploaded');
      await loadPlants();
    } catch (err) {
      setError(err.message || 'Failed to upload photo');
    } finally {
      setUploadingId('');
    }
  }

  async function deletePhoto(plantId, photoIndex) {
    const confirmed = window.confirm('Delete this photo?');
    if (!confirmed) return;

    const actionKey = `${plantId}-${photoIndex}`;
    try {
      setPhotoActionKey(actionKey);
      setError('');
      setSuccess('');

      await authFetch(`/api/homeowners/plants/${plantId}/photos/${photoIndex}`, {
        method: 'DELETE',
      });

      setSuccess('Photo deleted');
      await loadPlants();
    } catch (err) {
      setError(err.message || 'Failed to delete photo');
    } finally {
      setPhotoActionKey('');
    }
  }

  async function replacePhoto(plantId, photoIndex, file) {
    if (!file) return;

    const actionKey = `${plantId}-${photoIndex}`;
    try {
      setPhotoActionKey(actionKey);
      setError('');
      setSuccess('');

      const token = await getAccessToken();
      const formData = new FormData();
      formData.append('photo', file);

      const res = await fetch(apiUrl(`/api/homeowners/plants/${plantId}/photos/${photoIndex}/replace`), {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || 'Failed to replace photo');

      setSuccess('Photo replaced');
      await loadPlants();
    } catch (err) {
      setError(err.message || 'Failed to replace photo');
    } finally {
      setPhotoActionKey('');
    }
  }

  return (
    <main className="homeowner-shell min-h-screen px-4 py-10">
      <div className="homeowner-surface mx-auto w-full max-w-5xl rounded-2xl p-8 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="homeowner-heading text-3xl font-bold">Welcome to Your Digital Garden</h1>
            <p className="homeowner-subtext mt-2 text-sm">
              {getTierLabel(tier)}: {activeProfiles}/{profileLimit} active profiles
            </p>
            <div className={`homeowner-limit-badge mt-2 ${atLimit ? 'homeowner-limit-badge-hit' : ''}`}>
              {atLimit ? `Limit Reached ${activeProfiles}/${profileLimit}` : `Capacity ${activeProfiles}/${profileLimit}`}
            </div>
            {lockedProfiles > 0 && (
              <p className="homeowner-subtext mt-2 text-sm">
                {lockedProfiles} profile{lockedProfiles === 1 ? '' : 's'} locked by current plan limit.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => navigate('/')}
              className="homeowner-button-secondary rounded-md px-4 py-2 text-sm font-semibold"
            >
              Home
            </button>
            <button
              onClick={() => navigate('/homeowners/ask-arborai')}
              className="homeowner-button-secondary rounded-md px-4 py-2 text-sm font-semibold"
            >
              Ask ArborAI
            </button>
            <button
              onClick={() => navigate('/homeowners/account')}
              className="homeowner-button-secondary rounded-md px-4 py-2 text-sm font-semibold"
            >
              Back to Account
            </button>
            <button onClick={logout} className="homeowner-button-secondary rounded-md px-4 py-2 text-sm font-semibold">Sign out</button>
          </div>
        </div>

        <div className="homeowner-panel homeowner-panel-info mt-6">
          {atLimit
            ? 'You are at your profile limit for this tier. Upgrade or delete a profile to add more.'
            : 'Add and manage plant profiles here. You can attach up to 5 photos per profile.'}
        </div>
        <div className="homeowner-panel homeowner-panel-info mt-3 space-y-2 text-sm">
          <p>
            Tip: The more photos, notes, and updates you add, the more useful ArborAI's plant guidance can become.
          </p>
          <p>Your plant profiles are private to your account.</p>
          <p>
            ArborAI provides educational plant guidance and does not replace professional arborist, medical, legal, or chemical-treatment advice.
          </p>
        </div>
        {loading && (
          <div className="homeowner-plants-loading" role="status" aria-live="polite">
            <span className="homeowner-spinner" aria-hidden="true" />
            <span>Loading plant profiles...</span>
          </div>
        )}

        {error && <p className="homeowner-alert homeowner-alert-error">{error}</p>}
        {success && <p className="homeowner-alert homeowner-alert-success">{success}</p>}

        <form onSubmit={handleCreatePlant} className="homeowner-stat-card mt-6 rounded-xl p-4">
          <h2 className="text-lg font-bold text-[#1d411d]">Add Plant Profile</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <input
              className="homeowner-input rounded-md px-3 py-2 text-sm"
              placeholder="Plant name *"
              value={createForm.name}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
              disabled={submitting}
            />
            <input
              className="homeowner-input rounded-md px-3 py-2 text-sm"
              placeholder="Species (optional)"
              value={createForm.species}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, species: e.target.value }))}
              disabled={submitting}
            />
            <select
              className="homeowner-input rounded-md px-3 py-2 text-sm"
              value={createForm.room_or_bed}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, room_or_bed: e.target.value }))}
              disabled={submitting}
            >
              <option value="">Indoor/Outdoor (optional)</option>
              {LOCATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={submitting || atLimit}
              className="homeowner-button-primary rounded-md px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Saving...' : atLimit ? 'Create Profile (Limit Reached)' : 'Create Profile'}
            </button>
            {atLimit && (
              <button
                type="button"
                onClick={() => navigate('/homeowners/tiers')}
                className="homeowner-button-secondary rounded-md px-4 py-2 text-sm font-semibold"
              >
                Upgrade Tier
              </button>
            )}
          </div>
        </form>

        <div className="mt-6">
          {loading && <p className="homeowner-muted">Loading profiles...</p>}
          {!loading && plants.length === 0 && (
            <div className="homeowner-panel homeowner-panel-info border-dashed p-6 text-sm">
              No plant profiles yet. Create your first profile above, or use Ask ArborAI to scan a plant and create a Plant ID from the result.
            </div>
          )}
          <div className="tree-grid homeowner-plant-grid">
            {plants.map((plant) => {
              const photos = Array.isArray(plant.photos) ? plant.photos : [];
              const mainPhoto = photos[0] || null;
              const isEditing = editingId === plant.id;
              const isLocked = Boolean(plant.is_locked);
              const hasHazard = inferHazardFromDiagnostics(plant.last_diagnostics);

              return (
                <article
                  key={plant.id}
                  className={`tree-card homeowner-plant-card ${isLocked ? 'homeowner-plant-card-locked' : ''}`}
                  onClick={(event) => {
                    const target = event.target;
                    if (
                      target instanceof Element &&
                      target.closest('button, input, select, label, a, textarea')
                    ) {
                      return;
                    }

                    if (isLocked) {
                      setError('This profile is locked by your current plan. Upgrade tier to open it.');
                      return;
                    }

                    if (!isEditing) {
                      navigate(`/homeowners/plants/${plant.id}`, {
                        state: { plantPreview: plant },
                      });
                    }
                  }}
                >
                  {isLocked && <div className="homeowner-locked-banner">Locked by plan limit</div>}
                  <div className="tree-card-photo-wrapper homeowner-plant-main-photo">
                    {mainPhoto ? (
                      <img src={mainPhoto} alt={plant.name} className="tree-card-photo" />
                    ) : (
                      <div className="tree-card-no-photo">No Photo</div>
                    )}
                    <div className="qr-tag">{photos.length}/5</div>
                  </div>

                  <div className="tree-card-info homeowner-plant-info">
                    {isEditing ? (
                      <div className="homeowner-plant-edit-grid" onClick={(e) => e.stopPropagation()}>
                        <input
                          className="homeowner-plant-input"
                          value={editForm.name}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                          placeholder="Plant name"
                          disabled={submitting}
                        />
                        <input
                          className="homeowner-plant-input"
                          value={editForm.species}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, species: e.target.value }))}
                          placeholder="Species"
                          disabled={submitting}
                        />
                        <select
                          className="homeowner-plant-input"
                          value={editForm.room_or_bed}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, room_or_bed: e.target.value }))}
                          disabled={submitting}
                        >
                          <option value="">Indoor/Outdoor (optional)</option>
                          {LOCATION_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <>
                        <h3 className="tree-card-title homeowner-plant-title">{plant.name}</h3>
                        <p className="tree-card-meta homeowner-plant-id">ID: {plant.id}</p>
                        <p className="tree-card-location">Species: {plant.species || 'Not set'}</p>
                        <p className="tree-card-location">Indoor / Outdoor: {getLocationLabel(plant.room_or_bed)}</p>
                        <p className={`tree-card-location homeowner-hazard-line ${hasHazard ? 'homeowner-hazard-line-danger' : ''}`}>
                          Hazards Detected: {hasHazard ? 'Y' : 'N'}
                        </p>
                      </>
                    )}
                  </div>

                  <div className="tree-card-actions homeowner-plant-actions" onClick={(e) => e.stopPropagation()}>
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void saveEdit(plant.id);
                          }}
                          disabled={submitting}
                          className="btn btn-sm btn-secondary"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            cancelEdit();
                          }}
                          disabled={submitting}
                          className="btn btn-sm btn-secondary"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          startEdit(plant);
                        }}
                        disabled={submitting || isLocked}
                        className="btn btn-sm btn-secondary"
                      >
                        Edit
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void deletePlant(plant.id);
                      }}
                      disabled={submitting || isLocked}
                      className="btn btn-sm btn-danger"
                    >
                      Delete Plant
                    </button>

                    <label
                      className="btn btn-sm btn-secondary homeowner-upload-label"
                      onClick={(event) => event.stopPropagation()}
                      onTouchStart={(event) => event.stopPropagation()}
                    >
                      {uploadingId === plant.id ? 'Uploading...' : 'Add Photo'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingId === plant.id || photos.length >= 5 || isLocked}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          void uploadPhoto(plant.id, file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>

                  {photos.length > 0 && (
                    <div className="homeowner-thumb-grid" onClick={(e) => e.stopPropagation()}>
                      {photos.map((url, index) => {
                        const actionKey = `${plant.id}-${index}`;
                        const photoBusy = photoActionKey === actionKey;

                        return (
                          <div key={`${url}-${index}`} className="homeowner-thumb-card">
                            <a href={url} target="_blank" rel="noreferrer" className="homeowner-thumb-link">
                              <img src={url} alt={plant.name} className="homeowner-thumb-image" />
                            </a>
                            <div className="homeowner-thumb-actions">
                              <label className="homeowner-thumb-button">
                                Replace
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  disabled={photoBusy || Boolean(uploadingId) || submitting || isLocked}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    void replacePhoto(plant.id, index, file);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  void deletePhoto(plant.id, index);
                                }}
                                  disabled={photoBusy || Boolean(uploadingId) || submitting || isLocked}
                                className="homeowner-thumb-button homeowner-thumb-button-danger"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
