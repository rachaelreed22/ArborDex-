import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fileToDataUrl, getDemoPlantById, loadDemoGardenPlants, saveDemoGardenPlants } from '../utils/demoGardenStore';
import { isDemoQueensPassUnlocked, verifyDemoQueensPass } from '../utils/demoQueensPass';
import './HomeownerTheme.css';
import './TreeDetail.css';
import './HomeownerPlantDetail.css';

function getLocationLabel(value) {
  if (value === 'indoor') return 'Indoor';
  if (value === 'outdoor') return 'Outdoor';
  return 'Not set';
}

export default function HomeownerDemoPlantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [plant, setPlant] = useState(null);
  const [error, setError] = useState('');
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailForm, setDetailForm] = useState({
    name: '',
    species: '',
    room_or_bed: '',
    bed_number: '',
    row_section_id: '',
    notes: '',
  });
  const [showPassGate, setShowPassGate] = useState(false);
  const [passError, setPassError] = useState('');
  const [passLoading, setPassLoading] = useState(false);
  const [queenPassForm, setQueenPassForm] = useState({ email: 'rachaelr@rrtech.dev', pass_id: '' });
  const pendingActionRef = useRef(null);

  useEffect(() => {
    const nextPlant = getDemoPlantById(id || '');
    if (!nextPlant) {
      setError('Demo plant profile not found.');
      return;
    }
    setPlant(nextPlant);
    setDetailForm({
      name: nextPlant.name || '',
      species: nextPlant.species || '',
      room_or_bed: nextPlant.room_or_bed || '',
      bed_number: nextPlant.bed_number ?? '',
      row_section_id: nextPlant.row_section_id || '',
      notes: nextPlant.notes || '',
    });
  }, [id]);

  function withPassGate(action) {
    if (isDemoQueensPassUnlocked()) {
      action();
      return;
    }

    pendingActionRef.current = action;
    setShowPassGate(true);
  }

  async function handleVerifyPass() {
    try {
      setPassLoading(true);
      setPassError('');
      await verifyDemoQueensPass(queenPassForm.email, queenPassForm.pass_id);
      setShowPassGate(false);
      if (typeof pendingActionRef.current === 'function') {
        const action = pendingActionRef.current;
        pendingActionRef.current = null;
        action();
      }
    } catch (err) {
      setPassError(err.message || "Queen's Pass verification failed.");
    } finally {
      setPassLoading(false);
    }
  }

  function persistPlant(updater) {
    const plants = loadDemoGardenPlants();
    const updatedPlants = plants.map((entry) => (entry.id === id ? updater(entry) : entry));
    saveDemoGardenPlants(updatedPlants);
    const next = updatedPlants.find((entry) => entry.id === id) || null;
    setPlant(next);
    if (next) {
      setDetailForm({
        name: next.name || '',
        species: next.species || '',
        room_or_bed: next.room_or_bed || '',
        bed_number: next.bed_number ?? '',
        row_section_id: next.row_section_id || '',
        notes: next.notes || '',
      });
    }
  }

  function startEditDetails() {
    withPassGate(() => {
      if (!plant) return;
      setDetailForm({
        name: plant.name || '',
        species: plant.species || '',
        room_or_bed: plant.room_or_bed || '',
        bed_number: plant.bed_number ?? '',
        row_section_id: plant.row_section_id || '',
        notes: plant.notes || '',
      });
      setEditingDetails(true);
    });
  }

  function cancelEditDetails() {
    if (!plant) return;
    setEditingDetails(false);
    setDetailForm({
      name: plant.name || '',
      species: plant.species || '',
      room_or_bed: plant.room_or_bed || '',
      bed_number: plant.bed_number ?? '',
      row_section_id: plant.row_section_id || '',
      notes: plant.notes || '',
    });
  }

  function saveDetails() {
    withPassGate(() => {
      persistPlant((entry) => ({
        ...entry,
        name: detailForm.name.trim() || entry.name,
        species: detailForm.species.trim(),
        room_or_bed: (detailForm.room_or_bed || '').trim(),
        bed_number: detailForm.bed_number === '' ? null : Number.parseInt(detailForm.bed_number, 10),
        row_section_id: (detailForm.row_section_id || '').toUpperCase().trim(),
        notes: detailForm.notes || '',
        updated_at: new Date().toISOString(),
      }));
      setEditingDetails(false);
    });
  }

  async function addPhoto(file) {
    if (!file) return;
    withPassGate(async () => {
      const dataUrl = await fileToDataUrl(file);
      persistPlant((entry) => {
        const photos = Array.isArray(entry.photos) ? entry.photos : [];
        if (photos.length >= 5) return entry;
        return { ...entry, photos: [...photos, dataUrl], updated_at: new Date().toISOString() };
      });
    });
  }

  async function replacePhoto(photoIndex, file) {
    if (!file) return;
    withPassGate(async () => {
      const dataUrl = await fileToDataUrl(file);
      persistPlant((entry) => {
        const photos = Array.isArray(entry.photos) ? [...entry.photos] : [];
        if (photoIndex < 0 || photoIndex >= photos.length) return entry;
        photos[photoIndex] = dataUrl;
        return { ...entry, photos, updated_at: new Date().toISOString() };
      });
    });
  }

  function deletePhoto(photoIndex) {
    withPassGate(() => {
      persistPlant((entry) => {
        const photos = Array.isArray(entry.photos) ? entry.photos.filter((_, index) => index !== photoIndex) : [];
        return { ...entry, photos, updated_at: new Date().toISOString() };
      });
    });
  }

  const photos = useMemo(() => (Array.isArray(plant?.photos) ? plant.photos : []), [plant]);
  const mainPhoto = photos[0] || null;

  if (!plant) {
    return (
      <div className="page tree-detail-page">
        <div className="empty-state">
          <div className="icon">🪴</div>
          <p>{error || 'Demo plant profile could not be found.'}</p>
          <button className="btn btn-secondary" onClick={() => navigate('/homeowners/demo-garden')}>
            Back To Demo Garden
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page tree-detail-page homeowner-plant-detail-page">
      <div className="tree-detail-topbar">
        <button className="btn btn-secondary" onClick={() => navigate('/homeowners/demo-garden')}>
          Back to Demo Garden
        </button>
        <div className="topbar-actions">
          {editingDetails ? (
            <>
              <button className="btn btn-primary" onClick={saveDetails}>Save Details</button>
              <button className="btn btn-secondary" onClick={cancelEditDetails}>Cancel</button>
            </>
          ) : (
            <button className="btn btn-secondary" onClick={startEditDetails}>Edit Details</button>
          )}
        </div>
      </div>

      {showPassGate && (
        <section className="card homeowner-panel homeowner-panel-warn mt-3 space-y-3">
          <h2>Queen's Pass Required</h2>
          <p>Enter Queen's Pass credentials to edit this demo profile.</p>
          <label className="homeowner-detail-label">
            Email
            <input className="homeowner-detail-input" type="email" value={queenPassForm.email} onChange={(e) => setQueenPassForm((prev) => ({ ...prev, email: e.target.value }))} />
          </label>
          <label className="homeowner-detail-label">
            Queen's Pass ID
            <input className="homeowner-detail-input" type="text" value={queenPassForm.pass_id} onChange={(e) => setQueenPassForm((prev) => ({ ...prev, pass_id: e.target.value }))} />
          </label>
          {passError && <p className="homeowner-detail-error">{passError}</p>}
          <div className="homeowner-journal-entry-actions">
            <button className="btn btn-primary" onClick={handleVerifyPass} disabled={passLoading}>{passLoading ? 'Verifying...' : 'Unlock Editing'}</button>
            <button className="btn btn-secondary" onClick={() => setShowPassGate(false)}>Close</button>
          </div>
        </section>
      )}

      <div className="tree-detail-layout">
        <div className="tree-detail-main">
          <section className="card section-photos homeowner-detail-hero">
            <div className="section-header-row">
              <div>
                {editingDetails ? (
                  <div className="homeowner-detail-edit-grid">
                    <label className="homeowner-detail-label">
                      Plant Name
                      <input className="homeowner-detail-input" value={detailForm.name} onChange={(e) => setDetailForm((prev) => ({ ...prev, name: e.target.value }))} />
                    </label>
                    <label className="homeowner-detail-label">
                      Species
                      <input className="homeowner-detail-input" value={detailForm.species} onChange={(e) => setDetailForm((prev) => ({ ...prev, species: e.target.value }))} />
                    </label>
                    <label className="homeowner-detail-label">
                      Indoor / Outdoor
                      <select className="homeowner-detail-input" value={detailForm.room_or_bed} onChange={(e) => setDetailForm((prev) => ({ ...prev, room_or_bed: e.target.value }))}>
                        <option value="">Not set</option>
                        <option value="indoor">Indoor</option>
                        <option value="outdoor">Outdoor</option>
                      </select>
                    </label>
                    <label className="homeowner-detail-label">
                      Bed #
                      <input className="homeowner-detail-input" type="number" min="1" max="100" value={detailForm.bed_number} onChange={(e) => setDetailForm((prev) => ({ ...prev, bed_number: e.target.value }))} />
                    </label>
                    <label className="homeowner-detail-label">
                      Row / Section ID
                      <input className="homeowner-detail-input" value={detailForm.row_section_id} onChange={(e) => setDetailForm((prev) => ({ ...prev, row_section_id: e.target.value.toUpperCase() }))} />
                    </label>
                    <label className="homeowner-detail-label">
                      Notes
                      <textarea className="homeowner-detail-input" rows={3} value={detailForm.notes} onChange={(e) => setDetailForm((prev) => ({ ...prev, notes: e.target.value }))} />
                    </label>
                  </div>
                ) : (
                  <>
                    <h1 className="detail-title">{plant.name}</h1>
                    <p className="detail-location">Species: {plant.species || 'Not set'}</p>
                    <p className="detail-location">Indoor / Outdoor: {getLocationLabel(plant.room_or_bed)}</p>
                    <p className="detail-location">Bed #: {plant.bed_number ?? 'Not set'}</p>
                    <p className="detail-location">Row / Section: {plant.row_section_id || 'Not set'}</p>
                    <p className="detail-location">Notes: {plant.notes || 'No notes yet.'}</p>
                    <p className="detail-coords">Demo Plant ID: {plant.id}</p>
                  </>
                )}
              </div>
            </div>

            <div className="main-photo-wrapper">
              {mainPhoto ? (
                <img src={mainPhoto} alt={plant.name} className="main-photo" decoding="async" />
              ) : (
                <div className="detail-no-photo">
                  <span>🪴</span>
                  <p>No photos uploaded yet.</p>
                </div>
              )}
            </div>
          </section>

          <section className="card section-gallery homeowner-plant-photo-gallery">
            <h2>Photo Gallery</h2>
            <label className="btn btn-secondary homeowner-upload-label" style={{ marginTop: '0.5rem', display: 'inline-flex' }}>
              Add Photo
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={photos.length >= 5}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  void addPhoto(file);
                  e.target.value = '';
                }}
              />
            </label>

            {photos.length === 0 ? (
              <p style={{ marginTop: '0.6rem' }}>No photos uploaded for this plant yet.</p>
            ) : (
              <div className="homeowner-detail-photo-grid" style={{ marginTop: '0.6rem' }}>
                {photos.map((url, index) => (
                  <div key={`${url}-${index}`} className="homeowner-thumb-card">
                    <a href={url} target="_blank" rel="noreferrer" className="homeowner-thumb-link">
                      <img src={url} alt={`${plant.name} ${index + 1}`} className="homeowner-detail-thumb" loading="lazy" decoding="async" />
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
                            void replacePhoto(index, file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <button type="button" className="homeowner-thumb-button homeowner-thumb-button-danger" onClick={() => deletePhoto(index)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="mt-6 flex gap-3 flex-wrap" style={{ padding: '0 0.5rem 1rem' }}>
        <button type="button" className="homeowner-button-secondary rounded-md px-4 py-2 text-sm font-semibold" onClick={() => navigate('/')}>Home</button>
        <button type="button" className="homeowner-button-primary rounded-md px-4 py-2 text-sm font-semibold" onClick={() => navigate('/homeowners/signup')}>Create My Digital Garden</button>
      </div>
    </div>
  );
}
