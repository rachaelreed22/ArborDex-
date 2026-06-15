import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './AdminLogin.css';

const TERMS_KEY = 'arbortag_terms_accepted';

export default function AdminLogin() {
  const navigate = useNavigate();
  const { signInOnly, supabase, hasStaffAccess, isStaffAuthorized, loading: authLoading } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(
    () => localStorage.getItem(TERMS_KEY) === 'true'
  );

  const handleTermsChange = (e) => {
    const checked = e.target.checked;
    setTermsAccepted(checked);
    if (checked) localStorage.setItem(TERMS_KEY, 'true');
    else localStorage.removeItem(TERMS_KEY);
  };

  useEffect(() => {
    if (!authLoading && isStaffAuthorized) {
      navigate('/staff/parks', { replace: true });
    }
  }, [isStaffAuthorized, authLoading, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Step 1: authenticate credentials only.
      const data = await signInOnly(email, password);
      const signedInUser = data?.user || null;

      if (!signedInUser) {
        throw new Error('Sign in succeeded but no user session was returned. Please try again.');
      }

      // Step 2: check staff_profiles BEFORE any state updates propagate.
      const { data: staffProfile, error: staffProfileError } = await supabase
        .from('staff_profiles')
        .select('role, park_id')
        .eq('user_id', signedInUser.id)
        .maybeSingle();

      if (staffProfileError) {
        setError('Unable to verify staff access right now. Please try again.');
        supabase.auth.signOut().catch(() => {});
        return;
      }

      if (!staffProfile || !hasStaffAccess(staffProfile.role)) {
        setError('ACCESS_DENIED');
        supabase.auth.signOut().catch(() => {});
        return;
      }

      // Valid staff — do NOT navigate here.
      // onAuthStateChange will hydrate userRole → isStaffAuthorized becomes true
      // → the useEffect above navigates to /staff/parks once hydration is confirmed.
      // Navigating here would race ProtectedRoute before hydration finishes.
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-container">
      <div className="admin-login-box">
        <div className="login-top-actions">
          <button type="button" className="login-home-btn" onClick={() => navigate('/')}>
            Home
          </button>
        </div>

        <h1>Staff Login</h1>
        <p className="login-subtitle">Sign in to access your park dashboard</p>

        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={loading}
              aria-label="Email address"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
              aria-label="Password"
            />
          </div>

          {error === 'ACCESS_DENIED' ? (
            <div className="login-error login-access-denied" role="alert">
              <strong>Access Denied</strong>
              <p>This account does not have ArborDex staff access. If you believe this is an error, contact your administrator.</p>
            </div>
          ) : error ? (
            <div className="login-error" role="alert">
              {error}
            </div>
          ) : null}

          <div className="terms-check-row">
            <input
              id="terms-check"
              type="checkbox"
              checked={termsAccepted}
              onChange={handleTermsChange}
              disabled={loading}
            />
            <label htmlFor="terms-check" className="terms-check-label">
              I have read and agree to the{' '}
              <Link to="/policies" target="_blank" rel="noopener noreferrer">
                Policies &amp; Terms
              </Link>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || !termsAccepted}
            className="btn btn-primary login-button"
          >
            {loading ? 'Logging in...' : 'Sign In'}
          </button>
        </form>

        <p className="login-help">
          Questions? Contact your park administrator.
        </p>
      </div>
    </div>
  );
}
