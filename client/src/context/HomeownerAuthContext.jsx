import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const HomeownerAuthContext = createContext(null);

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: 'arbortag-homeowner-auth',
  },
});

export function HomeownerAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function fetchHomeownerProfile(userId) {
    if (!userId) {
      setProfile(null);
      return null;
    }

    const profilePromise = supabase
      .from('homeowner_profiles')
      .select('id, user_id, tier, stripe_customer_id')
      .eq('user_id', userId)
      .single();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('homeowner_profiles query timed out')), 5000)
    );

    const { data, error: profileError } = await Promise.race([profilePromise, timeoutPromise]);

    if (profileError && profileError.code !== 'PGRST116') {
      throw profileError;
    }

    setProfile(data || null);
    return data || null;
  }

  async function ensureHomeownerProfile(userId) {
    if (!userId) return null;

    let foundProfile = await fetchHomeownerProfile(userId);
    if (foundProfile) return foundProfile;

    const { error: upsertError } = await supabase
      .from('homeowner_profiles')
      .upsert(
        [{
          user_id: userId,
          tier: 'free',
        }],
        { onConflict: 'user_id' }
      );

    if (upsertError) throw upsertError;
    return fetchHomeownerProfile(userId);
  }

  useEffect(() => {
    let mounted = true;

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
    const { data, error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          account_type: 'homeowner',
        },
      },
    });

    if (signupError) throw signupError;

    const authUser = data?.user;
    if (authUser) {
      const { error: upsertError } = await supabase
        .from('homeowner_profiles')
        .upsert(
          [{
            user_id: authUser.id,
            tier: 'free',
          }],
          { onConflict: 'user_id' }
        );
      if (upsertError) throw upsertError;

      await ensureHomeownerProfile(authUser.id);
    }

    return data;
  }

  async function login(email, password) {
    setError('');
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
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
    const redirectTo = `${window.location.origin}/homeowners/reset-password`;
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
    refreshProfile: () => fetchHomeownerProfile(user?.id),
  }), [user, profile, loading, error]);

  return <HomeownerAuthContext.Provider value={value}>{children}</HomeownerAuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useHomeownerAuth() {
  const ctx = useContext(HomeownerAuthContext);
  if (!ctx) throw new Error('useHomeownerAuth must be used within HomeownerAuthProvider');
  return ctx;
}
