import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/data/supabase/database.types"
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/data/supabase/env"

/**
 * Service-role client for trusted server modules only.
 * Never import this file from Client Components.
 */
export function createServiceSupabaseClient(): SupabaseClient<Database> {
  return createClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
