"use client"

import { useCallback, useEffect, useState } from "react"
import {
  getPushPublicKeyAction,
  getPushSubscriptionStatusAction,
  subscribePushAction,
  unsubscribePushAction,
} from "@/data/push/actions"

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

async function getReadyRegistration() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null
  const registration = await navigator.serviceWorker.ready
  return registration
}

export type PushPermissionState = NotificationPermission | "unsupported"

export function usePushSubscription() {
  const [supported, setSupported] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [permission, setPermission] = useState<PushPermissionState>("default")
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    const hasApi =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window
    setSupported(hasApi)
    if (!hasApi) {
      setPermission("unsupported")
      setReady(true)
      return
    }
    setPermission(Notification.permission)

    const [keyResult, status] = await Promise.all([
      getPushPublicKeyAction(),
      getPushSubscriptionStatusAction(),
    ])
    setConfigured(keyResult.ok || status.configured)

    const registration = await getReadyRegistration()
    const local = registration ? await registration.pushManager.getSubscription() : null
    setSubscribed(Boolean(local) || status.subscribed)
    setReady(true)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const enable = useCallback(async () => {
    setBusy(true)
    try {
      const keyResult = await getPushPublicKeyAction()
      if (!keyResult.ok) return { ok: false as const, reason: "not-configured" as const }

      const permissionResult = await Notification.requestPermission()
      setPermission(permissionResult)
      if (permissionResult !== "granted") {
        return { ok: false as const, reason: "denied" as const }
      }

      const registration = await getReadyRegistration()
      if (!registration) return { ok: false as const, reason: "no-sw" as const }

      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyResult.publicKey),
        })
      }

      const json = subscription.toJSON()
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        return { ok: false as const, reason: "invalid" as const }
      }

      const saved = await subscribePushAction({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent,
      })
      if (!saved.ok) return { ok: false as const, reason: "save" as const }
      setSubscribed(true)
      return { ok: true as const }
    } catch (error) {
      console.error("[push] enable:", error)
      return { ok: false as const, reason: "error" as const }
    } finally {
      setBusy(false)
      void refresh()
    }
  }, [refresh])

  const disable = useCallback(async () => {
    setBusy(true)
    try {
      const registration = await getReadyRegistration()
      const subscription = registration ? await registration.pushManager.getSubscription() : null
      if (subscription) {
        await unsubscribePushAction(subscription.endpoint)
        await subscription.unsubscribe()
      }
      setSubscribed(false)
      return { ok: true as const }
    } catch (error) {
      console.error("[push] disable:", error)
      return { ok: false as const }
    } finally {
      setBusy(false)
      void refresh()
    }
  }, [refresh])

  return {
    ready,
    supported,
    configured,
    permission,
    subscribed,
    busy,
    enable,
    disable,
    refresh,
  }
}
