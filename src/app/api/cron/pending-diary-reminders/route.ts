import { NextResponse } from "next/server"
import { shouldSendPendingReminder } from "@/data/push/jerusalem-time"
import { notifyPendingDiaryReminders } from "@/data/push/send"

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
