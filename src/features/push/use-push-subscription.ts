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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label}-timeout`)), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      }
    )
  })
}

async function ensureServiceWorkerRegistration() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null

  let registration = await navigator.serviceWorker.getRegistration()
  if (!registration) {
    try {
      registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" })
    } catch (error) {
      console.error("[push] sw register:", error)
      return null
    }
  }

  try {
    await withTimeout(navigator.serviceWorker.ready, 10000, "sw-ready")
  } catch (error) {
    console.error("[push] sw ready:", error)
    return registration.active || registration.waiting || registration.installing
      ? registration
      : null
  }
  return navigator.serviceWorker.getRegistration().then((reg) => reg ?? registration)
}

export type PushPermissionState = NotificationPermission | "unsupported"
export type PushEnableResult =
  | { ok: true }
  | {
      ok: false
      reason: "not-configured" | "denied" | "no-sw" | "invalid" | "save" | "error"
    }

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
      setConfigured(false)
      setSubscribed(false)
      setReady(true)
      return
    }
    setPermission(Notification.permission)

    const [keyResult, status] = await Promise.all([
      getPushPublicKeyAction(),
      getPushSubscriptionStatusAction(),
    ])
    setConfigured(keyResult.ok || status.configured)

    // Server row is required for outbound pushes. If the browser already has a
    // local subscription but the DB does not, re-upsert it now.
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const local = registration ? await registration.pushManager.getSubscription() : null
      if (local && !status.subscribed && keyResult.ok) {
        const json = local.toJSON()
        if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
          const saved = await subscribePushAction({
            endpoint: json.endpoint,
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
            userAgent: navigator.userAgent,
          })
          if (saved.ok) {
            setSubscribed(true)
            setReady(true)
            return
          }
        }
      }
    } catch (error) {
      console.error("[push] resync:", error)
    }
    setSubscribed(status.subscribed)
    setReady(true)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const enable = useCallback(async (): Promise<PushEnableResult> => {
    setBusy(true)
    try {
      const keyResult = await getPushPublicKeyAction()
      if (!keyResult.ok) return { ok: false, reason: "not-configured" }

      const permissionResult = await Notification.requestPermission()
      setPermission(permissionResult)
      if (permissionResult !== "granted") {
        return { ok: false, reason: "denied" }
      }

      const registration = await ensureServiceWorkerRegistration()
      if (!registration?.pushManager) return { ok: false, reason: "no-sw" }

      let subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        // Re-subscribe if keys are missing from a stale subscription.
        const existing = subscription.toJSON()
        if (!existing.keys?.p256dh || !existing.keys?.auth) {
          await subscription.unsubscribe()
          subscription = null
        }
      }
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyResult.publicKey),
        })
      }

      const json = subscription.toJSON()
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        return { ok: false, reason: "invalid" }
      }

      const saved = await subscribePushAction({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent,
      })
      if (!saved.ok) {
        console.error("[push] save failed:", saved.error)
        return { ok: false, reason: "save" }
      }
      setSubscribed(true)
      return { ok: true }
    } catch (error) {
      console.error("[push] enable:", error)
      return { ok: false, reason: "error" }
    } finally {
      setBusy(false)
      void refresh()
    }
  }, [refresh])

  const disable = useCallback(async () => {
    setBusy(true)
    try {
      const registration = await navigator.serviceWorker.getRegistration()
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
