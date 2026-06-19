import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useHomeownerAuth } from '../context/HomeownerAuthContext';
import './HomeownerTheme.css';

export default function HomeownerLogin() {
  const navigate = useNavigate();
  const { login } = useHomeownerAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await login(email, password);
      navigate('/homeowners/plants', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="homeowner-shell min-h-screen px-4 py-10">
      <div className="homeowner-surface mx-auto w-full max-w-md rounded-2xl p-8 shadow-2xl">
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="homeowner-button-secondary rounded-md px-3 py-2 text-sm font-semibold"
          >
            Home
          </button>
        </div>
        <h1 className="homeowner-heading text-center text-3xl font-bold">Homeowner Login</h1>
        <p className="homeowner-subtext mt-2 text-center text-sm">Access your private plant profiles and plan limits.</p>
        <div className="homeowner-panel homeowner-panel-info mt-4 space-y-2 text-sm">
          <p>
            ArborTag Homeowner Edition is currently in early access. Early users are helping shape the app by sharing honest feedback about setup, plant profiles, photo uploads, and ArborAI guidance.
          </p>
          <p>
            Homeowner Edition is built around the relationship between each person and each plant. The more photos, notes, and care updates you add, the more personal and useful your guidance becomes.
          </p>
          <p>
            Tip: The more photos, notes, and updates you add, the more useful ArborAI's plant guidance can become.
          </p>
          <p>Your plant profiles are private to your account.</p>
          <p>
            ArborAI provides educational plant guidance and does not replace professional arborist, medical, legal, or chemical-treatment advice.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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

          <button
            type="submit"
            disabled={loading || !agreedToTerms}
            className="homeowner-button-primary w-full rounded-md py-3 text-sm font-semibold transition disabled:opacity-60"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="homeowner-muted mt-5 space-y-2 text-center text-sm">
          <p>
            New to Homeowner's Edition?{' '}
            <Link to="/homeowners/signup" className="font-semibold text-[#1d411d] underline">Create account</Link>
          </p>
          <p>
            <Link to="/homeowners/reset-password-request" className="font-semibold text-[#1d411d] underline">Reset password</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
