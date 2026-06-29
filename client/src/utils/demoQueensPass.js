import { apiUrl } from './apiUrl';

const DEMO_QUEENS_PASS_TOKEN_KEY = 'arbordex-demo-queens-pass-token';
const DEMO_QUEENS_PASS_UNLOCKED_KEY = 'arbordex-demo-queens-pass-unlocked';

export function isDemoQueensPassUnlocked() {
  const token = (window.sessionStorage.getItem(DEMO_QUEENS_PASS_TOKEN_KEY) || '').toString().trim();
  const legacyToken = (window.localStorage.getItem(DEMO_QUEENS_PASS_TOKEN_KEY) || '').toString().trim();
  if (legacyToken) {
    window.localStorage.removeItem(DEMO_QUEENS_PASS_TOKEN_KEY);
    window.localStorage.removeItem(DEMO_QUEENS_PASS_UNLOCKED_KEY);
  }

  if (token) {
    window.sessionStorage.setItem(DEMO_QUEENS_PASS_UNLOCKED_KEY, '1');
    return true;
  }

  // Remove stale legacy unlock flags that do not have a valid edit token.
  if (window.sessionStorage.getItem(DEMO_QUEENS_PASS_UNLOCKED_KEY) === '1') {
    window.sessionStorage.removeItem(DEMO_QUEENS_PASS_UNLOCKED_KEY);
  }

  return false;
}

export function getDemoQueensPassToken() {
  return window.sessionStorage.getItem(DEMO_QUEENS_PASS_TOKEN_KEY) || '';
}

export function setDemoQueensPassUnlocked(token) {
  if (token) {
    window.sessionStorage.setItem(DEMO_QUEENS_PASS_TOKEN_KEY, token.toString());
    window.sessionStorage.setItem(DEMO_QUEENS_PASS_UNLOCKED_KEY, '1');
  } else {
    window.sessionStorage.removeItem(DEMO_QUEENS_PASS_TOKEN_KEY);
    window.sessionStorage.removeItem(DEMO_QUEENS_PASS_UNLOCKED_KEY);
  }
}

export function clearDemoQueensPass() {
  setDemoQueensPassUnlocked('');
}

export async function verifyDemoQueensPass(email, passId) {
  const res = await fetch(apiUrl('/api/demo-garden/queens-pass/verify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: (email || '').toString().trim(),
      pass_id: (passId || '').toString().trim(),
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.ok || !payload?.token) {
    throw new Error(payload.error || "Queen's Pass could not be verified.");
  }

  setDemoQueensPassUnlocked(payload.token);
  return true;
}
