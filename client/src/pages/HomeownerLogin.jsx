import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useHomeownerAuth } from '../context/HomeownerAuthContext';
import './HomeownerTheme.css';

export default function HomeownerLogin() {
  const navigate = useNavigate();
  const { login } = useHomeownerAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        <h1 className="homeowner-heading text-center text-3xl font-bold">Homeowner Login</h1>
        <p className="homeowner-subtext mt-2 text-center text-sm">Access your private plant profiles and plan limits.</p>

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
            <input
              id="password"
              className="homeowner-input w-full rounded-md px-3 py-2 outline-none"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
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
