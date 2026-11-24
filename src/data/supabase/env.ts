export function getSupabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL")
  return url
}

export function getSupabaseAnonKey() {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY")
  return key
}

export function getSupabaseServiceRoleKey() {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim()
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY")
  return key
}

/** Real auth is on when URL + anon key exist (local .env.local). */
export function isAuthEnabled() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim())
  )
}
