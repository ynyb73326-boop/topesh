"use client"

import { Switch } from "@/components/ui/switch"
import { usePushSubscription } from "@/features/push/use-push-subscription"
import { he } from "@/i18n/he"
import { toast } from "sonner"

export function PushSettingsSection() {
  const push = usePushSubscription()
  if (!push.configured) return null

  const locked =
    !push.ready ||
    push.busy ||
    !push.supported ||
    push.localOnly ||
    push.permission === "denied"

  const hint = !push.supported
    ? he.push.unsupported
    : push.localOnly
      ? he.push.localOnly
      : push.permission === "denied"
        ? he.push.denied
        : push.subscribed
          ? he.push.enabledHint
          : he.push.enableHint

  const onCheckedChange = (checked: boolean) => {
    if (locked) return
    void (async () => {
      if (!checked) {
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
      else if (result.reason === "local-only") toast.error(he.push.localOnly)
      else if (result.reason === "no-sw") toast.error(he.push.needInstall)
      else if (result.reason === "save") toast.error(he.push.saveFailed)
      else toast.error(he.push.error)
    })()
  }

  return (
    <section className="border-t border-border py-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tracking-tight">{he.push.title}</p>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{hint}</p>
        </div>
        <Switch
          checked={push.subscribed}
          disabled={locked}
          onCheckedChange={onCheckedChange}
          aria-label={he.push.title}
        />
      </div>
    </section>
  )
}
