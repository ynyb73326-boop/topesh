"use server"

import { randomUUID } from "node:crypto"
import { requireManager, requireTeamLeader } from "@/data/supabase/require-profile"
import { loadAppSnapshot } from "@/data/supabase/snapshot"
import { createServiceSupabaseClient } from "@/data/supabase/server"
import type { MockDb } from "@/data/seed"
import type {
  CustomerInput,
  DiaryAssignmentInput,
  ManagerUserInput,
  SiteInput,
  TeamLeaderInput,
  TechnicianInput,
} from "@/data/manager"
import type { DiaryDraft } from "@/data/repository"
import { diaryReadyToSubmit, getManagerDiary } from "@/data/manager"

export type MutateResult =
  | { ok: true; id?: string }
  | { ok: false; reason?: string }

export async function fetchAppSnapshotAction(): Promise<
  { ok: true; db: MockDb } | { ok: false }
> {
  try {
    await requireManager().catch(async () => requireTeamLeader())
    const db = await loadAppSnapshot()
    return { ok: true, db }
  } catch {
    return { ok: false }
  }
}

function emptyToNull(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ""
  return trimmed ? trimmed : null
}

async function assertPendingDiary(diaryId: string) {
  const admin = createServiceSupabaseClient()
  const { data, error } = await admin
    .from("work_diaries")
    .select("id,status,team_leader_id,signature_capture_only")
    .eq("id", diaryId)
    .maybeSingle()
  if (error || !data) return null
  return data
}

export async function createDiaryAction(
  input: DiaryAssignmentInput
): Promise<MutateResult> {
  try {
    await requireManager()
    const admin = createServiceSupabaseClient()
    const id = randomUUID()
    const { error } = await admin.from("work_diaries").insert({
      id,
      team_leader_id: input.teamLeaderId,
      work_date: input.workDate,
      company_id: input.companyId,
      customer_id: input.customerId,
      site_id: input.siteId,
      sub_site_name: input.subSiteName.trim(),
      project_name: input.projectName.trim(),
      work_order_number: input.workOrderNumber.trim(),
      accompanying_technician_id: input.accompanyingTechnicianId,
      status: "pending",
      notes: "",
      signature_capture_only: false,
    })
    if (error) return { ok: false, reason: error.message }
    return { ok: true, id }
  } catch {
    return { ok: false }
  }
}

