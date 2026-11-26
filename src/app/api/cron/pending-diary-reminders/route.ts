import { NextResponse } from "next/server"
import { notifyPendingDiaryReminders } from "@/data/push/send"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function jerusalemParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  })
  const parts = fmt.formatToParts(now)
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? ""
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "-1")
  return { weekday, hour }
}

/** Sun–Thu at 18:00 Asia/Jerusalem. */
export function shouldSendPendingReminder(now = new Date()) {
  const { weekday, hour } = jerusalemParts(now)
  const workday = ["Sun", "Mon", "Tue", "Wed", "Thu"].includes(weekday)
  return workday && hour === 18
}

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  const header = request.headers.get("authorization")?.trim() || ""
  return header === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  if (!shouldSendPendingReminder()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "outside-window" })
  }

  const result = await notifyPendingDiaryReminders()
  return NextResponse.json({ ok: true, skipped: false, ...result })
}
