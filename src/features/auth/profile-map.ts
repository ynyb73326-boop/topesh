import type { User } from "@/domain/types"
import type { Database } from "@/data/supabase/database.types"

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"]

export function mapProfileToUser(profile: ProfileRow): User {
  return {
    id: profile.id,
    fullName: profile.full_name,
    identityNumber: profile.identity_number ?? "",
    phone: profile.phone,
    email: profile.email,
    companyId: profile.company_id ?? "",
    role: profile.role === "team_leader" ? "teamLeader" : "manager",
    isActive: profile.is_active,
  }
}

export function leaderSyntheticEmail(identityNumber: string) {
  return `tl-${identityNumber}@leader.topesh.local`
}
