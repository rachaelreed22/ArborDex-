import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchDemoGardenPlants, fileToDataUrl, getCachedDemoGardenPlants, saveDemoGardenPlants } from '../utils/demoGardenStore';
import { clearDemoQueensPass, getDemoQueensPassToken, isDemoQueensPassUnlocked, verifyDemoQueensPass } from '../utils/demoQueensPass';
import './HomeownerTheme.css';
import './TreeList.css';
import './HomeownerPlants.css';
import './HomeownerDemoGarden.css';

const EMPTY_FORM = {
  name: '',
  species: '',
  room_or_bed: '',
  bed_number: '',
  row_section_id: '',
  notes: '',
};

function getLocationLabel(value) {
  if (value === 'indoor') return 'Indoor';
  if (value === 'outdoor') return 'Outdoor';
  return 'Not set';
}

function isQueensPassAuthError(message) {
  const text = (message || '').toString().toLowerCase();
  return text.includes('queen\'s pass authorization is required')
    || text.includes('queen\'s pass is required')
    || text.includes('unauthorized');
}

export default function HomeownerDemoGarden() {
  const navigate = useNavigate();
  const [plants, setPlants] = useState([]);
  const [passError, setPassError] = useState('');
  const [passLoading, setPassLoading] = useState(false);
  const [showPassGate, setShowPassGate] = useState(false);
  const pendingActionRef = useRef(null);
  const [queenPassForm, setQueenPassForm] = useState({
    email: 'rachaelr@rrtech.dev',
    pass_id: '',
  });
  const [editingId, setEditingId] = useState('');
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadPlants() {
      try {
        const initial = await fetchDemoGardenPlants();
        if (active) {
          setPlants(initial);
        }
      } catch (err) {
        if (active) {
          setError(err.message || 'Could not load the shared demo garden.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadPlants();

    return () => {
      active = false;
    };
  }, []);

  async function persistPlants(updater) {
    setSaving(true);
    setError('');

    try {
      const nextPlants = typeof updater === 'function' ? updater(getCachedDemoGardenPlants()) : updater;
      const savedPlants = await saveDemoGardenPlants(nextPlants, getDemoQueensPassToken());
      setPlants(savedPlants);
      return savedPlants;
    } catch (err) {
      if (isQueensPassAuthError(err?.message)) {
        clearDemoQueensPass();
        setPassError("Please verify Queen's Pass to continue editing.");
        setShowPassGate(true);
      }
      setError(err.message || 'Could not save shared demo garden changes.');
      throw err;
    } finally {
      setSaving(false);
    }
  }

  function withPassGate(action) {
    if (isDemoQueensPassUnlocked()) {
      void Promise.resolve(action());
      return;
    }

    setPassError('');
    pendingActionRef.current = action;
    setShowPassGate(true);
  }

  async function verifyQueensPass() {
    try {
      setPassLoading(true);
      setPassError('');

      await verifyDemoQueensPass(queenPassForm.email, queenPassForm.pass_id);

      setShowPassGate(false);
      if (typeof pendingActionRef.current === 'function') {
        const action = pendingActionRef.current;
        pendingActionRef.current = null;
        void Promise.resolve(action());
      }
    } catch (err) {
      setPassError(err.message || "Queen's Pass verification failed.");
    } finally {
      setPassLoading(false);
    }
  }

  function startEdit(plant) {
    withPassGate(() => {
      setEditingId(plant.id);
      setEditForm({
        name: plant.name || '',
        species: plant.species || '',
        room_or_bed: plant.room_or_bed || '',
        bed_number: plant.bed_number ?? '',
        row_section_id: plant.row_section_id || '',
        notes: plant.notes || '',
      });
    });
  }

  function cancelEdit() {
    setEditingId('');
    setEditForm(EMPTY_FORM);
  }

  function saveEdit(plantId) {
    withPassGate(async () => {
      await persistPlants((prev) => prev.map((plant) => {
        if (plant.id !== plantId) return plant;
        return {
          ...plant,
          name: editForm.name.trim() || plant.name,
          species: editForm.species.trim(),
          room_or_bed: (editForm.room_or_bed || '').trim(),
          bed_number: editForm.bed_number === '' ? null : Number.parseInt(editForm.bed_number, 10),
          row_section_id: (editForm.row_section_id || '').toUpperCase().trim(),
          notes: editForm.notes || '',
          updated_at: new Date().toISOString(),
        };
      }));
      setEditingId('');
      setEditForm(EMPTY_FORM);
    });
  }

  function createPlant(e) {
    e.preventDefault();
    if (!createForm.name.trim()) {
      setError('Plant name is required.');
      return;
    }

    withPassGate(async () => {
      const nextPlant = {
        id: `demo-plant-${Math.random().toString(36).slice(2, 10)}`,
        name: createForm.name.trim(),
        species: createForm.species.trim(),
        room_or_bed: (createForm.room_or_bed || '').trim(),
        bed_number: createForm.bed_number === '' ? null : Number.parseInt(createForm.bed_number, 10),
        row_section_id: (createForm.row_section_id || '').toUpperCase().trim(),
        notes: createForm.notes || '',
        photos: [],
        last_diagnostics: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await persistPlants((prev) => [nextPlant, ...prev]);
      setCreateForm(EMPTY_FORM);
    });
  }

  function deletePlant(plantId) {
    withPassGate(async () => {
      const confirmed = window.confirm('Delete this demo plant profile?');
      if (!confirmed) return;
      await persistPlants((prev) => prev.filter((plant) => plant.id !== plantId));
    });
  }

  async function uploadPhoto(plantId, file) {
    if (!file) return;
    withPassGate(async () => {
      try {
        const dataUrl = await fileToDataUrl(file);
        await persistPlants((prev) => prev.map((plant) => {
          if (plant.id !== plantId) return plant;
          const photos = Array.isArray(plant.photos) ? plant.photos : [];
          if (photos.length >= 5) return plant;
          return { ...plant, photos: [...photos, dataUrl], updated_at: new Date().toISOString() };
        }));
      } catch {
        setError('Could not add photo to this demo plant.');
      }
    });
  }

  async function replacePhoto(plantId, photoIndex, file) {
    if (!file) return;
    withPassGate(async () => {
      try {
        const dataUrl = await fileToDataUrl(file);
        await persistPlants((prev) => prev.map((plant) => {
          if (plant.id !== plantId) return plant;
          const photos = Array.isArray(plant.photos) ? [...plant.photos] : [];
          if (photoIndex < 0 || photoIndex >= photos.length) return plant;
          photos[photoIndex] = dataUrl;
          return { ...plant, photos, updated_at: new Date().toISOString() };
        }));
      } catch {
        setError('Could not replace photo in this demo plant.');
      }
    });
  }

  function deletePhoto(plantId, photoIndex) {
    withPassGate(async () => {
      await persistPlants((prev) => prev.map((plant) => {
        if (plant.id !== plantId) return plant;
        const photos = Array.isArray(plant.photos) ? plant.photos.filter((_, index) => index !== photoIndex) : [];
        return { ...plant, photos, updated_at: new Date().toISOString() };
      }));
    });
  }

  return (
    <main className="homeowner-shell min-h-screen px-4 py-10">
      <div className="homeowner-surface mx-auto w-full max-w-5xl rounded-2xl p-8 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="homeowner-heading text-3xl font-bold">🌱 Explore a Digital Garden</h1>
            <p className="homeowner-subtext mt-2 text-sm">See how ArborTag helps you remember, organize, and care for every plant in your garden.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => navigate('/')} className="homeowner-button-secondary rounded-md px-4 py-2 text-sm font-semibold">Home</button>
            <button onClick={() => navigate('/homeowners')} className="homeowner-button-secondary rounded-md px-4 py-2 text-sm font-semibold">Back</button>
          </div>
        </div>

        <div className="homeowner-panel homeowner-panel-info mt-6">
          <p className="homeowner-heading text-base font-semibold">Welcome to the ArborTag Demo Garden</p>
          <p className="homeowner-subtext mt-2 text-sm">Browse sample plant profiles to see how you can:</p>
          <ul className="homeowner-subtext mt-2 space-y-1 text-sm">
            <li>✅ Organize plants by location</li>
            <li>✅ Keep photos and notes together</li>
            <li>✅ Track watering, fertilizing, and harvests</li>
            <li>✅ Store plant history in one place</li>
            <li>✅ Build a living record of your garden over time</li>
          </ul>
        </div>

        {error && <p className="homeowner-alert homeowner-alert-error">{error}</p>}
        {loading && <p className="homeowner-subtext mt-4 text-sm">Loading demo garden plants...</p>}
        {!loading && saving && <p className="homeowner-subtext mt-4 text-sm">Saving shared demo garden changes...</p>}

        <form onSubmit={createPlant} className="homeowner-stat-card mt-6 rounded-xl p-4">
          <h2 className="text-lg font-bold text-[#1d411d]">Create a Sample Plant</h2>
          <p className="homeowner-subtext mt-1 text-sm">See how easy it is to build a digital profile for a plant in your garden.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <input className="homeowner-input rounded-md px-3 py-2 text-sm" placeholder="Plant name *" value={createForm.name} onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))} />
            <input className="homeowner-input rounded-md px-3 py-2 text-sm" placeholder="Species" value={createForm.species} onChange={(e) => setCreateForm((prev) => ({ ...prev, species: e.target.value }))} />
            <select className="homeowner-input rounded-md px-3 py-2 text-sm" value={createForm.room_or_bed} onChange={(e) => setCreateForm((prev) => ({ ...prev, room_or_bed: e.target.value }))}>
              <option value="">Indoor/Outdoor</option>
              <option value="indoor">Indoor</option>
              <option value="outdoor">Outdoor</option>
            </select>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="submit" className="homeowner-button-primary rounded-md px-4 py-2 text-sm font-semibold">Create Demo Profile</button>
          </div>
        </form>

        <div className="mt-6">
          <div className="tree-grid homeowner-plant-grid">
            {plants.map((plant) => {
              const photos = Array.isArray(plant.photos) ? plant.photos : [];
              const mainPhoto = photos[0] || null;
              const isEditing = editingId === plant.id;

              return (
                <article
                  key={plant.id}
                  className="tree-card homeowner-plant-card"
                  onClick={(event) => {
                    const target = event.target;
                    if (target instanceof Element && target.closest('button, input, select, label, a, textarea')) {
                      return;
                    }
                    if (!isEditing) {
                      navigate(`/homeowners/demo-garden/plants/${plant.id}`);
                    }
                  }}
                >
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
                        <input className="homeowner-plant-input" value={editForm.name} onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Plant name" />
                        <input className="homeowner-plant-input" value={editForm.species} onChange={(e) => setEditForm((prev) => ({ ...prev, species: e.target.value }))} placeholder="Species" />
                        <select className="homeowner-plant-input" value={editForm.room_or_bed} onChange={(e) => setEditForm((prev) => ({ ...prev, room_or_bed: e.target.value }))}>
                          <option value="">Indoor/Outdoor</option>
                          <option value="indoor">Indoor</option>
                          <option value="outdoor">Outdoor</option>
                        </select>
                      </div>
                    ) : (
                      <>
                        <h3 className="tree-card-title homeowner-plant-title">{plant.name}</h3>
                        <p className="tree-card-meta homeowner-plant-id">Demo ID: {plant.id}</p>
                        <p className="tree-card-location">Species: {plant.species || 'Not set'}</p>
                        <p className="tree-card-location">Indoor / Outdoor: {getLocationLabel(plant.room_or_bed)}</p>
                      </>
                    )}
                  </div>

                  <div className="tree-card-actions homeowner-plant-actions" onClick={(e) => e.stopPropagation()}>
                    {isEditing ? (
                      <>
                        <button type="button" onClick={() => saveEdit(plant.id)} className="btn btn-sm btn-secondary">Save</button>
                        <button type="button" onClick={cancelEdit} className="btn btn-sm btn-secondary">Cancel</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => startEdit(plant)} className="btn btn-sm btn-secondary">Edit</button>
                    )}

                    <button type="button" onClick={() => deletePlant(plant.id)} className="btn btn-sm btn-danger">Delete Plant</button>

                    <label className="btn btn-sm btn-secondary homeowner-upload-label">
                      Add Photo
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={photos.length >= 5}
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
                      {photos.map((url, index) => (
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
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  void replacePhoto(plant.id, index, file);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                            <button type="button" onClick={() => deletePhoto(plant.id, index)} className="homeowner-thumb-button homeowner-thumb-button-danger">Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        {showPassGate && (
          <section className="homeowner-panel homeowner-panel-warn mt-6 space-y-3">
            <h2 className="homeowner-heading text-lg font-semibold">Queen&apos;s Pass Required</h2>
            <p className="homeowner-subtext text-sm">Enter the Queen&apos;s Pass email + ID to unlock demo edits.</p>
            <label className="homeowner-heading block text-sm font-semibold">
              Email
              <input
                className="homeowner-input mt-1 w-full rounded-md px-3 py-2 outline-none"
                type="email"
                value={queenPassForm.email}
                onChange={(e) => setQueenPassForm((prev) => ({ ...prev, email: e.target.value }))}
              />
            </label>
            <label className="homeowner-heading block text-sm font-semibold">
              Queen&apos;s Pass ID
              <input
                className="homeowner-input mt-1 w-full rounded-md px-3 py-2 outline-none"
                type="text"
                value={queenPassForm.pass_id}
                onChange={(e) => setQueenPassForm((prev) => ({ ...prev, pass_id: e.target.value }))}
              />
            </label>
            {passError && <p className="homeowner-alert homeowner-alert-error">{passError}</p>}
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                className="homeowner-button-primary rounded-md px-4 py-2 text-sm font-semibold"
                disabled={passLoading}
                onClick={verifyQueensPass}
              >
                {passLoading ? 'Verifying...' : 'Unlock Demo Editing'}
              </button>
              <button
                type="button"
                className="homeowner-button-secondary rounded-md px-4 py-2 text-sm font-semibold"
                onClick={() => {
                  setShowPassGate(false);
                  pendingActionRef.current = null;
                }}
              >
                Close
              </button>
            </div>
          </section>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            className="homeowner-button-secondary rounded-md px-5 py-2.5 text-sm font-semibold"
            onClick={() => navigate('/')}
          >
            Home
          </button>
          <button
            type="button"
            className="homeowner-button-primary rounded-md px-5 py-2.5 text-sm font-semibold"
            onClick={() => navigate('/homeowners/signup')}
          >
            🌿 Start My Garden
          </button>
        </div>
      </div>
    </main>
  );
}
