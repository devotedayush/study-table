import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseConfig } from './config'
import { createMissingSupabaseClient } from './missing-client'

export async function createClient() {
  const config = getSupabaseConfig()

  if (!config) {
    return createMissingSupabaseClient()
  }

  const cookieStore = await cookies()

  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Server components can read cookies but do not always allow writes.
        }
      },
    },
  })
}
