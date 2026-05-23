import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHomeownerAuth } from '../context/HomeownerAuthContext';
import './HomeownerTheme.css';

export default function HomeownerResetPassword() {
  const navigate = useNavigate();
  const { updatePassword } = useHomeownerAuth();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      await updatePassword(password);
      navigate('/homeowners/login', { replace: true });
    } catch (err) {
      setError(err.message || 'Could not update password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="homeowner-shell min-h-screen px-4 py-10">
      <div className="homeowner-surface mx-auto w-full max-w-md rounded-2xl p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-[#1d411d]">Set New Password</h1>
        <p className="homeowner-subtext mt-2 text-sm">Choose a new password for your Homeowner account.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="homeowner-heading mb-1 block text-sm font-semibold" htmlFor="password">New Password</label>
            <input
              id="password"
              type="password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="homeowner-input w-full rounded-md px-3 py-2 outline-none"
            />
          </div>

          <div>
            <label className="homeowner-heading mb-1 block text-sm font-semibold" htmlFor="confirm">Confirm Password</label>
            <input
              id="confirm"
              type="password"
              minLength={8}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="homeowner-input w-full rounded-md px-3 py-2 outline-none"
            />
          </div>

          {error && <p className="homeowner-alert homeowner-alert-error">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="homeowner-button-primary w-full rounded-md py-3 text-sm font-semibold disabled:opacity-60"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </main>
  );
}
