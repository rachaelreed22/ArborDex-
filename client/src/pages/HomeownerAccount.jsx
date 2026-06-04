import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiUrl } from '../utils/apiUrl';
import { getTierLabel, getTierLimit } from '../utils/homeownerTier';
import { useHomeownerAuth } from '../context/HomeownerAuthContext';
import './HomeownerTheme.css';

export default function HomeownerAccount() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tier, user, supabase, logout, getAccessToken, refreshProfile } = useHomeownerAuth();

  const [activeProfiles, setActiveProfiles] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [billingLoading, setBillingLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const checkoutSuccess = new URLSearchParams(location.search).get('checkout') === 'success';

  const profileLimit = useMemo(() => getTierLimit(tier), [tier]);
  const title = checkoutSuccess ? "Thank you for choosing ArborTag HomeOwner's Edition" : 'Homeowner Account';

  useEffect(() => {
    async function loadAccount() {
      try {
        setLoading(true);
        setError('');
        await refreshProfile();

        const { count, error: countError } = await supabase
          .from('homeowner_plants')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id);

        if (countError) throw countError;
        setActiveProfiles(count || 0);
      } catch (err) {
        setError(err.message || 'Failed to load account details');
      } finally {
        setLoading(false);
      }
    }

    if (user?.id) {
      loadAccount();
    }
  }, [user?.id]);

  async function openPortal() {
    try {
      setBillingLoading(true);
      setError('');
      const token = await getAccessToken();
      const res = await fetch(apiUrl('/api/stripe/create-portal-session'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.url) throw new Error(payload.error || 'Failed to open billing portal');
      window.location.href = payload.url;
    } catch (err) {
      setError(err.message || 'Billing portal error');
    } finally {
      setBillingLoading(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirm.trim().toUpperCase() !== 'DELETE') {
      setError('Type DELETE to confirm account deletion.');
      return;
    }

    const proceed = window.confirm('Delete your account permanently? This removes your homeowner profiles and billing access.');
    if (!proceed) return;

    try {
      setDeleteLoading(true);
      setError('');

      const token = await getAccessToken();
      const res = await fetch(apiUrl('/api/homeowners/account'), {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to delete account');
      }

      await logout().catch(() => {});
      navigate('/homeowners/signup', { replace: true });
    } catch (err) {
      setError(err.message || 'Failed to delete account');
    } finally {
      setDeleteLoading(false);
    }
  }

  const isAtLimit = activeProfiles >= profileLimit;

  return (
    <main className="homeowner-shell min-h-screen px-4 py-10">
      <div className="homeowner-surface mx-auto w-full max-w-3xl rounded-2xl p-8 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="homeowner-heading text-3xl font-bold">{title}</h1>
          <button onClick={logout} className="homeowner-button-secondary rounded-md px-4 py-2 text-sm font-semibold">Sign out</button>
        </div>

        <p className="homeowner-subtext mt-2 text-sm">Logged in as {user?.email}</p>

        {checkoutSuccess && (
          <div className="homeowner-panel homeowner-panel-info mt-4">
            Thank you for choosing ArborTag HomeOwner&apos;s Edition. Your updated profile limit is shown below.
          </div>
        )}

        {loading ? (
          <p className="homeowner-muted mt-6">
            {checkoutSuccess ? 'Refreshing your updated profile limit...' : 'Loading account...'}
          </p>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="homeowner-stat-card rounded-xl p-4">
              <p className="homeowner-subtext text-xs uppercase tracking-wide">Current Tier</p>
              <p className="homeowner-heading mt-1 text-lg font-bold">{getTierLabel(tier)}</p>
            </div>
            <div className="homeowner-stat-card rounded-xl p-4">
              <p className="homeowner-subtext text-xs uppercase tracking-wide">Profile Limit</p>
              <p className="homeowner-heading mt-1 text-lg font-bold">{profileLimit}</p>
            </div>
            <div className="homeowner-stat-card rounded-xl p-4">
              <p className="homeowner-subtext text-xs uppercase tracking-wide">Active Profiles</p>
              <p className="homeowner-heading mt-1 text-lg font-bold">{activeProfiles}</p>
            </div>
          </div>
        )}

        <div className="homeowner-panel homeowner-panel-info mt-6">
          {isAtLimit
            ? 'You are at your active profile limit. Upgrade your tier to create more profiles, or delete one to replace it.'
            : 'You can replace profiles by deleting older entries. Limits apply to active profiles only.'}
        </div>

        {!checkoutSuccess && tier === 'free' && (
          <div className="homeowner-panel homeowner-panel-warn mt-4">
            Need more than 3 active plant IDs? Upgrade to Gardener or Estate.
            Over 65 requires B2B custom pricing at <a className="underline font-semibold" href="mailto:rachaelr@rrtech.dev">rachaelr@rrtech.dev</a>.
          </div>
        )}

        {error && <p className="homeowner-alert homeowner-alert-error">{error}</p>}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => navigate('/homeowners/plants')}
            className="homeowner-button-secondary rounded-md px-5 py-2.5 text-sm font-semibold"
          >
            Manage Profiles
          </button>
          <button
            onClick={() => navigate('/homeowners/ask-arborai')}
            className="homeowner-button-secondary rounded-md px-5 py-2.5 text-sm font-semibold"
          >
            Ask ArborAI
          </button>
          <button
            onClick={() => navigate('/homeowners/tiers')}
            className="homeowner-button-secondary rounded-md px-5 py-2.5 text-sm font-semibold"
          >
            Upgrade Tier
          </button>
          <button
            onClick={openPortal}
            disabled={billingLoading}
            className="homeowner-button-secondary rounded-md px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {billingLoading ? 'Opening billing...' : 'Manage Billing'}
          </button>
        </div>

        <div className="homeowner-panel homeowner-panel-warn mt-8">
          <h2 className="homeowner-heading text-base font-semibold">Delete Account</h2>
          <p className="homeowner-subtext mt-1 text-sm">
            This permanently deletes your homeowner account, plant profiles, and associated photos.
          </p>
          <label className="homeowner-heading mt-3 block text-sm font-semibold" htmlFor="delete-account-confirm">
            Type DELETE to confirm
          </label>
          <input
            id="delete-account-confirm"
            className="homeowner-input mt-1 w-full rounded-md px-3 py-2 text-sm outline-none"
            type="text"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            disabled={deleteLoading}
            placeholder="DELETE"
          />
          <button
            onClick={handleDeleteAccount}
            disabled={deleteLoading}
            className="mt-3 rounded-md border border-[#7a1f1f] bg-[#7a1f1f] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {deleteLoading ? 'Deleting account...' : 'Delete Account Permanently'}
          </button>
        </div>
      </div>
    </main>
  );
}
