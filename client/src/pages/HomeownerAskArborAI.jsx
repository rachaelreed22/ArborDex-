import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../utils/apiUrl';
import { useHomeownerAuth } from '../context/HomeownerAuthContext';
import './HomeownerTheme.css';
import './AskArborAI.css';
import './HomeownerAskArborAI.css';

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

export default function HomeownerAskArborAI() {
  const navigate = useNavigate();
  const { getAccessToken } = useHomeownerAuth();
  const [messages, setMessages] = useState([
    createMessage({
      role: 'assistant',
      text: 'Hi! I am ArborAI. Upload or take a plant photo and I can help you identify it before you create a new Plant ID or add this scan to an existing one.',
    }),
  ]);
  const [uploadedPhotos, setUploadedPhotos] = useState([]);
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [plants, setPlants] = useState([]);
  const [isPlantsLoading, setIsPlantsLoading] = useState(false);
  const [attachDialogOpen, setAttachDialogOpen] = useState(false);
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  const [authPromptMessage, setAuthPromptMessage] = useState('');
  const [selectedPlantId, setSelectedPlantId] = useState('');
  const [attachMessageId, setAttachMessageId] = useState('');
  const [activeProfiles, setActiveProfiles] = useState(0);
  const [profileLimit, setProfileLimit] = useState(3);
  const bottomRef = useRef(null);

  const atProfileLimit = activeProfiles >= profileLimit;

  const isAuthErrorMessage = (message) => {
    const text = (message || '').toString().trim().toLowerCase();
    return (
      text === 'auth_required'
      || text.includes('invalid auth token')
      || text.includes('auth token')
      || text.includes('jwt')
      || text.includes('session expired')
      || text.includes('not signed in')
      || text.includes('unauthorized')
      || text.includes('401')
      || text.includes('missing bearer token')
    );
  };

  const visibleActionError = isAuthErrorMessage(actionError) ? '' : actionError;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const photoPreviews = useMemo(
    () => uploadedPhotos.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
    [uploadedPhotos]
  );

  useEffect(() => {
    return () => {
      photoPreviews.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, [photoPreviews]);

  const promptForAuth = (message = '') => {
    setAttachDialogOpen(false);
    setActionError('');
    setAuthPromptMessage(
      message
      || 'Sign in or sign up to save this scan to a plant profile.'
    );
    setAuthPromptOpen(true);
  };

  async function authJsonFetch(path, options = {}) {
    const token = await getAccessToken();
    if (!token) {
      promptForAuth('Sign in or sign up to save this scan to a plant profile.');
      throw new Error('AUTH_REQUIRED');
    }

    const response = await fetch(apiUrl(path), {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const serverErrorMessage = (payload?.error || '').toString();
      if (response.status === 401 || isAuthErrorMessage(serverErrorMessage)) {
        promptForAuth('Sign in or sign up to save this scan to a plant profile.');
        throw new Error('AUTH_REQUIRED');
      }
      throw new Error(payload.error || 'Request failed');
    }

    return payload;
  }

  async function refreshHomeownerStatus() {
    const payload = await authJsonFetch('/api/homeowners/plants');
    setActiveProfiles(Number(payload.active_profiles) || 0);
    setProfileLimit(Number(payload.profile_limit) || 3);
  }

  useEffect(() => {
    void refreshHomeownerStatus().catch(() => {
      // Ignore background status fetch failures on initial load.
    });
  }, []);

  const handleFilesSelected = (event) => {
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'));
    if (!files.length) return;
    setUploadedPhotos((prev) => [...prev, ...files]);
    event.target.value = '';
  };

  const removePhoto = (index) => {
    setUploadedPhotos((prev) => prev.filter((_file, fileIndex) => fileIndex !== index));
  };

  const resetConversation = () => {
    setMessages([
      createMessage({
        role: 'assistant',
        text: 'Hi! I am ArborAI. Upload or take a plant photo and I can help you identify it before you create a new Plant ID or add this scan to an existing one.',
      }),
    ]);
    setQuestion('');
    setUploadedPhotos([]);
    setActionError('');
    setPlants([]);
    setIsPlantsLoading(false);
    setIsActionLoading(false);
    setIsLoading(false);
    setAttachDialogOpen(false);
    setSelectedPlantId('');
    setAttachMessageId('');
  };

  const markActionCompleted = (messageId) => {
    setMessages((prev) => prev.map((message) => (
      message.id === messageId
        ? { ...message, actionCompleted: true, showActions: false }
        : message
    )));
  };

  const appendAssistantMessage = (text) => {
    if (isAuthErrorMessage(text)) {
      promptForAuth('Sign in or sign up to save this scan to a plant profile.');
      return;
    }

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
        text: trimmedQuestion || 'Analyze these plant photos',
        photos: imagePreviewUrls,
      }),
    ]);

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('question', trimmedQuestion || 'Please analyze these plant photos for identification and condition.');
      uploadedPhotos.forEach((file) => formData.append('photos', file));

      const response = await fetch(apiUrl('/api/ai/ask-arborai'), {
        method: 'POST',
        body: formData,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to get ArborAI response');
      }

      const risks = Array.isArray(data.risks) ? data.risks : [];
      const recommendations = Array.isArray(data.recommendations) ? data.recommendations : [];
      const photoSummaries = Array.isArray(data.photo_summaries) ? data.photo_summaries : [];
      const hazardDetails = Array.isArray(data.hazard_details) ? data.hazard_details : [];
      const confidence = data.confidence || 'Unknown';
      const healthScore = data.health_score ?? 'Unknown';
      const species = data.species || 'Unknown';
      const summary = data.summary || 'No summary returned.';

      // Frontend inference fallback for hazards
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

      setQuestion('');
      setUploadedPhotos([]);
      setActionError('');
    } catch (error) {
      appendAssistantMessage(`I could not complete that scan yet: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const onComposerKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  const createPlantFromScan = async (message) => {
    if (!message?.scanPayload) {
      appendAssistantMessage('This scan is missing payload data. Run a new scan and try again.');
      return;
    }

    if (atProfileLimit) {
      appendAssistantMessage(`Create Plant ID blocked: profile limit reached (${activeProfiles}/${profileLimit}).`);
      return;
    }

    setIsActionLoading(true);
    setActionError('');
    try {
      const payload = await authJsonFetch('/api/homeowners/ai/create-plant-from-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message.scanPayload),
      });

      markActionCompleted(message.id);
      appendAssistantMessage(`Created a new Plant ID and attached ${payload.added_photos || 0} photo(s).`);
      await refreshHomeownerStatus();
      navigate(`/homeowners/plants/${payload.plant.id}`);
    } catch (error) {
      if (error?.message === 'AUTH_REQUIRED' || isAuthErrorMessage(error?.message)) return;
      setActionError(error.message);
      appendAssistantMessage(`Create Plant ID failed: ${error.message}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const openAttachDialog = async (message) => {
    if (!message?.scanPayload) {
      appendAssistantMessage('This scan is missing payload data. Run a new scan and try again.');
      return;
    }

    setAttachMessageId(message.id);
    setAttachDialogOpen(true);
    setActionError('');

    if (plants.length > 0) {
      if (!selectedPlantId) {
        setSelectedPlantId(plants[0].id);
      }
      return;
    }

    setIsPlantsLoading(true);
    try {
      const payload = await authJsonFetch('/api/homeowners/plants');
      const normalized = Array.isArray(payload.plants) ? payload.plants : [];
      setPlants(normalized);
      if (normalized[0]?.id) {
        setSelectedPlantId(normalized[0].id);
      }
    } catch (error) {
      if (error?.message === 'AUTH_REQUIRED' || isAuthErrorMessage(error?.message)) return;
      setActionError(error.message);
      appendAssistantMessage(`Could not load Plant IDs for attach: ${error.message}`);
    } finally {
      setIsPlantsLoading(false);
    }
  };

  const attachScanToExistingPlant = async () => {
    if (!attachMessageId) return;
    if (!selectedPlantId) {
      setActionError('Select a Plant ID before attaching this scan.');
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
      const payload = await authJsonFetch('/api/homeowners/ai/attach-scan-to-plant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plant_id: selectedPlantId,
          ...sourceMessage.scanPayload,
        }),
      });

      markActionCompleted(sourceMessage.id);
      setAttachDialogOpen(false);
      appendAssistantMessage(`Added ${payload.added_photos || 0} photo(s) to Plant ID ${payload.plant.id}.`);
      navigate(`/homeowners/plants/${payload.plant.id}`);
    } catch (error) {
      if (error?.message === 'AUTH_REQUIRED' || isAuthErrorMessage(error?.message)) return;
      setActionError(error.message);
      appendAssistantMessage(`Add to existing Plant ID failed: ${error.message}`);
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
              <p>Hazard inferred from diagnostics risk signals (decay/structural instability); needs human inspection.</p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="ask-page homeowner-shell homeowner-ask-page">
      <section className="ask-shell homeowner-ask-shell">
        <header className="ask-header homeowner-ask-header">
          <div className="ask-header-row homeowner-ask-header-row">
            <div>
              <p className="homeowner-ask-kicker">Homeowner's Edition</p>
              <h1>Ask ArborAI</h1>
              <p>Scan a plant first, then choose whether to create a new Plant ID or add the scan to an existing one.</p>
              <div className={`homeowner-limit-badge mt-2 ${atProfileLimit ? 'homeowner-limit-badge-hit' : ''}`}>
                {atProfileLimit ? `Limit Reached ${activeProfiles}/${profileLimit}` : `Capacity ${activeProfiles}/${profileLimit}`}
              </div>
            </div>
            <button className="homeowner-button-secondary homeowner-ask-back-button" onClick={() => navigate('/homeowners/account')}>
              Back to Account
            </button>
          </div>

          <div className="homeowner-ask-intro-grid">
            <div className="homeowner-ask-intro-card">
              <span className="homeowner-ask-intro-label">Step 1</span>
              <strong>Upload or take photos</strong>
              <p>Use one clear photo or a small set that all belong to the same plant.</p>
            </div>
            <div className="homeowner-ask-intro-card">
              <span className="homeowner-ask-intro-label">Step 2</span>
              <strong>Review the scan</strong>
              <p>ArborAI returns an identification guess, health score, risks, and next-step notes.</p>
            </div>
            <div className="homeowner-ask-intro-card">
              <span className="homeowner-ask-intro-label">Step 3</span>
              <strong>Save it where it belongs</strong>
              <p>Create a new Plant ID or attach the scan to an existing profile in one step.</p>
            </div>
          </div>
        </header>

        <section className="ask-chat homeowner-ask-chat" aria-live="polite">
          {messages.map((message) => (
            <article
              key={message.id}
              className={`ask-message ${message.role === 'user' ? 'ask-user' : 'ask-assistant'}`}
            >
              <div className={`ask-bubble homeowner-ask-bubble ${message.role === 'user' ? 'homeowner-ask-bubble-user' : 'homeowner-ask-bubble-assistant'}`}>
                {message.text && <p>{message.text}</p>}

                {message.photos.length > 0 && (
                  <div className="ask-photo-row">
                    {message.photos.map((url, index) => (
                      <img key={`${message.id}-photo-${index}`} src={url} alt="Uploaded plant" />
                    ))}
                  </div>
                )}

                {renderDiagnostics(message.diagnostics)}

                {message.showActions && !message.actionCompleted && (
                  <div className="ask-action-row homeowner-ask-action-row">
                    <button type="button" onClick={() => createPlantFromScan(message)} disabled={isActionLoading || atProfileLimit}>
                      {atProfileLimit ? 'Create New Plant ID (Limit Reached)' : 'Create New Plant ID'}
                    </button>
                    <button type="button" onClick={() => openAttachDialog(message)} disabled={isActionLoading}>
                      Add to Existing Plant ID
                    </button>
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

        <section className="ask-composer homeowner-ask-composer">
          {visibleActionError && <p className="ask-error">{visibleActionError}</p>}

          <div className="homeowner-ask-composer-note">
            Tip: keep each scan to one plant. Mixed photos lower the odds of a usable Plant ID.
          </div>

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

          <div className="ask-input-row homeowner-ask-input-row">
            <textarea
              className="homeowner-ask-textarea"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={onComposerKeyDown}
              rows={2}
              placeholder="Ask ArborAI anything about this plant..."
            />

            <div className="ask-tools homeowner-ask-tools">
              <label className="ask-tool-btn homeowner-ask-tool-btn" htmlFor="homeowner-camera-input">
                Take Photo
              </label>
              <input
                id="homeowner-camera-input"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFilesSelected}
                hidden
              />

              <label className="ask-tool-btn homeowner-ask-tool-btn" htmlFor="homeowner-upload-input">
                Upload Photo
              </label>
              <input
                id="homeowner-upload-input"
                type="file"
                accept="image/*"
                multiple
                onChange={handleFilesSelected}
                hidden
              />

              <button type="button" className="ask-send-btn homeowner-ask-send-btn" onClick={() => void sendMessage()} disabled={isLoading}>
                Send
              </button>
            </div>
          </div>
        </section>

        {attachDialogOpen && (
          <div className="ask-modal-overlay" role="dialog" aria-modal="true" aria-label="Add scan to existing plant ID dialog">
            <div className="ask-modal-card homeowner-ask-modal-card">
              <h2>Add Scan To Existing Plant ID</h2>

              {isPlantsLoading && <p>Loading plant IDs...</p>}

              {!isPlantsLoading && plants.length === 0 && (
                <p>No plant IDs found. Create a Plant ID first or use Create New Plant ID.</p>
              )}

              {!isPlantsLoading && plants.length > 0 && (
                <label className="ask-modal-field homeowner-ask-modal-field">
                  Select Plant ID
                  <select
                    value={selectedPlantId}
                    onChange={(event) => setSelectedPlantId(event.target.value)}
                  >
                    {plants.map((plant) => (
                      <option key={plant.id} value={plant.id}>
                        {plant.name || 'Untitled Plant'} ({plant.id})
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="ask-modal-actions">
                <button
                  type="button"
                  className="ask-send-btn homeowner-ask-send-btn"
                  onClick={() => void attachScanToExistingPlant()}
                  disabled={isActionLoading || isPlantsLoading || plants.length === 0}
                >
                  Add Scan
                </button>
                <button
                  type="button"
                  className="ask-tool-btn homeowner-ask-tool-btn"
                  onClick={() => setAttachDialogOpen(false)}
                  disabled={isActionLoading}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {authPromptOpen && (
          <div className="ask-modal-overlay" role="dialog" aria-modal="true" aria-label="Sign in prompt dialog">
            <div className="ask-modal-card homeowner-ask-modal-card">
              <h2>Save This Plant Scan</h2>
              <p>{authPromptMessage}</p>
              <div className="ask-modal-actions">
                <button
                  type="button"
                  className="ask-send-btn homeowner-ask-send-btn"
                  onClick={() => {
                    setAuthPromptOpen(false);
                    navigate('/homeowners/login');
                  }}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  className="ask-tool-btn homeowner-ask-tool-btn"
                  onClick={() => {
                    setAuthPromptOpen(false);
                    navigate('/homeowners/signup');
                  }}
                >
                  Sign Up
                </button>
                <button
                  type="button"
                  className="ask-tool-btn homeowner-ask-tool-btn"
                  onClick={() => setAuthPromptOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
