"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import type { Role, User } from "@/domain/types"
import { MOCK_DB_KEY } from "@/data/repository"
import { createBrowserSupabaseClient } from "@/data/supabase/browser"
import { isAuthEnabled } from "@/data/supabase/env"
import { uriUser } from "@/data/catalog"
import { signOutAuth } from "@/features/auth/actions"
import { loadAuthSession } from "@/features/auth/session"
import {
  DEV_ROLE_STORAGE_KEY,
  DEV_USER_STORAGE_KEY,
  devManager,
  devTeamLeaders,
} from "@/features/dev-role/users"

const ROLE_EVENT = "work-diary-role"
const DB_EVENT = "work-diary-db"
let storeRevision = 0

type DevSession = {
  role: Role | null
  user: User | null
  ready: boolean
  setManager: (userId?: string) => void
  setTeamLeader: (userId: string) => void
  clearRole: () => Promise<void>
  refreshAuth: () => Promise<void>
}

const DevSessionContext = createContext<DevSession | null>(null)

function subscribe(onStoreChange: () => void) {
  const onDb = () => {
    storeRevision += 1
    onStoreChange()
  }
  window.addEventListener(ROLE_EVENT, onStoreChange)
  window.addEventListener(DB_EVENT, onDb)
  window.addEventListener("storage", onStoreChange)
  return () => {
    window.removeEventListener(ROLE_EVENT, onStoreChange)
    window.removeEventListener(DB_EVENT, onDb)
    window.removeEventListener("storage", onStoreChange)
  }
}

function readSessionToken() {
  const role = window.localStorage.getItem(DEV_ROLE_STORAGE_KEY) ?? ""
  const userId = window.localStorage.getItem(DEV_USER_STORAGE_KEY) ?? ""
  if (role !== "manager" && role !== "teamLeader") return ""
  return `${role}|${userId}|${storeRevision}`
}

function writeSession(role: Role | null, userId: string | null) {
  if (role) window.localStorage.setItem(DEV_ROLE_STORAGE_KEY, role)
  else window.localStorage.removeItem(DEV_ROLE_STORAGE_KEY)
  if (userId) window.localStorage.setItem(DEV_USER_STORAGE_KEY, userId)
  else window.localStorage.removeItem(DEV_USER_STORAGE_KEY)
  window.dispatchEvent(new Event(ROLE_EVENT))
}

function resolveLeader(userId: string | undefined): User {
  if (!userId) return uriUser
  const stored = readStoredUser(userId, "teamLeader")
  return stored ?? devTeamLeaders.find((leader) => leader.id === userId) ?? uriUser
}

function resolveManager(userId: string | undefined): User {
  if (!userId) return devManager
  const stored = readStoredUser(userId, "manager")
  return stored ?? (userId === devManager.id ? devManager : devManager)
}

function readStoredUser(userId: string, role: Role): User | null {
  try {
    const raw = window.localStorage.getItem(MOCK_DB_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || !("users" in parsed)) return null
    const users = (parsed as { users?: unknown }).users
    if (!Array.isArray(users)) return null
    const match = users.find(
      (user) =>
        user &&
        typeof user === "object" &&
        "id" in user &&
        user.id === userId &&
        "role" in user &&
        user.role === role
    )
    return isStoredUser(match) ? match : null
  } catch {
    return null
  }
}

function isStoredUser(value: unknown): value is User {
  if (!value || typeof value !== "object") return false
  const user = value as User
  return (
    typeof user.id === "string" &&
    typeof user.fullName === "string" &&
    typeof user.identityNumber === "string" &&
    typeof user.companyId === "string" &&
    typeof user.isActive === "boolean"
  )
}

function resolveDevSession(token: string): { role: Role | null; user: User | null } {
  const [role, userId] = token.split("|")
  if (role === "manager") return { role, user: resolveManager(userId) }
  if (role === "teamLeader") return { role, user: resolveLeader(userId) }
  return { role: null, user: null }
}

function AuthBackedSessionProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  const refreshAuth = useCallback(async (opts?: { allowClear?: boolean }) => {
    const allowClear = opts?.allowClear ?? true
    try {
      const session = await loadAuthSession()
      if (session) {
        setRole(session.role)
        setUser(session.user)
      } else if (allowClear) {
        setRole(null)
        setUser(null)
      }
    } catch (error) {
      // Network blip / temporary Auth error: keep the last known session.
      console.error("[auth] refreshAuth failed:", error)
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    void refreshAuth()
  }, [refreshAuth])

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setRole(null)
        setUser(null)
        setReady(true)
        return
      }
      // TOKEN_REFRESHED / SIGNED_IN / INITIAL_SESSION / USER_UPDATED
      void refreshAuth({ allowClear: event === "SIGNED_IN" })
    })
    return () => subscription.unsubscribe()
  }, [refreshAuth])

  useEffect(() => {
    const onResume = () => {
      if (document.visibilityState !== "visible") return
      void refreshAuth({ allowClear: false })
    }
    document.addEventListener("visibilitychange", onResume)
    window.addEventListener("focus", onResume)
    return () => {
      document.removeEventListener("visibilitychange", onResume)
      window.removeEventListener("focus", onResume)
    }
  }, [refreshAuth])

  const value = useMemo<DevSession>(
    () => ({
      role,
      user,
      ready,
      setManager: () => undefined,
      setTeamLeader: () => undefined,
      clearRole: async () => {
        try {
          await signOutAuth()
        } finally {
          setRole(null)
          setUser(null)
          writeSession(null, null)
        }
      },
      refreshAuth: () => refreshAuth({ allowClear: true }),
    }),
    [ready, refreshAuth, role, user]
  )

  return <DevSessionContext.Provider value={value}>{children}</DevSessionContext.Provider>
}

function DevSwitcherSessionProvider({ children }: { children: ReactNode }) {
  const token = useSyncExternalStore(subscribe, readSessionToken, () => "")
  const value = useMemo<DevSession>(() => {
    const session = resolveDevSession(token)
    return {
      role: session.role,
      user: session.user,
      ready: true,
      setManager: (userId) => writeSession("manager", userId ?? devManager.id),
      setTeamLeader: (userId) => writeSession("teamLeader", userId),
      clearRole: async () => {
        writeSession(null, null)
      },
      refreshAuth: async () => {},
    }
  }, [token])

  return <DevSessionContext.Provider value={value}>{children}</DevSessionContext.Provider>
}

export function DevSessionProvider({ children }: { children: ReactNode }) {
  if (isAuthEnabled()) {
    return <AuthBackedSessionProvider>{children}</AuthBackedSessionProvider>
  }
  return <DevSwitcherSessionProvider>{children}</DevSwitcherSessionProvider>
}

export function useDevSession() {
  const session = useContext(DevSessionContext)
  if (!session) {
    throw new Error("useDevSession must be used within DevSessionProvider")
  }
  return session
}

export function useHasHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
}
