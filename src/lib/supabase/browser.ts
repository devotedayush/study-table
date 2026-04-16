'use client'

import { createBrowserClient } from '@supabase/ssr'
import { getSupabaseConfig } from './config'
import { createMissingSupabaseClient } from './missing-client'

export function createClient() {
  const config = getSupabaseConfig()

  if (!config) {
    return createMissingSupabaseClient()
  }

  return createBrowserClient(config.url, config.anonKey)
}
