"use client"

import { useEffect, useSyncExternalStore } from "react"
import { useDevSession, useHasHydrated } from "@/features/dev-role/dev-session"
import type {
  CustomerInput,
  DiaryAssignmentInput,
  ManagerUserInput,
  SiteInput,
  TeamLeaderInput,
  TechnicianInput,
} from "@/data/manager"
import {
  cancelDiaryAction,
  createDiaryAction,
  deleteCompanyAction,
  deleteComponentAction,
  deleteCustomerAction,
  deleteDiaryAction,
  deleteDomainAction,
  deleteSiteAction,
  deleteTechnicianAction,
  deleteUserAction,
  duplicateDiaryAction,
  editDiaryAction,
  fetchAppSnapshotAction,
  reopenDiaryForSignatureAction,
  saveCompanyAction,
  saveComponentAction,
  saveCustomerAction,
  saveDomainAction,
  saveLeaderDraftAction,
  saveManagerAccountAction,
  saveSiteAction,
  saveTeamLeaderAction,
  saveTechnicianAction,
  submitDiaryAction,
  submitLeaderDiaryAction,
  updateDiaryAssignmentAction,
} from "@/data/supabase/data-actions"
import {
  detailForLeader,
  listForLeader,
  MOCK_DB_KEY,
  type DiaryDraft,
  type LeaderDiaryDetail,
  type LeaderDiarySummary,
  type RepositorySnapshot,
} from "@/data/repository"
import type { MockDb } from "@/data/seed"

const EVENT = "work-diary-db"
const SERVER_SNAPSHOT: RepositorySnapshot = { status: "error" }
const ERROR_SNAPSHOT: RepositorySnapshot = { status: "error" }
const LOADING = { status: "loading" } as const

type CacheState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; db: MockDb }
  | { status: "error" }

let cache: CacheState = { status: "idle" }
/** Stable identity for useSyncExternalStore — never allocate in getSnapshot. */
let clientSnapshot: RepositorySnapshot = SERVER_SNAPSHOT
let inflight: Promise<void> | null = null
let mockCleared = false

function subscribe(onStoreChange: () => void) {
  window.addEventListener(EVENT, onStoreChange)
  return () => window.removeEventListener(EVENT, onStoreChange)
}

function notify() {
  window.dispatchEvent(new Event(EVENT))
}

function clearLegacyMock() {
  if (mockCleared || typeof window === "undefined") return
  try {
    window.localStorage.removeItem(MOCK_DB_KEY)
  } catch {
    /* ignore */
  }
  mockCleared = true
}

async function loadSnapshot(force = false) {
  clearLegacyMock()
  if (!force && cache.status === "ready") return
  if (inflight) {
    await inflight
    return
  }
  const keepReadyUi = cache.status === "ready"
  if (!keepReadyUi) {
    cache = { status: "loading" }
    clientSnapshot = SERVER_SNAPSHOT
    notify()
  }
  inflight = (async () => {
    const result = await fetchAppSnapshotAction()
    if (result.ok) {
      cache = { status: "ready", db: result.db }
      clientSnapshot = { status: "ready", db: result.db }
    } else {
      cache = { status: "error" }
      clientSnapshot = ERROR_SNAPSHOT
    }
    inflight = null
    notify()
  })()
  await inflight
}

function getClientSnapshot(): RepositorySnapshot {
  return clientSnapshot
}

export function useRepositorySnapshot() {
  const hydrated = useHasHydrated()
  const session = useDevSession()

  useEffect(() => {
    if (!hydrated || !session.ready || !session.user) return
    void loadSnapshot(cache.status !== "ready")
  }, [hydrated, session.ready, session.user?.id])

  return useSyncExternalStore(subscribe, getClientSnapshot, () => SERVER_SNAPSHOT)
}

/** Re-fetch live Supabase snapshot (pull-to-refresh). */
export function reloadBrowserStore() {
  void loadSnapshot(true)
}

export function resetLeaderStore() {
  void loadSnapshot(true)
}

async function afterMutate<T extends { ok: boolean }>(result: T): Promise<T> {
  if (result.ok) await loadSnapshot(true)
  return result
}

