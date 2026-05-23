import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHomeownerAuth } from '../context/HomeownerAuthContext';
import './HomeownerTheme.css';

export default function HomeownerResetPassword() {
  const navigate = useNavigate();
  const { updatePassword, supabase } = useHomeownerAuth();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function prepareRecoverySession() {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));

        const authCode = searchParams.get('code');
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (authCode) {
          await supabase.auth.exchangeCodeForSession(authCode);
        } else if (accessToken && refreshToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        }

        const { data, error: sessionError } = await supabase.auth.getSession();
        if (!active) return;

        if (sessionError || !data?.session) {
          setSessionReady(false);
          setError('Recovery link expired or invalid. Request a new reset email.');
          return;
        }

        setSessionReady(true);
      } catch {
        if (!active) return;
        setSessionReady(false);
        setError('Could not validate reset session. Request a new reset email.');
      } finally {
        if (active) setSessionChecking(false);
      }
    }

    void prepareRecoverySession();

    return () => {
      active = false;
    };
  }, [supabase]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!sessionReady) {
      setError('Reset session is missing. Request a new reset email and use the latest link.');
      return;
    }

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

        {sessionChecking && <p className="homeowner-subtext mt-4 text-sm">Validating reset link...</p>}

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
            disabled={loading || sessionChecking || !sessionReady}
            className="homeowner-button-primary w-full rounded-md py-3 text-sm font-semibold disabled:opacity-60"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>

        {!sessionChecking && !sessionReady && (
          <p className="homeowner-muted mt-4 text-sm">
            <a href="/homeowners/reset-password-request" className="font-semibold underline">Request a new reset email</a>
          </p>
        )}
      </div>
    </main>
  );
}
