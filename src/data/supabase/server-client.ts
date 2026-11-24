import "server-only"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "@/data/supabase/database.types"
import { authCookieOptions } from "@/data/supabase/cookie-options"
import { getSupabaseAnonKey, getSupabaseUrl } from "@/data/supabase/env"

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, {
              ...authCookieOptions,
              ...options,
              maxAge: options.maxAge ?? authCookieOptions.maxAge,
              path: options.path ?? authCookieOptions.path,
              sameSite: options.sameSite ?? authCookieOptions.sameSite,
            })
          }
        } catch {
          // Called from a Server Component — middleware will refresh sessions.
        }
      },
    },
  })
}
