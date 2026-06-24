import { apiUrl } from './apiUrl';

const DEMO_QUEENS_PASS_UNLOCKED_KEY = 'arbordex-demo-queens-pass-unlocked';

export function isDemoQueensPassUnlocked() {
  return window.localStorage.getItem(DEMO_QUEENS_PASS_UNLOCKED_KEY) === '1';
}

export function setDemoQueensPassUnlocked(isUnlocked) {
  if (isUnlocked) {
    window.localStorage.setItem(DEMO_QUEENS_PASS_UNLOCKED_KEY, '1');
  } else {
    window.localStorage.removeItem(DEMO_QUEENS_PASS_UNLOCKED_KEY);
  }
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
  if (!res.ok || !payload?.ok) {
    throw new Error(payload.error || "Queen's Pass could not be verified.");
  }

  setDemoQueensPassUnlocked(true);
  return true;
}
