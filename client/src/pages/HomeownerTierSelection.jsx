import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../utils/apiUrl';
import { getTierLabel } from '../utils/homeownerTier';
import { useHomeownerAuth } from '../context/HomeownerAuthContext';
import './HomeownerTheme.css';

const PLANS = [
  { key: 'free', title: 'Free Tier', price: '$0/mo', description: 'Up to 3 active plant profiles' },
  { key: 'gardener', title: "Gardener's Tier", price: '$10.99/mo', description: 'Up to 40 active plant profiles' },
  { key: 'estate', title: 'Estate Tier', price: '$35/mo', description: 'Up to 65 active plant profiles' },
];

export default function HomeownerTierSelection() {
  const navigate = useNavigate();
  const { tier, getAccessToken } = useHomeownerAuth();
  const [selectedTier, setSelectedTier] = useState(tier || 'free');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const chosen = useMemo(() => PLANS.find((p) => p.key === selectedTier), [selectedTier]);

  async function continueCheckout() {
    if (selectedTier === 'free') {
      navigate('/homeowners/account');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const token = await getAccessToken();
      const res = await fetch(apiUrl('/api/stripe/create-checkout-session'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ tier: selectedTier }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.url) throw new Error(payload.error || 'Unable to create checkout session');
      window.location.href = payload.url;
    } catch (err) {
      setError(err.message || 'Checkout failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="homeowner-shell min-h-screen px-4 py-10">
      <div className="homeowner-surface mx-auto w-full max-w-3xl rounded-2xl p-8 shadow-2xl">
        <h1 className="homeowner-heading text-3xl font-bold">Choose Homeowner Tier</h1>
        <p className="homeowner-subtext mt-2 text-sm">Select the plan that fits your number of active plant profiles.</p>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {PLANS.map((plan) => (
            <button
              key={plan.key}
              type="button"
              onClick={() => setSelectedTier(plan.key)}
              className={`homeowner-option-card rounded-xl p-4 text-left transition ${selectedTier === plan.key ? 'homeowner-option-card-active shadow' : ''}`}
            >
              <p className="text-sm font-semibold text-[#1d411d]">{plan.title}</p>
              <p className="homeowner-subtext mt-1 text-2xl font-bold">{plan.price}</p>
              <p className="homeowner-subtext mt-1 text-xs">{plan.description}</p>
            </button>
          ))}
        </div>

        <p className="homeowner-muted mt-4 text-sm">
          Selected: <span className="font-semibold">{getTierLabel(chosen?.key || 'free')}</span>
        </p>

        <div className="homeowner-panel homeowner-panel-warn mt-4">
          Any usage over 65 active plant IDs requires B2B custom pricing at{' '}
          <a className="font-semibold underline" href="mailto:rachaelr@rrtech.dev">rachaelr@rrtech.dev</a>.
        </div>

        {error && <p className="homeowner-alert homeowner-alert-error">{error}</p>}

        <div className="mt-6 flex gap-3">
          <button
            onClick={continueCheckout}
            disabled={loading}
            className="homeowner-button-primary rounded-md px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            {loading ? 'Redirecting...' : selectedTier === 'free' ? 'Keep Free Tier' : 'Continue to Stripe'}
          </button>
          <button
            onClick={() => navigate('/homeowners/account')}
            className="homeowner-button-secondary rounded-md px-5 py-2.5 text-sm font-semibold"
          >
            Cancel
          </button>
        </div>
      </div>
    </main>
  );
}
