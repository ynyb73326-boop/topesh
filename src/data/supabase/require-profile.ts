import "server-only"

import { createServerSupabaseClient } from "@/data/supabase/server-client"
import { createServiceSupabaseClient } from "@/data/supabase/server"
import { mapProfileToUser } from "@/features/auth/profile-map"
import type { Role, User } from "@/domain/types"
import type { Database } from "@/data/supabase/database.types"

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"]

export type AuthedProfile = {
  profile: ProfileRow
  user: User
  role: Role
}

export async function requireProfile(expected?: Role): Promise<AuthedProfile> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user: authUser },
    error,
  } = await supabase.auth.getUser()
  if (error || !authUser) {
    throw new Error("not authenticated")
  }

  const admin = createServiceSupabaseClient()
  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("auth_user_id", authUser.id)
    .eq("is_active", true)

  if (profileError || !profiles?.length) {
    throw new Error("profile not found")
  }

  const preferred = authUser.user_metadata?.role as string | undefined
  const profile =
    (preferred ? profiles.find((row) => row.role === preferred) : null) ||
    profiles.find((row) => row.role === "manager") ||
    profiles[0]

  if (!profile) throw new Error("profile not found")

  const user = mapProfileToUser(profile)
  if (expected && user.role !== expected) {
    throw new Error("forbidden")
  }

  return { profile, user, role: user.role }
}

export async function requireManager() {
  return requireProfile("manager")
}

export async function requireTeamLeader() {
  return requireProfile("teamLeader")
}
