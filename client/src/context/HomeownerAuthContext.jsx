import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const HomeownerAuthContext = createContext(null);

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const PUBLIC_APP_URL = (import.meta.env.VITE_PUBLIC_APP_URL || '').toString().trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: 'arbortag-homeowner-auth',
  },
});

function getHomeownerResetRedirectUrl() {
  const configured = PUBLIC_APP_URL.replace(/\/$/, '');
  if (configured) {
    return `${configured}/homeowners/reset-password`;
  }

  const origin = (window?.location?.origin || '').toString().trim().replace(/\/$/, '');
  // Localhost links in emails are unreachable for remote users; default to production URL.
  if (!origin || /localhost|127\.0\.0\.1/i.test(origin)) {
    return 'https://arbordex.onrender.com/homeowners/reset-password';
  }

  return `${origin}/homeowners/reset-password`;
}

function isRecoveryLinkVisit() {
  const search = (window?.location?.search || '').toString().toLowerCase();
  const hash = (window?.location?.hash || '').toString().toLowerCase();
  return (
    search.includes('type=recovery')
    || hash.includes('type=recovery')
    || hash.includes('recovery_token=')
    || hash.includes('access_token=')
  );
}

function redirectToResetPasswordRoute() {
  const resetPath = '/homeowners/reset-password';
  const pathname = (window?.location?.pathname || '').toString();
  const search = (window?.location?.search || '').toString();
  const hash = (window?.location?.hash || '').toString();

  if (pathname === resetPath) return;

  // Preserve search/hash because Supabase recovery tokens are often carried there.
  window.location.replace(`${resetPath}${search}${hash}`);
}

export function HomeownerAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function ensureHomeownerProfile(userId) {
    if (!userId) return null;

    const fallbackProfile = {
      id: null,
      user_id: userId,
      tier: 'free',
      stripe_customer_id: null,
    };

    setProfile(fallbackProfile);
    return fallbackProfile;
  }

  useEffect(() => {
    let mounted = true;

    if (isRecoveryLinkVisit()) {
      redirectToResetPasswordRoute();
    }

    async function hydrate() {
      try {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        const nextUser = session?.user || null;
        if (!mounted) return;

        setUser(nextUser);
        if (nextUser) {
          await ensureHomeownerProfile(nextUser.id);
        } else {
          setProfile(null);
        }
      } catch (err) {
        if (mounted) setError(err.message || 'Failed to load homeowner session');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    hydrate();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'PASSWORD_RECOVERY') {
        redirectToResetPasswordRoute();
      }

      const nextUser = session?.user || null;
      setLoading(true);
      setUser(nextUser);

      void (async () => {
        try {
          if (nextUser) {
            await ensureHomeownerProfile(nextUser.id);
          } else {
            setProfile(null);
          }
        } catch (err) {
          setError(err.message || 'Failed to hydrate homeowner profile');
          setProfile(null);
        } finally {
          setLoading(false);
        }
      })();
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  async function signup({ email, password }) {
    setError('');
    const normalizedEmail = (email || '').toString().trim().toLowerCase();

    const { data, error: signupError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          account_type: 'homeowner',
        },
      },
    });

    if (signupError) {
      const normalizedMessage = (signupError.message || '').toLowerCase();
      if (
        normalizedMessage.includes('already registered')
        || normalizedMessage.includes('already exists')
        || normalizedMessage.includes('user exists')
      ) {
        // If Auth already has this email, try logging in so returning users are not blocked.
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (signInError || !signInData?.user) {
          throw new Error('An account with this email already exists. Try Sign in or Reset Password.');
        }

        await ensureHomeownerProfile(signInData.user.id);
        return signInData;
      }

      throw signupError;
    }

    const authUser = data?.user;
    if (authUser) {
      await ensureHomeownerProfile(authUser.id);
    }

    return data;
  }

  async function login(email, password) {
    setError('');
    const normalizedEmail = (email || '').toString().trim().toLowerCase();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    if (signInError) throw signInError;

    return data;
  }

  async function logout() {
    setError('');
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
    setUser(null);
    setProfile(null);
  }

  async function resetPassword(email) {
    setError('');
    const redirectTo = getHomeownerResetRedirectUrl();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (resetError) throw resetError;
  }

  async function updatePassword(password) {
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) throw updateError;
  }

  async function getAccessToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  }

  const value = useMemo(() => ({
    user,
    profile,
    tier: profile?.tier || 'free',
    isAuthenticated: Boolean(user),
    isHomeowner: Boolean(profile?.user_id),
    loading,
    error,
    supabase,
    login,
    signup,
    logout,
    resetPassword,
    updatePassword,
    getAccessToken,
    refreshProfile: () => ensureHomeownerProfile(user?.id),
  }), [user, profile, loading, error]);

  return <HomeownerAuthContext.Provider value={value}>{children}</HomeownerAuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useHomeownerAuth() {
  const ctx = useContext(HomeownerAuthContext);
  if (!ctx) throw new Error('useHomeownerAuth must be used within HomeownerAuthProvider');
  return ctx;
}
