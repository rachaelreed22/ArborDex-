import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchDemoGardenPlants,
  fileToDataUrl,
  readDemoGardenLayoutSession,
  saveDemoGardenLayoutSession,
  saveDemoGardenPlants,
} from '../utils/demoGardenStore';
import OnboardingTopNav from '../components/OnboardingTopNav';
import { saveOnboardingDraftSnapshot } from '../utils/sessionGardenMigration';
import { apiUrl } from '../utils/apiUrl';
import './HomeownerTheme.css';
import './HomeownerPlants.css';
import './HomeownerDemoGarden.css';

const ONBOARDING_KEY = 'arbordex-demo-onboarding-v1';
const ASK_DRAFT_KEY = 'arbordex-demo-ask-draft-v1';
const UNSAVED_DIAG_REQUEST_KEY = 'arbordex-demo-unsaved-diagnostics-request-v1';

const EMPTY_PLANT = {
  name: '',
  species: '',
  room_or_bed: '',
  row_section_id: '',
};

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
}

function createAskMessage({ role, text, photos = [], diagnostics = null, sourceQuestion = '', photoDataUrls = [] }) {
  return {
    id: createId('ask'),
    role,
    text,
    photos,
    diagnostics,
    sourceQuestion,
    photoDataUrls,
    created_at: new Date().toISOString(),
  };
}

function buildSessionSummary(gardenName, plants) {
  const safePlants = Array.isArray(plants) ? plants : [];
  const species = new Set();
  const locations = new Set();
  let photos = 0;
  let journals = 0;

  safePlants.forEach((plant) => {
    const nextSpecies = (plant?.species || '').toString().trim();
    if (nextSpecies) species.add(nextSpecies);

    const nextLocation = (plant?.row_section_id || plant?.room_or_bed || '').toString().trim();
    if (nextLocation) locations.add(nextLocation);

    const plantPhotos = Array.isArray(plant?.photos) ? plant.photos : [];
    photos += plantPhotos.length;

    const entries = Array.isArray(plant?.journal_entries) ? plant.journal_entries : [];
    journals += entries.length;
  });

  return {
    headline: `${gardenName}: ${safePlants.length} plant profile${safePlants.length === 1 ? '' : 's'} tracked`,
    plant_count: safePlants.length,
    species_count: species.size,
    location_count: locations.size,
    photo_count: photos,
    journal_entry_count: journals,
  };
}

