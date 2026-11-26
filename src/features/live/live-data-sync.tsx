"use client"

import { useEffect, useRef } from "react"
import { reloadBrowserStore } from "@/data/browser-store"
import { createBrowserSupabaseClient } from "@/data/supabase/browser"
import { useDevSession, useHasHydrated } from "@/features/dev-role/dev-session"

const POLL_MS = 12_000
const DEBOUNCE_MS = 400

/**
 * Keeps the in-memory snapshot in sync across users/devices:
 * - Supabase Realtime on `app_data_signals` (instant, after SQL migration)
 * - Reload on tab focus / visibility
 * - Soft poll while the tab is visible (fallback if Realtime is unavailable)
 */
export function LiveDataSync() {
  const hydrated = useHasHydrated()
  const session = useDevSession()
  const timerRef = useRef<number | null>(null)
  const userId = session.user?.id

  useEffect(() => {
    if (!hydrated || !session.ready || !userId) return

    let cancelled = false

    const scheduleReload = () => {
      if (cancelled) return
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        if (!cancelled && document.visibilityState === "visible") {
          reloadBrowserStore()
        }
      }, DEBOUNCE_MS)
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleReload()
    }

    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)

    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") reloadBrowserStore()
    }, POLL_MS)

    const supabase = createBrowserSupabaseClient()
    const channel = supabase
      .channel(`app-data-signals:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_data_signals" },
        () => scheduleReload()
      )
      .subscribe()

    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
      window.clearInterval(poll)
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
      void supabase.removeChannel(channel)
    }
  }, [hydrated, session.ready, userId])

  return null
}
