import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './AdminLogin.css';

export default function AdminLogin() {
  const navigate = useNavigate();
  const { login, isAuthenticated, loading: authLoading } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/staff/parks', { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-container">
      <div className="admin-login-box">
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

          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
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
