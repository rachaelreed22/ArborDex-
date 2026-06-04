import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiUrl } from '../utils/apiUrl';
import { useHomeownerAuth } from '../context/HomeownerAuthContext';
import { getTierLabel } from '../utils/homeownerTier';
import './HomeownerTheme.css';

const PLANS = [
  {
    key: 'free',
    title: 'Free Tier',
    price: '$0/mo',
    limit: 'Up to 3 active plant profiles',
  },
  {
    key: 'gardener',
    title: "Gardener's Tier",
    price: '$10.99/mo',
    limit: 'Up to 40 active plant profiles',
  },
  {
    key: 'estate',
    title: 'Estate Tier',
    price: '$35/mo',
    limit: 'Up to 65 active plant profiles',
  },
];

export default function HomeownerSignup() {
  const navigate = useNavigate();
  const { signup, login, getAccessToken, resetPassword } = useHomeownerAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [plan, setPlan] = useState('free');
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [showResetNow, setShowResetNow] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');

  const selectedPlan = useMemo(() => PLANS.find((p) => p.key === plan), [plan]);

  useEffect(() => {
    if (plan === 'free') {
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
          body: JSON.stringify({ tier: plan, promoCode }),
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
  }, [plan, promoCode]);

  function isExistingAccountError(message) {
    const normalized = (message || '').toString().toLowerCase();
    return (
      normalized.includes('already exists')
      || normalized.includes('already registered')
      || normalized.includes('user exists')
      || normalized.includes('already in use')
    );
  }

  async function handleSendResetNow() {
    const normalizedEmail = (email || '').toString().trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Enter your email, then click Send reset email now.');
      return;
    }

    setResetLoading(true);
    setResetMessage('');
    try {
      await resetPassword(normalizedEmail);
      setResetMessage('Reset email sent. Please check inbox and spam folders.');
    } catch (err) {
      setError(err?.message || 'Could not send reset email.');
    } finally {
      setResetLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setResetMessage('');
    setShowResetNow(false);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await signup({ email, password });
      await login(email, password);

      if (plan === 'free') {
        navigate('/homeowners/plants', { replace: true });
        return;
      }

      const token = await getAccessToken();
      const res = await fetch(apiUrl('/api/stripe/create-checkout-session'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ tier: plan, promoCode }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.url) {
        throw new Error(payload.error || 'Could not start Stripe checkout');
      }

      window.location.href = payload.url;
    } catch (err) {
      const nextError = err?.message || 'Signup failed';
      setError(nextError);
      setShowResetNow(isExistingAccountError(nextError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="homeowner-shell min-h-screen px-4 py-10">
      <div className="homeowner-surface mx-auto w-full max-w-3xl rounded-2xl p-8 shadow-2xl">
        <h1 className="homeowner-heading text-center text-3xl font-bold">Create Homeowner Account</h1>
        <p className="homeowner-subtext mt-2 text-center text-sm">Choose your tier and create your Homeowner's Edition login.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="homeowner-heading mb-1 block text-sm font-semibold" htmlFor="email">Email</label>
              <input
                id="email"
                className="homeowner-input w-full rounded-md px-3 py-2 outline-none"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div>
              <label className="homeowner-heading mb-1 block text-sm font-semibold" htmlFor="password">Password</label>
              <div className="relative flex items-center">
                <input
                  id="password"
                  className="homeowner-input w-full rounded-md px-3 py-2 pr-10 outline-none"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                  className="absolute right-2 text-xl text-[#1d411d] hover:opacity-70 transition disabled:opacity-50"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="homeowner-heading mb-1 block text-sm font-semibold" htmlFor="confirmPassword">Confirm Password</label>
            <div className="relative flex items-center">
              <input
                id="confirmPassword"
                className="homeowner-input w-full rounded-md px-3 py-2 pr-10 outline-none"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                disabled={loading}
                className="absolute right-2 text-xl text-[#1d411d] hover:opacity-70 transition disabled:opacity-50"
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-lg font-semibold text-[#1d411d]">Select Tier</h2>
            <div className="grid gap-3 md:grid-cols-3">
              {PLANS.map((tier) => (
                <button
                  key={tier.key}
                  type="button"
                  onClick={() => setPlan(tier.key)}
                  className={`homeowner-option-card rounded-xl p-4 text-left transition ${plan === tier.key ? 'homeowner-option-card-active shadow' : ''}`}
                >
                  <p className="text-sm font-semibold text-[#1d411d]">{tier.title}</p>
                  <p className="homeowner-subtext mt-1 text-xl font-bold">{tier.price}</p>
                  <p className="homeowner-subtext mt-1 text-xs">{tier.limit}</p>
                </button>
              ))}
            </div>
            <p className="homeowner-muted mt-3 text-sm">
              Over 65 active plant IDs requires a B2B arrangement with custom pricing. Email{' '}
              <a className="font-semibold underline" href="mailto:rachaelr@rrtech.dev">rachaelr@rrtech.dev</a>.
            </p>

            {plan !== 'free' && (
              <div className="mt-4">
                <label className="homeowner-heading mb-1 block text-sm font-semibold" htmlFor="signup-promo-code">
                  Promo code (optional)
                </label>
                <input
                  id="signup-promo-code"
                  className="homeowner-input w-full rounded-md px-3 py-2 outline-none"
                  type="text"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  placeholder="Enter founding member code"
                  disabled={loading}
                />
              </div>
            )}

            {plan !== 'free' && (
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
          </div>

          <label className="flex items-start gap-2 text-sm homeowner-subtext cursor-pointer">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              disabled={loading}
              className="mt-0.5 accent-[#1d411d]"
              required
            />
            <span>
              I agree to the{' '}
              <Link to="/policies" target="_blank" className="font-semibold text-[#1d411d] underline">Policies &amp; Terms</Link>
            </span>
          </label>

          {error && <p className="homeowner-alert homeowner-alert-error">{error}</p>}

          {showResetNow && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleSendResetNow}
                disabled={loading || resetLoading}
                className="w-full rounded-md border border-[#1d411d] bg-white py-2 text-sm font-semibold text-[#1d411d] transition hover:bg-[#f4f8f1] disabled:opacity-60"
              >
                {resetLoading ? 'Sending reset email...' : 'Send reset email now'}
              </button>
              {resetMessage && <p className="homeowner-alert homeowner-alert-success">{resetMessage}</p>}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !agreedToTerms}
            className="homeowner-button-primary w-full rounded-md py-3 text-sm font-semibold transition disabled:opacity-60"
          >
            {loading ? 'Creating account...' : `Continue with ${getTierLabel(selectedPlan?.key || 'free')}`}
          </button>
        </form>

        <p className="homeowner-muted mt-4 text-center text-sm">
          Already have an account?{' '}
          <Link to="/homeowners/login" className="font-semibold text-[#1d411d] underline">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
