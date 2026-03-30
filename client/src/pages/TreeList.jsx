import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTrees, deleteTree } from '../api';

const CONDITIONS = ['Excellent', 'Good', 'Fair', 'Poor', 'Dead'];

export default function TreeList() {
  const [trees, setTrees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [conditionFilter, setConditionFilter] = useState('');
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    getTrees()
      .then(setTrees)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = (e, id, name) => {
    e.stopPropagation();
    if (window.confirm(`Delete "${name}"? This cannot be undone.`)) {
      deleteTree(id).then(load);
    }
  };

  const filtered = trees.filter(t => {
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      t.common_name.toLowerCase().includes(q) ||
      (t.scientific_name || '').toLowerCase().includes(q) ||
      (t.species || '').toLowerCase().includes(q) ||
      (t.location_description || '').toLowerCase().includes(q);
    const matchesCondition = !conditionFilter || t.condition === conditionFilter;
    return matchesSearch && matchesCondition;
  });

  if (loading) return <div className="loading">Loading tree database…</div>;

  return (
    <div className="page">
      <h1 className="page-title">🌳 Tree &amp; Plant Database</h1>
      <p className="page-subtitle">ArborDex — Staff Management Portal</p>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search by name, species, location…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select value={conditionFilter} onChange={e => setConditionFilter(e.target.value)}>
          <option value="">All Conditions</option>
          {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="btn btn-primary" onClick={() => navigate('/add')}>
          + Add Tree
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="icon">🌱</div>
          <p>{trees.length === 0 ? 'No trees in the database yet. Add your first tree!' : 'No trees match your search.'}</p>
        </div>
      ) : (
        <div className="tree-grid">
          {filtered.map(tree => (
            <div
              key={tree.id}
              className="tree-card"
              onClick={() => navigate(`/trees/${tree.id}`)}
            >
              <h3>{tree.common_name}</h3>
              {tree.scientific_name && <div className="scientific">{tree.scientific_name}</div>}
              <div className="meta">
                {tree.species && <span className="badge">{tree.species}</span>}
                {tree.condition && (
                  <span className={`badge condition-${tree.condition}`}>{tree.condition}</span>
                )}
                {tree.gps_lat && tree.gps_lng && (
                  <span className="badge badge-info">📍 GPS</span>
                )}
              </div>
              {tree.location_description && (
                <div style={{ fontSize: '0.82rem', color: '#6a896a', marginTop: '0.2rem' }}>
                  📌 {tree.location_description}
                </div>
              )}
              <div className="actions" onClick={e => e.stopPropagation()}>
                <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/trees/${tree.id}`)}>
                  View
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/trees/${tree.id}/edit`)}>
                  Edit
                </button>
                <button className="btn btn-danger btn-sm" onClick={e => handleDelete(e, tree.id, tree.common_name)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
