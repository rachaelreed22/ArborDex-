import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiUrl } from '../utils/apiUrl';
import { useHomeownerAuth } from '../context/HomeownerAuthContext';
import './HomeownerTheme.css';

export default function HomeownerQrTagOrders() {
  const navigate = useNavigate();
  const { isAuthenticated, loading, getAccessToken } = useHomeownerAuth();
  const [orders, setOrders] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({
    quantity: 25,
    tag_material: 'weatherproof-vinyl',
    notes: '',
  });

  async function authFetch(path, options = {}) {
    const token = await getAccessToken();
    const res = await fetch(apiUrl(path), {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload.error || 'Request failed');
    }

    return payload;
  }

  async function loadOrders() {
    if (!isAuthenticated) return;
    try {
      setFetching(true);
      setError('');
      const payload = await authFetch('/api/homeowners/qr-tag-orders');
      setOrders(Array.isArray(payload.orders) ? payload.orders : []);
    } catch (err) {
      setError(err.message || 'Could not load QR tag requests');
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (loading) return;
    void loadOrders();
  }, [loading, isAuthenticated]);

  async function submitOrderRequest(e) {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError('');
      setSuccess('');
      const payload = await authFetch('/api/homeowners/qr-tag-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setSuccess(payload.message || 'Request saved.');
      setForm((prev) => ({ ...prev, notes: '' }));
      await loadOrders();
    } catch (err) {
      setError(err.message || 'Could not save request');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="homeowner-shell min-h-screen px-4 py-10">
        <div className="homeowner-surface mx-auto w-full max-w-3xl rounded-2xl p-8 shadow-2xl">
          <p className="homeowner-subtext">Loading...</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="homeowner-shell min-h-screen px-4 py-10">
        <div className="homeowner-surface mx-auto w-full max-w-3xl rounded-2xl p-8 shadow-2xl space-y-4">
          <p className="homeowner-alert homeowner-alert-success">Coming Soon: QR-coded plant tag ordering is in pre-launch.</p>
          <h1 className="homeowner-heading text-3xl font-bold">QR Tag Orders</h1>
          <p className="homeowner-subtext text-sm">Sign in to leave your early request while ordering is being finalized.</p>
          <div className="flex gap-3 flex-wrap">
            <Link to="/homeowners/login" className="homeowner-button-primary rounded-md px-5 py-2.5 text-sm font-semibold">Homeowner Login</Link>
            <button
              type="button"
              className="homeowner-button-secondary rounded-md px-5 py-2.5 text-sm font-semibold"
              onClick={() => navigate('/homeowners')}
            >
              Back
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="homeowner-shell min-h-screen px-4 py-10">
      <div className="homeowner-surface mx-auto w-full max-w-3xl rounded-2xl p-8 shadow-2xl space-y-5">
        <p className="homeowner-alert homeowner-alert-success">
          Coming Soon: Ordering is not live yet. Early request entries are being collected while Stripe and fulfillment are finalized.
        </p>

        <h1 className="homeowner-heading text-3xl font-bold">QR-Coded Plant ID Tag Orders</h1>

        <form className="space-y-4" onSubmit={submitOrderRequest}>
          <div>
            <label className="homeowner-heading mb-1 block text-sm font-semibold" htmlFor="qr-order-qty">Tag Quantity</label>
            <input
              id="qr-order-qty"
              type="number"
              min="1"
              max="500"
              className="homeowner-input w-full rounded-md px-3 py-2 outline-none"
              value={form.quantity}
              onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value }))}
              disabled={submitting}
            />
          </div>

          <div>
            <label className="homeowner-heading mb-1 block text-sm font-semibold" htmlFor="qr-order-material">Tag Material Preference</label>
            <select
              id="qr-order-material"
              className="homeowner-input w-full rounded-md px-3 py-2 outline-none"
              value={form.tag_material}
              onChange={(e) => setForm((prev) => ({ ...prev, tag_material: e.target.value }))}
              disabled={submitting}
            >
              <option value="weatherproof-vinyl">Weatherproof Vinyl</option>
              <option value="aluminum">Aluminum</option>
              <option value="stainless-steel">Stainless Steel</option>
              <option value="unsure">Unsure</option>
            </select>
          </div>

          <div>
            <label className="homeowner-heading mb-1 block text-sm font-semibold" htmlFor="qr-order-notes">Notes</label>
            <textarea
              id="qr-order-notes"
              rows={4}
              className="homeowner-input w-full rounded-md px-3 py-2 outline-none"
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Optional: preferred size, attachment style, or quantity mix"
              disabled={submitting}
            />
          </div>

          {error && <p className="homeowner-alert homeowner-alert-error">{error}</p>}
          {success && <p className="homeowner-alert homeowner-alert-success">{success}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="homeowner-button-primary rounded-md px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            {submitting ? 'Saving...' : 'Save Early Order Request'}
          </button>
        </form>

        <section className="homeowner-panel homeowner-panel-info">
          <h2 className="homeowner-heading text-lg font-semibold">Your Saved Requests</h2>
          {fetching ? (
            <p className="homeowner-subtext mt-2 text-sm">Loading requests...</p>
          ) : orders.length === 0 ? (
            <p className="homeowner-subtext mt-2 text-sm">No requests yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm homeowner-subtext">
              {orders.map((order) => (
                <li key={order.id} className="homeowner-panel homeowner-panel-info">
                  Qty {order.quantity} | {order.tag_material || 'No material selected'} | {new Date(order.created_at).toLocaleString()}
                  {order.notes ? <div className="mt-1">Notes: {order.notes}</div> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
