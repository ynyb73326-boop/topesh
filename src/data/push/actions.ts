"use server"

import { requireProfile } from "@/data/supabase/require-profile"
import { createServiceSupabaseClient } from "@/data/supabase/server"
import { getVapidPublicKey, isPushConfigured } from "@/data/push/env"

export type PushActionResult =
  | { ok: true }
  | { ok: false; error: string }

export async function getPushPublicKeyAction(): Promise<
  { ok: true; publicKey: string } | { ok: false; configured: false }
> {
  if (!isPushConfigured()) return { ok: false, configured: false }
  try {
    return { ok: true, publicKey: getVapidPublicKey() }
  } catch {
    return { ok: false, configured: false }
  }
}

export async function subscribePushAction(input: {
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string
}): Promise<PushActionResult> {
  try {
    const { profile } = await requireProfile()
    const endpoint = input.endpoint.trim()
    const p256dh = input.p256dh.trim()
    const auth = input.auth.trim()
    if (!endpoint || !p256dh || !auth) return { ok: false, error: "invalid" }

    const admin = createServiceSupabaseClient()
    const { error } = await admin.from("push_subscriptions").upsert(
      {
        profile_id: profile.id,
        endpoint,
        p256dh,
        auth,
        user_agent: input.userAgent?.slice(0, 400) ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    )
    if (error) {
      console.error("[push] subscribe:", error.message)
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (error) {
    console.error("[push] subscribePushAction:", error)
    return { ok: false, error: "auth" }
  }
}

export async function unsubscribePushAction(endpoint: string): Promise<PushActionResult> {
  try {
    const { profile } = await requireProfile()
    const admin = createServiceSupabaseClient()
    const { error } = await admin
      .from("push_subscriptions")
      .delete()
      .eq("profile_id", profile.id)
      .eq("endpoint", endpoint.trim())
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch {
    return { ok: false, error: "auth" }
  }
}

export async function getPushSubscriptionStatusAction(): Promise<{
  configured: boolean
  subscribed: boolean
}> {
  if (!isPushConfigured()) return { configured: false, subscribed: false }
  try {
    const { profile } = await requireProfile()
    const admin = createServiceSupabaseClient()
    const { count } = await admin
      .from("push_subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("profile_id", profile.id)
    return { configured: true, subscribed: (count ?? 0) > 0 }
  } catch {
    return { configured: true, subscribed: false }
  }
}
