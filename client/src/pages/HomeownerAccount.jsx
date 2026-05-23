import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../utils/apiUrl';
import { getTierLabel, getTierLimit } from '../utils/homeownerTier';
import { useHomeownerAuth } from '../context/HomeownerAuthContext';
import './HomeownerTheme.css';

export default function HomeownerAccount() {
  const navigate = useNavigate();
  const { profile, tier, user, supabase, logout, getAccessToken, refreshProfile } = useHomeownerAuth();

  const [activeProfiles, setActiveProfiles] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [billingLoading, setBillingLoading] = useState(false);

  const profileLimit = useMemo(() => getTierLimit(tier), [tier]);

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

  const isAtLimit = activeProfiles >= profileLimit;

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#8fbf38] via-[#2f5c2f] to-[#1d411d] px-4 py-10">
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-[#1d411d]/55 bg-gradient-to-br from-[#f5e7a8]/95 via-[#d7e29a]/92 to-[#8aa848]/88 p-8 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold text-[#1d411d]">Homeowner Account</h1>
          <button onClick={logout} className="rounded-md border border-[#1d411d] px-4 py-2 text-sm font-semibold text-[#1d411d] hover:bg-[#dbe9b0]">Sign out</button>
        </div>

        <p className="mt-2 text-sm text-[#244824]">Logged in as {user?.email}</p>

        {loading ? (
          <p className="mt-6 text-[#1f3f1f]">Loading account...</p>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-[#3f6b28] bg-[#f5eecf] p-4">
              <p className="text-xs uppercase tracking-wide text-[#244824]">Current Tier</p>
              <p className="mt-1 text-lg font-bold text-[#1d411d]">{getTierLabel(tier)}</p>
            </div>
            <div className="rounded-xl border border-[#3f6b28] bg-[#f5eecf] p-4">
              <p className="text-xs uppercase tracking-wide text-[#244824]">Profile Limit</p>
              <p className="mt-1 text-lg font-bold text-[#1d411d]">{profileLimit}</p>
            </div>
            <div className="rounded-xl border border-[#3f6b28] bg-[#f5eecf] p-4">
              <p className="text-xs uppercase tracking-wide text-[#244824]">Active Profiles</p>
              <p className="mt-1 text-lg font-bold text-[#1d411d]">{activeProfiles}</p>
            </div>
          </div>
        )}

        <div className="homeowner-panel homeowner-panel-info mt-6">
          {isAtLimit
            ? 'You are at your active profile limit. Upgrade your tier to create more profiles, or delete one to replace it.'
            : 'You can replace profiles by deleting older entries. Limits apply to active profiles only.'}
        </div>

        {tier === 'free' && (
          <div className="homeowner-panel homeowner-panel-warn mt-4">
            Need more than 3 active plant IDs? Upgrade to Gardener or Estate.
            Over 65 requires B2B custom pricing at <a className="underline font-semibold" href="mailto:rachaelr@rrtech.dev">rachaelr@rrtech.dev</a>.
          </div>
        )}

        {error && <p className="homeowner-alert homeowner-alert-error">{error}</p>}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => navigate('/homeowners/plants')}
            className="rounded-md border border-[#1d411d] px-5 py-2.5 text-sm font-semibold text-[#1d411d] hover:bg-[#dbe9b0]"
          >
            Manage Plant Profiles
          </button>
          <button
            onClick={() => navigate('/homeowners/ask-arborai')}
            className="rounded-md border border-[#1d411d] px-5 py-2.5 text-sm font-semibold text-[#1d411d] hover:bg-[#dbe9b0]"
          >
            Ask ArborAI
          </button>
          <button
            onClick={() => navigate('/homeowners/tiers')}
            className="rounded-md bg-[#1d411d] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#173517]"
          >
            Upgrade Tier
          </button>
          <button
            onClick={openPortal}
            disabled={billingLoading || !profile?.stripe_customer_id}
            className="rounded-md border border-[#1d411d] px-5 py-2.5 text-sm font-semibold text-[#1d411d] hover:bg-[#dbe9b0] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {billingLoading ? 'Opening billing...' : 'Manage Billing'}
          </button>
        </div>
      </div>
    </main>
  );
}
