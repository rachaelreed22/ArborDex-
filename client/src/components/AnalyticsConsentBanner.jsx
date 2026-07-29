import { useEffect, useState } from 'react';

const CONSENT_KEY = 'arbordex-analytics-consent';
const CLARITY_PROJECT_ID = 'xg995b64wt';

function injectClarityScript() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.clarity) return;
  if (document.querySelector('script[data-clarity-project="xg995b64wt"]')) return;

  (function(c, l, a, r, i, t, y) {
    c[a] = c[a] || function() {
      (c[a].q = c[a].q || []).push(arguments);
    };
    t = l.createElement(r);
    t.async = 1;
    t.src = 'https://www.clarity.ms/tag/' + i;
    t.setAttribute('data-clarity-project', i);
    y = l.getElementsByTagName(r)[0];
    y.parentNode.insertBefore(t, y);
  })(window, document, 'clarity', 'script', CLARITY_PROJECT_ID);
}

export default function AnalyticsConsentBanner() {
  const [consent, setConsent] = useState(() => {
    try {
      return (window.localStorage.getItem(CONSENT_KEY) || '').toString();
    } catch {
      return '';
    }
  });

  useEffect(() => {
    if (consent === 'granted') {
      injectClarityScript();
    }
  }, [consent]);

  function grantConsent() {
    try {
      window.localStorage.setItem(CONSENT_KEY, 'granted');
    } catch {
      // Continue without persistence if storage is unavailable.
    }
    setConsent('granted');
  }

  function declineConsent() {
    try {
      window.localStorage.setItem(CONSENT_KEY, 'denied');
    } catch {
      // Continue without persistence if storage is unavailable.
    }
    setConsent('denied');
  }

  if (consent === 'granted' || consent === 'denied') {
    return null;
  }

  return (
    <aside className="consent-banner" role="dialog" aria-live="polite" aria-label="Analytics consent">
      <p className="consent-banner-title">Analytics Cookies</p>
      <p className="consent-banner-text">
        ArborTag uses Microsoft Clarity to understand site usage and improve navigation and content quality.
        You can accept or decline analytics tracking.
      </p>
      <p className="consent-banner-text consent-banner-text-small">
        See details in <a href="/privacy">Privacy Policy</a>.
      </p>
      <div className="consent-banner-actions">
        <button type="button" className="btn btn-primary" onClick={grantConsent}>Accept</button>
        <button type="button" className="btn btn-secondary" onClick={declineConsent}>Decline</button>
      </div>
    </aside>
  );
}
