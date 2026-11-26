"use client"

import { useEffect } from "react"

/** Ensure `/sw.js` is registered in production so Web Push can subscribe. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    if (!("serviceWorker" in navigator)) return

    void (async () => {
      try {
        const existing = await navigator.serviceWorker.getRegistration()
        if (existing) return
        await navigator.serviceWorker.register("/sw.js", { scope: "/" })
      } catch (error) {
        console.error("[sw] register failed:", error)
      }
    })()
  }, [])

  return null
}
