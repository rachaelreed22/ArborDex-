import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fileToDataUrl, getCachedDemoGardenPlants, getDemoPlantById, saveDemoGardenPlants } from '../utils/demoGardenStore';
import { getDemoQueensPassToken, isDemoQueensPassUnlocked, verifyDemoQueensPass } from '../utils/demoQueensPass';
import './HomeownerTheme.css';
import './TreeDetail.css';
import './HomeownerPlantDetail.css';

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

function computeHazardState(diagnostics) {
  if (!diagnostics || typeof diagnostics !== 'object') {
    return { detected: false, details: [] };
  }

  const details = Array.isArray(diagnostics.hazard_details)
    ? diagnostics.hazard_details.map((item) => (item == null ? '' : item.toString().trim())).filter(Boolean)
    : [];

  const signalItems = [
    diagnostics.summary,
    diagnostics.medicinal_qualities,
    diagnostics.overall_condition,
    ...(Array.isArray(diagnostics.primary_concerns) ? diagnostics.primary_concerns : []),
    ...(Array.isArray(diagnostics.common_issues_to_watch_for) ? diagnostics.common_issues_to_watch_for : []),
    ...(Array.isArray(diagnostics.warning_signs) ? diagnostics.warning_signs : []),
    ...(Array.isArray(diagnostics.photo_summaries) ? diagnostics.photo_summaries : []),
    ...details,
  ];

  const signals = signalItems
    .map((item) => (item == null ? '' : item.toString().toLowerCase()))
    .join(' | ');

  const explicitHazard = ['yes', 'y', 'true'].includes(
    (diagnostics.hazards_detected || diagnostics.hazard_detected || '').toString().trim().toLowerCase()
  );
  const hasDecay = /(decay|decaying|rot|rotting|hollow|cavity|loss\s+of\s+integrity)/i.test(signals);
  const hasStructuralRisk = /(instability|structural|failure|compromised|fall\s+risk|collapse|unsafe|consider\s+removal)/i.test(signals);
  const hasTrunkBaseRoot = /(trunk|base|basal|root|root\s*flare|root\s*collar)/i.test(signals);
  const hasNegatedRisk = /(no|not|without)\s+(clear\s+)?(signs?\s+of\s+)?(hazards?|risk|decay|rot|instability|failure)/i.test(signals);
  const hasObservedEvidence = signalItems.some((item) => hasObservedHazardEvidence(item));
  const inferredHazard = hasObservedEvidence && hasDecay && hasTrunkBaseRoot && !hasNegatedRisk && (hasStructuralRisk || hasDecay);

  const detected = explicitHazard || details.length > 0 || inferredHazard;
  const normalizedDetails = [...details];

  if (detected && normalizedDetails.length === 0) {
    normalizedDetails.push('Critical trunk/base decay indicators detected; needs human inspection.');
  }

  return { detected, details: normalizedDetails };
}

const JOURNAL_EVENT_OPTIONS = [
  { value: 'planted', label: 'Planted' },
  { value: 'harvested', label: 'Harvested' },
  { value: 'fertilized', label: 'Fertilized' },
  { value: 'watered', label: 'Watered' },
  { value: 'note', label: 'Note' },
];

function toLocalDateTimeInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60000;
  const local = new Date(date.getTime() - offsetMs);
  return local.toISOString().slice(0, 16);
}

function fromLocalDateTimeInputValue(value) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function sortJournalEntries(entries) {
  return [...entries].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
}

function toTextArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (item == null ? '' : item.toString().trim()))
      .filter(Boolean);
  }

  if (value == null) return [];
  const text = value.toString().trim();
  return text ? [text] : [];
}

