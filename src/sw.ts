/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker"
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist"
import { NetworkOnly, Serwist } from "serwist"

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher({ url, sameOrigin }) {
        return (
          url.pathname.startsWith("/api/") ||
          url.hostname.endsWith(".supabase.co") ||
          url.hostname.endsWith(".supabase.in") ||
          !sameOrigin
        )
      },
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document"
        },
      },
    ],
  },
})

serwist.addEventListeners()

self.addEventListener("push", (event) => {
  let title = "טופ-אש"
  let body = ""
  let url = "/"
  try {
    const raw = event.data?.json() as { title?: string; body?: string; url?: string } | undefined
    if (raw?.title) title = raw.title
    if (raw?.body) body = raw.body
    if (raw?.url) url = raw.url
  } catch {
    body = event.data?.text() ?? ""
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      lang: "he",
      dir: "rtl",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url },
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const target =
    typeof event.notification.data?.url === "string" ? event.notification.data.url : "/"
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      for (const client of clientsList) {
        if ("focus" in client) {
          await client.focus()
          if ("navigate" in client) {
            await (client as WindowClient).navigate(target)
          }
          return
        }
      }
      await self.clients.openWindow(target)
    })()
  )
})
