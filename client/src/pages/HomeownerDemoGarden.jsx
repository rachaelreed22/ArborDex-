import { useEffect, useMemo, useRef, useState } from 'react';
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

const DEMO_COMPANION_STORAGE_KEY = 'arbordex-demo-garden-companion-v1';
const DEMO_COMPANION_DOCS_STORAGE_KEY = 'arbordex-demo-garden-docs-v1';
const DEMO_GARDEN_NAME_PROMPT = [
  'Welcome!',
  '',
  "I'm your Garden Companion.",
  '',
  "I'll remember your plants, your photos, your journals, your garden layout, and everything you teach me over time.",
  '',
  "Let's start by giving your garden a name.",
  'What would you like to call it?',
].join('\n');
const DEMO_GARDEN_AFTER_NAME_PROMPT = "Great! I'll help you remember what you planted, where it lives, and what changed season to season. Ask me anything about this specific garden anytime.";
const DEMO_COMPANION_SUGGESTED_PROMPTS = [
  '🌱 What should I work on today?',
  '📒 Summarize my garden.',
  '🌼 Help me plan next season.',
  '📷 Which plants need updates?',
];

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

function toDemoCompanionMessage(message) {
  if (!message || typeof message !== 'object') return null;
  const role = (message.role || '').toString();
  if (!['assistant', 'user'].includes(role)) return null;
  const content = (message.content || '').toString();
  if (!content.trim()) return null;
  return {
    id: message.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    created_at: message.created_at || new Date().toISOString(),
  };
}

function readDemoCompanionState() {
  const raw = window.sessionStorage.getItem(DEMO_COMPANION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const gardenName = (parsed.garden_name || '').toString();
    const messages = Array.isArray(parsed.messages)
      ? parsed.messages.map(toDemoCompanionMessage).filter(Boolean)
      : [];
    return { gardenName, messages };
  } catch {
    return null;
  }
}

function saveDemoCompanionState(gardenName, messages) {
  const payload = {
    garden_name: (gardenName || '').toString(),
    messages: Array.isArray(messages) ? messages.map(toDemoCompanionMessage).filter(Boolean) : [],
  };
  window.sessionStorage.setItem(DEMO_COMPANION_STORAGE_KEY, JSON.stringify(payload));
}

function createDemoCompanionMessage(role, content) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    created_at: new Date().toISOString(),
  };
}

function toDemoDocumentedEntry(item) {
  if (!item || typeof item !== 'object') return null;
  const details = (item.details || '').toString().trim();
  if (!details) return null;
  return {
    id: item.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    details,
    created_at: item.created_at || new Date().toISOString(),
  };
}

function buildDemoCompanionSummary(gardenName, plants) {
  const safePlants = Array.isArray(plants) ? plants : [];
  const speciesSet = new Set();
  const locationSet = new Set();
  let photoCount = 0;
  let journalCount = 0;
  const allNotes = [];

  safePlants.forEach((plant) => {
    const species = (plant?.species || '').toString().trim();
    if (species) speciesSet.add(species);

    const location = (plant?.row_section_id || plant?.room_or_bed || '').toString().trim();
    if (location) locationSet.add(location);

    const photos = Array.isArray(plant?.photos) ? plant.photos : [];
    photoCount += photos.length;

    const journalEntries = Array.isArray(plant?.journal_entries) ? plant.journal_entries : [];
    journalCount += journalEntries.length;
    journalEntries.forEach((entry) => {
      const notes = (entry?.notes || '').toString().trim();
      if (notes) allNotes.push(notes);
    });

    const plantNotes = (plant?.notes || '').toString().trim();
    if (plantNotes) allNotes.push(plantNotes);
  });

  return {
    headline: `${gardenName || 'Demo Digital Garden'}: ${safePlants.length} plant profile${safePlants.length === 1 ? '' : 's'} tracked.`,
    plant_count: safePlants.length,
    species_count: speciesSet.size,
    location_count: locationSet.size,
    photo_count: photoCount,
    journal_entry_count: journalCount,
    recent_notes: allNotes.slice(-8).reverse(),
    species: Array.from(speciesSet).sort(),
    locations: Array.from(locationSet).sort(),
  };
}