export async function updateDiaryAssignmentAction(
  diaryId: string,
  input: DiaryAssignmentInput
): Promise<MutateResult> {
  try {
    await requireManager()
    const row = await assertPendingDiary(diaryId)
    if (!row || row.status !== "pending") return { ok: false }
    const admin = createServiceSupabaseClient()
    const { error } = await admin
      .from("work_diaries")
      .update({
        team_leader_id: input.teamLeaderId,
        work_date: input.workDate,
        company_id: input.companyId,
        customer_id: input.customerId,
        site_id: input.siteId,
        sub_site_name: input.subSiteName.trim(),
        project_name: input.projectName.trim(),
        work_order_number: input.workOrderNumber.trim(),
        accompanying_technician_id: input.accompanyingTechnicianId,
      })
      .eq("id", diaryId)
      .eq("status", "pending")
    if (error) return { ok: false, reason: error.message }
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

async function replaceDiaryChildren(
  diaryId: string,
  draft: DiaryDraft,
  options?: { signatureOnly?: boolean }
) {
  const admin = createServiceSupabaseClient()

  if (options?.signatureOnly) {
    const { error } = await admin
      .from("work_diaries")
      .update({
        site_manager_name: emptyToNull(draft.siteManagerName),
        site_manager_signature_data_url: draft.siteManagerSignatureDataUrl,
      })
      .eq("id", diaryId)
      .eq("status", "pending")
    if (error) throw new Error(error.message)
    return
  }

  const { error: diaryError } = await admin
    .from("work_diaries")
    .update({
      notes: draft.notes.trim(),
      site_manager_name: emptyToNull(draft.siteManagerName),
      site_manager_signature_data_url: draft.siteManagerSignatureDataUrl,
    })
    .eq("id", diaryId)
    .eq("status", "pending")
  if (diaryError) throw new Error(diaryError.message)

  const { error: deleteWorkersError } = await admin
    .from("work_diary_workers")
    .delete()
    .eq("diary_id", diaryId)
  if (deleteWorkersError) throw new Error(deleteWorkersError.message)
  const { error: deleteItemsError } = await admin
    .from("work_diary_items")
    .delete()
    .eq("diary_id", diaryId)
  if (deleteItemsError) throw new Error(deleteItemsError.message)
  const { error: deleteChecksError } = await admin
    .from("work_diary_checkbox_selections")
    .delete()
    .eq("diary_id", diaryId)
  if (deleteChecksError) throw new Error(deleteChecksError.message)

  const workers = draft.workers
    .map((worker, index) => ({
      id: worker.id || randomUUID(),
      diary_id: diaryId,
      full_name: worker.fullName.trim(),
      sort_order: index,
    }))
    .filter((worker) => worker.full_name)

  if (workers.length) {
    const { error } = await admin.from("work_diary_workers").insert(workers)
    if (error) throw new Error(error.message)
  }

  const items = draft.items
    .filter((item) => item.componentId && Number(item.quantity) > 0)
    .map((item) => ({
      id: item.id || randomUUID(),
      diary_id: diaryId,
      component_id: item.componentId,
      quantity: item.quantity,
    }))

  if (items.length) {
    const { error } = await admin.from("work_diary_items").insert(items)
    if (error) throw new Error(error.message)
  }

  if (draft.checkedIds.length) {
    const { error } = await admin.from("work_diary_checkbox_selections").insert(
      draft.checkedIds.map((checkboxId) => ({
        id: randomUUID(),
        diary_id: diaryId,
        checkbox_id: checkboxId,
        checked: true,
      }))
    )
    if (error) throw new Error(error.message)
  }
}

export async function editDiaryAction(
  diaryId: string,
  input: DiaryAssignmentInput,
  draft: DiaryDraft
): Promise<MutateResult> {
  try {
    await requireManager()
    const row = await assertPendingDiary(diaryId)
    if (!row || row.status !== "pending") return { ok: false }
    const assign = await updateDiaryAssignmentAction(diaryId, input)
    if (!assign.ok) return assign
    await replaceDiaryChildren(diaryId, draft, {
      signatureOnly: row.signature_capture_only,
    })
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function deleteDiaryAction(diaryId: string): Promise<MutateResult> {
  try {
    await requireManager()
    const admin = createServiceSupabaseClient()
    const { error } = await admin.from("work_diaries").delete().eq("id", diaryId).eq("status", "pending")
    if (error) return { ok: false, reason: error.message }
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function cancelDiaryAction(diaryId: string): Promise<MutateResult> {
  try {
    await requireManager()
    const admin = createServiceSupabaseClient()
    const { error } = await admin.rpc("cancel_work_diary", { p_diary_id: diaryId })
    if (error) return { ok: false, reason: error.message }
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function submitDiaryAction(diaryId: string): Promise<MutateResult> {
  try {
    await requireManager()
    const db = await loadAppSnapshot()
    const detail = getManagerDiary(db, diaryId)
    if (!detail || detail.status !== "pending" || !diaryReadyToSubmit(detail)) {
      return { ok: false, reason: "not-ready" }
    }
    const admin = createServiceSupabaseClient()
    const { error } = await admin.rpc("submit_work_diary", { p_diary_id: diaryId })
    if (error) return { ok: false, reason: error.message }
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function reopenDiaryForSignatureAction(diaryId: string): Promise<MutateResult> {
  try {
    await requireManager()
    const admin = createServiceSupabaseClient()
    const { error } = await admin.rpc("reopen_work_diary_for_signature", {
      p_diary_id: diaryId,
    })
    if (error) return { ok: false, reason: error.message }
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function duplicateDiaryAction(diaryId: string): Promise<MutateResult> {
  try {
    await requireManager()
    const admin = createServiceSupabaseClient()
    const { data: current, error } = await admin
      .from("work_diaries")
      .select("*")
      .eq("id", diaryId)
      .maybeSingle()
    if (error || !current) return { ok: false }
    const id = randomUUID()
    const { error: insertError } = await admin.from("work_diaries").insert({
      id,
      team_leader_id: current.team_leader_id,
      work_date: current.work_date,
      company_id: current.company_id,
      customer_id: current.customer_id,
      site_id: current.site_id,
      sub_site_name: current.sub_site_name,
      project_name: current.project_name,
      work_order_number: current.work_order_number,
      accompanying_technician_id: current.accompanying_technician_id,
      status: "pending",
      notes: "",
      duplicated_from_id: current.id,
      signature_capture_only: false,
    })
    if (insertError) return { ok: false, reason: insertError.message }
    return { ok: true, id }
  } catch {
    return { ok: false }
  }
}

export async function saveCompanyAction(
  id: string | null,
  name: string
): Promise<MutateResult> {
  try {
    await requireManager()
    const admin = createServiceSupabaseClient()
    const clean = name.trim()
    if (!clean) return { ok: false }
    if (id) {
      const { error } = await admin.from("companies").update({ name: clean }).eq("id", id)
      if (error) return { ok: false, reason: error.message }
      return { ok: true, id }
    }
    const nextId = randomUUID()
    const { error } = await admin.from("companies").insert({ id: nextId, name: clean })
    if (error) return { ok: false, reason: error.message }
    return { ok: true, id: nextId }
  } catch {
    return { ok: false }
  }
}

export async function saveCustomerAction(
  id: string | null,
  input: CustomerInput
): Promise<MutateResult> {
  try {
    await requireManager()
    const admin = createServiceSupabaseClient()
    const payload = {
      name: input.name.trim(),
      company_id: null as string | null,
    }
    if (!payload.name) return { ok: false }
    if (id) {
      const { error } = await admin.from("customers").update(payload).eq("id", id)
      if (error) return { ok: false, reason: error.message }
      return { ok: true, id }
    }
    const nextId = randomUUID()
    const { error } = await admin.from("customers").insert({ id: nextId, ...payload })
    if (error) return { ok: false, reason: error.message }
    return { ok: true, id: nextId }
  } catch {
    return { ok: false }
  }
}

export async function saveSiteAction(
  id: string | null,
  input: SiteInput
): Promise<MutateResult> {
  try {
    await requireManager()
    const admin = createServiceSupabaseClient()
    const payload = {
      name: input.name.trim(),
      customer_id: input.customerId,
    }
    if (!payload.name || !payload.customer_id) return { ok: false }
    if (id) {
      const { error } = await admin.from("sites").update(payload).eq("id", id)
      if (error) return { ok: false, reason: error.message }
      return { ok: true, id }
    }
    const nextId = randomUUID()
    const { error } = await admin.from("sites").insert({ id: nextId, ...payload })
    if (error) return { ok: false, reason: error.message }
    return { ok: true, id: nextId }
  } catch {
    return { ok: false }
  }
}

export async function saveTechnicianAction(
  id: string | null,
  input: TechnicianInput
): Promise<MutateResult> {
  try {
    await requireManager()
    const admin = createServiceSupabaseClient()
    const payload = {
      full_name: input.fullName.trim(),
      phone: input.phone.trim(),
    }
    if (!payload.full_name || !payload.phone) return { ok: false }
    if (id) {
      const { error } = await admin.from("technicians").update(payload).eq("id", id)
      if (error) return { ok: false, reason: error.message }
      return { ok: true, id }
    }
    const nextId = randomUUID()
    const { error } = await admin.from("technicians").insert({ id: nextId, ...payload })
    if (error) return { ok: false, reason: error.message }
    return { ok: true, id: nextId }
  } catch {
    return { ok: false }
  }
}

export async function saveTeamLeaderAction(
  id: string | null,
  input: TeamLeaderInput
): Promise<MutateResult> {
  try {
    await requireManager()
    const admin = createServiceSupabaseClient()
    const payload = {
      full_name: input.fullName.trim(),
      identity_number: input.identityNumber.trim(),
      phone: emptyToNull(input.phone),
      company_id: emptyToNull(input.companyId),
      role: "team_leader" as const,
      email: null as string | null,
    }
    if (!payload.full_name || !payload.identity_number) return { ok: false }
    if (id) {
      const { error } = await admin.from("profiles").update(payload).eq("id", id)
      if (error) return { ok: false, reason: error.message }
      return { ok: true, id }
    }
    const nextId = randomUUID()
    const { error } = await admin.from("profiles").insert({ id: nextId, ...payload })
    if (error) return { ok: false, reason: error.message }
    return { ok: true, id: nextId }
  } catch {
    return { ok: false }
  }
}

export async function saveManagerAccountAction(
  id: string | null,
  input: ManagerUserInput
): Promise<MutateResult> {
  try {
    await requireManager()
    const admin = createServiceSupabaseClient()
    const payload = {
      full_name: input.fullName.trim(),
      identity_number: emptyToNull(input.identityNumber),
      email: input.email.trim().toLowerCase(),
      company_id: emptyToNull(input.companyId),
      role: "manager" as const,
      phone: null as string | null,
    }
    if (!payload.full_name || !payload.email) return { ok: false }
    if (id) {
      const { error } = await admin.from("profiles").update(payload).eq("id", id)
      if (error) return { ok: false, reason: error.message }
      return { ok: true, id }
    }
    const nextId = randomUUID()
    const { error } = await admin.from("profiles").insert({ id: nextId, ...payload })
    if (error) return { ok: false, reason: error.message }
    return { ok: true, id: nextId }
  } catch {
    return { ok: false }
  }
}

export async function saveDomainAction(
  id: string | null,
  name: string
): Promise<MutateResult> {
  try {
    await requireManager()
    const admin = createServiceSupabaseClient()
    const clean = name.trim()
    if (!clean) return { ok: false }
    if (id) {
      const { error } = await admin.from("systems").update({ name: clean }).eq("id", id)
      if (error) return { ok: false, reason: error.message }
      return { ok: true, id }
    }
    const nextId = randomUUID()
    const { count } = await admin.from("systems").select("*", { count: "exact", head: true })
    const { error } = await admin
      .from("systems")
      .insert({ id: nextId, name: clean, sort_order: (count ?? 0) + 1 })
    if (error) return { ok: false, reason: error.message }
    return { ok: true, id: nextId }
  } catch {
    return { ok: false }
  }
}

export async function saveComponentAction(
  id: string | null,
  input: { domainId: string; name: string; unit: string }
): Promise<MutateResult> {
  try {
    await requireManager()
    const admin = createServiceSupabaseClient()
    const payload = {
      system_id: input.domainId,
      name: input.name.trim(),
      unit: input.unit.trim(),
    }
    if (!payload.system_id || !payload.name || !payload.unit) return { ok: false }
    if (id) {
      const { error } = await admin.from("components").update(payload).eq("id", id)
      if (error) return { ok: false, reason: error.message }
      return { ok: true, id }
    }
    const nextId = randomUUID()
    const { count } = await admin
      .from("components")
      .select("*", { count: "exact", head: true })
      .eq("system_id", input.domainId)
    const { error } = await admin
      .from("components")
      .insert({ id: nextId, ...payload, sort_order: (count ?? 0) + 1 })
    if (error) return { ok: false, reason: error.message }
    return { ok: true, id: nextId }
  } catch {
    return { ok: false }
  }
}

export async function deleteCompanyAction(id: string): Promise<MutateResult> {
  try {
    await requireManager()
    const admin = createServiceSupabaseClient()
    const { count } = await admin
      .from("work_diaries")
      .select("*", { count: "exact", head: true })
      .eq("company_id", id)
    if ((count ?? 0) > 0) return { ok: false, reason: "has-diaries" }
    const { error } = await admin.from("companies").delete().eq("id", id)
    if (error) return { ok: false, reason: error.message }
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function deleteCustomerAction(id: string): Promise<MutateResult> {
  try {
    await requireManager()
    const admin = createServiceSupabaseClient()
    const { count } = await admin
      .from("work_diaries")
      .select("*", { count: "exact", head: true })
      .eq("customer_id", id)
    if ((count ?? 0) > 0) return { ok: false, reason: "has-diaries" }
    const { error } = await admin.from("customers").delete().eq("id", id)
    if (error) return { ok: false, reason: error.message }
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function deleteSiteAction(id: string): Promise<MutateResult> {
  try {
    await requireManager()
    const admin = createServiceSupabaseClient()
    const { count } = await admin
      .from("work_diaries")
      .select("*", { count: "exact", head: true })
      .eq("site_id", id)
    if ((count ?? 0) > 0) return { ok: false, reason: "has-diaries" }
    const { error } = await admin.from("sites").delete().eq("id", id)
    if (error) return { ok: false, reason: error.message }
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function deleteTechnicianAction(id: string): Promise<MutateResult> {
  try {
    await requireManager()
    const admin = createServiceSupabaseClient()
    const { count } = await admin
      .from("work_diaries")
      .select("*", { count: "exact", head: true })
      .eq("accompanying_technician_id", id)
    if ((count ?? 0) > 0) return { ok: false, reason: "has-diaries" }
    const { error } = await admin.from("technicians").delete().eq("id", id)
    if (error) return { ok: false, reason: error.message }
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function deleteUserAction(id: string): Promise<MutateResult> {
  try {
    await requireManager()
    const admin = createServiceSupabaseClient()
    const { data: profile } = await admin.from("profiles").select("role").eq("id", id).maybeSingle()
    if (!profile) return { ok: false, reason: "not-found" }
    if (profile.role === "manager") {
      const { count } = await admin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "manager")
        .eq("is_active", true)
      if ((count ?? 0) <= 1) return { ok: false, reason: "last-manager" }
    }
    const { count } = await admin
      .from("work_diaries")
      .select("*", { count: "exact", head: true })
      .eq("team_leader_id", id)
    if ((count ?? 0) > 0) return { ok: false, reason: "has-diaries" }
    const { error } = await admin.from("profiles").delete().eq("id", id)
    if (error) return { ok: false, reason: error.message }
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function deleteDomainAction(id: string): Promise<MutateResult> {
  try {
    await requireManager()
    const admin = createServiceSupabaseClient()
    const { count } = await admin
      .from("components")
      .select("*", { count: "exact", head: true })
      .eq("system_id", id)
    if ((count ?? 0) > 0) return { ok: false, reason: "has-components" }
    const { error } = await admin.from("systems").delete().eq("id", id)
    if (error) return { ok: false, reason: error.message }
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function deleteComponentAction(id: string): Promise<MutateResult> {
  try {
    await requireManager()
    const admin = createServiceSupabaseClient()
    const { count } = await admin
      .from("work_diary_items")
      .select("*", { count: "exact", head: true })
      .eq("component_id", id)
    if ((count ?? 0) > 0) return { ok: false, reason: "has-diaries" }
    const { error } = await admin.from("components").delete().eq("id", id)
    if (error) return { ok: false, reason: error.message }
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function saveLeaderDraftAction(
  diaryId: string,
  draft: DiaryDraft
): Promise<MutateResult> {
  try {
    const { user } = await requireTeamLeader()
    const row = await assertPendingDiary(diaryId)
    if (!row || row.team_leader_id !== user.id || row.status !== "pending") {
      return { ok: false, reason: "not-found" }
    }
    await replaceDiaryChildren(diaryId, draft, {
      signatureOnly: row.signature_capture_only,
    })
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : "save-failed"
    console.error("[saveLeaderDraftAction]", message)
    return { ok: false, reason: message }
  }
}

export async function submitLeaderDiaryAction(
  diaryId: string,
  draft: DiaryDraft
): Promise<MutateResult> {
  try {
    const { user } = await requireTeamLeader()
    const row = await assertPendingDiary(diaryId)
    if (!row || row.team_leader_id !== user.id || row.status !== "pending") {
      return { ok: false, reason: "not-found" }
    }
    await replaceDiaryChildren(diaryId, draft, {
      signatureOnly: row.signature_capture_only,
    })
    const admin = createServiceSupabaseClient()
    const { error } = await admin.rpc("submit_work_diary", { p_diary_id: diaryId })
    if (error) return { ok: false, reason: error.message }
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : "submit-failed"
    console.error("[submitLeaderDiaryAction]", message)
    return { ok: false, reason: message }
  }
}
