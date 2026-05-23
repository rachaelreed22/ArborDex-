// db.js — Supabase client (public backend, anon key)

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

function createUnavailableSupabaseClient(errorMessage) {
  const unavailableResult = { data: null, error: new Error(errorMessage) };

  const queryProxy = new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === 'then') {
          return (resolve) => resolve(unavailableResult);
        }

        if (prop === 'catch' || prop === 'finally') {
          return undefined;
        }

        if (prop === 'select' || prop === 'insert' || prop === 'update' || prop === 'upsert' || prop === 'delete' || prop === 'eq' || prop === 'neq' || prop === 'in' || prop === 'contains' || prop === 'order' || prop === 'range' || prop === 'limit' || prop === 'single' || prop === 'maybeSingle' || prop === 'match' || prop === 'or' || prop === 'ilike' || prop === 'like' || prop === 'gte' || prop === 'lte' || prop === 'gt' || prop === 'lt' || prop === 'not' || prop === 'overlaps' || prop === 'textSearch' || prop === 'is' || prop === 'filter' || prop === 'csv' || prop === 'overrideTypes') {
          return () => queryProxy;
        }

        return queryProxy;
      },
      apply() {
        return Promise.resolve(unavailableResult);
      },
    }
  );

  const storageBucketProxy = new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === 'upload' || prop === 'remove' || prop === 'download' || prop === 'list') {
          return () => queryProxy;
        }

        if (prop === 'getPublicUrl') {
          return () => ({ data: { publicUrl: null } });
        }

        return queryProxy;
      },
    }
  );

  return {
    auth: {
      getUser: async () => unavailableResult,
    },
    from: () => queryProxy,
    storage: {
      from: () => storageBucketProxy,
    },
  };
}

let supabase;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment variables. Running in degraded mode.');
  supabase = createUnavailableSupabaseClient('Supabase environment variables are not configured on this server.');
} else {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
    },
  });
}

module.exports = supabase;
