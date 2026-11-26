"use client"

import { useEffect, useState } from "react"
import { Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useDevSession, useHasHydrated } from "@/features/dev-role/dev-session"
import { usePushSubscription } from "@/features/push/use-push-subscription"
import { he } from "@/i18n/he"
import { toast } from "sonner"

function dismissKey(userId: string) {
  return `topesh:push-prompt-dismissed:${userId}`
}

export function PushPromptBanner() {
  const hydrated = useHasHydrated()
  const session = useDevSession()
  const push = usePushSubscription()
  const [open, setOpen] = useState(false)
  const userId = session.user?.id

  useEffect(() => {
    if (!hydrated || !session.ready || !userId) {
      setOpen(false)
      return
    }
    if (!push.ready || !push.statusKnown || !push.configured || !push.supported || push.localOnly) {
      setOpen(false)
      return
    }
    if (push.subscribed || push.permission === "denied") {
      setOpen(false)
      return
    }
    try {
      if (window.localStorage.getItem(dismissKey(userId)) === "1") {
        setOpen(false)
        return
      }
    } catch {
      /* ignore */
    }
    setOpen(true)
  }, [
    hydrated,
    session.ready,
    userId,
    push.ready,
    push.statusKnown,
    push.configured,
    push.supported,
    push.localOnly,
    push.subscribed,
    push.permission,
  ])

  if (!open || !userId) return null

  const dismiss = () => {
    try {
      window.localStorage.setItem(dismissKey(userId), "1")
    } catch {
      /* ignore */
    }
    setOpen(false)
  }

  const enable = () => {
    void (async () => {
      const result = await push.enable()
      if (result.ok) {
        toast.success(he.push.enabled)
        setOpen(false)
        return
      }
      if (result.reason === "denied") toast.error(he.push.denied)
      else if (result.reason === "local-only") toast.error(he.push.localOnly)
      else if (result.reason === "no-sw") toast.error(he.push.needInstall)
      else if (result.reason === "save") toast.error(he.push.saveFailed)
      else toast.error(he.push.error)
      // Keep the banner available after a soft failure so the user can retry.
    })()
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-3 lg:bottom-6">
      <div className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-border bg-card p-3 shadow-lg">
        <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Bell className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tracking-tight">{he.push.promptTitle}</p>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{he.push.promptBody}</p>
          <div className="mt-3 flex gap-2">
            <Button type="button" size="sm" disabled={push.busy} onClick={enable}>
              {he.push.enable}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={dismiss}>
              {he.push.later}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
