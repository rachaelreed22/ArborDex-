import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../utils/apiUrl';
import { fetchDemoGardenPlants, saveDemoGardenPlants } from '../utils/demoGardenStore';
import './HomeownerTheme.css';
import './HomeownerPlantDetail.css';

const UNSAVED_DIAG_REQUEST_KEY = 'arbordex-demo-unsaved-diagnostics-request-v1';
const UNSAVED_DIAG_REPORT_KEY = 'arbordex-demo-unsaved-diagnostics-report-v1';
const UNSAVED_DIAG_RUNS_KEY = 'arbordex-demo-unsaved-diagnostics-runs-v1';
const UNSAVED_DIAG_FAILURES_KEY = 'arbordex-demo-unsaved-diagnostics-failures-v1';
const UNSAVED_DIAG_MAX_RUNS = 3;

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
}

function dataUrlToBlob(dataUrl) {
  const [meta, content] = (dataUrl || '').split(',', 2);
  if (!meta || !content) return null;
  const mimeMatch = /data:([^;]+);base64/.exec(meta);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binary = window.atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function toTextArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => (item == null ? '' : item.toString().trim())).filter(Boolean);
  }
  if (value == null) return [];
  const text = value.toString().trim();
  return text ? [text] : [];
}

export default function HomeownerUnsavedDiagnostics() {
  const navigate = useNavigate();

  const [request, setRequest] = useState(null);
  const [report, setReport] = useState(null);
  const [runs, setRuns] = useState(0);
  const [failureCount, setFailureCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveName, setSaveName] = useState('');
  const [saveSpecies, setSaveSpecies] = useState('');
  const [saveLocation, setSaveLocation] = useState('indoor');

  useEffect(() => {
    const reqRaw = window.sessionStorage.getItem(UNSAVED_DIAG_REQUEST_KEY);
    const reportRaw = window.sessionStorage.getItem(UNSAVED_DIAG_REPORT_KEY);
    const runsRaw = window.sessionStorage.getItem(UNSAVED_DIAG_RUNS_KEY);
    const failuresRaw = window.sessionStorage.getItem(UNSAVED_DIAG_FAILURES_KEY);

    try {
      if (reqRaw) setRequest(JSON.parse(reqRaw));
    } catch {
      setRequest(null);
    }

    try {
      if (reportRaw) {
        const parsed = JSON.parse(reportRaw);
        setReport(parsed);
        setSaveSpecies((parsed?.species || '').toString());
      }
    } catch {
      setReport(null);
    }

    const parsedRuns = Number.parseInt((runsRaw || '').toString(), 10);
    if (Number.isFinite(parsedRuns) && parsedRuns > 0) {
      setRuns(Math.min(parsedRuns, UNSAVED_DIAG_MAX_RUNS));
    }

    const parsedFailures = Number.parseInt((failuresRaw || '').toString(), 10);
    if (Number.isFinite(parsedFailures) && parsedFailures > 0) {
      setFailureCount(parsedFailures);
    }
  }, []);

  const reportSpecies = (report?.species || report?.likely_identification || '').toString().trim();
  const title = useMemo(() => {
    const garden = (request?.garden_name || 'My Garden').toString().trim() || 'My Garden';
    if (!reportSpecies) return `${garden}: Unsaved Diagnostics`;
    return `${garden}: Unsaved Diagnostics for ${reportSpecies} plant`;
  }, [request?.garden_name, reportSpecies]);

  async function runDiagnostics({ countRun = true } = {}) {
    setError('');
    if (!request || typeof request !== 'object') {
      setError('No Ask ArborAI diagnostics request was found. Return to demo and try again.');
      return;
    }

    const photos = Array.isArray(request.photos) ? request.photos.filter(Boolean) : [];
    if (photos.length === 0) {
      setError('At least one photo is required before diagnostics can run.');
      return;
    }

    if (countRun && runs >= UNSAVED_DIAG_MAX_RUNS) {
      setError('Diagnostics run limit reached for this session. Sign in or sign up to continue.');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('question', (request.question || 'Please provide a full diagnostics report for this plant.').toString());

      photos.forEach((photo, index) => {
        const blob = dataUrlToBlob(photo);
        if (blob) {
          formData.append('photos', blob, `unsaved-plant-${index + 1}.jpg`);
        }
      });

      const response = await fetch(apiUrl('/api/ai/ask-arborai'), {
        method: 'POST',
        body: formData,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Diagnostics request failed.');
      }

      const normalized = {
        ...payload,
        species: (payload.species || payload.likely_identification || 'Unknown').toString(),
        confidence: (payload.confidence || 'Unknown').toString(),
        summary: (payload.summary || payload.raw_ai_message || 'Diagnostics complete.').toString(),
      };

      setReport(normalized);
      setSaveSpecies((normalized.species || '').toString());
      window.sessionStorage.setItem(UNSAVED_DIAG_REPORT_KEY, JSON.stringify(normalized));

      setFailureCount(0);
      window.sessionStorage.setItem(UNSAVED_DIAG_FAILURES_KEY, '0');

      if (countRun) {
        const nextRuns = Math.min(runs + 1, UNSAVED_DIAG_MAX_RUNS);
        setRuns(nextRuns);
        window.sessionStorage.setItem(UNSAVED_DIAG_RUNS_KEY, nextRuns.toString());
      }
    } catch (err) {
      const nextFailures = failureCount + 1;
      setFailureCount(nextFailures);
      window.sessionStorage.setItem(UNSAVED_DIAG_FAILURES_KEY, nextFailures.toString());

      if (nextFailures > 2) {
        setError('We seem to be having trouble, please try again later.');
      } else {
        setError(err?.message || 'Could not generate diagnostics right now.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!request) return;
    if (report) return;
    void runDiagnostics({ countRun: true });
  }, [request, report]);

  async function saveUnsavedReport() {
    setSaveError('');

    const name = saveName.trim();
    if (!name) {
      setSaveError('Plant name is required.');
      return;
    }

    if (!saveLocation) {
      setSaveError('Indoor/Outdoor is required.');
      return;
    }

    if (!report) {
      setSaveError('Run diagnostics before saving this plant report.');
      return;
    }

    setSaveBusy(true);
    try {
      const plants = await fetchDemoGardenPlants();
      const photos = Array.isArray(request?.photos) ? request.photos.filter(Boolean).slice(0, 5) : [];

      const nextPlant = {
        id: createId('demo-plant'),
        name,
        species: saveSpecies.trim(),
        room_or_bed: saveLocation,
        bed_number: null,
        row_section_id: '',
        notes: '',
        photos,
        last_diagnostics: report,
        journal_entries: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const saved = await saveDemoGardenPlants([nextPlant, ...plants]);
      const created = saved.find((item) => item.id === nextPlant.id) || nextPlant;

      window.sessionStorage.removeItem(UNSAVED_DIAG_REQUEST_KEY);
      window.sessionStorage.removeItem(UNSAVED_DIAG_REPORT_KEY);
      window.sessionStorage.removeItem(UNSAVED_DIAG_FAILURES_KEY);

      navigate(`/homeowners/demo-garden/plants/${encodeURIComponent(created.id)}#latest-diagnostics`);
    } catch (err) {
      setSaveError(err?.message || 'Could not save this report to a plant profile.');
    } finally {
      setSaveBusy(false);
    }
  }

  const recommendationList = toTextArray(report?.recommendations || report?.care_notes);
  const riskList = toTextArray(report?.risks || report?.primary_concerns);
  const photoNotes = toTextArray(report?.photo_summaries);

  return (
    <main className="homeowner-shell min-h-screen px-4 py-8 md:py-10">
      <div className="homeowner-surface mx-auto w-full max-w-5xl rounded-2xl p-6 md:p-8 shadow-2xl">
        <div className="tree-detail-topbar">
          <button className="btn btn-secondary" onClick={() => navigate('/homeowners/demo-garden')}>
            Back to Demo Garden
          </button>
          <p className="homeowner-subtext text-sm">Diagnostics Runs: {runs}/{UNSAVED_DIAG_MAX_RUNS}</p>
        </div>

        <section className="homeowner-panel homeowner-panel-info mt-4">
          <h1 className="homeowner-heading text-2xl font-bold">{title}</h1>

          {loading && (
            <div className="homeowner-detail-loading mt-3" role="status" aria-live="polite">
              <span className="homeowner-spinner" aria-hidden="true" />
              <span>Preparing Diagnostics Report</span>
            </div>
          )}

          {!loading && error && (
            <div className="mt-3">
              <p className="homeowner-alert homeowner-alert-error">{error}</p>
              {failureCount <= 2 && (
                <button type="button" className="homeowner-button-secondary mt-2 rounded-md px-4 py-2 text-sm font-semibold" onClick={() => void runDiagnostics({ countRun: false })}>
                  Retry
                </button>
              )}
            </div>
          )}

          {!loading && report && (
            <>
              <div className="mt-3 homeowner-diagnostics-grid">
                <div className="homeowner-diag-mini-card">
                  <p className="homeowner-diag-label">Likely Identification</p>
                  <h3>{report.species || 'Unknown'}</h3>
                </div>
                <div className="homeowner-diag-mini-card">
                  <p className="homeowner-diag-label">Confidence</p>
                  <h3>{report.confidence || 'Unknown'}</h3>
                </div>
                <div className="homeowner-diag-mini-card">
                  <p className="homeowner-diag-label">Overall Condition</p>
                  <h3>{(report.overall_condition || report.condition || 'Unknown').toString()}</h3>
                </div>
              </div>

              <div className="homeowner-diag-section mt-3">
                <p className="homeowner-diag-label">Summary</p>
                <p>{report.summary || 'No summary available.'}</p>
              </div>

              {riskList.length > 0 && (
                <div className="homeowner-diag-section mt-3">
                  <p className="homeowner-diag-label">Primary Concerns</p>
                  <ul>
                    {riskList.map((item, index) => (
                      <li key={`risk-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {recommendationList.length > 0 && (
                <div className="homeowner-diag-section mt-3">
                  <p className="homeowner-diag-label">Care Notes</p>
                  <ul>
                    {recommendationList.map((item, index) => (
                      <li key={`recommend-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {photoNotes.length > 0 && (
                <div className="homeowner-diag-section mt-3">
                  <p className="homeowner-diag-label">Photo Notes</p>
                  <ul>
                    {photoNotes.map((item, index) => (
                      <li key={`photo-note-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="homeowner-journal-entry-actions mt-4">
                <button
                  type="button"
                  className="homeowner-button-secondary rounded-md px-4 py-2 text-sm font-semibold"
                  disabled={loading || runs >= UNSAVED_DIAG_MAX_RUNS}
                  onClick={() => void runDiagnostics({ countRun: true })}
                >
                  Re-run Diagnostics
                </button>
              </div>

              {runs >= UNSAVED_DIAG_MAX_RUNS && (
                <div className="mt-3">
                  <p className="homeowner-subtext">You have used all {UNSAVED_DIAG_MAX_RUNS} diagnostics runs this session. Sign in or sign up to continue.</p>
                  <div className="homeowner-journal-entry-actions mt-2">
                    <button className="btn btn-secondary" type="button" onClick={() => navigate('/homeowners/login')}>Sign In</button>
                    <button className="btn btn-primary" type="button" onClick={() => navigate('/homeowners/signup')}>Sign Up</button>
                  </div>
                </div>
              )}

              <div className="mt-5">
                <button
                  type="button"
                  className="homeowner-button-primary rounded-md px-4 py-2 text-sm font-semibold"
                  onClick={() => setShowSaveForm((prev) => !prev)}
                >
                  Save to Remember this Plant's Diagnostics Report
                </button>
              </div>

              {showSaveForm && (
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <input
                    className="homeowner-input rounded-md px-3 py-2 text-sm"
                    placeholder="Plant name *"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                  />
                  <input
                    className="homeowner-input rounded-md px-3 py-2 text-sm"
                    placeholder="Species"
                    value={saveSpecies}
                    onChange={(e) => setSaveSpecies(e.target.value)}
                  />
                  <select className="homeowner-input rounded-md px-3 py-2 text-sm" value={saveLocation} onChange={(e) => setSaveLocation(e.target.value)}>
                    <option value="indoor">Indoor</option>
                    <option value="outdoor">Outdoor</option>
                  </select>

                  <div className="md:col-span-3 homeowner-journal-entry-actions">
                    <button
                      type="button"
                      className="homeowner-button-primary rounded-md px-4 py-2 text-sm font-semibold"
                      disabled={saveBusy}
                      onClick={() => void saveUnsavedReport()}
                    >
                      {saveBusy ? 'Saving...' : 'Save Plant Report'}
                    </button>
                    {saveError && <p className="homeowner-alert homeowner-alert-error">{saveError}</p>}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
