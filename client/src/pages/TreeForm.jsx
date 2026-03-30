import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createTree, getTree, updateTree } from '../api';

const CONDITIONS = ['Excellent', 'Good', 'Fair', 'Poor', 'Dead'];

const EMPTY_FORM = {
  common_name: '', scientific_name: '', species: '', family: '', description: '',
  height_ft: '', diameter_in: '', age_years: '', condition: '',
  gps_lat: '', gps_lng: '', location_description: '',
  treatment_notes: '', last_treatment_date: '', date_planted: '',
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

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
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
      <div className="back-link" onClick={() => navigate(isEdit ? `/trees/${id}` : '/')}>
        ← Back
      </div>
      <h1 className="page-title">{isEdit ? '✏️ Edit Tree' : '🌱 Add New Tree'}</h1>
      <p className="page-subtitle">{isEdit ? 'Update tree information' : 'Add a new tree or plant to the ArborDex database'}</p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <p className="section-title">🪪 Identity</p>
            <div className="form-grid">
              <div className="form-group">
                <label>Common Name *</label>
                <input value={form.common_name} onChange={set('common_name')} placeholder="e.g. White Oak" required />
              </div>
              <div className="form-group">
                <label>Scientific Name</label>
                <input value={form.scientific_name} onChange={set('scientific_name')} placeholder="e.g. Quercus alba" />
              </div>
              <div className="form-group">
                <label>Species</label>
                <input value={form.species} onChange={set('species')} placeholder="e.g. Quercus" />
              </div>
              <div className="form-group">
                <label>Family</label>
                <input value={form.family} onChange={set('family')} placeholder="e.g. Fagaceae" />
              </div>
              <div className="form-group full-width">
                <label>Description</label>
                <textarea value={form.description} onChange={set('description')} placeholder="General description of this tree or plant…" rows={3} />
              </div>
            </div>

            <p className="section-title">📏 Growth &amp; Condition</p>
            <div className="form-grid">
              <div className="form-group">
                <label>Height (ft)</label>
                <input type="number" min="0" step="0.1" value={form.height_ft} onChange={set('height_ft')} placeholder="e.g. 45" />
              </div>
              <div className="form-group">
                <label>Trunk Diameter (in)</label>
                <input type="number" min="0" step="0.1" value={form.diameter_in} onChange={set('diameter_in')} placeholder="e.g. 18" />
              </div>
              <div className="form-group">
                <label>Estimated Age (years)</label>
                <input type="number" min="0" value={form.age_years} onChange={set('age_years')} placeholder="e.g. 75" />
              </div>
              <div className="form-group">
                <label>Condition</label>
                <select value={form.condition} onChange={set('condition')}>
                  <option value="">-- Select --</option>
                  {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Date Planted</label>
                <input type="date" value={form.date_planted} onChange={set('date_planted')} />
              </div>
            </div>

            <p className="section-title">📍 Location</p>
            <div className="form-grid">
              <div className="form-group">
                <label>GPS Latitude</label>
                <input type="number" step="any" value={form.gps_lat} onChange={set('gps_lat')} placeholder="e.g. 38.5767" />
              </div>
              <div className="form-group">
                <label>GPS Longitude</label>
                <input type="number" step="any" value={form.gps_lng} onChange={set('gps_lng')} placeholder="e.g. -92.1735" />
              </div>
              <div className="form-group full-width">
                <label>Location Description</label>
                <input value={form.location_description} onChange={set('location_description')} placeholder="e.g. Near the east trailhead, Section B" />
              </div>
            </div>

            <p className="section-title">💊 Treatment</p>
            <div className="form-grid">
              <div className="form-group full-width">
                <label>Treatment Notes</label>
                <textarea value={form.treatment_notes} onChange={set('treatment_notes')} placeholder="Fertilization, pest control, pruning notes…" rows={3} />
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