export default function HomeownerPlayFirstGarden() {
  const navigate = useNavigate();
  const [started, setStarted] = useState(false);
  const [gardenNameInput, setGardenNameInput] = useState('');
  const [gardenName, setGardenName] = useState('');
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [createPlant, setCreatePlant] = useState(EMPTY_PLANT);

  const [layoutImage, setLayoutImage] = useState('');
  const [layoutNotes, setLayoutNotes] = useState('');

  const [askQuestion, setAskQuestion] = useState('');
  const [askPhotos, setAskPhotos] = useState([]);
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState('');
  const [askMessages, setAskMessages] = useState([
    createAskMessage({
      role: 'assistant',
      text: 'Upload or take a plant photo, ask ArborAI, then use Get Full Diagnostics to open the full unsaved diagnostics report.',
    }),
  ]);

  const [diagnoseMode, setDiagnoseMode] = useState('new');
  const [diagnoseExistingPlantId, setDiagnoseExistingPlantId] = useState('');
  const [diagnoseNewName, setDiagnoseNewName] = useState('');
  const [diagnoseNewSpecies, setDiagnoseNewSpecies] = useState('');
  const [diagnoseNewLocation, setDiagnoseNewLocation] = useState('indoor');
  const [diagnoseNotice, setDiagnoseNotice] = useState('');
  const [diagnoseBusy, setDiagnoseBusy] = useState(false);

  const summary = useMemo(() => buildSessionSummary(gardenName || 'My Garden', plants), [gardenName, plants]);

  useEffect(() => {
    const onboardingRaw = window.sessionStorage.getItem(ONBOARDING_KEY);
    if (onboardingRaw) {
      try {
        const parsed = JSON.parse(onboardingRaw);
        const name = (parsed?.garden_name || '').toString().trim();
        if (name) {
          setGardenName(name);
          setGardenNameInput(name);
          setStarted(true);
        }
      } catch {
        // ignore parse errors
      }
    }

    const layout = readDemoGardenLayoutSession();
    if (layout?.image_url) setLayoutImage((layout.image_url || '').toString());
    if (layout?.notes) setLayoutNotes((layout.notes || '').toString());

    let active = true;
    fetchDemoGardenPlants()
      .then((rows) => {
        if (active) setPlants(rows);
      })
      .catch(() => {
        if (active) setError('Could not load temporary garden session.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!started || !gardenName) return;
    window.sessionStorage.setItem(ONBOARDING_KEY, JSON.stringify({ garden_name: gardenName, started_at: Date.now() }));
  }, [started, gardenName]);

  useEffect(() => {
    const raw = window.sessionStorage.getItem(ASK_DRAFT_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const draft = (parsed?.question || '').toString();
      if (draft) {
        setAskQuestion(draft);
      }
    } catch {
      // ignore invalid draft payloads
    }
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem(ASK_DRAFT_KEY, JSON.stringify({ question: askQuestion }));
  }, [askQuestion]);

  async function persistPlants(nextPlants) {
    setSaving(true);
    try {
      const saved = await saveDemoGardenPlants(nextPlants);
      setPlants(saved);
      return saved;
    } catch (err) {
      setError(err?.message || 'Could not save this session update.');
      throw err;
    } finally {
      setSaving(false);
    }
  }

  function startGarden() {
    const nextName = gardenNameInput.trim();
    if (!nextName) {
      setError('Please enter a garden name.');
      return;
    }
    setGardenName(nextName);
    setStarted(true);
  }

  async function addPlant(e) {
    e.preventDefault();
    const name = createPlant.name.trim();
    if (!name) {
      setError('Plant name is required.');
      return;
    }

    const nextPlant = {
      id: createId('demo-plant'),
      name,
      species: createPlant.species.trim(),
      room_or_bed: createPlant.room_or_bed,
      bed_number: null,
      row_section_id: createPlant.row_section_id.trim(),
      notes: '',
      photos: [],
      last_diagnostics: null,
      journal_entries: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await persistPlants([nextPlant, ...plants]);
    setCreatePlant(EMPTY_PLANT);
  }

  async function uploadPlantPhoto(plantId, file) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    await persistPlants(
      plants.map((plant) => {
        if (plant.id !== plantId) return plant;
        const photos = Array.isArray(plant.photos) ? [...plant.photos] : [];
        if (photos.length >= 5) return plant;
        photos.push(dataUrl);
        return { ...plant, photos, updated_at: new Date().toISOString() };
      })
    );
  }

  async function uploadLayout(file) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setLayoutImage(dataUrl);
    saveDemoGardenLayoutSession({ image_url: dataUrl, notes: layoutNotes, updated_at: new Date().toISOString() });
  }

  function saveLayoutNotes() {
    saveDemoGardenLayoutSession({ image_url: layoutImage, notes: layoutNotes, updated_at: new Date().toISOString() });
  }

  async function runDiagnosis(e) {
    e.preventDefault();
    setDiagnoseNotice('');

    const fileInput = document.getElementById('onboarding-diagnose-file');
    const file = fileInput?.files?.[0];
    if (!file) {
      setDiagnoseNotice('Please upload or take a plant photo first.');
      return;
    }

    setDiagnoseBusy(true);
    setError('');

    try {
      const photoDataUrl = await fileToDataUrl(file);

      if (diagnoseMode === 'existing') {
        if (!diagnoseExistingPlantId) {
          setDiagnoseNotice('Select a plant profile first.');
          return;
        }

        const targetPlant = plants.find((plant) => plant.id === diagnoseExistingPlantId);
        if (!targetPlant?.id) {
          setDiagnoseNotice('That plant profile is no longer available. Select another plant.');
          return;
        }

        await persistPlants(
          plants.map((plant) => {
            if (plant.id !== targetPlant.id) return plant;
            const photos = Array.isArray(plant.photos) ? [...plant.photos] : [];
            if (photos.length < 5) photos.push(photoDataUrl);
            return {
              ...plant,
              photos,
              updated_at: new Date().toISOString(),
            };
          })
        );

        navigate(`/homeowners/demo-garden/plants/${encodeURIComponent(targetPlant.id)}#latest-diagnostics`);
        return;
      }

      const nextName = diagnoseNewName.trim();
      if (!nextName) {
        setDiagnoseNotice('Enter a new plant name before running diagnostics.');
        return;
      }

      const nextPlant = {
        id: createId('demo-plant'),
        name: nextName,
        species: diagnoseNewSpecies.trim(),
        room_or_bed: diagnoseNewLocation,
        bed_number: null,
        row_section_id: '',
        notes: '',
        photos: [photoDataUrl],
        last_diagnostics: null,
        journal_entries: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const savedPlants = await persistPlants([nextPlant, ...plants]);
      const createdPlant = savedPlants.find((plant) => plant.id === nextPlant.id) || nextPlant;

      setDiagnoseExistingPlantId(createdPlant.id);
      setDiagnoseMode('existing');
      setDiagnoseNewName('');
      setDiagnoseNewSpecies('');

      navigate(`/homeowners/demo-garden/plants/${encodeURIComponent(createdPlant.id)}#latest-diagnostics`);
    } catch (err) {
      setError(err?.message || 'Could not open diagnostics page.');
    } finally {
      setDiagnoseBusy(false);
    }
  }

  function removeAskPhoto(index) {
    setAskPhotos((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }

  function onAskFilesSelected(event) {
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'));
    if (!files.length) return;
    setAskPhotos((prev) => [...prev, ...files]);
    event.target.value = '';
  }

  async function sendAskMessage(e) {
    e.preventDefault();
    const nextQuestion = askQuestion.trim();
    if (!nextQuestion && askPhotos.length === 0) return;
    if (askLoading) return;

    setAskError('');
    setAskLoading(true);

    const localPhotoUrls = askPhotos.map((file) => URL.createObjectURL(file));
    setAskMessages((prev) => [
      ...prev,
      createAskMessage({
        role: 'user',
        text: nextQuestion || 'Analyze these plant photos',
        photos: localPhotoUrls,
      }),
    ]);

    try {
      const formData = new FormData();
      formData.append('question', nextQuestion || 'Please analyze these plant photos.');
      askPhotos.forEach((file) => formData.append('photos', file));

      const response = await fetch(apiUrl('/api/ai/ask-arborai'), {
        method: 'POST',
        body: formData,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to get ArborAI response');
      }

      const photoDataUrls = [];
      for (const file of askPhotos) {
        // Keep the source payload available if the page refreshes before full diagnostics completes.
        const dataUrl = await fileToDataUrl(file);
        photoDataUrls.push(dataUrl);
      }

      const diagnostics = {
        species: (data.species || 'Unknown').toString(),
        confidence: (data.confidence || 'Unknown').toString(),
        summary: (data.summary || data.raw_ai_message || 'No summary returned.').toString(),
      };

      setAskMessages((prev) => [
        ...prev,
        createAskMessage({
          role: 'assistant',
          text: (data.raw_ai_message || diagnostics.summary).toString(),
          diagnostics,
          sourceQuestion: nextQuestion,
          photoDataUrls,
        }),
      ]);

      setAskQuestion('');
      window.sessionStorage.removeItem(ASK_DRAFT_KEY);
      setAskPhotos([]);
    } catch (err) {
      setAskError(err?.message || 'Could not reach ArborAI right now.');
      setAskMessages((prev) => [
        ...prev,
        createAskMessage({
          role: 'assistant',
          text: `I could not complete that request yet: ${err?.message || 'Unknown error'}`,
        }),
      ]);
    } finally {
      setAskLoading(false);
    }
  }

  function openFullDiagnosticsFromAsk(message) {
    const photoDataUrls = Array.isArray(message?.photoDataUrls) ? message.photoDataUrls.filter(Boolean) : [];
    if (photoDataUrls.length === 0) {
      setAskError('At least one photo is required before full diagnostics can run.');
      return;
    }

    window.sessionStorage.setItem(
      UNSAVED_DIAG_REQUEST_KEY,
      JSON.stringify({
        garden_name: gardenName || 'My Garden',
        question: (message?.sourceQuestion || '').toString(),
        photos: photoDataUrls,
        created_at: new Date().toISOString(),
      })
    );

    navigate('/homeowners/demo-garden/unsaved-diagnostics');
  }

  if (loading) {
    return <main className="homeowner-shell min-h-screen px-4 py-8"><p className="homeowner-subtext">Loading temporary garden...</p></main>;
  }

  return (
    <main className="homeowner-shell homeowner-demo-page min-h-screen px-4 py-8 md:py-10">
      <div className="homeowner-surface mx-auto w-full max-w-6xl rounded-2xl p-6 md:p-8 shadow-2xl">
        <OnboardingTopNav showSave />

        {!started ? (
          <section className="homeowner-panel homeowner-panel-info mt-3">
            <h1 className="homeowner-heading text-3xl font-bold">What would you like to call your garden?</h1>
            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
              <input
                className="homeowner-input rounded-md px-3 py-2 text-sm md:min-w-[340px]"
                placeholder="Example: Grandma's Garden"
                value={gardenNameInput}
                onChange={(e) => setGardenNameInput(e.target.value)}
              />
              <button type="button" className="homeowner-button-primary rounded-md px-4 py-2 text-sm font-semibold" onClick={startGarden}>
                Continue
              </button>
            </div>
          </section>
        ) : (
          <>
            <section className="homeowner-panel homeowner-panel-info mt-3">
              <h1 className="homeowner-heading text-3xl font-bold">🌿 Welcome to "{gardenName}"</h1>
              <p className="homeowner-subtext mt-1 text-sm">Choose where you'd like to begin.</p>
              <div className="onboarding-action-grid mt-3">
                <a className="onboarding-action-card onboarding-action-link" href="#ask-arborai"><strong>📸 Ask ArborAI</strong><span>Upload a photo and ask a plant question to begin diagnostics.</span></a>
                <a className="onboarding-action-card onboarding-action-link" href="#build-garden-beds"><strong>🛏️ Build My Garden Beds</strong><span>Give ArborAI a picture of your space so it understands where your plants live and how they relate to each other.</span></a>
                <a className="onboarding-action-card onboarding-action-link" href="#add-my-plants"><strong>🌱 Add My Plants</strong><span>Start tracking what you're growing.</span></a>
                <a className="onboarding-action-card onboarding-action-link" href="#diagnose-a-plant"><strong>📷 Diagnose a Plant</strong><span>Upload a photo and receive AI-powered plant guidance.</span></a>
              </div>
              <p className="homeowner-subtext mt-3 text-sm">Progress: {summary.plant_count} plants, {summary.photo_count} photos, {summary.journal_entry_count} journal entries.</p>
            </section>

            <section id="ask-arborai" className="homeowner-panel homeowner-panel-info mt-4">
              <h2 className="homeowner-heading text-xl font-bold">📸 Ask ArborAI</h2>
              <p className="homeowner-subtext mt-1 text-sm">Ask a plant question with at least one photo, then open a full unsaved diagnostics report.</p>

              <div className="companion-chat companion-chat-focus mt-3">
                <div className="companion-chat-messages" role="log" aria-live="polite">
                  {askMessages.map((message) => (
                    <article key={message.id} className={`companion-message ${message.role === 'assistant' ? 'companion-message-assistant' : 'companion-message-user'}`}>
                      <p className="companion-message-role">{message.role === 'assistant' ? 'ArborAI' : 'You'}</p>
                      <p className="companion-message-text">{message.text}</p>
                      {Array.isArray(message.photos) && message.photos.length > 0 && (
                        <div className="ask-photo-row" style={{ marginTop: '0.55rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          {message.photos.map((photo, photoIndex) => (
                            <img key={`${message.id}-photo-${photoIndex}`} src={photo} alt="Plant upload" style={{ width: '86px', height: '86px', objectFit: 'cover', borderRadius: '8px' }} />
                          ))}
                        </div>
                      )}
                      {message.role === 'assistant' && Array.isArray(message.photoDataUrls) && message.photoDataUrls.length > 0 && (
                        <div className="mt-2">
                          <button
                            type="button"
                            className="homeowner-button-secondary rounded-md px-3 py-2 text-sm font-semibold"
                            onClick={() => openFullDiagnosticsFromAsk(message)}
                          >
                            Get Full Diagnostics
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>

                <form className="companion-chat-form" onSubmit={sendAskMessage}>
                  {askError && <p className="homeowner-alert homeowner-alert-error">{askError}</p>}

                  {askPhotos.length > 0 && (
                    <div className="ask-photo-row" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                      {askPhotos.map((file, index) => (
                        <button
                          key={`${file.name}-${index}`}
                          type="button"
                          className="homeowner-button-secondary rounded-md px-2 py-1 text-xs"
                          onClick={() => removeAskPhoto(index)}
                        >
                          Remove {file.name.slice(0, 18)}
                        </button>
                      ))}
                    </div>
                  )}

                  <textarea
                    className="homeowner-input companion-chat-input"
                    rows={3}
                    value={askQuestion}
                    onChange={(e) => setAskQuestion(e.target.value)}
                    placeholder="Describe what you're seeing and ask ArborAI..."
                    disabled={askLoading}
                  />
                  <div className="companion-chat-actions" style={{ justifyContent: 'space-between' }}>
                    <div className="flex gap-2">
                      <label className="homeowner-button-secondary rounded-md px-3 py-2 text-sm font-semibold" style={{ cursor: 'pointer' }}>
                        Take Photo
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onAskFilesSelected} />
                      </label>
                      <label className="homeowner-button-secondary rounded-md px-3 py-2 text-sm font-semibold" style={{ cursor: 'pointer' }}>
                        Upload Photo
                        <input type="file" accept="image/*" multiple className="hidden" onChange={onAskFilesSelected} />
                      </label>
                    </div>
                    <button type="submit" className="homeowner-button-primary rounded-md px-4 py-2 text-sm font-semibold" disabled={askLoading}>
                      {askLoading ? 'Sending...' : 'Enter'}
                    </button>
                  </div>
                </form>
              </div>
            </section>

            <section id="build-garden-beds" className="homeowner-panel homeowner-panel-info mt-4">
              <h2 className="homeowner-heading text-xl font-bold">🛏️ Build My Garden Beds</h2>
              <p className="homeowner-subtext mt-1 text-sm">Give ArborAI a picture of your space — a photo, hand-drawn map, or diagram — so it can understand where your plants live and how they relate to each other.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <input type="file" accept="image/*" className="homeowner-input rounded-md px-3 py-2 text-sm" onChange={(e) => void uploadLayout(e.target.files?.[0])} />
                <input className="homeowner-input rounded-md px-3 py-2 text-sm" placeholder="Layout notes (zones, sunlight, watering areas)" value={layoutNotes} onChange={(e) => setLayoutNotes(e.target.value)} onBlur={saveLayoutNotes} />
              </div>
              {layoutImage && <img src={layoutImage} alt="Garden layout" className="mt-3 companion-layout-image" />}
            </section>

            <section id="add-my-plants" className="homeowner-stat-card mt-5 rounded-xl p-4">
              <h2 className="text-lg font-bold text-[#1d411d]">🌱 Add My Plants</h2>
              <form className="mt-3 grid gap-3 md:grid-cols-4" onSubmit={addPlant}>
                <input className="homeowner-input rounded-md px-3 py-2 text-sm" placeholder="Plant name *" value={createPlant.name} onChange={(e) => setCreatePlant((prev) => ({ ...prev, name: e.target.value }))} />
                <input className="homeowner-input rounded-md px-3 py-2 text-sm" placeholder="Species" value={createPlant.species} onChange={(e) => setCreatePlant((prev) => ({ ...prev, species: e.target.value }))} />
                <select className="homeowner-input rounded-md px-3 py-2 text-sm" value={createPlant.room_or_bed} onChange={(e) => setCreatePlant((prev) => ({ ...prev, room_or_bed: e.target.value }))}>
                  <option value="">Indoor / Outdoor</option>
                  <option value="indoor">Indoor</option>
                  <option value="outdoor">Outdoor</option>
                </select>
                <button type="submit" className="homeowner-button-primary rounded-md px-4 py-2 text-sm font-semibold">Add Plant</button>
              </form>

              <div className="tree-grid homeowner-plant-grid mt-4">
                {plants.map((plant) => (
                  <article key={plant.id} className="tree-card homeowner-plant-card">
                    <div className="tree-card-photo-wrapper homeowner-plant-main-photo">
                      {plant.photos?.[0] ? <img src={plant.photos[0]} alt={plant.name} className="tree-card-photo" /> : <div className="tree-card-no-photo">No Photo</div>}
                    </div>
                    <div className="tree-card-info homeowner-plant-info">
                      <h3 className="tree-card-title homeowner-plant-title">{plant.name}</h3>
                      <p className="tree-card-location">{plant.species || 'Species not set'}</p>
                    </div>
                    <div className="tree-card-actions homeowner-plant-actions">
                      <label className="btn btn-sm btn-secondary homeowner-upload-label">
                        Add Photo
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => void uploadPlantPhoto(plant.id, e.target.files?.[0])} />
                      </label>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section id="diagnose-a-plant" className="homeowner-panel homeowner-panel-info mt-4">
              <h2 className="homeowner-heading text-xl font-bold">📷 Diagnose a Plant</h2>
              <form className="mt-3 space-y-3" onSubmit={runDiagnosis}>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`${diagnoseMode === 'new' ? 'homeowner-button-primary' : 'homeowner-button-secondary'} rounded-md px-3 py-2 text-sm font-semibold`}
                    onClick={() => setDiagnoseMode('new')}
                  >
                    New Plant
                  </button>
                  <button
                    type="button"
                    className={`${diagnoseMode === 'existing' ? 'homeowner-button-primary' : 'homeowner-button-secondary'} rounded-md px-3 py-2 text-sm font-semibold`}
                    onClick={() => setDiagnoseMode('existing')}
                  >
                    Existing Plant
                  </button>
                </div>

                {diagnoseMode === 'existing' ? (
                  <select className="homeowner-input rounded-md px-3 py-2 text-sm md:max-w-[460px]" value={diagnoseExistingPlantId} onChange={(e) => setDiagnoseExistingPlantId(e.target.value)}>
                    <option value="">Select plant profile</option>
                    {plants.map((plant) => <option key={plant.id} value={plant.id}>{plant.name}</option>)}
                  </select>
                ) : (
                  <div className="grid gap-3 md:grid-cols-3">
                    <input
                      className="homeowner-input rounded-md px-3 py-2 text-sm"
                      placeholder="New plant name *"
                      value={diagnoseNewName}
                      onChange={(e) => setDiagnoseNewName(e.target.value)}
                    />
                    <input
                      className="homeowner-input rounded-md px-3 py-2 text-sm"
                      placeholder="Species (optional)"
                      value={diagnoseNewSpecies}
                      onChange={(e) => setDiagnoseNewSpecies(e.target.value)}
                    />
                    <select
                      className="homeowner-input rounded-md px-3 py-2 text-sm"
                      value={diagnoseNewLocation}
                      onChange={(e) => setDiagnoseNewLocation(e.target.value)}
                    >
                      <option value="indoor">Indoor</option>
                      <option value="outdoor">Outdoor</option>
                    </select>
                  </div>
                )}

                <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                  <input id="onboarding-diagnose-file" type="file" accept="image/*" capture="environment" className="homeowner-input rounded-md px-3 py-2 text-sm" />
                  <button type="submit" className="homeowner-button-secondary rounded-md px-4 py-2 text-sm font-semibold" disabled={diagnoseBusy}>{diagnoseBusy ? 'Opening...' : 'Run Diagnosis'}</button>
                </div>
              </form>
              {diagnoseNotice && <p className="homeowner-subtext mt-2 text-sm">{diagnoseNotice}</p>}
            </section>

            <div className="mt-5 flex gap-2">
              <button type="button" className="homeowner-button-primary rounded-md px-4 py-2 text-sm font-semibold" onClick={() => { saveOnboardingDraftSnapshot(); window.location.href = '/homeowners/signup'; }}>
                Save Your Garden
              </button>
            </div>
          </>
        )}

        {saving && <p className="homeowner-subtext mt-3 text-sm">Saving this temporary session...</p>}
        {error && <p className="homeowner-alert homeowner-alert-error mt-3">{error}</p>}
      </div>
    </main>
  );
}
