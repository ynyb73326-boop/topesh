"use server"

import { createServerSupabaseClient } from "@/data/supabase/server-client"
import { createServiceSupabaseClient } from "@/data/supabase/server"
import { mapProfileToUser } from "@/features/auth/profile-map"
import type { Role, User } from "@/domain/types"

export type AuthSessionPayload = {
  role: Role
  user: User
} | null

export async function loadAuthSession(): Promise<AuthSessionPayload> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user: authUser },
    error,
  } = await supabase.auth.getUser()

  // Transient Auth/API failures must not look like "logged out".
  if (error) throw new Error(error.message)
  if (!authUser) return null

  const admin = createServiceSupabaseClient()
  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("auth_user_id", authUser.id)
    .eq("is_active", true)

  if (profileError) throw new Error(profileError.message)
  if (!profiles?.length) return null

  const preferredRole = authUser.user_metadata?.role as string | undefined
  const profile =
    profiles.find((row) => row.role === preferredRole) || profiles[0]
  if (!profile) return null

  const user = mapProfileToUser(profile)
  return { role: user.role, user }
}
