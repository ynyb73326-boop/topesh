"use server"

import { createServerSupabaseClient } from "@/data/supabase/server-client"
import { createServiceSupabaseClient } from "@/data/supabase/server"
import { leaderSyntheticEmail } from "@/features/auth/profile-map"
import { sendManagerOtpEmail } from "@/features/auth/send-otp-email"
import { he } from "@/i18n/he"

export type AuthActionResult =
  | { ok: true }
  | { ok: false; error: string }

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function normalizeIdentity(value: string) {
  return value.replace(/\D/g, "")
}

async function findAuthUserIdByEmail(
  admin: ReturnType<typeof createServiceSupabaseClient>,
  email: string
) {
  const perPage = 200
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const match = data.users.find((user) => user.email?.toLowerCase() === email)
    if (match) return match.id
    if (data.users.length < perPage) break
  }
  return null
}

async function ensureAuthUserForProfile(input: {
  profileId: string
  email: string
  role: "manager" | "team_leader"
  authUserId: string | null
}) {
  const admin = createServiceSupabaseClient()
  if (input.authUserId) return input.authUserId

  const existingId = await findAuthUserIdByEmail(admin, input.email)
  if (existingId) {
    await admin
      .from("profiles")
      .update({ auth_user_id: existingId })
      .eq("id", input.profileId)
    return existingId
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    email_confirm: true,
    user_metadata: {
      profile_id: input.profileId,
      role: input.role,
    },
  })
  if (error || !data.user) {
    throw new Error(error?.message || "auth user create failed")
  }

  await admin
    .from("profiles")
    .update({ auth_user_id: data.user.id })
    .eq("id", input.profileId)

  return data.user.id
}

function authConfigErrorMessage(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error ?? "")
  if (/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/i.test(message)) {
    return he.auth.missingServiceRole
  }
  if (/NEXT_PUBLIC_SUPABASE/i.test(message)) {
    return he.auth.missingSupabasePublic
  }
  if (/GMAIL_USER|GMAIL_APP_PASSWORD/i.test(message)) {
    return he.auth.missingGmail
  }
  return null
}

export async function requestManagerOtp(emailRaw: string): Promise<AuthActionResult> {
  try {
    const email = normalizeEmail(emailRaw)
    if (!email) return { ok: false, error: he.auth.emailRequired }

    const admin = createServiceSupabaseClient()
    const { data: profile, error } = await admin
      .from("profiles")
      .select("id, email, role, is_active, auth_user_id")
      .eq("role", "manager")
      .eq("is_active", true)
      .eq("email", email)
      .maybeSingle()

    if (error) {
      console.error("[auth] manager profile lookup:", error.message)
      return { ok: false, error: he.auth.genericError }
    }
    if (!profile?.email) return { ok: false, error: he.auth.managerNotFound }

    await ensureAuthUserForProfile({
      profileId: profile.id,
      email: profile.email,
      role: "manager",
      authUserId: profile.auth_user_id,
    })

    // Supabase Cloud → Gmail SMTP times out (504). Generate a real Auth OTP,
    // then send it from this Next.js server via Gmail (same mailbox).
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: profile.email,
    })
    const code = linkData?.properties?.email_otp
    if (linkError || !code) {
      console.error("[auth] generateLink failed:", linkError?.message)
      return { ok: false, error: he.auth.otpSendFailed }
    }

    return sendManagerOtpEmail({ to: profile.email, code })
  } catch (error) {
    console.error("[auth] requestManagerOtp failed:", error)
    return { ok: false, error: authConfigErrorMessage(error) ?? he.auth.genericError }
  }
}

export async function verifyManagerOtp(
  emailRaw: string,
  tokenRaw: string
): Promise<AuthActionResult> {
  try {
    const email = normalizeEmail(emailRaw)
    const token = tokenRaw.trim()
    if (!email) return { ok: false, error: he.auth.emailRequired }
    if (token.length !== 6) return { ok: false, error: he.auth.otpIncomplete }

    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    })
    if (error || !data.user) return { ok: false, error: he.auth.otpInvalid }

    const admin = createServiceSupabaseClient()
    const { data: profile } = await admin
      .from("profiles")
      .select("id, auth_user_id, role, is_active")
      .eq("role", "manager")
      .eq("is_active", true)
      .eq("email", email)
      .maybeSingle()

    if (!profile) {
      await supabase.auth.signOut()
      return { ok: false, error: he.auth.managerNotFound }
    }

    if (profile.auth_user_id !== data.user.id) {
      await admin.from("profiles").update({ auth_user_id: data.user.id }).eq("id", profile.id)
    }

    return { ok: true }
  } catch {
    return { ok: false, error: he.auth.genericError }
  }
}

export async function signInTeamLeader(identityRaw: string): Promise<AuthActionResult> {
  try {
    const identity = normalizeIdentity(identityRaw)
    if (!identity) return { ok: false, error: he.auth.identityRequired }
    if (identity.length < 8 || identity.length > 9) {
      return { ok: false, error: he.auth.identityInvalid }
    }

    const admin = createServiceSupabaseClient()
    const { data: profile, error } = await admin
      .from("profiles")
      .select("id, full_name, identity_number, email, role, is_active, auth_user_id")
      .eq("role", "team_leader")
      .eq("is_active", true)
      .eq("identity_number", identity)
      .maybeSingle()

    if (error) {
      console.error("[auth] leader profile lookup:", error.message)
      return { ok: false, error: he.auth.genericError }
    }
    if (!profile) return { ok: false, error: he.auth.leaderNotFound }

    const email = profile.email?.trim() || leaderSyntheticEmail(identity)
    await ensureAuthUserForProfile({
      profileId: profile.id,
      email,
      role: "team_leader",
      authUserId: profile.auth_user_id,
    })

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    })
    if (linkError || !linkData.properties?.hashed_token) {
      console.error("[auth] leader generateLink failed:", linkError?.message)
      return { ok: false, error: he.auth.genericError }
    }

    const supabase = await createServerSupabaseClient()
    const { error: verifyError } = await supabase.auth.verifyOtp({
      type: "email",
      token_hash: linkData.properties.hashed_token,
    })
    if (verifyError) {
      console.error("[auth] leader verifyOtp failed:", verifyError.message)
      return { ok: false, error: he.auth.genericError }
    }

    return { ok: true }
  } catch (error) {
    console.error("[auth] signInTeamLeader failed:", error)
    return { ok: false, error: authConfigErrorMessage(error) ?? he.auth.genericError }
  }
}

export async function signOutAuth(): Promise<void> {
  const supabase = await createServerSupabaseClient()
  // Local scope only — explicit logout button. Never call this on app minimize/close.
  await supabase.auth.signOut({ scope: "local" })
}

export async function getSessionProfile() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createServiceSupabaseClient()
  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle()

  return profile
}
