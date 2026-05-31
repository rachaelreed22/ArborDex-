import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMode } from '../context/ModeContext';
import { apiUrl } from '../utils/apiUrl';
import './AskArborAI.css';

const ASK_ARBOR_AI_STORAGE_KEY = 'arbortag.askArborAi.session.v1';

function getInitialAssistantMessage() {
  return createMessage({
    role: 'assistant',
    text: 'Hi! I am ArborAI. Upload or take a tree photo and ask anything about species, health, risk, or care.',
  });
}

function sanitizeMessageForStorage(message) {
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    photos: [],
    photoFiles: [],
    diagnostics: message.diagnostics || null,
    showActions: false,
    scanPayload: message.scanPayload || null,
    actionCompleted: true,
    createdAt: message.createdAt || Date.now(),
  };
}

function createMessage({
  role,
  text = '',
  photos = [],
  photoFiles = [],
  diagnostics = null,
  showActions = false,
  scanPayload = null,
  actionCompleted = false,
}) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    text,
    photos,
    photoFiles,
    diagnostics,
    showActions,
    scanPayload,
    actionCompleted,
    createdAt: Date.now(),
  };
}

export default function AskArborAI() {
  const { mode } = useMode();
  const isStaff = mode === 'dex';
  const navigate = useNavigate();
  const [messages, setMessages] = useState([getInitialAssistantMessage()]);
  const [uploadedPhotos, setUploadedPhotos] = useState([]);
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [listings, setListings] = useState([]);
  const [isListingsLoading, setIsListingsLoading] = useState(false);
  const [attachDialogOpen, setAttachDialogOpen] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState('');
  const [attachMessageId, setAttachMessageId] = useState('');
  const [hasHydratedSession, setHasHydratedSession] = useState(false);
  const chatRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);
  const bottomRef = useRef(null);

  const buildPrefillDescription = ({ summary, confidence, healthScore, recommendations, assistantText }) => {
    const parts = [
      typeof summary === 'string' ? summary.trim() : '',
      confidence ? `Confidence: ${confidence}` : '',
      healthScore !== undefined && healthScore !== null ? `Health score: ${healthScore}` : '',
      Array.isArray(recommendations) && recommendations.length > 0
        ? `Care tips: ${recommendations.slice(0, 2).join(' ')}`
        : '',
      typeof assistantText === 'string' ? assistantText.trim() : '',
    ].filter(Boolean);

    return parts.join('\n\n');
  };

  const resetConversation = () => {
    setMessages([getInitialAssistantMessage()]);
    setQuestion('');
    setUploadedPhotos([]);
    setActionError('');
    setListings([]);
    setIsListingsLoading(false);
    setIsActionLoading(false);
    setIsLoading(false);
    setAttachDialogOpen(false);
    setSelectedListingId('');
    setAttachMessageId('');
    shouldAutoScrollRef.current = true;
    try {
      localStorage.removeItem(ASK_ARBOR_AI_STORAGE_KEY);
    } catch {
      // Ignore storage errors in private mode.
    }
  };

  useEffect(() => {
    if (!hasHydratedSession) return;

    const payload = {
      messages: messages.map(sanitizeMessageForStorage),
      question,
    };

    try {
      localStorage.setItem(ASK_ARBOR_AI_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage errors in private mode.
    }
  }, [messages, question, hasHydratedSession]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ASK_ARBOR_AI_STORAGE_KEY);
      if (!raw) {
        setHasHydratedSession(true);
        return;
      }

      const parsed = JSON.parse(raw);
      const savedMessages = Array.isArray(parsed?.messages) ? parsed.messages : [];
      const normalized = savedMessages
        .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
        .map((item) => ({
          ...createMessage({ role: item.role, text: item.text || '' }),
          id: item.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          diagnostics: item.diagnostics || null,
          scanPayload: item.scanPayload || null,
          showActions: false,
          actionCompleted: true,
          photos: [],
          photoFiles: [],
          createdAt: item.createdAt || Date.now(),
        }));

      setMessages(normalized.length > 0 ? normalized : [getInitialAssistantMessage()]);
      setQuestion((parsed?.question || '').toString());
    } catch {
      setMessages([getInitialAssistantMessage()]);
      setQuestion('');
    } finally {
      setHasHydratedSession(true);
    }
  }, []);

  useEffect(() => {
    if (!hasHydratedSession || !shouldAutoScrollRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [messages.length, isLoading, hasHydratedSession]);

  const handleChatScroll = () => {
    const chat = chatRef.current;
    if (!chat) return;
    const distanceFromBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 72;
  };

  const photoPreviews = useMemo(
    () => uploadedPhotos.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
    [uploadedPhotos]
  );

  useEffect(() => {
    return () => {
      photoPreviews.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, [photoPreviews]);

  const handleFilesSelected = (event) => {
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'));
    if (!files.length) return;
    setUploadedPhotos((prev) => [...prev, ...files]);
    event.target.value = '';
  };

  const removePhoto = (index) => {
    setUploadedPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const resetComposer = () => {
    setQuestion('');
    setUploadedPhotos([]);
  };

  const markActionCompleted = (messageId) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? { ...message, actionCompleted: true, showActions: false }
          : message
      )
    );
  };

  const appendAssistantMessage = (text) => {
    setMessages((prev) => [...prev, createMessage({ role: 'assistant', text })]);
  };

  const sendMessage = async () => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion && uploadedPhotos.length === 0) return;
    if (isLoading) return;

    const imagePreviewUrls = uploadedPhotos.map((file) => URL.createObjectURL(file));

    setMessages((prev) => [
      ...prev,
      createMessage({
        role: 'user',
        text: trimmedQuestion || 'Analyze these photos',
        photos: imagePreviewUrls,
      }),
    ]);

    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('question', trimmedQuestion);
      uploadedPhotos.forEach((file) => formData.append('photos', file));

      const response = await fetch(apiUrl('/api/ai/ask-arborai'), {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to get ArborAI response');
      }

      const risks = Array.isArray(data.risks) ? data.risks : [];
      const recommendations = Array.isArray(data.recommendations) ? data.recommendations : [];
      const photoSummaries = Array.isArray(data.photo_summaries) ? data.photo_summaries : [];
      const hazardDetails = Array.isArray(data.hazard_details) ? data.hazard_details : [];

      const hazardTextBlob = [
        data.summary,
        data.raw_ai_message,
        ...risks,
        ...recommendations,
        ...photoSummaries,
        ...hazardDetails,
      ]
        .map((item) => (item == null ? '' : item.toString().toLowerCase()))
        .join(' | ');

      const hasDecay = /(decay|decaying|rot|rotting|hollow|cavity|loss\s+of\s+integrity)/i.test(hazardTextBlob);
      const hasStructuralRisk = /(instability|structural|failure|compromised|fall\s+risk|collapse|unsafe|consider\s+removal)/i.test(hazardTextBlob);
      const hasTrunkBaseRoot = /(trunk|base|basal|root|root\s*flare|root\s*collar)/i.test(hazardTextBlob);
      const hasNegatedRisk = /(no|not|without)\s+(clear\s+)?(signs?\s+of\s+)?(hazards?|risk|decay|rot|instability|failure)/i.test(hazardTextBlob);
      const inferredHazard = hasDecay && hasTrunkBaseRoot && !hasNegatedRisk && (hasStructuralRisk || hasDecay);

      const normalizedHazardDetails = Array.from(
        new Set(
          hazardDetails
            .map((item) => (item == null ? '' : item.toString().trim()))
            .filter(Boolean)
        )
      );

      if (inferredHazard && normalizedHazardDetails.length === 0) {
        normalizedHazardDetails.push('Critical trunk/base decay indicators detected; needs human inspection.');
      }

      const hazardsDetected =
        normalizedHazardDetails.length > 0 ||
        inferredHazard ||
        ['yes', 'y', 'true'].includes((data.hazards_detected || '').toString().trim().toLowerCase())
          ? 'Yes'
          : 'No';
      const confidence = data.confidence || 'Unknown';
      const healthScore = data.health_score ?? 'Unknown';
      const species = data.species || 'Unknown';
      const summary = data.summary || 'No summary returned.';

      const assistantText =
        data.raw_ai_message ||
        `${species} appears to have ${confidence.toLowerCase()} confidence with a health score of ${healthScore}.`;

      setMessages((prev) => [
        ...prev,
        createMessage({
          role: 'assistant',
          text: assistantText,
          photoFiles: [...uploadedPhotos],
          diagnostics: {
            species,
            confidence,
            healthScore,
            summary,
            risks,
            recommendations,
            photoSummaries,
            hazardsDetected,
            hazardDetails: normalizedHazardDetails,
          },
          scanPayload: {
            species,
            confidence,
            health_score: healthScore,
            summary,
            risks,
            recommendations,
            photo_summaries: photoSummaries,
            hazards_detected: hazardsDetected,
            hazard_details: normalizedHazardDetails,
            raw_ai_message: assistantText,
            photo_urls: Array.isArray(data.photo_urls) ? data.photo_urls : [],
          },
          showActions: true,
        }),
      ]);

      resetComposer();
      setActionError('');
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        createMessage({
          role: 'assistant',
          text: `I could not complete that scan yet: ${error.message}`,
        }),
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const onComposerKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const createTreeFromScan = async (message) => {
    if (!message?.scanPayload) {
      appendAssistantMessage('This scan is missing payload data. Run a new scan and try again.');
      return;
    }

    const species = (message.scanPayload.species || '').toString().trim();
    const title = species || 'Untitled Tree';
    const description = buildPrefillDescription({
      summary: message.scanPayload.summary,
      confidence: message.scanPayload.confidence,
      healthScore: message.scanPayload.health_score,
      recommendations: message.scanPayload.recommendations,
      assistantText: message.text,
    });

    markActionCompleted(message.id);
    navigate('/add', {
      state: {
        fromScan: {
          title,
          description,
          photos: Array.isArray(message.photoFiles) ? message.photoFiles : [],
          scanPayload: message.scanPayload,
          assistantText: message.text,
        },
      },
    });
  };

  const openAttachDialog = async (message) => {
    if (!message?.scanPayload) {
      appendAssistantMessage('This scan is missing payload data. Run a new scan and try again.');
      return;
    }

    setAttachMessageId(message.id);
    setAttachDialogOpen(true);
    setActionError('');

    if (listings.length > 0) {
      if (!selectedListingId) {
        setSelectedListingId(listings[0].id);
      }
      return;
    }

    setIsListingsLoading(true);
    try {
      const response = await fetch(apiUrl('/api/listings'));
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load trees');
      }

      const normalized = Array.isArray(data) ? data : [];
      setListings(normalized);
      if (normalized[0]?.id) {
        setSelectedListingId(normalized[0].id);
      }
    } catch (error) {
      setActionError(error.message);
      appendAssistantMessage(`Could not load trees for attach: ${error.message}`);
    } finally {
      setIsListingsLoading(false);
    }
  };

  const attachScanToExistingTree = async () => {
    if (!attachMessageId) return;
    if (!selectedListingId) {
      setActionError('Select a tree before attaching this scan.');
      return;
    }

    const sourceMessage = messages.find((message) => message.id === attachMessageId);
    if (!sourceMessage?.scanPayload) {
      setActionError('This scan payload is no longer available.');
      return;
    }

    setIsActionLoading(true);
    setActionError('');

    try {
      const response = await fetch(apiUrl('/api/ai/attach-scan-to-tree'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: selectedListingId,
          ...sourceMessage.scanPayload,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to attach scan to tree');
      }

      markActionCompleted(sourceMessage.id);
      setAttachDialogOpen(false);
      appendAssistantMessage(`Attached ${data.added_photos} photo(s) to tree ${data.listing_id}.`);
      navigate(`/listing/${data.listing_id}`);
    } catch (error) {
      setActionError(error.message);
      appendAssistantMessage(`Attach scan failed: ${error.message}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const renderDiagnostics = (diagnostics) => {
    if (!diagnostics) return null;

    return (
      <div className="ask-diagnostics">
        <div className="ask-diag-grid">
          <div className="ask-diag-card">
            <p className="ask-diag-label">Species</p>
            <h3>{diagnostics.species}</h3>
          </div>
          <div className="ask-diag-card">
            <p className="ask-diag-label">Confidence</p>
            <h3>{diagnostics.confidence}</h3>
          </div>
          <div className="ask-diag-card">
            <p className="ask-diag-label">Health Score</p>
            <h3>{diagnostics.healthScore}</h3>
          </div>
        </div>

        <div className="ask-diag-section">
          <p className="ask-diag-label">Summary</p>
          <p>{diagnostics.summary}</p>
        </div>

        {diagnostics.risks.length > 0 && (
          <div className="ask-diag-section">
            <p className="ask-diag-label">Risks</p>
            <ul>
              {diagnostics.risks.map((risk, index) => (
                <li key={`risk-${index}`}>{risk}</li>
              ))}
            </ul>
          </div>
        )}

        {diagnostics.recommendations.length > 0 && (
          <div className="ask-diag-section">
            <p className="ask-diag-label">Recommendations</p>
            <ul>
              {diagnostics.recommendations.map((item, index) => (
                <li key={`recommendation-${index}`}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="ask-diag-section">
          <p className="ask-diag-label">Hazards Detected</p>
          <p>{diagnostics.hazardsDetected === 'Yes' ? 'Y' : 'N'}</p>
        </div>

        {diagnostics.hazardsDetected === 'Yes' && (
          <div className="ask-diag-section">
            <p className="ask-diag-label">Hazard Details</p>
            {Array.isArray(diagnostics.hazardDetails) && diagnostics.hazardDetails.length > 0 ? (
              <ul>
                {diagnostics.hazardDetails.map((item, index) => (
                  <li key={`hazard-${index}`}>{item}</li>
                ))}
              </ul>
            ) : (
              <p>No specific hazard details returned.</p>
            )}
          </div>
        )}

        {diagnostics.photoSummaries.length > 0 && (
          <div className="ask-diag-section">
            <p className="ask-diag-label">Photo Notes</p>
            <ul>
              {diagnostics.photoSummaries.map((note, index) => (
                <li key={`note-${index}`}>{note}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="ask-page">
      <section className="ask-shell">
        <header className="ask-header">
          <div className="ask-header-row">
            <h1>Ask ArborAI</h1>
            <button className="btn btn-secondary" onClick={() => navigate("/")}>
              Home
            </button>
          </div>
          <p>Snap, upload, ask, and get species plus health diagnostics instantly.</p>
        </header>

        <section className="ask-chat" aria-live="polite" ref={chatRef} onScroll={handleChatScroll}>
          {messages.map((message) => (
            <article
              key={message.id}
              className={`ask-message ${message.role === 'user' ? 'ask-user' : 'ask-assistant'}`}
            >
              <div className="ask-bubble">
                {message.text && <p>{message.text}</p>}

                {message.photos.length > 0 && (
                  <div className="ask-photo-row">
                    {message.photos.map((url, index) => (
                      <img key={`${message.id}-photo-${index}`} src={url} alt="Uploaded tree" />
                    ))}
                  </div>
                )}

                {renderDiagnostics(message.diagnostics)}

                {message.showActions && !message.actionCompleted && (
                  <div className="ask-action-row">
                    {isStaff && (
                      <button
                        type="button"
                        onClick={() => createTreeFromScan(message)}
                        disabled={isActionLoading}
                      >
                        Create Tree From This Scan
                      </button>
                    )}
                    {isStaff && (
                      <button
                        type="button"
                        onClick={() => openAttachDialog(message)}
                        disabled={isActionLoading}
                      >
                        Attach to Existing Tree
                      </button>
                    )}
                    <button type="button" onClick={resetConversation} disabled={isActionLoading}>
                      Start Over
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}

          {isLoading && (
            <article className="ask-message ask-assistant">
              <div className="ask-bubble ask-loading">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </article>
          )}
          <div ref={bottomRef}></div>
        </section>

        <section className="ask-composer">
          {actionError && <p className="ask-error">{actionError}</p>}

          {photoPreviews.length > 0 && (
            <div className="ask-selected-photos">
              {photoPreviews.map((item, index) => (
                <div className="ask-selected-photo" key={`${item.file.name}-${index}`}>
                  <img src={item.previewUrl} alt={item.file.name} />
                  <button type="button" onClick={() => removePhoto(index)} aria-label="Remove photo">
                    x
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="ask-input-row">
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={onComposerKeyDown}
              rows={2}
              placeholder="Ask ArborAI anything..."
            />

            <div className="ask-tools">
              <label className="ask-tool-btn" htmlFor="camera-input">
                Take Photo
              </label>
              <input
                id="camera-input"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFilesSelected}
                hidden
              />

              <label className="ask-tool-btn" htmlFor="upload-input">
                Upload Photo
              </label>
              <input
                id="upload-input"
                type="file"
                accept="image/*"
                multiple
                onChange={handleFilesSelected}
                hidden
              />

              <button type="button" className="ask-send-btn" onClick={sendMessage} disabled={isLoading}>
                Send
              </button>
            </div>
          </div>
        </section>

        {attachDialogOpen && (
          <div className="ask-modal-overlay" role="dialog" aria-modal="true" aria-label="Attach scan dialog">
            <div className="ask-modal-card">
              <h2>Attach Scan To Existing Tree</h2>

              {isListingsLoading && <p>Loading tree list...</p>}

              {!isListingsLoading && listings.length === 0 && (
                <p>No trees found. Add a tree first or use Create Tree From This Scan.</p>
              )}

              {!isListingsLoading && listings.length > 0 && (
                <label className="ask-modal-field">
                  Select tree
                  <select
                    value={selectedListingId}
                    onChange={(event) => setSelectedListingId(event.target.value)}
                  >
                    {listings.map((listing) => (
                      <option key={listing.id} value={listing.id}>
                        {listing.title || 'Untitled Tree'} ({listing.id})
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="ask-modal-actions">
                <button
                  type="button"
                  className="ask-send-btn"
                  onClick={attachScanToExistingTree}
                  disabled={isActionLoading || isListingsLoading || listings.length === 0}
                >
                  Attach Scan
                </button>
                <button
                  type="button"
                  className="ask-tool-btn"
                  onClick={() => setAttachDialogOpen(false)}
                  disabled={isActionLoading}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
