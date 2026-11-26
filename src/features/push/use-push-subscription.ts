"use client"

import { useCallback, useEffect, useState } from "react"
import {
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

function getClientVapidPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null
}

/** Push SW is not registered under `next dev` (Serwist + DevServiceWorkerCleanup). */
export function isLocalPushHost() {
  if (typeof window === "undefined") return false
  const host = window.location.hostname
  return (
    process.env.NODE_ENV !== "production" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".local")
  )
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
      reason: "not-configured" | "denied" | "no-sw" | "local-only" | "invalid" | "save" | "error"
    }

export function usePushSubscription() {
  const [supported, setSupported] = useState(false)
  const [configured, setConfigured] = useState(() => Boolean(getClientVapidPublicKey()))
  const [permission, setPermission] = useState<PushPermissionState>("default")
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [localOnly, setLocalOnly] = useState(false)

  const refresh = useCallback(async () => {
    const publicKey = getClientVapidPublicKey()
    setConfigured(Boolean(publicKey))
    setLocalOnly(isLocalPushHost())

    const hasApi =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window
    setSupported(hasApi)

    if (!hasApi) {
      setPermission("unsupported")
      setSubscribed(false)
      setReady(true)
      return
    }

    setPermission(Notification.permission)
    // Paint the settings row immediately; hydrate subscription state in the background.
    setReady(true)

    try {
      const status = await getPushSubscriptionStatusAction()
      if (!publicKey && !status.configured) {
        setConfigured(false)
        setSubscribed(false)
        return
      }
      setConfigured(Boolean(publicKey) || status.configured)

      const registration = await navigator.serviceWorker.getRegistration()
      const local = registration ? await registration.pushManager.getSubscription() : null
      if (local && !status.subscribed && publicKey) {
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
            return
          }
        }
      }
      setSubscribed(status.subscribed)
    } catch (error) {
      console.error("[push] refresh:", error)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const enable = useCallback(async (): Promise<PushEnableResult> => {
    setBusy(true)
    try {
      if (isLocalPushHost()) return { ok: false, reason: "local-only" }

      const publicKey = getClientVapidPublicKey()
      if (!publicKey) return { ok: false, reason: "not-configured" }

      const permissionResult = await Notification.requestPermission()
      setPermission(permissionResult)
      if (permissionResult !== "granted") {
        return { ok: false, reason: "denied" }
      }

      const registration = await ensureServiceWorkerRegistration()
      if (!registration?.pushManager) return { ok: false, reason: "no-sw" }

      let subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        const existing = subscription.toJSON()
        if (!existing.keys?.p256dh || !existing.keys?.auth) {
          await subscription.unsubscribe()
          subscription = null
        }
      }
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
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
    localOnly,
    enable,
    disable,
    refresh,
  }
}
