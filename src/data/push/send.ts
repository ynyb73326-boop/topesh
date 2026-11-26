import "server-only"

import webpush from "web-push"
import { createServiceSupabaseClient } from "@/data/supabase/server"
import { getVapidPrivateKey, getVapidPublicKey, getVapidSubject, isPushConfigured } from "@/data/push/env"

export type PushPayload = {
  title: string
  body: string
  url: string
}

function configureWebPush() {
  webpush.setVapidDetails(getVapidSubject(), getVapidPublicKey(), getVapidPrivateKey())
}

async function deleteSubscription(endpoint: string) {
  const admin = createServiceSupabaseClient()
  await admin.from("push_subscriptions").delete().eq("endpoint", endpoint)
}

export async function sendPushToProfiles(profileIds: string[], payload: PushPayload) {
  if (!isPushConfigured() || profileIds.length === 0) return { sent: 0, failed: 0 }

  const uniqueIds = [...new Set(profileIds.filter(Boolean))]
  if (!uniqueIds.length) return { sent: 0, failed: 0 }

  try {
    configureWebPush()
  } catch (error) {
    console.error("[push] vapid config:", error)
    return { sent: 0, failed: 0 }
  }

  const admin = createServiceSupabaseClient()
  const { data: rows, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, profile_id")
    .in("profile_id", uniqueIds)

  if (error) {
    console.error("[push] load subscriptions:", error.message)
    return { sent: 0, failed: 0 }
  }

  const body = JSON.stringify(payload)
  let sent = 0
  let failed = 0

  await Promise.all(
    (rows ?? []).map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          body,
          { TTL: 60 * 60 * 12, urgency: "high" }
        )
        sent += 1
      } catch (err) {
        failed += 1
        const status = (err as { statusCode?: number } | null)?.statusCode
        if (status === 404 || status === 410) {
          await deleteSubscription(row.endpoint)
        } else {
          console.error("[push] send failed:", status, (err as Error)?.message)
        }
      }
    })
  )

  return { sent, failed }
}

export async function notifyTeamLeaderNewDiary(input: {
  teamLeaderId: string
  managerName: string
}) {
  const name = input.managerName.trim() || "מנהל"
  return sendPushToProfiles([input.teamLeaderId], {
    title: "יומן עבודה חדש",
    body: `הופק עבורך יומן עבודה חדש ע"י ${name}`,
    url: "/leader",
  })
}

export async function notifyManagersDiarySubmitted(input: {
  teamLeaderName: string
  customerName: string
}) {
  const admin = createServiceSupabaseClient()
  const { data: managers, error } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "manager")
    .eq("is_active", true)

  if (error) {
    console.error("[push] managers lookup:", error.message)
    return { sent: 0, failed: 0 }
  }

  const leader = input.teamLeaderName.trim() || "ראש צוות"
  const customer = input.customerName.trim() || "לקוח"
  return sendPushToProfiles(
    (managers ?? []).map((row) => row.id),
    {
      title: "יומן הוגש",
      body: `${leader} הגיש יומן כרגע עבור ${customer}`,
      url: "/manager",
    }
  )
}

export async function notifyPendingDiaryReminders() {
  const admin = createServiceSupabaseClient()
  const { data: pending, error } = await admin
    .from("work_diaries")
    .select("team_leader_id")
    .eq("status", "pending")

  if (error) {
    console.error("[push] pending diaries:", error.message)
    return { sent: 0, failed: 0, leaders: 0 }
  }

  const leaderIds = [...new Set((pending ?? []).map((row) => row.team_leader_id).filter(Boolean))]
  if (!leaderIds.length) return { sent: 0, failed: 0, leaders: 0 }

  const result = await sendPushToProfiles(leaderIds, {
    title: "יומנים ממתינים",
    body: "ממתינים לך יומנים לדיווח - נא לדווח בהקדם",
    url: "/leader",
  })
  return { ...result, leaders: leaderIds.length }
}
