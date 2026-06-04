import { useEffect, useMemo, useState } from 'react';
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
  const [promoCode, setPromoCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [error, setError] = useState('');
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');

  const chosen = useMemo(() => PLANS.find((p) => p.key === selectedTier), [selectedTier]);

  useEffect(() => {
    if (selectedTier === 'free') {
      setQuote(null);
      setQuoteError('');
      setQuoteLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setQuoteLoading(true);
        setQuoteError('');

        const res = await fetch(apiUrl('/api/stripe/checkout-preview'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tier: selectedTier, promoCode }),
          signal: controller.signal,
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload.error || 'Unable to preview checkout total');
        }

        setQuote(payload);
      } catch (err) {
        if (controller.signal.aborted) return;
        setQuote(null);
        setQuoteError(err?.message || 'Unable to preview checkout total');
      } finally {
        if (!controller.signal.aborted) {
          setQuoteLoading(false);
        }
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [selectedTier, promoCode]);

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
        body: JSON.stringify({ tier: selectedTier, promoCode }),
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
      if (!res.ok || !payload.url) throw new Error(payload.error || 'Unable to open billing portal');
      window.location.href = payload.url;
    } catch (err) {
      setError(err.message || 'Billing portal error');
    } finally {
      setBillingLoading(false);
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

        <div className="mt-4">
          <label className="homeowner-heading mb-1 block text-sm font-semibold" htmlFor="homeowner-promo-code">
            Promo code (optional)
          </label>
          <input
            id="homeowner-promo-code"
            className="homeowner-input w-full rounded-md px-3 py-2 text-sm outline-none"
            type="text"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value)}
            placeholder="Enter founding member code"
            disabled={loading || billingLoading}
          />
          <p className="homeowner-muted mt-1 text-xs">
            If you have a founding-member code, enter it here before continuing.
          </p>
        </div>

        {selectedTier !== 'free' && (
          <div className="homeowner-panel homeowner-panel-info mt-4">
            <p className="text-sm font-semibold text-[#1d411d]">Charge preview</p>
            {quoteLoading ? (
              <p className="homeowner-subtext mt-1 text-sm">Calculating your exact first charge...</p>
            ) : quote ? (
              <div className="mt-2 space-y-1 text-sm">
                <p className="homeowner-subtext">Subtotal: <span className="font-semibold">{quote.subtotal_display}</span></p>
                {Number(quote.discount_minor || 0) > 0 && (
                  <p className="homeowner-subtext">Promo discount: <span className="font-semibold text-[#1d411d]">-{quote.discount_display}</span></p>
                )}
                <p className="text-base font-semibold text-[#1d411d]">You will be charged: {quote.total_display}</p>
                {Number(quote.discount_minor || 0) > 0 && (
                  <p className="homeowner-muted text-xs">Discount applies before the first subscription charge is collected.</p>
                )}
              </div>
            ) : (
              <p className="homeowner-subtext mt-1 text-sm">{quoteError || 'Enter a promo code if you have one, then continue.'}</p>
            )}
          </div>
        )}

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
          <button
            onClick={openPortal}
            disabled={billingLoading}
            className="homeowner-button-secondary rounded-md px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {billingLoading ? 'Opening billing...' : 'Manage Billing'}
          </button>
        </div>
      </div>
    </main>
  );
}
