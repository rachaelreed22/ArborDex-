import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const AuthContext = createContext(null);

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL || '').toString().trim()
  || 'https://oukhegxuzgssyfqogdmg.supabase.co';
const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY || '').toString().trim()
  || 'sb_publishable_SUwAmMFR9xGM26BXK7A5oA_XsAvSbGz';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [userParkId, setUserParkId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const hydrateUserProfile = async (authUser) => {
    if (!authUser) {
      setUser(null);
      setUserRole(null);
      setUserParkId(null);
      return;
    }

    const isHomeownerSession =
      authUser?.user_metadata?.account_type === 'homeowner'
      || (typeof window !== 'undefined' && window.location.pathname.startsWith('/homeowners'));

    if (isHomeownerSession) {
      // Homeowner auth is handled by HomeownerAuthContext; skip staff profile hydration.
      setUser(null);
      setUserRole(null);
      setUserParkId(null);
      return;
    }

    setUser(authUser);

    try {
      const profilePromise = supabase
        .from('staff_profiles')
        .select('role, park_id')
        .eq('user_id', authUser.id)
        .single();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('staff_profiles query timed out')), 5000)
      );

      const { data: profile, error: profileError } = await Promise.race([profilePromise, timeoutPromise]);

      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Error fetching profile:', profileError);
      }

      if (profile) {
        setUserRole(profile.role);
        setUserParkId(profile.park_id);
      } else {
        setUserRole(null);
        setUserParkId(null);
      }
    } catch (err) {
      console.error('hydrateUserProfile failed:', err.message);
      setUserRole(null);
      setUserParkId(null);
    }
  };

  // Check session on mount and listen for auth changes
  useEffect(() => {
    // Safety net: never stay loading more than 6 seconds
    const loadingTimeout = setTimeout(() => {
      setLoading(false);
    }, 6000);

    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        await hydrateUserProfile(session?.user ?? null);
      } catch (err) {
        setError(err.message);
      } finally {
        clearTimeout(loadingTimeout);
        setLoading(false);
      }
    };

    checkSession();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setLoading(true);
        try {
          await hydrateUserProfile(session?.user ?? null);
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      }
    );

    return () => {
      clearTimeout(loadingTimeout);
      subscription?.unsubscribe();
    };
  }, []);

  const login = async (email, password) => {
    try {
      setError(null);
      setLoading(true);
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        throw signInError;
      }

      // Don't await profile hydration here — onAuthStateChange handles it.
      // Returning immediately prevents the form from hanging if staff_profiles is slow.
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      setError(null);
      setLoading(true);
      await supabase.auth.signOut();
      setUser(null);
      setUserRole(null);
      setUserParkId(null);
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const value = {
    user,
    userRole,
    userParkId,
    loading,
    error,
    login,
    logout,
    supabase,
    isAuthenticated: !!user,
    isQueen: userRole === 'queen',
    isStaff: userRole === 'staff',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
