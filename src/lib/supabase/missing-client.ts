import type { SupabaseClient } from '@supabase/supabase-js'

const missingSupabaseError = {
  message: 'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
}

class MissingSupabaseQuery {
  select() {
    return this
  }

  eq() {
    return this
  }

  order() {
    return this
  }

  limit() {
    return this
  }

  delete() {
    return this
  }

  insert() {
    return Promise.resolve({ data: null, error: missingSupabaseError })
  }

  upsert() {
    return Promise.resolve({ data: null, error: missingSupabaseError })
  }

  maybeSingle() {
    return Promise.resolve({ data: null, error: null })
  }

  single() {
    return Promise.resolve({ data: null, error: missingSupabaseError })
  }

  then<TResult1 = { data: null; error: typeof missingSupabaseError }, TResult2 = never>(
    onfulfilled?: ((value: { data: null; error: typeof missingSupabaseError }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve({ data: null, error: missingSupabaseError }).then(onfulfilled, onrejected)
  }
}

export function createMissingSupabaseClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      signOut: async () => ({ error: null }),
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: missingSupabaseError }),
      signUp: async () => ({ data: { user: null, session: null }, error: missingSupabaseError }),
    },
    from: () => new MissingSupabaseQuery(),
    rpc: async () => ({ data: null, error: missingSupabaseError }),
  } as unknown as SupabaseClient
}
