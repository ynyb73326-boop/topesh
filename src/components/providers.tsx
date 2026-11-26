"use client"

import type { ReactNode } from "react"
import { MotionConfig } from "motion/react"
import { DirectionProvider } from "@/components/ui/direction"
import { Toaster } from "@/components/ui/sonner"
import { NavigationDirection } from "@/components/motion/navigation-direction"
import { DevServiceWorkerCleanup } from "@/components/pwa/dev-sw-cleanup"
import { RegisterServiceWorker } from "@/components/pwa/register-service-worker"
import { PwaInstallListener } from "@/components/pwa/use-pwa-install"
import { DevSessionProvider } from "@/features/dev-role/dev-session"
import { PushPromptBanner } from "@/features/push/push-prompt-banner"
import { ThemeProvider } from "@/features/theme/theme-provider"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <DirectionProvider direction="rtl">
      <MotionConfig reducedMotion="user">
        <ThemeProvider>
          <DevSessionProvider>
            <DevServiceWorkerCleanup />
            <RegisterServiceWorker />
            <NavigationDirection />
            {children}
            <PushPromptBanner />
            <PwaInstallListener />
            <Toaster />
          </DevSessionProvider>
        </ThemeProvider>
      </MotionConfig>
    </DirectionProvider>
  )
}
