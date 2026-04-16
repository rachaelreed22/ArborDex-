import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getTree, getPhotos } from '../api';

function fmt(val, suffix = '') {
  return val != null && val !== '' ? `${val}${suffix}` : '—';
}

function fmtDate(val) {
  if (!val) return '—';
  return new Date(val).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function conditionTone(condition) {
  const value = (condition || '').toLowerCase();

  if (value.includes('excellent') || value.includes('good') || value.includes('healthy')) {
    return 'condition-pill good';
  }
  if (value.includes('fair') || value.includes('monitor')) {
    return 'condition-pill watch';
  }
  if (value.includes('poor') || value.includes('decline') || value.includes('needs')) {
    return 'condition-pill alert';
  }
  return 'condition-pill neutral';
}

export default function ArborTag() {
  const { id } = useParams();

  const [tree, setTree] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getTree(id), getPhotos(id)])
      .then(([t, p]) => {
        setTree(t);
        setPhotos(p || []);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="loading">Loading tree…</div>;
  if (!tree) return <div className="alert alert-error">Tree not found.</div>;

  return (
    <div className="arbor-tag-page">
      <section className="visitor-hero card">
        <div className="card-body">
          <div className="eyebrow">ArborTag • Park Tree Profile</div>

          <h1 className="tree-title">{tree.common_name || 'Unnamed Tree'}</h1>

          {tree.scientific_name && (
            <div className="tree-subtitle">{tree.scientific_name}</div>
          )}

          <p className="visitor-intro">
            You scanned a live tree tag. Explore this tree’s identity, condition,
            and community photo record.
          </p>

          <div className="hero-meta">
            <div className={conditionTone(tree.condition)}>
              {tree.condition || 'Condition unknown'}
            </div>

            {tree.location_description && (
              <div className="meta-chip">📍 {tree.location_description}</div>
            )}
          </div>
        </div>
      </section>

      {photos.length > 0 && (
        <section className="card" style={{ marginTop: '1rem' }}>
          <div className="card-body">
            <img
              src={`/uploads/${photos[0].filename}`}
              alt={tree.common_name || 'Tree'}
              style={{
                width: '100%',
                borderRadius: '8px',
                marginBottom: '1rem',
                objectFit: 'cover'
              }}
            />
          </div>
        </section>
      )}

      <section className="card" style={{ marginTop: '1rem' }}>
        <div className="card-body">
          {tree.description && (
            <p className="tree-description">{tree.description}</p>
          )}

          <div className="detail-grid">
            <div className="detail-row">
              <span className="label">Species</span>
              <span className="value">{fmt(tree.species)}</span>
            </div>

            <div className="detail-row">
              <span className="label">Family</span>
              <span className="value">{fmt(tree.family)}</span>
            </div>

            <div className="detail-row">
              <span className="label">Height</span>
              <span className="value">{fmt(tree.height_ft, ' ft')}</span>
            </div>

            <div className="detail-row">
              <span className="label">Estimated Age</span>
              <span className="value">{fmt(tree.age_years, ' yrs')}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <div className="card-header">
          <h2>📷 Community Photos</h2>
        </div>

        <div className="card-body">
          <p className="section-intro">
            Visitors can help document this tree through the seasons.
          </p>

          {photos.length === 0 ? (
            <div className="empty-state">
              <div className="icon">🌿</div>
              <p>No photos yet. Be the first to share one.</p>
            </div>
          ) : (
            <div className="photo-gallery">
              {photos.map((photo) => (
                <div key={photo.id} className="photo-card">
                  <img src={`/uploads/${photo.filename}`} alt={tree.common_name || 'Tree'} />
                  <div className="photo-info">
                    <div className="photographer">
                      📸 {photo.photographer_name || 'Anonymous'}
                    </div>

                    {photo.caption && (
                      <div className="photo-caption">{photo.caption}</div>
                    )}

                    <div className="photo-date">
                      {fmtDate(photo.uploaded_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="upload-cta">
            <button className="btn btn-primary" disabled>
              ⬆ Upload a Photo
            </button>
            <p className="upload-note">
              Photo uploads can support seasonal challenges and are reviewed before appearing publicly.
            </p>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <div className="card-body">
          <h3 style={{ marginBottom: '0.5rem' }}>Why this matters</h3>
          <p className="tree-description" style={{ marginBottom: 0 }}>
            ArborTag helps visitors learn from individual trees in real time, while
            supporting park staff with a connected record behind the scenes.
          </p>
        </div>
      </section>
    </div>
  );
}
