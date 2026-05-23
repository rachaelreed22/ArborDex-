import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useHomeownerAuth } from '../context/HomeownerAuthContext';
import './HomeownerTheme.css';

export default function HomeownerResetPasswordRequest() {
  const { resetPassword } = useHomeownerAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await resetPassword(email);
      setMessage('Password reset email sent. Check your inbox.');
    } catch (err) {
      setError(err.message || 'Could not send reset email');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="homeowner-shell min-h-screen px-4 py-10">
      <div className="homeowner-surface mx-auto w-full max-w-md rounded-2xl p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-[#1d411d]">Reset Password</h1>
        <p className="homeowner-subtext mt-2 text-sm">Enter the email on file and we will send a reset link.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="homeowner-heading mb-1 block text-sm font-semibold" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="homeowner-input w-full rounded-md px-3 py-2 outline-none"
            />
          </div>

          {message && <p className="homeowner-alert homeowner-alert-success">{message}</p>}
          {error && <p className="homeowner-alert homeowner-alert-error">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="homeowner-button-primary w-full rounded-md py-3 text-sm font-semibold disabled:opacity-60"
          >
            {loading ? 'Sending...' : 'Send reset link'}
          </button>
        </form>

        <p className="homeowner-muted mt-4 text-sm">
          <Link className="font-semibold underline" to="/homeowners/login">Back to login</Link>
        </p>
      </div>
    </main>
  );
}
