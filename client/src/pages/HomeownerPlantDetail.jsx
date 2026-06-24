import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiUrl } from '../utils/apiUrl';
import { useHomeownerAuth } from '../context/HomeownerAuthContext';
import './HomeownerTheme.css';
import './TreeDetail.css';
import './HomeownerPlantDetail.css';

function getLocationLabel(value) {
  if (value === 'indoor') return 'Indoor';
  if (value === 'outdoor') return 'Outdoor';
  return 'Not set';
}

function readDiagnosticsStatus(diagnostics, loading, error) {
  if (loading) return 'loading';
  if (error) return 'error';
  if (diagnostics) return 'success';
  return 'idle';
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

export default function HomeownerPlantDetail() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { getAccessToken } = useHomeownerAuth();
  const previewPlant =
    location.state?.plantPreview && location.state.plantPreview.id === id
      ? location.state.plantPreview
      : null;

  const [plant, setPlant] = useState(previewPlant || null);
  const [loading, setLoading] = useState(!previewPlant);
  const [refreshing, setRefreshing] = useState(Boolean(previewPlant));
  const [error, setError] = useState('');
  const [runningDiagnostics, setRunningDiagnostics] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState('');

  const diagnostics = plant?.last_diagnostics || null;
  const diagnosticsStatus = readDiagnosticsStatus(diagnostics, runningDiagnostics, diagnosticsError);
  const hazardState = useMemo(() => computeHazardState(diagnostics), [diagnostics]);
  const [editingDetails, setEditingDetails] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailForm, setDetailForm] = useState({
    name: previewPlant?.name || '',
    species: previewPlant?.species || '',
    room_or_bed: previewPlant?.room_or_bed || '',
    bed_number: previewPlant?.bed_number ?? '',
    row_section_id: previewPlant?.row_section_id || '',
  });
  const [journalEntries, setJournalEntries] = useState([]);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalError, setJournalError] = useState('');
  const [journalSaving, setJournalSaving] = useState(false);
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

  async function authFetch(path, options = {}) {
    const token = await getAccessToken();
    const res = await fetch(apiUrl(path), {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload.error || 'Request failed');
    }

    return payload;
  }

  async function loadPlant(options = {}) {
    const background = Boolean(options.background);

    try {
      if (background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');
      const payload = await authFetch(`/api/homeowners/plants/${id}`);
      const nextPlant = payload.plant || null;
      setPlant(nextPlant);
      setDetailForm({
        name: nextPlant?.name || '',
        species: nextPlant?.species || '',
        room_or_bed: nextPlant?.room_or_bed || '',
        bed_number: nextPlant?.bed_number ?? '',
        row_section_id: nextPlant?.row_section_id || '',
      });
    } catch (err) {
      setError(err.message || 'Failed to load plant profile');
      setPlant(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function loadJournal() {
    try {
      setJournalLoading(true);
      setJournalError('');
      const payload = await authFetch(`/api/homeowners/plants/${id}/journal`);
      setJournalEntries(Array.isArray(payload.entries) ? payload.entries : []);
    } catch (err) {
      setJournalEntries([]);
      setJournalError(err.message || 'Failed to load journal entries');
    } finally {
      setJournalLoading(false);
    }
  }

  useEffect(() => {
    if (previewPlant) {
      setPlant(previewPlant);
      setDetailForm({
        name: previewPlant.name || '',
        species: previewPlant.species || '',
        room_or_bed: previewPlant.room_or_bed || '',
        bed_number: previewPlant.bed_number ?? '',
        row_section_id: previewPlant.row_section_id || '',
      });
      setLoading(false);
      void loadPlant({ background: true });
      void loadJournal();
      return;
    }

    void loadPlant();
    void loadJournal();
  }, [id, previewPlant]);

  async function runDiagnostics() {
    try {
      setRunningDiagnostics(true);
      setDiagnosticsError('');
      const payload = await authFetch(`/api/homeowners/plants/${id}/diagnostics`, {
        method: 'POST',
      });
      setPlant(payload.plant || null);
    } catch (err) {
      setDiagnosticsError(err.message || 'Failed to run diagnostics');
    } finally {
      setRunningDiagnostics(false);
    }
  }

  function startEditDetails() {
    setDetailForm({
      name: plant?.name || '',
      species: plant?.species || '',
      room_or_bed: plant?.room_or_bed || '',
      bed_number: plant?.bed_number ?? '',
      row_section_id: plant?.row_section_id || '',
    });
    setEditingDetails(true);
    setError('');
  }

  function cancelEditDetails() {
    setEditingDetails(false);
    setDetailForm({
      name: plant?.name || '',
      species: plant?.species || '',
      room_or_bed: plant?.room_or_bed || '',
      bed_number: plant?.bed_number ?? '',
      row_section_id: plant?.row_section_id || '',
    });
  }

  async function saveDetails() {
    if (!detailForm.name.trim()) {
      setError('Plant name is required');
      return;
    }

    if (detailForm.row_section_id && !/^[A-Z](100|[1-9][0-9]?)$/.test((detailForm.row_section_id || '').toUpperCase().trim())) {
      setError('Row/Section ID must be in Letter+Number format like A1 through Z100.');
      return;
    }

    try {
      setSavingDetails(true);
      setError('');
      const payload = await authFetch(`/api/homeowners/plants/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...detailForm,
          row_section_id: (detailForm.row_section_id || '').toUpperCase().trim(),
          bed_number: detailForm.bed_number === '' ? null : detailForm.bed_number,
        }),
      });
      const nextPlant = payload.plant || null;
      setPlant(nextPlant);
      setEditingDetails(false);
    } catch (err) {
      setError(err.message || 'Failed to save plant details');
    } finally {
      setSavingDetails(false);
    }
  }

  async function createJournalEntry(e) {
    e.preventDefault();
    try {
      setJournalSaving(true);
      setJournalError('');
      await authFetch(`/api/homeowners/plants/${id}/journal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(journalForm),
      });
      setJournalForm({
        event_type: journalForm.event_type || 'watered',
        occurred_at: toLocalDateTimeInputValue(new Date().toISOString()),
        notes: '',
      });
      await loadJournal();
    } catch (err) {
      setJournalError(err.message || 'Failed to save journal entry');
    } finally {
      setJournalSaving(false);
    }
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
    setEditingJournalForm({ event_type: 'note', occurred_at: '', notes: '' });
  }

  async function saveJournalEntry(entryId) {
    try {
      setJournalSaving(true);
      setJournalError('');
      await authFetch(`/api/homeowners/plants/${id}/journal/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingJournalForm),
      });
      setEditingJournalId('');
      await loadJournal();
    } catch (err) {
      setJournalError(err.message || 'Failed to update journal entry');
    } finally {
      setJournalSaving(false);
    }
  }

  async function deleteJournalEntry(entryId) {
    const confirmed = window.confirm('Delete this journal entry?');
    if (!confirmed) return;

    try {
      setJournalSaving(true);
      setJournalError('');
      await authFetch(`/api/homeowners/plants/${id}/journal/${entryId}`, {
        method: 'DELETE',
      });
      if (editingJournalId === entryId) {
        cancelEditJournalEntry();
      }
      await loadJournal();
    } catch (err) {
      setJournalError(err.message || 'Failed to delete journal entry');
    } finally {
      setJournalSaving(false);
    }
  }

  const mainPhoto = useMemo(() => {
    const photos = Array.isArray(plant?.photos) ? plant.photos : [];
    return photos[0] || null;
  }, [plant]);

  if (loading) {
    return (
      <div className="homeowner-detail-loading" role="status" aria-live="polite">
        <span className="homeowner-spinner" aria-hidden="true" />
        <span>Loading plant profile...</span>
      </div>
    );
  }

  if (!plant) {
    return (
      <div className="page tree-detail-page">
        <div className="empty-state">
          <div className="icon">🪴</div>
          <p>{error || 'This plant profile could not be found.'}</p>
          <button className="btn btn-secondary" onClick={() => navigate('/homeowners/plants')}>
            Back to Plant Profiles
          </button>
        </div>
      </div>
    );
  }

  const photos = Array.isArray(plant.photos) ? plant.photos : [];
  const diagnosticsChipLabel =
    diagnosticsStatus === 'loading'
      ? 'Diagnostics loading'
      : diagnosticsStatus === 'success'
        ? 'Diagnostics ready'
        : diagnosticsStatus === 'error'
          ? 'Diagnostics failed'
          : 'Diagnostics idle';

  return (
    <div className="page tree-detail-page homeowner-plant-detail-page">
      <div className="tree-detail-topbar">
        <button className="btn btn-secondary" onClick={() => navigate('/homeowners/plants')}>
          Back to Plant Profiles
        </button>
        <div className="topbar-actions">
          {refreshing && (
            <span className="homeowner-inline-status" title="Refreshing latest plant details">
              <span className="homeowner-spinner homeowner-spinner-sm" aria-hidden="true" />
              Refreshing
            </span>
          )}
          {editingDetails ? (
            <>
              <button className="btn btn-primary" onClick={saveDetails} disabled={savingDetails}>
                {savingDetails ? 'Saving...' : 'Save Details'}
              </button>
              <button className="btn btn-secondary" onClick={cancelEditDetails} disabled={savingDetails}>
                Cancel
              </button>
            </>
          ) : (
            <button className="btn btn-secondary" onClick={startEditDetails}>
              Edit Details
            </button>
          )}
          <span className={`diagnostics-chip diagnostics-chip-${diagnosticsStatus}`} title={diagnosticsError || diagnosticsChipLabel}>
            {diagnosticsChipLabel}
          </span>
          <button className="btn btn-primary" onClick={runDiagnostics} disabled={runningDiagnostics}>
            {runningDiagnostics ? (
              <>
                <span className="homeowner-spinner homeowner-spinner-sm" aria-hidden="true" />
                Running Diagnostics...
              </>
            ) : 'Run Diagnostics'}
          </button>
        </div>
      </div>

      {error && <div className="card"><p className="homeowner-detail-error">{error}</p></div>}
      {diagnosticsError && <div className="card"><p className="homeowner-detail-error">{diagnosticsError}</p></div>}

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
                        disabled={savingDetails}
                      />
                    </label>
                    <label className="homeowner-detail-label">
                      Species
                      <input
                        className="homeowner-detail-input"
                        value={detailForm.species}
                        onChange={(e) => setDetailForm((prev) => ({ ...prev, species: e.target.value }))}
                        disabled={savingDetails}
                      />
                    </label>
                    <label className="homeowner-detail-label">
                      Indoor / Outdoor
                      <select
                        className="homeowner-detail-input"
                        value={detailForm.room_or_bed}
                        onChange={(e) => setDetailForm((prev) => ({ ...prev, room_or_bed: e.target.value }))}
                        disabled={savingDetails}
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
                        disabled={savingDetails}
                      />
                    </label>
                    <label className="homeowner-detail-label">
                      Row / Section ID
                      <input
                        className="homeowner-detail-input"
                        placeholder="A1"
                        value={detailForm.row_section_id}
                        onChange={(e) => setDetailForm((prev) => ({ ...prev, row_section_id: e.target.value.toUpperCase() }))}
                        disabled={savingDetails}
                      />
                    </label>
                    <p className="detail-coords">Plant ID: {plant.id}</p>
                    <p className="detail-coords">Bed #: {plant.bed_number ?? 'Not set'}</p>
                    <p className="detail-coords">Row / Section: {plant.row_section_id || 'Not set'}</p>
                  </div>
                ) : (
                  <>
                    <h1 className="detail-title">{plant.name}</h1>
                    <p className="detail-location">Species: {plant.species || 'Not set'}</p>
                    <p className="detail-location">Indoor / Outdoor: {getLocationLabel(plant.room_or_bed)}</p>
                    <p className="detail-location">Bed #: {plant.bed_number ?? 'Not set'}</p>
                    <p className="detail-location">Row / Section: {plant.row_section_id || 'Not set'}</p>
                    <p className="detail-coords">Plant ID: {plant.id}</p>
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
            {photos.length === 0 ? (
              <p>No photos uploaded for this plant yet.</p>
            ) : (
              <div className="homeowner-detail-photo-grid">
                {photos.map((url, index) => (
                  <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="homeowner-detail-photo-link">
                    <img src={url} alt={`${plant.name} ${index + 1}`} className="homeowner-detail-thumb" loading="lazy" decoding="async" />
                  </a>
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

            {journalLoading ? (
              <p>Loading journal entries...</p>
            ) : journalEntries.length === 0 ? (
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
                          <button className="btn btn-primary" onClick={() => saveJournalEntry(entry.id)} disabled={journalSaving}>
                            Save Entry
                          </button>
                          <button className="btn btn-secondary" onClick={cancelEditJournalEntry} disabled={journalSaving}>
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
                          <button className="btn btn-secondary" onClick={() => startEditJournalEntry(entry)} disabled={journalSaving}>
                            Edit
                          </button>
                          <button className="btn btn-secondary" onClick={() => deleteJournalEntry(entry.id)} disabled={journalSaving}>
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
                  {Array.isArray(diagnostics.key_features_noticed) && diagnostics.key_features_noticed.length > 0 ? (
                    <ul>
                      {diagnostics.key_features_noticed.map((item, index) => (
                        <li key={`feature-${index}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No feature notes provided.</p>
                  )}
                </div>

                <div className="card diag-card diag-card-warn">
                  <p className="homeowner-diag-label">Primary Concerns</p>
                  {Array.isArray(diagnostics.primary_concerns) && diagnostics.primary_concerns.length > 0 ? (
                    <ul>
                      {diagnostics.primary_concerns.map((item, index) => (
                        <li key={`concern-${index}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No urgent concerns flagged.</p>
                  )}
                </div>

                <div className="card diag-card">
                  <p className="homeowner-diag-label">Care Notes</p>
                  {Array.isArray(diagnostics.care_notes) && diagnostics.care_notes.length > 0 ? (
                    <ul>
                      {diagnostics.care_notes.map((item, index) => (
                        <li key={`care-${index}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No care notes provided.</p>
                  )}
                </div>

                <div className="card diag-card">
                  <p className="homeowner-diag-label">Common Issues to Watch For</p>
                  {Array.isArray(diagnostics.common_issues_to_watch_for) && diagnostics.common_issues_to_watch_for.length > 0 ? (
                    <ul>
                      {diagnostics.common_issues_to_watch_for.map((item, index) => (
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
                  {Array.isArray(diagnostics.under_over_watering_signs) && diagnostics.under_over_watering_signs.length > 0 ? (
                    <ul>
                      {diagnostics.under_over_watering_signs.map((item, index) => (
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
                  {Array.isArray(diagnostics.warning_signs) && diagnostics.warning_signs.length > 0 ? (
                    <ul>
                      {diagnostics.warning_signs.map((item, index) => (
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
                  {Array.isArray(diagnostics.uses_throughout_history) && diagnostics.uses_throughout_history.length > 0 ? (
                    <ul>
                      {diagnostics.uses_throughout_history.map((item, index) => (
                        <li key={`history-${index}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No historical uses listed.</p>
                  )}

                  <p className="homeowner-diag-label homeowner-diag-subheading">Fun Facts</p>
                  {Array.isArray(diagnostics.fun_facts) && diagnostics.fun_facts.length > 0 ? (
                    <ul>
                      {diagnostics.fun_facts.map((item, index) => (
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
                  {Array.isArray(diagnostics.data_quality_flags) && diagnostics.data_quality_flags.length > 0 ? (
                    <ul>
                      {diagnostics.data_quality_flags.map((item, index) => (
                        <li key={`quality-${index}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No data quality flags for this run.</p>
                  )}

                  <p className="homeowner-diag-label homeowner-diag-subheading">Photo Notes</p>
                  {Array.isArray(diagnostics.photo_summaries) && diagnostics.photo_summaries.length > 0 ? (
                    <ul>
                      {diagnostics.photo_summaries.map((item, index) => (
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

        {plant.qr_code_image_url && (
          <aside className="tree-detail-sidebar">
            <section className="card section-qr homeowner-qr-card">
              <h2>Plant QR Tag</h2>
              <div className="homeowner-qr-preview">
                <img src={plant.qr_code_image_url} alt={`QR code for ${plant.name}`} className="homeowner-qr-image" />
                <p className="detail-coords homeowner-qr-payload">{plant.qr_code_payload}</p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => navigate('/homeowners/qr-tag-orders')}
                >
                  Order QR Tags
                </button>
              </div>
            </section>
          </aside>
        )}
      </div>
    </div>
  );
}
