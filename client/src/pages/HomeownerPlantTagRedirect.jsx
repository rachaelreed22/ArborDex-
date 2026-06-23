import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiUrl } from '../utils/apiUrl';
import { useHomeownerAuth } from '../context/HomeownerAuthContext';
import './HomeownerTheme.css';

export default function HomeownerPlantTagRedirect() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, loading, getAccessToken } = useHomeownerAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated) {
      navigate('/homeowners/login', { replace: true });
      return;
    }

    let canceled = false;

    async function resolveToken() {
      try {
        setError('');
        const accessToken = await getAccessToken();
        const res = await fetch(apiUrl(`/api/homeowners/qr/${encodeURIComponent(token || '')}/resolve`), {
          headers: {
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok || !payload?.plant?.id) {
          throw new Error(payload.error || 'Plant profile could not be resolved from this QR tag.');
        }

        if (!canceled) {
          navigate(`/homeowners/plants/${payload.plant.id}`, { replace: true });
        }
      } catch (err) {
        if (!canceled) {
          setError(err.message || 'Failed to resolve plant profile from QR tag.');
        }
      }
    }

    void resolveToken();

    return () => {
      canceled = true;
    };
  }, [token, loading, isAuthenticated, navigate, getAccessToken]);

  return (
    <main className="homeowner-shell min-h-screen px-4 py-10">
      <div className="homeowner-surface mx-auto w-full max-w-2xl rounded-2xl p-8 shadow-2xl">
        <h1 className="homeowner-heading text-2xl font-bold">Resolving Plant QR Tag</h1>
        {!error ? (
          <p className="homeowner-subtext mt-3 text-sm">Please wait while we open the linked plant profile.</p>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="homeowner-alert homeowner-alert-error">{error}</p>
            <button
              type="button"
              className="homeowner-button-secondary rounded-md px-4 py-2 text-sm font-semibold"
              onClick={() => navigate('/homeowners/plants')}
            >
              Back to Digital Garden
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
