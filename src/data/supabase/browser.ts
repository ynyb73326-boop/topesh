"use client"

import { createBrowserClient } from "@supabase/ssr"
import type { Database } from "@/data/supabase/database.types"
import { authCookieOptions } from "@/data/supabase/cookie-options"
import { getSupabaseAnonKey, getSupabaseUrl } from "@/data/supabase/env"

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null

/** Singleton browser client — keeps session across tabs / PWA resumes. */
export function createBrowserSupabaseClient() {
  if (browserClient) return browserClient
  browserClient = createBrowserClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookieOptions: authCookieOptions,
    isSingleton: true,
  })
  return browserClient
}
