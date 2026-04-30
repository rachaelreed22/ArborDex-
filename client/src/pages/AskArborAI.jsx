import { useEffect, useMemo, useRef, useState } from 'react';
import './AskArborAI.css';

function createMessage({ role, text = '', photos = [], diagnostics = null, showActions = false }) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    text,
    photos,
    diagnostics,
    showActions,
    createdAt: Date.now(),
  };
}

export default function AskArborAI() {
  const [messages, setMessages] = useState([
    createMessage({
      role: 'assistant',
      text: 'Hi! I am ArborAI. Upload or take a tree photo and ask anything about species, health, risk, or care.',
    }),
  ]);
  const [uploadedPhotos, setUploadedPhotos] = useState([]);
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef(null);

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

      const response = await fetch('/api/ai/ask-arborai', {
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
          diagnostics: {
            species,
            confidence,
            healthScore,
            summary,
            risks,
            recommendations,
            photoSummaries,
          },
          showActions: true,
        }),
      ]);

      resetComposer();
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
      </div>
    );
  };

  return (
    <main className="ask-page">
      <section className="ask-shell">
        <header className="ask-header">
          <h1>Ask ArborAI</h1>
          <p>Snap, upload, ask, and get species plus health diagnostics instantly.</p>
        </header>

        <section className="ask-chat" aria-live="polite">
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

                {message.showActions && (
                  <div className="ask-action-row">
                    <button type="button" onClick={() => window.alert('Stub: create tree from scan')}>
                      Create Tree From This Scan
                    </button>
                    <button type="button" onClick={() => window.alert('Stub: attach to existing tree')}>
                      Attach to Existing Tree
                    </button>
                    <button type="button" onClick={() => window.alert('Stub: start over')}>
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
      </section>
    </main>
  );
}