function buildDemoCompanionReply(question, summary) {
  const text = (question || '').toString().toLowerCase();
  const speciesText = summary.species.length > 0 ? summary.species.slice(0, 6).join(', ') : 'No species saved yet';
  const locationText = summary.locations.length > 0 ? summary.locations.slice(0, 8).join(', ') : 'No locations set yet';

  if (/remind|schedule|watering|fertiliz/i.test(text)) {
    return [
      `From ${summary.plant_count} plants and ${summary.journal_entry_count} journal entries, this garden looks active enough for a weekly check-in rhythm.`,
      'Try this simple plan: Monday watering check, Thursday pest/stress check, and a Sunday notes update for anything that changed.',
      `Current locations tracked: ${locationText}.`,
    ].join(' ');
  }

  if (/history|journal|remember|notes/i.test(text)) {
    const notesPreview = summary.recent_notes.length > 0
      ? `Recent notes: ${summary.recent_notes.slice(0, 3).join(' | ')}`
      : 'No recent notes yet, so adding short weekly notes will quickly build useful memory.';
    return `Your demo garden history currently has ${summary.journal_entry_count} journal entries and ${summary.photo_count} photos. ${notesPreview}`;
  }

  if (/organize|location|map|layout|where/i.test(text)) {
    return `You currently have ${summary.location_count} location tags (${locationText}). A good next step is to standardize each plant with row/section labels (A1, B3) plus indoor/outdoor so it stays searchable over time.`;
  }

  if (/species|pattern|trend|across|overall/i.test(text)) {
    return `Across your demo garden I see ${summary.species_count} species and ${summary.plant_count} total profiles. Species tracked: ${speciesText}. Use monthly photo snapshots to spot garden-wide trends early.`;
  }

  return [
    `I can help with whole-garden planning using what is already tracked in ${summary.plant_count} plant profiles.`,
    `Right now you have ${summary.photo_count} photos, ${summary.journal_entry_count} journal entries, and ${summary.location_count} locations saved.`,
    'Ask me about reminders, organizing plant locations, history notes, or seasonal planning across the whole garden.',
  ].join(' ');
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
  const [demoGardenName, setDemoGardenName] = useState('');
  const [demoGardenNameInput, setDemoGardenNameInput] = useState('');
  const [companionMessages, setCompanionMessages] = useState([]);
  const [companionInput, setCompanionInput] = useState('');
  const [companionLoading, setCompanionLoading] = useState(false);
  const [documentedNotes, setDocumentedNotes] = useState([]);
  const companionBottomRef = useRef(null);

  const companionSummary = useMemo(
    () => buildDemoCompanionSummary(demoGardenName || 'Demo Digital Garden', plants),
    [demoGardenName, plants]
  );

  useEffect(() => {
    const savedState = readDemoCompanionState();
    if (savedState) {
      setDemoGardenName(savedState.gardenName || '');
      setDemoGardenNameInput(savedState.gardenName || '');
      if (savedState.messages.length > 0) {
        setCompanionMessages(savedState.messages);
      } else {
        setCompanionMessages([createDemoCompanionMessage('assistant', DEMO_GARDEN_NAME_PROMPT)]);
      }
      return;
    }

    setCompanionMessages([createDemoCompanionMessage('assistant', DEMO_GARDEN_NAME_PROMPT)]);
  }, []);

  useEffect(() => {
    if (companionMessages.length === 0) return;
    saveDemoCompanionState(demoGardenName, companionMessages);
  }, [demoGardenName, companionMessages]);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(DEMO_COMPANION_DOCS_STORAGE_KEY);
      if (!raw) {
        setDocumentedNotes([]);
        return;
      }
      const parsed = JSON.parse(raw);
      const nextEntries = Array.isArray(parsed) ? parsed.map(toDemoDocumentedEntry).filter(Boolean) : [];
      setDocumentedNotes(nextEntries);
    } catch {
      setDocumentedNotes([]);
    }
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem(DEMO_COMPANION_DOCS_STORAGE_KEY, JSON.stringify(documentedNotes));
  }, [documentedNotes]);

  useEffect(() => {
    companionBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [companionMessages, companionLoading]);

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

  function saveDemoGardenName(e) {
    e.preventDefault();
    const nextName = demoGardenNameInput.trim();
    if (!nextName) return;
    setDemoGardenName(nextName);
    setDemoGardenNameInput(nextName);
  }

  function sendCompanionMessage(e) {
    e.preventDefault();
    const message = companionInput.trim();
    if (!message || companionLoading) return;

    const nextUserMessage = createDemoCompanionMessage('user', message);
    setCompanionMessages((prev) => [...prev, nextUserMessage]);
    setCompanionInput('');
    setCompanionLoading(true);

    window.setTimeout(() => {
      if (!demoGardenName.trim()) {
        const nextGardenName = message.slice(0, 80).trim();
        setDemoGardenName(nextGardenName);
        setDemoGardenNameInput(nextGardenName);
        setCompanionMessages((prev) => [
          ...prev,
          createDemoCompanionMessage('assistant', `Great, ${nextGardenName}! ${DEMO_GARDEN_AFTER_NAME_PROMPT}`),
        ]);
        setCompanionLoading(false);
        return;
      }

      const reply = buildDemoCompanionReply(message, companionSummary);
      setCompanionMessages((prev) => [...prev, createDemoCompanionMessage('assistant', reply)]);
      setCompanionLoading(false);
    }, 320);
  }

  function useSuggestedPrompt(prompt) {
    const cleaned = (prompt || '').toString().replace(/^[^A-Za-z0-9]+\s*/, '').trim();
    if (!cleaned) return;
    setCompanionInput(cleaned);
  }

  function documentLatestDiscussion() {
    const mostRecentAssistant = [...companionMessages].reverse().find((entry) => entry.role === 'assistant');
    const mostRecentUser = [...companionMessages].reverse().find((entry) => entry.role === 'user');

    const parts = [];
    if (mostRecentUser?.content) {
      parts.push(`You: ${mostRecentUser.content}`);
    }
    if (mostRecentAssistant?.content) {
      parts.push(`Garden Partner: ${mostRecentAssistant.content}`);
    }

    const details = parts.join('\n\n').trim();
    if (!details) {
      setError('Start a chat first, then tap Document This to log the discussion.');
      return;
    }

    const entry = {
      id: `demo-note-${Date.now()}`,
      details,
      created_at: new Date().toISOString(),
    };
    setDocumentedNotes((prev) => [entry, ...prev]);
  }

  async function persistPlants(updater) {
    setSaving(true);
    setError('');

    try {
      const basePlants = Array.isArray(plants) && plants.length > 0 ? plants : getCachedDemoGardenPlants();
      const nextPlants = typeof updater === 'function' ? updater(basePlants) : updater;
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
    <main className="homeowner-shell homeowner-demo-page min-h-screen px-4 py-8 md:py-10">
      <div className="homeowner-surface mx-auto w-full max-w-6xl rounded-2xl p-6 md:p-8 shadow-2xl">
        <div className="homeowner-demo-hero">
          <div>
            <h1 className="homeowner-heading text-3xl font-bold">Never forget what you planted, where you planted it or how it grew</h1>
          </div>
          <div className="homeowner-demo-hero-actions">
            <button onClick={() => navigate('/')} className="homeowner-button-secondary rounded-md px-4 py-2 text-sm font-semibold">Home</button>
            <button onClick={() => navigate('/homeowners')} className="homeowner-button-secondary rounded-md px-4 py-2 text-sm font-semibold">Back</button>
            <button onClick={() => navigate('/help')} className="homeowner-button-secondary rounded-md px-4 py-2 text-sm font-semibold">Help / FAQ</button>
          </div>
        </div>

        <p className="homeowner-demo-hero-tagline">Let ArborTag remember your garden so that you can enjoy growing it.</p>

        <section className="homeowner-panel homeowner-panel-info mt-4 companion-section">
          <div className="companion-header">
            <div>
              <p className="homeowner-heading text-base font-semibold">ArborTag is your garden's memory.</p>
              <h2 className="homeowner-heading text-xl font-bold mt-1">Meet Your Garden Companion</h2>
              <p className="homeowner-subtext text-sm">Let ArborTag remember your plants, journals, garden layouts, and history-so you don't have to.</p>
            </div>
          </div>

          <div className="companion-chat companion-chat-focus mt-3">
            <div className="flex flex-wrap gap-2">
              {DEMO_COMPANION_SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="homeowner-button-secondary rounded-md px-3 py-1.5 text-xs font-semibold"
                  onClick={() => useSuggestedPrompt(prompt)}
                  disabled={companionLoading}
                >
                  {prompt}
                </button>
              ))}
            </div>
            <div className="companion-chat-messages" role="log" aria-live="polite">
              {companionMessages.map((message) => (
                <article
                  key={message.id}
                  className={`companion-message ${message.role === 'assistant' ? 'companion-message-assistant' : 'companion-message-user'}`}
                >
                  <p className="companion-message-role">{message.role === 'assistant' ? 'Garden Companion' : 'You'}</p>
                  <p className="companion-message-text">{message.content}</p>
                </article>
              ))}
              {companionLoading && (
                <article className="companion-message companion-message-assistant">
                  <p className="companion-message-role">Garden Companion</p>
                  <p className="companion-message-text">Thinking about your garden...</p>
                </article>
              )}
              <div ref={companionBottomRef} />
            </div>

            <form className="companion-chat-form" onSubmit={sendCompanionMessage}>
              <textarea
                className="homeowner-input companion-chat-input"
                rows={3}
                value={companionInput}
                onChange={(e) => setCompanionInput(e.target.value)}
                placeholder="Ask about reminders, notes, patterns, seasonal planning, or plant organization..."
                disabled={companionLoading}
              />
              <div className="companion-chat-actions">
                <button
                  type="button"
                  className="homeowner-button-secondary rounded-md px-4 py-2 text-sm font-semibold"
                  onClick={documentLatestDiscussion}
                  disabled={companionLoading || companionMessages.length === 0}
                >
                  Document This
                </button>
                <button
                  type="submit"
                  className="homeowner-button-primary rounded-md px-4 py-2 text-sm font-semibold"
                  disabled={companionLoading || !companionInput.trim()}
                >
                  {companionLoading ? 'Sending...' : 'Enter'}
                </button>
              </div>
            </form>
          </div>

          <section className="companion-docs mt-3">
            <h3 className="homeowner-heading text-sm font-semibold">Event / Notes Documentation</h3>
            <p className="homeowner-subtext mt-1 text-sm">
              This is the memory backbone for the demo garden. Capture discussion highlights with date and time.
            </p>
            <div className="companion-doc-list mt-2">
              {documentedNotes.length === 0 && (
                <p className="homeowner-subtext text-sm">No documented notes yet. Start a chat, then tap Document This.</p>
              )}
              {documentedNotes.map((entry) => (
                <article key={entry.id} className="companion-doc-item">
                  <p className="companion-doc-meta">{new Date(entry.created_at).toLocaleString()}</p>
                  <p className="companion-doc-text">{entry.details}</p>
                </article>
              ))}
            </div>
          </section>

          <div className="companion-secondary mt-3">
            <div className="companion-summary">
              <p className="homeowner-heading text-sm font-semibold">I currently know:</p>
              <div className="companion-summary-grid mt-2">
                <span>🌱 {companionSummary.plant_count} plant profile{companionSummary.plant_count === 1 ? '' : 's'}</span>
                <span>📷 {companionSummary.photo_count} photo{companionSummary.photo_count === 1 ? '' : 's'}</span>
                <span>📍 {companionSummary.location_count} growing location{companionSummary.location_count === 1 ? '' : 's'}</span>
                <span>📝 {companionSummary.journal_entry_count} journal entr{companionSummary.journal_entry_count === 1 ? 'y' : 'ies'}</span>
                <span>🗺 Garden layout: {companionSummary.location_count > 0 ? 'Mapped by saved locations' : 'Not mapped yet'}</span>
              </div>
              <p className="homeowner-subtext mt-2 text-sm">Ask me anything about THIS garden.</p>
              <p className="homeowner-subtext mt-1 text-sm">The memory behind every garden.</p>
            </div>

            <div className="companion-summary mt-3">
              <p className="homeowner-heading text-sm font-semibold">Garden Summary</p>
              <p className="homeowner-subtext text-sm">{companionSummary.headline}</p>
              <div className="companion-summary-grid mt-2">
                <span>Plants: {companionSummary.plant_count}</span>
                <span>Species: {companionSummary.species_count}</span>
                <span>Locations: {companionSummary.location_count}</span>
                <span>Journal Entries: {companionSummary.journal_entry_count}</span>
                <span>Photos: {companionSummary.photo_count}</span>
              </div>
            </div>
          </div>
        </section>

        <div className="homeowner-panel homeowner-panel-info mt-5">
          <p className="homeowner-heading text-base font-semibold">Why not just use ChatGPT?</p>
          <p className="homeowner-subtext mt-2 text-sm">ChatGPT answers gardening questions. ArborTag remembers this garden from what you record.</p>
          <ul className="homeowner-subtext homeowner-feature-list mt-2 space-y-1 text-sm">
            <li>✔ Plant profiles</li>
            <li>✔ Photos</li>
            <li>✔ Journal history</li>
            <li>✔ Growing locations</li>
            <li>✔ Ongoing garden context</li>
          </ul>
          <p className="homeowner-subtext mt-2 text-sm">The more you record, the more personalized your Garden Companion becomes.</p>
        </div>

        <div className="homeowner-panel homeowner-panel-info mt-4">
          <p className="homeowner-heading text-base font-semibold">Welcome to the ArborTag Demo Garden</p>
          <p className="homeowner-subtext mt-2 text-sm">Browse sample plant profiles to see how you can:</p>
          <ul className="homeowner-subtext homeowner-feature-list mt-2 space-y-1 text-sm">
            <li>✅ Organize plants by location</li>
            <li>✅ Keep photos and notes together</li>
            <li>✅ Track watering, fertilizing, and harvests</li>
            <li>✅ Store plant history in one place</li>
            <li>✅ Build a living record of your garden over time</li>
          </ul>
        </div>

        {error && <p className="homeowner-alert homeowner-alert-error">{error}</p>}
        {loading && <p className="homeowner-subtext mt-4 text-sm">Loading demo garden plants...</p>}
        {!loading && saving && <p className="homeowner-subtext mt-4 text-sm">Saving your demo garden updates...</p>}

        <form onSubmit={createPlant} className="homeowner-stat-card mt-5 rounded-xl p-4">
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

        <div className="mt-5">
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

        <div className="mt-6 flex flex-wrap gap-3">
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