export async function saveLeaderDraft(
  _teamLeaderId: string,
  diaryId: string,
  draft: DiaryDraft
) {
  const result = await saveLeaderDraftAction(diaryId, draft)
  await afterMutate(result)
  if (!result.ok) return { ok: false as const, reason: "invalid" as const }
  const db = cache.status === "ready" ? cache.db : null
  const detail = db ? detailForLeader(db, _teamLeaderId, diaryId) : null
  if (!detail) return { ok: false as const, reason: "not-found" as const }
  return { ok: true as const, unchanged: false, data: detail }
}

export async function submitLeaderDiary(
  _teamLeaderId: string,
  diaryId: string,
  draft: DiaryDraft
) {
  const result = await submitLeaderDiaryAction(diaryId, draft)
  await afterMutate(result)
  if (!result.ok) return { ok: false as const, reason: "invalid" as const }
  const db = cache.status === "ready" ? cache.db : null
  const detail = db ? detailForLeader(db, _teamLeaderId, diaryId) : null
  if (!detail) return { ok: false as const, reason: "not-found" as const }
  return { ok: true as const, unchanged: false, data: detail }
}

type LeaderQuery<T> =
  | typeof LOADING
  | { status: "error" }
  | { status: "ready"; teamLeaderId: string; data: T }

function useLeaderContext() {
  const session = useDevSession()
  const hydrated = useHasHydrated()
  const snapshot = useRepositorySnapshot()
  const teamLeaderId = session.user?.role === "teamLeader" ? session.user.id : null
  return { hydrated, snapshot, teamLeaderId }
}

function settle<T>(
  context: ReturnType<typeof useLeaderContext>,
  select: (teamLeaderId: string, snapshot: Extract<RepositorySnapshot, { status: "ready" }>) => T
): LeaderQuery<T> {
  if (
    !context.hydrated ||
    !context.teamLeaderId ||
    context.snapshot === SERVER_SNAPSHOT ||
    cache.status === "loading" ||
    cache.status === "idle"
  ) {
    return LOADING
  }
  if (context.snapshot.status !== "ready") return { status: "error" }
  return {
    status: "ready",
    teamLeaderId: context.teamLeaderId,
    data: select(context.teamLeaderId, context.snapshot),
  }
}

export function useManagerDb():
  | typeof LOADING
  | { status: "error" }
  | { status: "ready"; db: MockDb } {
  const hydrated = useHasHydrated()
  const snapshot = useRepositorySnapshot()
  if (!hydrated || snapshot === SERVER_SNAPSHOT || cache.status === "loading" || cache.status === "idle") {
    return LOADING
  }
  if (snapshot.status !== "ready") return { status: "error" }
  return { status: "ready", db: snapshot.db }
}

export async function createManagerDiary(input: DiaryAssignmentInput) {
  return afterMutate(await createDiaryAction(input))
}

export async function updateManagerDiary(diaryId: string, input: DiaryAssignmentInput) {
  return afterMutate(await updateDiaryAssignmentAction(diaryId, input))
}

export async function cancelManagerDiary(diaryId: string) {
  return afterMutate(await cancelDiaryAction(diaryId))
}

export async function editManagerDiary(
  diaryId: string,
  input: DiaryAssignmentInput,
  draft: DiaryDraft
) {
  return afterMutate(await editDiaryAction(diaryId, input, draft))
}

export async function deleteManagerDiary(diaryId: string) {
  return afterMutate(await deleteDiaryAction(diaryId))
}

export async function markManagerDiaryCancelled(diaryId: string) {
  return afterMutate(await cancelDiaryAction(diaryId))
}

export async function markManagerDiarySubmitted(diaryId: string) {
  return afterMutate(await submitDiaryAction(diaryId))
}

export async function reopenManagerDiaryForSignature(diaryId: string) {
  return afterMutate(await reopenDiaryForSignatureAction(diaryId))
}

export async function duplicateManagerDiary(diaryId: string) {
  return afterMutate(await duplicateDiaryAction(diaryId))
}

