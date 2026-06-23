import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../utils/apiUrl';
import './HomeownerTheme.css';

export default function HomeownerDemoGarden() {
  const navigate = useNavigate();
  const [queenPassUnlocked, setQueenPassUnlocked] = useState(false);
  const [passError, setPassError] = useState('');
  const [passLoading, setPassLoading] = useState(false);
  const [showPassGate, setShowPassGate] = useState(false);
  const [pendingEditIndex, setPendingEditIndex] = useState(-1);
  const [queenPassForm, setQueenPassForm] = useState({
    email: 'rachaelr@rrtech.dev',
    pass_id: '',
  });
  const [demoPlants, setDemoPlants] = useState([
    {
      name: 'Front Porch Fern',
      species: 'Boston Fern',
      location: 'Indoor',
      bed: 0,
      row: 'A1',
      notes: 'Example profile: this is where homeowners will see their plant timeline and notes.',
    },
    {
      name: 'Kitchen Herb Cluster',
      species: 'Mixed Herbs',
      location: 'Indoor',
      bed: 0,
      row: 'B3',
      notes: 'Example profile: QR tag and location notes will live right beside Indoor/Outdoor details.',
    },
  ]);
  const [editingIndex, setEditingIndex] = useState(-1);
  const [draft, setDraft] = useState(null);

  function requestEdit(index) {
    if (!queenPassUnlocked) {
      setPendingEditIndex(index);
      setShowPassGate(true);
      return;
    }

    setDraft({ ...demoPlants[index] });
    setEditingIndex(index);
  }

  async function verifyQueensPass() {
    try {
      setPassLoading(true);
      setPassError('');

      const res = await fetch(apiUrl('/api/demo-garden/queens-pass/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(queenPassForm),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.ok) {
        throw new Error(payload.error || "Queen's Pass could not be verified.");
      }

      setQueenPassUnlocked(true);
      setShowPassGate(false);
      if (pendingEditIndex >= 0 && demoPlants[pendingEditIndex]) {
        setDraft({ ...demoPlants[pendingEditIndex] });
        setEditingIndex(pendingEditIndex);
      }
      setPendingEditIndex(-1);
    } catch (err) {
      setPassError(err.message || "Queen's Pass verification failed.");
    } finally {
      setPassLoading(false);
    }
  }

  function saveEdit() {
    if (editingIndex < 0 || !draft) return;
    setDemoPlants((prev) => prev.map((plant, index) => (index === editingIndex ? { ...draft } : plant)));
    setEditingIndex(-1);
    setDraft(null);
  }

  function cancelEdit() {
    setEditingIndex(-1);
    setDraft(null);
  }

  return (
    <main className="homeowner-shell min-h-screen px-4 py-10">
      <div className="homeowner-surface mx-auto w-full max-w-4xl rounded-2xl p-8 shadow-2xl">
        <h1 className="homeowner-heading text-3xl font-bold">Explore the Demo Digital Garden</h1>
        <p className="homeowner-subtext mt-3 text-sm">
          This is how your Digital Garden will look. You will be able to organize each plant profile, keep care history,
          manage location notes, and use QR-linked records as your garden grows.
        </p>

        <p className="homeowner-subtext mt-4 text-sm">
          Demo editing is locked for early preview users. Click Edit on any profile and enter the Queen&apos;s Pass to unlock edits.
        </p>

        <div className="mt-6 grid gap-4">
          {demoPlants.map((plant, index) => (
            <article key={`${plant.name}-${index}`} className="homeowner-panel homeowner-panel-info">
              {editingIndex === index && draft ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="homeowner-heading block text-sm font-semibold">
                    Plant Name
                    <input
                      className="homeowner-input mt-1 w-full rounded-md px-3 py-2 outline-none"
                      value={draft.name}
                      onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                    />
                  </label>
                  <label className="homeowner-heading block text-sm font-semibold">
                    Species
                    <input
                      className="homeowner-input mt-1 w-full rounded-md px-3 py-2 outline-none"
                      value={draft.species}
                      onChange={(e) => setDraft((prev) => ({ ...prev, species: e.target.value }))}
                    />
                  </label>
                  <label className="homeowner-heading block text-sm font-semibold">
                    Indoor / Outdoor
                    <select
                      className="homeowner-input mt-1 w-full rounded-md px-3 py-2 outline-none"
                      value={draft.location}
                      onChange={(e) => setDraft((prev) => ({ ...prev, location: e.target.value }))}
                    >
                      <option value="Indoor">Indoor</option>
                      <option value="Outdoor">Outdoor</option>
                    </select>
                  </label>
                  <label className="homeowner-heading block text-sm font-semibold">
                    Bed #
                    <input
                      className="homeowner-input mt-1 w-full rounded-md px-3 py-2 outline-none"
                      type="number"
                      min="1"
                      max="100"
                      value={draft.bed}
                      onChange={(e) => setDraft((prev) => ({ ...prev, bed: e.target.value }))}
                    />
                  </label>
                  <label className="homeowner-heading block text-sm font-semibold">
                    Row / Section ID
                    <input
                      className="homeowner-input mt-1 w-full rounded-md px-3 py-2 outline-none"
                      value={draft.row}
                      onChange={(e) => setDraft((prev) => ({ ...prev, row: e.target.value.toUpperCase() }))}
                      placeholder="A1"
                    />
                  </label>
                  <label className="homeowner-heading block text-sm font-semibold md:col-span-2">
                    Notes
                    <textarea
                      className="homeowner-input mt-1 w-full rounded-md px-3 py-2 outline-none"
                      rows={3}
                      value={draft.notes}
                      onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
                    />
                  </label>
                  <div className="md:col-span-2 flex gap-2 flex-wrap">
                    <button type="button" className="homeowner-button-primary rounded-md px-4 py-2 text-sm font-semibold" onClick={saveEdit}>
                      Save Demo Changes
                    </button>
                    <button type="button" className="homeowner-button-secondary rounded-md px-4 py-2 text-sm font-semibold" onClick={cancelEdit}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="homeowner-heading text-xl font-semibold">{plant.name}</h2>
                  <p className="homeowner-subtext text-sm">Species: {plant.species}</p>
                  <p className="homeowner-subtext text-sm">Indoor / Outdoor: {plant.location}</p>
                  <p className="homeowner-subtext text-sm">Bed #: {plant.bed || 'Not set'} | Row / Section: {plant.row || 'Not set'}</p>
                  <p className="homeowner-subtext text-sm">Notes: {plant.notes}</p>
                  <button
                    type="button"
                    className="homeowner-button-secondary mt-3 rounded-md px-4 py-2 text-sm font-semibold"
                    onClick={() => requestEdit(index)}
                  >
                    Edit Demo Profile
                  </button>
                </>
              )}
            </article>
          ))}
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
                onClick={() => setShowPassGate(false)}
              >
                Close
              </button>
            </div>
          </section>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            className="homeowner-button-primary rounded-md px-5 py-2.5 text-sm font-semibold"
            onClick={() => navigate('/homeowners/signup')}
          >
            Create My Digital Garden
          </button>
          <button
            type="button"
            className="homeowner-button-secondary rounded-md px-5 py-2.5 text-sm font-semibold"
            onClick={() => navigate('/homeowners')}
          >
            Back
          </button>
        </div>
      </div>
    </main>
  );
}
