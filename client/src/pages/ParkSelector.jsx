import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useMode } from '../context/ModeContext';
import './ParkSelector.css';

export default function ParkSelector() {
  const navigate = useNavigate();
  const { mode, toggleMode } = useMode();
  const { user, isQueen, userParkId, supabase } = useAuth();
  const [parks, setParks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchParks = async () => {
      try {
        setLoading(true);
        const { data, error: fetchError } = await supabase
          .from('parks')
          .select('id, name, location')
          .order('name');

        if (fetchError) throw fetchError;
        setParks(data || []);
      } catch (err) {
        setError(err.message || 'Failed to load parks');
        console.error('Error fetching parks:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchParks();
  }, [supabase]);

  const handleParkSelect = (parkId, parkName) => {
    localStorage.setItem('selectedParkId', parkId);
    localStorage.setItem('selectedParkName', parkName);

    // Only switch to staff/dex mode for logged-in users
    if (user && mode !== 'dex') {
      toggleMode();
    }

    navigate('/database');
  };

  if (loading) {
    return (
      <main className="page park-selector-page">
        <div className="loading-spinner">Loading parks...</div>
      </main>
    );
  }

  return (
    <main className="page park-selector-page">
      <section className="park-selector-card">
        <h1>Select Your Park</h1>
        <p className="park-selector-subtitle">
          Choose which park you'd like to manage
        </p>

        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}

        {parks.length === 0 ? (
          <div className="no-parks">
            <p>No parks available yet.</p>
          </div>
        ) : (
          <div className="parks-grid">
            {parks.map((park) => {
              // Logged-in staff (non-queen) only see their assigned park.
              if (user && !isQueen && userParkId && park.id !== userParkId) {
                return null;
              }

              return (
                <button
                  key={park.id}
                  className="park-card"
                  onClick={() => handleParkSelect(park.id, park.name)}
                  aria-label={`Select ${park.name}`}
                >
                  <h3>{park.name}</h3>
                  {park.location && <p>{park.location}</p>}
                  <span className="park-card-arrow">→</span>
                </button>
              );
            })}
          </div>
        )}

        {isQueen && (
          <p className="queen-note">
            ✓ Queen access: You can view all parks
          </p>
        )}
      </section>
    </main>
  );
}