export async function saveManagerCompany(id: string | null, name: string) {
  return afterMutate(await saveCompanyAction(id, name))
}

export async function saveManagerCustomer(id: string | null, input: CustomerInput) {
  return afterMutate(await saveCustomerAction(id, input))
}

export async function saveManagerSite(id: string | null, input: SiteInput) {
  return afterMutate(await saveSiteAction(id, input))
}

export async function saveManagerTechnician(id: string | null, input: TechnicianInput) {
  return afterMutate(await saveTechnicianAction(id, input))
}

export async function deleteManagerTechnician(id: string) {
  const result = await deleteTechnicianAction(id)
  await afterMutate(result)
  if (!result.ok) return { ok: false as const, reason: (result.reason as "has-diaries") || "not-found" }
  return { ok: true as const }
}

export async function setManagerTechnicianActive(_id: string, _isActive: boolean) {
  return { ok: false as const }
}

export async function setManagerCompanyActive(_id: string, _isActive: boolean) {
  return { ok: false as const }
}

export async function setManagerCustomerActive(_id: string, _isActive: boolean) {
  return { ok: false as const }
}

export async function setManagerSiteActive(_id: string, _isActive: boolean) {
  return { ok: false as const }
}

export async function setManagerUserActive(_id: string, _isActive: boolean) {
  return { ok: false as const, reason: "not-found" as const }
}

export async function deleteManagerCompany(id: string) {
  const result = await deleteCompanyAction(id)
  await afterMutate(result)
  if (!result.ok) return { ok: false as const, reason: (result.reason as "has-diaries") || "not-found" }
  return { ok: true as const }
}

export async function deleteManagerCustomer(id: string) {
  const result = await deleteCustomerAction(id)
  await afterMutate(result)
  if (!result.ok) return { ok: false as const, reason: (result.reason as "has-diaries") || "not-found" }
  return { ok: true as const }
}

export async function deleteManagerSite(id: string) {
  const result = await deleteSiteAction(id)
  await afterMutate(result)
  if (!result.ok) return { ok: false as const, reason: (result.reason as "has-diaries") || "not-found" }
  return { ok: true as const }
}

export async function deleteManagerUser(id: string) {
  const result = await deleteUserAction(id)
  await afterMutate(result)
  if (!result.ok) {
    return {
      ok: false as const,
      reason: (result.reason as "has-diaries" | "last-manager" | "not-found") || "not-found",
    }
  }
  return { ok: true as const }
}

export async function saveManagerDomain(id: string | null, name: string) {
  return afterMutate(await saveDomainAction(id, name))
}

export async function saveManagerComponent(
  id: string | null,
  input: { domainId: string; name: string; unit: string }
) {
  return afterMutate(await saveComponentAction(id, input))
}

export async function deleteManagerDomain(id: string) {
  const result = await deleteDomainAction(id)
  await afterMutate(result)
  if (!result.ok) {
    return { ok: false as const, reason: (result.reason as "has-components") || "not-found" }
  }
  return { ok: true as const }
}

export async function deleteManagerComponent(id: string) {
  const result = await deleteComponentAction(id)
  await afterMutate(result)
  if (!result.ok) {
    return { ok: false as const, reason: (result.reason as "has-diaries") || "not-found" }
  }
  return { ok: true as const }
}

export async function saveManagerTeamLeader(id: string | null, input: TeamLeaderInput) {
  return afterMutate(await saveTeamLeaderAction(id, input))
}

export async function saveManagerAccount(id: string | null, input: ManagerUserInput) {
  return afterMutate(await saveManagerAccountAction(id, input))
}

export function useLeaderDiaries(): LeaderQuery<LeaderDiarySummary[]> {
  const context = useLeaderContext()
  return settle(context, (teamLeaderId, snapshot) =>
    listForLeader(snapshot.db, teamLeaderId)
  )
}

export function useLeaderDiary(diaryId: string): LeaderQuery<LeaderDiaryDetail | null> {
  const context = useLeaderContext()
  return settle(context, (teamLeaderId, snapshot) =>
    detailForLeader(snapshot.db, teamLeaderId, diaryId)
  )
}
