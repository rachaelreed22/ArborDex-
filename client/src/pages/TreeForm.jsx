import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createTree, getTree, updateTree } from '../api';

const CONDITIONS = ['Excellent', 'Good', 'Fair', 'Poor', 'Dead'];

const EMPTY_FORM = {
  common_name: '',
  scientific_name: '',
  species: '',
  family: '',
  description: '',
  height_ft: '',
  diameter_in: '',
  age_years: '',
  condition: '',
  gps_lat: '',
  gps_lng: '',
  location_description: '',
  treatment_notes: '',
  last_treatment_date: '',
  date_planted: '',
};

export default function TreeForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isEdit) {
      getTree(id)
        .then(tree => {
          setForm({
            common_name: tree.common_name || '',
            scientific_name: tree.scientific_name || '',
            species: tree.species || '',
            family: tree.family || '',
            description: tree.description || '',
            height_ft: tree.height_ft ?? '',
            diameter_in: tree.diameter_in ?? '',
            age_years: tree.age_years ?? '',
            condition: tree.condition || '',
            gps_lat: tree.gps_lat ?? '',
            gps_lng: tree.gps_lng ?? '',
            location_description: tree.location_description || '',
            treatment_notes: tree.treatment_notes || '',
            last_treatment_date: tree.last_treatment_date || '',
            date_planted: tree.date_planted || '',
          });
        })
        .finally(() => setLoading(false));
    }
  }, [id, isEdit]);

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();

    if (!form.common_name.trim()) {
      setError('Common name is required.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = {
        ...form,
        height_ft: form.height_ft !== '' ? parseFloat(form.height_ft) : null,
        diameter_in: form.diameter_in !== '' ? parseFloat(form.diameter_in) : null,
        age_years: form.age_years !== '' ? parseInt(form.age_years) : null,
        gps_lat: form.gps_lat !== '' ? parseFloat(form.gps_lat) : null,
        gps_lng: form.gps_lng !== '' ? parseFloat(form.gps_lng) : null,
      };

      const tree = isEdit ? await updateTree(id, payload) : await createTree(payload);
      navigate(`/trees/${tree.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save. Please try again.');
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <div className="page">
      {/* BRIDGE BAR */}
      <div
        className="card"
        style={{
          marginBottom: '1rem',
          border: '1px solid #dfe7df',
          background: '#f7fbf7',
        }}
      >
        <div
          className="card-body"
          style={{
            display: 'flex',
            gap: '0.75rem',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" type="button" onClick={() => navigate('/')}>
              🌳 Tree Database
            </button>

            {isEdit && (
              <button className="btn btn-secondary" type="button" onClick={() => navigate(`/trees/${id}`)}>
                👁 View Staff Tree Page
              </button>
            )}

            {isEdit && (
              <button className="btn btn-primary" type="button" onClick={() => navigate(`/tag/${id}`)}>
                📱 Preview ArborTag Public Page
              </button>
            )}
          </div>

          <div style={{ fontSize: '0.85rem', color: '#6a896a' }}>
            Bridge tools—so you can actually reach the pages you’re building.
          </div>
        </div>
      </div>

      <div className="back-link" onClick={() => navigate(isEdit ? `/trees/${id}` : '/')}>
        ← Back
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '2rem', color: '#2f4f2f' }}>
          {isEdit ? 'Edit Tree' : 'Add New Tree'}
        </h1>
        <p style={{ color: '#6a896a' }}>
          {isEdit
            ? 'Manage tree details and curate associated photos.'
            : 'Create a new tree record. Photos can be added after creation.'}
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* PHOTO CURATION (UI scaffold) */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <h3>📸 Photo Curation</h3>
        </div>
        <div className="card-body">
          <div className="photo-gallery" style={{ opacity: 0.6 }}>
            <div className="photo-card placeholder">
              <div className="photo-placeholder">🌳</div>
              <div className="photo-info">
                <div className="photo-caption">No photos yet</div>
                <div className="photo-season">Staff or visitor photos will appear here</div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" disabled type="button">
              ⬆ Upload Staff Photo
            </button>
            <span style={{ fontSize: '0.85rem', color: '#6a896a', maxWidth: '520px' }}>
              Staff uploads will be enabled when the backend is connected. Visitor photos are submitted via ArborTag QR codes and reviewed here.
            </span>
          </div>
        </div>
      </div>

      {/* FORM */}
      <div className="card">
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <h3 className="section-title">🪪 Identity</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Common Name *</label>
                <input value={form.common_name} onChange={set('common_name')} required />
              </div>
              <div className="form-group">
                <label>Scientific Name</label>
                <input value={form.scientific_name} onChange={set('scientific_name')} />
              </div>
              <div className="form-group">
                <label>Species</label>
                <input value={form.species} onChange={set('species')} />
              </div>
              <div className="form-group">
                <label>Family</label>
                <input value={form.family} onChange={set('family')} />
              </div>
              <div className="form-group full-width">
                <label>Description</label>
                <textarea value={form.description} onChange={set('description')} rows={3} />
              </div>
            </div>

            <h3 className="section-title">📏 Growth &amp; Condition</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Height (ft)</label>
                <input type="number" step="0.1" value={form.height_ft} onChange={set('height_ft')} />
              </div>
              <div className="form-group">
                <label>Trunk Diameter (in)</label>
                <input type="number" step="0.1" value={form.diameter_in} onChange={set('diameter_in')} />
              </div>
              <div className="form-group">
                <label>Estimated Age</label>
                <input type="number" value={form.age_years} onChange={set('age_years')} />
              </div>
              <div className="form-group">
                <label>Condition</label>
                <select value={form.condition} onChange={set('condition')}>
                  <option value="">Select condition</option>
                  {CONDITIONS.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Date Planted</label>
                <input type="date" value={form.date_planted} onChange={set('date_planted')} />
              </div>
            </div>

            <h3 className="section-title">📍 Location</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Latitude</label>
                <input type="number" step="any" value={form.gps_lat} onChange={set('gps_lat')} />
              </div>
              <div className="form-group">
                <label>Longitude</label>
                <input type="number" step="any" value={form.gps_lng} onChange={set('gps_lng')} />
              </div>
              <div className="form-group full-width">
                <label>Location Description</label>
                <input value={form.location_description} onChange={set('location_description')} />
              </div>
            </div>

            <h3 className="section-title">💊 Treatment</h3>
            <div className="form-grid">
              <div className="form-group full-width">
                <label>Treatment Notes</label>
                <textarea value={form.treatment_notes} onChange={set('treatment_notes')} rows={3} />
              </div>
              <div className="form-group">
                <label>Last Treatment Date</label>
                <input type="date" value={form.last_treatment_date} onChange={set('last_treatment_date')} />
              </div>
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => navigate(isEdit ? `/trees/${id}` : '/')}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : isEdit ? 'Update Tree' : 'Add Tree'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}


