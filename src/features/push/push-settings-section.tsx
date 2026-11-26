"use client"

import { Bell, BellOff } from "lucide-react"
import { usePushSubscription } from "@/features/push/use-push-subscription"
import { he } from "@/i18n/he"
import { toast } from "sonner"

export function PushSettingsSection() {
  const push = usePushSubscription()
  if (!push.ready) return null
  if (!push.configured) return null

  const onToggle = () => {
    void (async () => {
      if (push.subscribed) {
        const result = await push.disable()
        if (result.ok) toast.success(he.push.disabled)
        else toast.error(he.push.error)
        return
      }
      const result = await push.enable()
      if (result.ok) {
        toast.success(he.push.enabled)
        return
      }
      if (result.reason === "denied") toast.error(he.push.denied)
      else if (result.reason === "no-sw") toast.error(he.push.needInstall)
      else if (result.reason === "save") toast.error(he.push.saveFailed)
      else toast.error(he.push.error)
    })()
  }

  return (
    <section className="border-t border-border py-4">
      <button
        type="button"
        className="pressable flex w-full items-center gap-3 rounded-xl text-start hover:bg-muted/40"
        disabled={push.busy || !push.supported || push.permission === "denied"}
        onClick={onToggle}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold tracking-tight">{he.push.title}</span>
          <span className="mt-1 block text-sm text-muted-foreground">
            {!push.supported
              ? he.push.unsupported
              : push.permission === "denied"
                ? he.push.denied
                : push.subscribed
                  ? he.push.enabledHint
                  : he.push.enableHint}
          </span>
        </span>
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          {push.subscribed ? (
            <Bell className="size-4" aria-hidden />
          ) : (
            <BellOff className="size-4" aria-hidden />
          )}
        </span>
      </button>
    </section>
  )
}