export default function HomeownerDemoPlantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const pendingActionRef = useRef(null);

  const [plant, setPlant] = useState(null);
  const [loading, setLoading] = useState(true);
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
  const [journalForm, setJournalForm] = useState({
    event_type: 'watered',
    occurred_at: toLocalDateTimeInputValue(new Date().toISOString()),
    notes: '',
  });
  const [editingJournalId, setEditingJournalId] = useState('');
  const [editingJournalForm, setEditingJournalForm] = useState({
    event_type: 'watered',
    occurred_at: '',
    notes: '',
  });
  const [journalSaving, setJournalSaving] = useState(false);
  const [journalError, setJournalError] = useState('');
  const [showPassGate, setShowPassGate] = useState(false);
  const [passError, setPassError] = useState('');
  const [passLoading, setPassLoading] = useState(false);
  const [queenPassForm, setQueenPassForm] = useState({
    email: 'rachaelr@rrtech.dev',
    pass_id: '',
  });

  useEffect(() => {
    let active = true;

    async function loadPlant() {
      try {
        const nextPlant = await getDemoPlantById(id || '');
        if (!active) return;
        if (!nextPlant) {
          setError('Demo plant profile not found.');
          setPlant(null);
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
      } catch (err) {
        if (active) {
          setError(err.message || 'Failed to load demo plant profile.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadPlant();

    return () => {
      active = false;
    };
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

  async function persistPlant(updater) {
    const plants = getCachedDemoGardenPlants();
    const updatedPlants = plants.map((entry) => (entry.id === id ? updater(entry) : entry));
    const savedPlants = await saveDemoGardenPlants(updatedPlants, getDemoQueensPassToken());

    const next = savedPlants.find((entry) => entry.id === id) || null;
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
      setError('');
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
    if (!detailForm.name.trim()) {
      setError('Plant name is required.');
      return;
    }

    withPassGate(async () => {
      await persistPlant((entry) => ({
        ...entry,
        name: detailForm.name.trim(),
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

  function createJournalEntry(e) {
    e.preventDefault();
    setJournalError('');

    withPassGate(async () => {
      try {
        setJournalSaving(true);
        const nextEntry = {
          id: `demo-journal-${Math.random().toString(36).slice(2, 10)}`,
          event_type: journalForm.event_type || 'note',
          occurred_at: fromLocalDateTimeInputValue(journalForm.occurred_at),
          notes: (journalForm.notes || '').trim(),
        };

        await persistPlant((entry) => {
          const current = Array.isArray(entry.journal_entries) ? entry.journal_entries : [];
          return {
            ...entry,
            journal_entries: sortJournalEntries([nextEntry, ...current]),
            updated_at: new Date().toISOString(),
          };
        });

        setJournalForm({
          event_type: journalForm.event_type || 'watered',
          occurred_at: toLocalDateTimeInputValue(new Date().toISOString()),
          notes: '',
        });
      } catch {
        setJournalError('Failed to save journal entry');
      } finally {
        setJournalSaving(false);
      }
    });
  }

  function startEditJournalEntry(entry) {
    setEditingJournalId(entry.id);
    setEditingJournalForm({
      event_type: entry.event_type || 'note',
      occurred_at: toLocalDateTimeInputValue(entry.occurred_at),
      notes: entry.notes || '',
    });
  }

  function cancelEditJournalEntry() {
    setEditingJournalId('');
    setEditingJournalForm({ event_type: 'watered', occurred_at: '', notes: '' });
  }

  function saveJournalEntry(entryId) {
    setJournalError('');

    withPassGate(async () => {
      try {
        setJournalSaving(true);
        await persistPlant((entry) => {
          const current = Array.isArray(entry.journal_entries) ? entry.journal_entries : [];
          const nextEntries = current.map((item) => {
            if (item.id !== entryId) return item;
            return {
              ...item,
              event_type: editingJournalForm.event_type || 'note',
              occurred_at: fromLocalDateTimeInputValue(editingJournalForm.occurred_at),
              notes: editingJournalForm.notes || '',
            };
          });

          return {
            ...entry,
            journal_entries: sortJournalEntries(nextEntries),
            updated_at: new Date().toISOString(),
          };
        });
        setEditingJournalId('');
      } catch {
        setJournalError('Failed to update journal entry');
      } finally {
        setJournalSaving(false);
      }
    });
  }

  function deleteJournalEntry(entryId) {
    setJournalError('');

    withPassGate(async () => {
      const confirmed = window.confirm('Delete this journal entry?');
      if (!confirmed) return;

      try {
        setJournalSaving(true);
        await persistPlant((entry) => {
          const current = Array.isArray(entry.journal_entries) ? entry.journal_entries : [];
          return {
            ...entry,
            journal_entries: current.filter((item) => item.id !== entryId),
            updated_at: new Date().toISOString(),
          };
        });
        if (editingJournalId === entryId) {
          cancelEditJournalEntry();
        }
      } catch {
        setJournalError('Failed to delete journal entry');
      } finally {
        setJournalSaving(false);
      }
    });
  }

  async function addPhoto(file) {
    if (!file) return;
    withPassGate(async () => {
      const dataUrl = await fileToDataUrl(file);
      await persistPlant((entry) => {
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
      await persistPlant((entry) => {
        const photos = Array.isArray(entry.photos) ? [...entry.photos] : [];
        if (photoIndex < 0 || photoIndex >= photos.length) return entry;
        photos[photoIndex] = dataUrl;
        return { ...entry, photos, updated_at: new Date().toISOString() };
      });
    });
  }

  function deletePhoto(photoIndex) {
    withPassGate(async () => {
      await persistPlant((entry) => {
        const photos = Array.isArray(entry.photos) ? entry.photos.filter((_, index) => index !== photoIndex) : [];
        return { ...entry, photos, updated_at: new Date().toISOString() };
      });
    });
  }

  const photos = useMemo(() => (Array.isArray(plant?.photos) ? plant.photos : []), [plant]);
  const mainPhoto = photos[0] || null;
  const journalEntries = useMemo(
    () => sortJournalEntries(Array.isArray(plant?.journal_entries) ? plant.journal_entries : []),
    [plant]
  );
  const diagnostics = plant?.last_diagnostics || null;
  const hazardState = useMemo(() => computeHazardState(diagnostics), [diagnostics]);
  const keyFeatures = useMemo(() => toTextArray(diagnostics?.key_features_noticed), [diagnostics]);
  const primaryConcerns = useMemo(() => toTextArray(diagnostics?.primary_concerns), [diagnostics]);
  const careNotes = useMemo(() => toTextArray(diagnostics?.care_notes), [diagnostics]);
  const commonIssues = useMemo(() => toTextArray(diagnostics?.common_issues_to_watch_for), [diagnostics]);
  const wateringSigns = useMemo(() => toTextArray(diagnostics?.under_over_watering_signs), [diagnostics]);
  const warningSigns = useMemo(() => toTextArray(diagnostics?.warning_signs), [diagnostics]);
  const historicalUses = useMemo(() => toTextArray(diagnostics?.uses_throughout_history), [diagnostics]);
  const funFacts = useMemo(() => toTextArray(diagnostics?.fun_facts), [diagnostics]);
  const dataQualityFlags = useMemo(() => toTextArray(diagnostics?.data_quality_flags), [diagnostics]);
  const photoSummaries = useMemo(() => toTextArray(diagnostics?.photo_summaries), [diagnostics]);

  if (loading) {
    return (
      <div className="homeowner-detail-loading" role="status" aria-live="polite">
        <span className="homeowner-spinner" aria-hidden="true" />
        <span>Loading shared demo plant profile...</span>
      </div>
    );
  }

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
              <button className="btn btn-primary" onClick={saveDetails} type="button">Save Details</button>
              <button className="btn btn-secondary" onClick={cancelEditDetails} type="button">Cancel</button>
            </>
          ) : (
            <button className="btn btn-secondary" onClick={startEditDetails} type="button">Edit Details</button>
          )}
        </div>
      </div>

      {error && <div className="card"><p className="homeowner-detail-error">{error}</p></div>}

      {showPassGate && (
        <section className="card homeowner-panel homeowner-panel-warn mt-3 space-y-3">
          <h2>Queen's Pass Required</h2>
          <p>Enter Queen's Pass credentials to edit this demo profile.</p>
          <label className="homeowner-detail-label">
            Email
            <input
              className="homeowner-detail-input"
              type="email"
              value={queenPassForm.email}
              onChange={(e) => setQueenPassForm((prev) => ({ ...prev, email: e.target.value }))}
            />
          </label>
          <label className="homeowner-detail-label">
            Queen's Pass ID
            <input
              className="homeowner-detail-input"
              type="text"
              value={queenPassForm.pass_id}
              onChange={(e) => setQueenPassForm((prev) => ({ ...prev, pass_id: e.target.value }))}
            />
          </label>
          {passError && <p className="homeowner-detail-error">{passError}</p>}
          <div className="homeowner-journal-entry-actions">
            <button className="btn btn-primary" onClick={handleVerifyPass} disabled={passLoading} type="button">
              {passLoading ? 'Verifying...' : 'Unlock Editing'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setShowPassGate(false);
                pendingActionRef.current = null;
              }}
              type="button"
            >
              Close
            </button>
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
                      <input
                        className="homeowner-detail-input"
                        value={detailForm.name}
                        onChange={(e) => setDetailForm((prev) => ({ ...prev, name: e.target.value }))}
                      />
                    </label>
                    <label className="homeowner-detail-label">
                      Species
                      <input
                        className="homeowner-detail-input"
                        value={detailForm.species}
                        onChange={(e) => setDetailForm((prev) => ({ ...prev, species: e.target.value }))}
                      />
                    </label>
                    <label className="homeowner-detail-label">
                      Indoor / Outdoor
                      <select
                        className="homeowner-detail-input"
                        value={detailForm.room_or_bed}
                        onChange={(e) => setDetailForm((prev) => ({ ...prev, room_or_bed: e.target.value }))}
                      >
                        <option value="">Not set</option>
                        <option value="indoor">Indoor</option>
                        <option value="outdoor">Outdoor</option>
                      </select>
                    </label>
                    <label className="homeowner-detail-label">
                      Bed #
                      <input
                        className="homeowner-detail-input"
                        type="number"
                        min="1"
                        max="100"
                        value={detailForm.bed_number}
                        onChange={(e) => setDetailForm((prev) => ({ ...prev, bed_number: e.target.value }))}
                      />
                    </label>
                    <label className="homeowner-detail-label">
                      Row / Section ID
                      <input
                        className="homeowner-detail-input"
                        value={detailForm.row_section_id}
                        onChange={(e) => setDetailForm((prev) => ({ ...prev, row_section_id: e.target.value.toUpperCase() }))}
                      />
                    </label>
                    <label className="homeowner-detail-label">
                      Notes
                      <textarea
                        className="homeowner-detail-input"
                        rows={3}
                        value={detailForm.notes}
                        onChange={(e) => setDetailForm((prev) => ({ ...prev, notes: e.target.value }))}
                      />
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
                      <button
                        type="button"
                        className="homeowner-thumb-button homeowner-thumb-button-danger"
                        onClick={() => deletePhoto(index)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card homeowner-journal-section">
            <h2>Plant Journal</h2>
            <p className="homeowner-journal-subtext">
              Track planted, harvested, fertilized, watered events plus notes over time.
            </p>

            <form className="homeowner-journal-form" onSubmit={createJournalEntry}>
              <label className="homeowner-detail-label">
                Entry Type
                <select
                  className="homeowner-detail-input"
                  value={journalForm.event_type}
                  onChange={(e) => setJournalForm((prev) => ({ ...prev, event_type: e.target.value }))}
                  disabled={journalSaving}
                >
                  {JOURNAL_EVENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="homeowner-detail-label">
                Date / Time
                <input
                  className="homeowner-detail-input"
                  type="datetime-local"
                  value={journalForm.occurred_at}
                  onChange={(e) => setJournalForm((prev) => ({ ...prev, occurred_at: e.target.value }))}
                  disabled={journalSaving}
                  required
                />
              </label>

              <label className="homeowner-detail-label homeowner-journal-notes-field">
                Notes
                <textarea
                  className="homeowner-detail-input homeowner-journal-notes"
                  rows={3}
                  value={journalForm.notes}
                  onChange={(e) => setJournalForm((prev) => ({ ...prev, notes: e.target.value }))}
                  disabled={journalSaving}
                  placeholder="Optional notes for this event"
                />
              </label>

              <button className="btn btn-primary" type="submit" disabled={journalSaving}>
                {journalSaving ? 'Saving...' : 'Add Journal Entry'}
              </button>
            </form>

            {journalError && <p className="homeowner-detail-error homeowner-journal-error">{journalError}</p>}

            {journalEntries.length === 0 ? (
              <p>No journal entries yet.</p>
            ) : (
              <div className="homeowner-journal-entry-list">
                {journalEntries.map((entry) => (
                  <article key={entry.id} className="homeowner-journal-entry">
                    {editingJournalId === entry.id ? (
                      <>
                        <div className="homeowner-journal-entry-grid">
                          <label className="homeowner-detail-label">
                            Entry Type
                            <select
                              className="homeowner-detail-input"
                              value={editingJournalForm.event_type}
                              onChange={(e) => setEditingJournalForm((prev) => ({ ...prev, event_type: e.target.value }))}
                              disabled={journalSaving}
                            >
                              {JOURNAL_EVENT_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                          <label className="homeowner-detail-label">
                            Date / Time
                            <input
                              className="homeowner-detail-input"
                              type="datetime-local"
                              value={editingJournalForm.occurred_at}
                              onChange={(e) => setEditingJournalForm((prev) => ({ ...prev, occurred_at: e.target.value }))}
                              disabled={journalSaving}
                            />
                          </label>
                        </div>
                        <label className="homeowner-detail-label homeowner-journal-notes-field">
                          Notes
                          <textarea
                            className="homeowner-detail-input homeowner-journal-notes"
                            rows={3}
                            value={editingJournalForm.notes}
                            onChange={(e) => setEditingJournalForm((prev) => ({ ...prev, notes: e.target.value }))}
                            disabled={journalSaving}
                          />
                        </label>
                        <div className="homeowner-journal-entry-actions">
                          <button className="btn btn-primary" onClick={() => saveJournalEntry(entry.id)} disabled={journalSaving} type="button">
                            Save Entry
                          </button>
                          <button className="btn btn-secondary" onClick={cancelEditJournalEntry} disabled={journalSaving} type="button">
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="homeowner-journal-entry-type">{(entry.event_type || 'note').toUpperCase()}</p>
                        <p className="homeowner-journal-entry-date">{new Date(entry.occurred_at).toLocaleString()}</p>
                        <p className="homeowner-journal-entry-notes">{entry.notes || 'No notes'}</p>
                        <div className="homeowner-journal-entry-actions">
                          <button className="btn btn-secondary" onClick={() => startEditJournalEntry(entry)} disabled={journalSaving} type="button">
                            Edit
                          </button>
                          <button className="btn btn-secondary" onClick={() => deleteJournalEntry(entry.id)} disabled={journalSaving} type="button">
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="homeowner-diagnostics-board">
            {!diagnostics && (
              <div className="card diag-card diag-card-span-full">
                <h2>Latest Diagnostics</h2>
                <p>No diagnostics have been run for this plant yet.</p>
              </div>
            )}

            {diagnostics && (
              <>
                <div className="card diag-card diag-card-span-full">
                  <h2>Latest Diagnostics</h2>
                  <div className="homeowner-diagnostics-grid">
                    <div className="homeowner-diag-mini-card">
                      <p className="homeowner-diag-label">Likely Identification</p>
                      <h3>{diagnostics.likely_identification || 'Unknown'}</h3>
                    </div>
                    <div className="homeowner-diag-mini-card">
                      <p className="homeowner-diag-label">Confidence</p>
                      <h3>{diagnostics.confidence || 'Unknown'}</h3>
                    </div>
                    <div className="homeowner-diag-mini-card">
                      <p className="homeowner-diag-label">Overall Condition</p>
                      <h3>{diagnostics.overall_condition || 'Unknown'}</h3>
                    </div>
                  </div>
                  <div className="homeowner-diag-section">
                    <p className="homeowner-diag-label">Summary</p>
                    <p>{diagnostics.summary || 'No summary available.'}</p>
                  </div>
                </div>

                <div className="card diag-card">
                  <p className="homeowner-diag-label">Key Features Noticed</p>
                  {keyFeatures.length > 0 ? (
                    <ul>
                      {keyFeatures.map((item, index) => (
                        <li key={`feature-${index}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No feature notes provided.</p>
                  )}
                </div>

                <div className="card diag-card diag-card-warn">
                  <p className="homeowner-diag-label">Primary Concerns</p>
                  {primaryConcerns.length > 0 ? (
                    <ul>
                      {primaryConcerns.map((item, index) => (
                        <li key={`concern-${index}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No urgent concerns flagged.</p>
                  )}
                </div>

                <div className="card diag-card">
                  <p className="homeowner-diag-label">Care Notes</p>
                  {careNotes.length > 0 ? (
                    <ul>
                      {careNotes.map((item, index) => (
                        <li key={`care-${index}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No care notes provided.</p>
                  )}
                </div>

                <div className="card diag-card">
                  <p className="homeowner-diag-label">Common Issues to Watch For</p>
                  {commonIssues.length > 0 ? (
                    <ul>
                      {commonIssues.map((item, index) => (
                        <li key={`issue-${index}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No common issue notes provided.</p>
                  )}
                </div>

                <div className="card diag-card">
                  <p className="homeowner-diag-label">Winter / Summer Watering Frequency</p>
                  <p><strong>Summer:</strong> {diagnostics.watering_frequency_summer || 'Not provided.'}</p>
                  <p><strong>Winter:</strong> {diagnostics.watering_frequency_winter || 'Not provided.'}</p>

                  <p className="homeowner-diag-label homeowner-diag-subheading">Signs of Under / Over Watering</p>
                  {wateringSigns.length > 0 ? (
                    <ul>
                      {wateringSigns.map((item, index) => (
                        <li key={`watering-sign-${index}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No watering stress signs provided.</p>
                  )}
                </div>

                <div className="card diag-card">
                  <p className="homeowner-diag-label">Light Requirements</p>
                  <p>{diagnostics.light_requirements || 'Not provided.'}</p>

                  <p className="homeowner-diag-label homeowner-diag-subheading">Temp / Humidity Preferences</p>
                  <p>{diagnostics.temp_humidity_preferences || 'Not provided.'}</p>

                  <p className="homeowner-diag-label homeowner-diag-subheading">Potting / Soil Requirements</p>
                  <p>{diagnostics.potting_soil_requirements || 'Not provided.'}</p>
                </div>

                <div className="card diag-card diag-card-warn">
                  <p className="homeowner-diag-label">Warning Signs</p>
                  {warningSigns.length > 0 ? (
                    <ul>
                      {warningSigns.map((item, index) => (
                        <li key={`warning-${index}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No warning signs listed.</p>
                  )}

                  <p className="homeowner-diag-label homeowner-diag-subheading">Toxicity Info</p>
                  <p>{diagnostics.toxicity_info || 'Not provided.'}</p>
                </div>

                <div className="card diag-card">
                  <p className="homeowner-diag-label">Maintenance Requirements</p>
                  <p>{diagnostics.maintenance_requirements || 'Not provided.'}</p>

                  <p className="homeowner-diag-label homeowner-diag-subheading">Estimated Growth Rate</p>
                  <p>{diagnostics.estimated_growth_rate || 'Not provided.'}</p>

                  <p className="homeowner-diag-label homeowner-diag-subheading">Growing Difficulty Score</p>
                  <p>{diagnostics.growing_difficulty_score || 'Unknown'}</p>
                </div>

                <div className="card diag-card">
                  <p className="homeowner-diag-label">Native Habitat</p>
                  <p>{diagnostics.native_habitat || 'Not provided.'}</p>

                  <p className="homeowner-diag-label homeowner-diag-subheading">Propagation Method</p>
                  <p>{diagnostics.propagation_method || 'Not provided.'}</p>

                  <p className="homeowner-diag-label homeowner-diag-subheading">Medicinal Qualities / If Any</p>
                  <p>{diagnostics.medicinal_qualities || 'Not provided.'}</p>
                </div>

                <div className="card diag-card">
                  <p className="homeowner-diag-label">Uses Throughout History</p>
                  {historicalUses.length > 0 ? (
                    <ul>
                      {historicalUses.map((item, index) => (
                        <li key={`history-${index}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No historical uses listed.</p>
                  )}

                  <p className="homeowner-diag-label homeowner-diag-subheading">Fun Facts</p>
                  {funFacts.length > 0 ? (
                    <ul>
                      {funFacts.map((item, index) => (
                        <li key={`fact-${index}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No fun facts provided.</p>
                  )}
                </div>

                <div className="card diag-card">
                  <p className="homeowner-diag-label">Hazards Detected</p>
                  <p className={hazardState.detected ? 'homeowner-hazard-flag' : ''}>{hazardState.detected ? 'Y' : 'N'}</p>
                  {hazardState.detected && (
                    <>
                      <p className="homeowner-diag-label homeowner-diag-subheading homeowner-hazard-flag">Hazard Details</p>
                      {hazardState.details.length > 0 ? (
                        <ul>
                          {hazardState.details.map((item, index) => (
                            <li key={`hazard-${index}`}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>Hazard inferred from diagnostics risk signals (decay/structural instability); needs human inspection.</p>
                      )}
                    </>
                  )}
                </div>

                <div className="card diag-card diag-card-note diag-card-span-full">
                  <p className="homeowner-diag-label">Data Quality Notes</p>
                  {dataQualityFlags.length > 0 ? (
                    <ul>
                      {dataQualityFlags.map((item, index) => (
                        <li key={`quality-${index}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No data quality flags for this run.</p>
                  )}

                  <p className="homeowner-diag-label homeowner-diag-subheading">Photo Notes</p>
                  {photoSummaries.length > 0 ? (
                    <ul>
                      {photoSummaries.map((item, index) => (
                        <li key={`photo-summary-${index}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No photo notes provided.</p>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      <div className="mt-6 flex gap-3 flex-wrap" style={{ padding: '0 0.5rem 1rem' }}>
        <button
          type="button"
          className="homeowner-button-secondary rounded-md px-4 py-2 text-sm font-semibold"
          onClick={() => navigate('/')}
        >
          Home
        </button>
        <button
          type="button"
          className="homeowner-button-primary rounded-md px-4 py-2 text-sm font-semibold"
          onClick={() => navigate('/homeowners/signup')}
        >
          Create My Digital Garden
        </button>
      </div>
    </div>
  );
}
