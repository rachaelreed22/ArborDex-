import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getTree, getPhotos, uploadPhoto } from '../api';
import { useMode } from '../context/ModeContext';

const SEASONS = ['Spring', 'Summer', 'Fall', 'Winter'];

function fmt(val, suffix = '') {
  return val != null ? `${val}${suffix}` : '—';
}

function fmtDate(val) {
  if (!val) return '—';
  return new Date(val).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function ArborTag() {
  const { id } = useParams();
  const [tree, setTree] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Upload form state
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploaderName, setUploaderName] = useState('');
  const [uploaderEmail, setUploaderEmail] = useState('');
  const [caption, setCaption] = useState('');
  const [season, setSeason] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef();

  useEffect(() => {
    Promise.all([
      getTree(id).catch(() => null),
      getPhotos(id).catch(() => []),
    ]).then(([t, p]) => {
      if (!t) { setNotFound(true); }
      else { setTree(t); setPhotos(p); }
    }).finally(() => setLoading(false));
  }, [id]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result);
    reader.readAsDataURL(file);
    setUploadSuccess(false);
    setUploadError('');
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) { setUploadError('Please select a photo.'); return; }
    setUploading(true);
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('photo', selectedFile);
      if (uploaderName) formData.append('photographer_name', uploaderName);
      if (uploaderEmail) formData.append('photographer_email', uploaderEmail);
      if (caption) formData.append('caption', caption);
      if (season) formData.append('season', season);

      const newPhoto = await uploadPhoto(id, formData);
      setPhotos(p => [newPhoto, ...p]);
      setUploadSuccess(true);
      setSelectedFile(null);
      setPreview(null);
      setUploaderName('');
      setUploaderEmail('');
      setCaption('');
      setSeason('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setUploadError(err.response?.data?.error || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="loading" style={{ paddingTop: '4rem' }}>Loading…</div>;

  if (notFound) {
    return (
      <div className="visitor-page" style={{ textAlign: 'center', paddingTop: '3rem' }}>
        <div style={{ fontSize: '4rem' }}>🌿</div>
        <h2 style={{ color: '#2e5e2e', marginTop: '0.5rem' }}>Tree Not Found</h2>
        <p style={{ color: '#6a896a', marginTop: '0.5rem' }}>This QR code may be invalid or the entry has been removed.</p>
      </div>
    );
  }

  return (
    <div className="visitor-page">
      {/* ArborTag Header */}
      <div className="visitor-header">
        <div className="visitor-brand">🌿 ArborTag</div>
        <h1>{tree.common_name}</h1>
        {tree.scientific_name && <p>{tree.scientific_name}</p>}
      </div>

      {/* Tree Stats */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-header"><h2>🌳 Tree Information</h2></div>
        <div className="card-body">
          <div className="detail-row"><span className="label">Species</span><span className="value">{fmt(tree.species)}</span></div>
          <div className="detail-row"><span className="label">Family</span><span className="value">{fmt(tree.family)}</span></div>
          <div className="detail-row"><span className="label">Height</span><span className="value">{fmt(tree.height_ft, ' ft')}</span></div>
          <div className="detail-row"><span className="label">Trunk Diameter</span><span className="value">{fmt(tree.diameter_in, ' in')}</span></div>
          <div className="detail-row"><span className="label">Estimated Age</span><span className="value">{fmt(tree.age_years, ' years')}</span></div>
          <div className="detail-row"><span className="label">Condition</span><span className={`value condition-${tree.condition}`}>{fmt(tree.condition)}</span></div>
          {tree.location_description && (
            <div className="detail-row"><span className="label">Location</span><span className="value">{tree.location_description}</span></div>
          )}
          {tree.date_planted && (
            <div className="detail-row"><span className="label">Date Planted</span><span className="value">{fmtDate(tree.date_planted)}</span></div>
          )}
          {tree.description && (
            <p style={{ marginTop: '0.75rem', fontSize: '0.9rem', color: '#4a6a4a', lineHeight: 1.6 }}>
              {tree.description}
            </p>
          )}
        </div>
      </div>

      {/* GPS Map link */}
      {tree.gps_lat && tree.gps_lng && (
        <div style={{ marginBottom: '1.25rem', textAlign: 'center' }}>
          <a
            href={`https://www.google.com/maps?q=${tree.gps_lat},${tree.gps_lng}`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
          >
            🗺 View on Map
          </a>
        </div>
      )}

      {/* Photo Upload */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <h2>📸 Submit Your Photo</h2>
        </div>
        <div className="card-body">
          <p style={{ fontSize: '0.88rem', color: '#5a7a5a', marginBottom: '1rem', lineHeight: 1.5 }}>
            Submit your photo of this tree for the seasonal photography challenge!
            Your photo will be displayed in the ArborDex database with your name as credit.
          </p>

          {uploadSuccess && (
            <div className="alert alert-success">
              🎉 Photo submitted successfully! Thank you for your contribution.
            </div>
          )}
          {uploadError && <div className="alert alert-error">{uploadError}</div>}

          <form onSubmit={handleUpload}>
            <label
              className="upload-area"
              htmlFor="photo-upload"
            >
              <input
                id="photo-upload"
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleFileChange}
              />
              {preview ? (
                <div className="upload-preview">
                  <img src={preview} alt="Preview" />
                  <p style={{ fontSize: '0.85rem', color: '#5a7a5a' }}>Tap to change photo</p>
                </div>
              ) : (
                <>
                  <div className="upload-icon">📷</div>
                  <p style={{ fontWeight: 600, color: '#2e5e2e' }}>Tap to select a photo</p>
                  <p style={{ fontSize: '0.8rem', color: '#8aab8a', marginTop: '0.25rem' }}>JPEG, PNG, or WEBP · Max 10MB</p>
                </>
              )}
            </label>

            <div className="form-grid">
              <div className="form-group">
                <label>Your Name</label>
                <input
                  type="text"
                  value={uploaderName}
                  onChange={e => setUploaderName(e.target.value)}
                  placeholder="Jane Smith"
                />
              </div>
              <div className="form-group">
                <label>Season</label>
                <select value={season} onChange={e => setSeason(e.target.value)}>
                  <option value="">-- Select --</option>
                  {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group full-width">
                <label>Caption</label>
                <input
                  type="text"
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  placeholder="What makes this tree special?"
                />
              </div>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={uploading || !selectedFile}>
                {uploading ? 'Uploading…' : '🌿 Submit Photo'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Community Photos */}
      {photos.length > 0 && (
        <div className="card">
          <div className="card-header"><h2>🖼 Community Gallery ({photos.length})</h2></div>
          <div className="card-body">
            <div className="photo-gallery">
              {photos.map(photo => (
                <div key={photo.id} className="photo-card">
                  <img src={`/uploads/${photo.filename}`} alt={photo.caption || 'Tree photo'} />
                  <div className="photo-info">
                    <div className="photographer">📸 {photo.photographer_name || 'Anonymous'}</div>
                    {photo.caption && <div className="photo-caption">{photo.caption}</div>}
                    {photo.season && <div className="photo-season">🍂 {photo.season}</div>}
                    <div style={{ fontSize: '0.75rem', color: '#9aab9a', marginTop: '0.2rem' }}>{fmtDate(photo.uploaded_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.78rem', color: '#9aab9a' }}>
        Powered by ArborDex · Missouri Parks Tree Management System
      </div>
    </div>
  );
}
