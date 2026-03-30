import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTree, getPhotos, getQRCode, deleteTree, deletePhoto } from '../api';

function fmt(val, suffix = '') {
  return val != null ? `${val}${suffix}` : '—';
}

function fmtDate(val) {
  if (!val) return '—';
  return new Date(val).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function TreeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tree, setTree] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [qr, setQr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    Promise.all([getTree(id), getPhotos(id)])
      .then(([t, p]) => { setTree(t); setPhotos(p); })
      .finally(() => setLoading(false));
  }, [id]);

  const loadQR = async () => {
    if (!qr) {
      const data = await getQRCode(id);
      setQr(data);
    }
    setShowQR(v => !v);
  };

  const handleDelete = async () => {
    if (window.confirm(`Delete "${tree.common_name}"? All photos will also be deleted.`)) {
      await deleteTree(id);
      navigate('/');
    }
  };

  const handleDeletePhoto = async (photoId) => {
    if (window.confirm('Remove this photo?')) {
      await deletePhoto(photoId);
      setPhotos(p => p.filter(ph => ph.id !== photoId));
    }
  };

  if (loading) return <div className="loading">Loading tree details…</div>;
  if (!tree) return <div className="alert alert-error">Tree not found.</div>;

  const mapsUrl = tree.gps_lat && tree.gps_lng
    ? `https://www.google.com/maps?q=${tree.gps_lat},${tree.gps_lng}`
    : null;

  return (
    <div className="page">
      <div className="back-link" onClick={() => navigate('/')}>← Back to Database</div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <h1 className="page-title">{tree.common_name}</h1>
          {tree.scientific_name && <p className="page-subtitle" style={{ fontStyle: 'italic' }}>{tree.scientific_name}</p>}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={loadQR}>
            {showQR ? 'Hide QR' : '📱 QR Code'}
          </button>
          <button className="btn btn-secondary" onClick={() => navigate(`/trees/${id}/edit`)}>
            ✏️ Edit
          </button>
          <button className="btn btn-danger" onClick={handleDelete}>
            🗑 Delete
          </button>
        </div>
      </div>

      {showQR && qr && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <div className="card-header"><h2>📱 ArborTag QR Code</h2></div>
          <div className="qr-section">
            <img src={qr.qrcode} alt="QR Code" width={200} />
            <p style={{ fontSize: '0.85rem', color: '#6a896a', textAlign: 'center' }}>
              Visitors scan this to view tree info &amp; upload photos
            </p>
            <p style={{ fontSize: '0.78rem', color: '#8aab8a' }}>{qr.url}</p>
            <a href={qr.qrcode} download={`${tree.common_name}-qrcode.png`} className="btn btn-secondary btn-sm">
              ⬇ Download QR Code
            </a>
          </div>
        </div>
      )}

      <div className="detail-grid">
        <div className="detail-section">
          <h3>🪪 Identity</h3>
          <div className="detail-row"><span className="label">Common Name</span><span className="value">{tree.common_name}</span></div>
          {tree.scientific_name && <div className="detail-row"><span className="label">Scientific Name</span><span className="value" style={{ fontStyle: 'italic' }}>{tree.scientific_name}</span></div>}
          <div className="detail-row"><span className="label">Species</span><span className="value">{fmt(tree.species)}</span></div>
          <div className="detail-row"><span className="label">Family</span><span className="value">{fmt(tree.family)}</span></div>
          {tree.description && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.88rem', color: '#4a6a4a', lineHeight: 1.5 }}>
              {tree.description}
            </div>
          )}
        </div>

        <div className="detail-section">
          <h3>📏 Growth &amp; Condition</h3>
          <div className="detail-row"><span className="label">Height</span><span className="value">{fmt(tree.height_ft, ' ft')}</span></div>
          <div className="detail-row"><span className="label">Trunk Diameter</span><span className="value">{fmt(tree.diameter_in, ' in')}</span></div>
          <div className="detail-row"><span className="label">Est. Age</span><span className="value">{fmt(tree.age_years, ' years')}</span></div>
          <div className="detail-row">
            <span className="label">Condition</span>
            <span className={`value condition-${tree.condition}`}>{fmt(tree.condition)}</span>
          </div>
          <div className="detail-row"><span className="label">Date Planted</span><span className="value">{fmtDate(tree.date_planted)}</span></div>
        </div>

        <div className="detail-section">
          <h3>📍 Location</h3>
          <div className="detail-row"><span className="label">Description</span><span className="value">{fmt(tree.location_description)}</span></div>
          <div className="detail-row"><span className="label">Latitude</span><span className="value">{fmt(tree.gps_lat)}</span></div>
          <div className="detail-row"><span className="label">Longitude</span><span className="value">{fmt(tree.gps_lng)}</span></div>
          {mapsUrl && (
            <div style={{ marginTop: '0.75rem' }}>
              <a href={mapsUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                🗺 View on Map
              </a>
            </div>
          )}
        </div>

        <div className="detail-section">
          <h3>💊 Treatment</h3>
          <div className="detail-row"><span className="label">Last Treatment</span><span className="value">{fmtDate(tree.last_treatment_date)}</span></div>
          {tree.treatment_notes ? (
            <div style={{ marginTop: '0.75rem', fontSize: '0.88rem', color: '#4a6a4a', lineHeight: 1.5 }}>
              {tree.treatment_notes}
            </div>
          ) : (
            <div className="detail-row"><span className="label">Notes</span><span className="value">—</span></div>
          )}
        </div>
      </div>

      {/* Photos section */}
      <div style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <h2 className="page-title" style={{ fontSize: '1.3rem' }}>📷 Community Photos ({photos.length})</h2>
        </div>
        <p style={{ fontSize: '0.85rem', color: '#6a896a', marginBottom: '0.75rem' }}>
          Photos submitted by park visitors via the ArborTag QR code.
        </p>
        {photos.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📷</div>
            <p>No photos yet. Visitors can submit photos by scanning the QR code.</p>
          </div>
        ) : (
          <div className="photo-gallery">
            {photos.map(photo => (
              <div key={photo.id} className="photo-card">
                <img src={`/uploads/${photo.filename}`} alt={photo.caption || 'Tree photo'} />
                <div className="photo-info">
                  <div className="photographer">📸 {photo.photographer_name || 'Anonymous'}</div>
                  {photo.caption && <div className="photo-caption">{photo.caption}</div>}
                  {photo.season && <div className="photo-season">🍂 {photo.season}</div>}
                  <div style={{ fontSize: '0.75rem', color: '#9aab9a', marginTop: '0.3rem' }}>
                    {fmtDate(photo.uploaded_at)}
                  </div>
                  <button className="btn btn-danger btn-sm" style={{ marginTop: '0.4rem' }} onClick={() => handleDeletePhoto(photo.id)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
