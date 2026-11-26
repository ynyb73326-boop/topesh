"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import type { Role } from "@/domain/types"
import { isAuthEnabled } from "@/data/supabase/env"
import { useDevSession, useHasHydrated } from "@/features/dev-role/dev-session"
import { devRoleSwitcherEnabled } from "@/features/dev-role/users"
import { he } from "@/i18n/he"

export function RoleGate({
  role,
  children,
}: {
  role: Role
  children: React.ReactNode
}) {
  const router = useRouter()
  const session = useDevSession()
  const hydrated = useHasHydrated()
  const authMode = isAuthEnabled()

  useEffect(() => {
    if (!hydrated || !session.ready) return
    if (session.role !== role) router.replace("/")
  }, [hydrated, role, router, session.ready, session.role])

  if (!authMode && !devRoleSwitcherEnabled) return <HoldingScreen />

  // Always keep `{children}` mounted so Cache Components can validate instant
  // navigation (RoleGate is a Client Component — omitting children drops the page segment).
  const allowed = session.ready && session.role === role
  return (
    <>
      {!allowed ? (
        <main className="mx-auto flex min-h-dvh w-full max-w-md items-center justify-center px-4">
          <p className="text-sm text-muted-foreground">{he.auth.signingIn}</p>
        </main>
      ) : null}
      <div hidden={!allowed} className={allowed ? "contents" : undefined}>
        {children}
      </div>
    </>
  )
}

export function HoldingScreen() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-3 px-4 py-8">
      <h1 className="text-xl font-semibold">{he.holding.title}</h1>
      <p className="text-sm leading-6 text-muted-foreground">{he.holding.body}</p>
    </main>
  )
}
