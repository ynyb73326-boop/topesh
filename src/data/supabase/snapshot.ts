import "server-only"

import { createServiceSupabaseClient } from "@/data/supabase/server"
import type { MockDb } from "@/data/seed"
import type {
  CheckboxDefinition,
  Company,
  ComponentItem,
  Customer,
  DiaryCheckbox,
  DiaryItem,
  DiaryWorker,
  Domain,
  Site,
  Technician,
  User,
  WorkDiary,
  DiaryStatus,
} from "@/domain/types"

function asIso(value: string | null | undefined) {
  return value ?? new Date(0).toISOString()
}

export async function loadAppSnapshot(): Promise<MockDb> {
  const admin = createServiceSupabaseClient()

  const [
    companiesRes,
    customersRes,
    sitesRes,
    profilesRes,
    techniciansRes,
    systemsRes,
    componentsRes,
    checkboxesRes,
    diariesRes,
    workersRes,
    itemsRes,
    checksRes,
  ] = await Promise.all([
    admin.from("companies").select("*").order("name"),
    admin.from("customers").select("*").order("name"),
    admin.from("sites").select("*").order("name"),
    admin.from("profiles").select("*").order("full_name"),
    admin.from("technicians").select("*").order("full_name"),
    admin.from("systems").select("*").order("sort_order"),
    admin.from("components").select("*").order("sort_order"),
    admin.from("checkbox_definitions").select("*").order("sort_order"),
    admin.from("work_diaries").select("*").order("created_at", { ascending: false }),
    admin.from("work_diary_workers").select("*").order("sort_order"),
    admin.from("work_diary_items").select("*"),
    admin.from("work_diary_checkbox_selections").select("*"),
  ])

  const errors = [
    companiesRes.error,
    customersRes.error,
    sitesRes.error,
    profilesRes.error,
    techniciansRes.error,
    systemsRes.error,
    componentsRes.error,
    checkboxesRes.error,
    diariesRes.error,
    workersRes.error,
    itemsRes.error,
    checksRes.error,
  ].filter(Boolean)
  if (errors.length) {
    throw new Error(errors[0]!.message)
  }

  const companies: Company[] = (companiesRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    createdAt: asIso(row.created_at),
  }))

  const customers: Customer[] = (customersRes.data ?? []).map((row) => ({
    id: row.id,
    companyId: row.company_id ?? "",
    name: row.name,
    isActive: row.is_active,
    createdAt: asIso(row.created_at),
  }))

  const sites: Site[] = (sitesRes.data ?? []).map((row) => ({
    id: row.id,
    customerId: row.customer_id,
    name: row.name,
    isActive: row.is_active,
    createdAt: asIso(row.created_at),
  }))

  const users: User[] = (profilesRes.data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    identityNumber: row.identity_number ?? "",
    phone: row.phone,
    email: row.email,
    companyId: row.company_id ?? "",
    role: row.role === "team_leader" ? "teamLeader" : "manager",
    isActive: row.is_active,
  }))

  const technicians: Technician[] = (techniciansRes.data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    isActive: row.is_active,
    createdAt: asIso(row.created_at),
  }))

  const domains: Domain[] = (systemsRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    isActive: row.is_active,
  }))

  const components: ComponentItem[] = (componentsRes.data ?? []).map((row) => ({
    id: row.id,
    domainId: row.system_id,
    name: row.name,
    unit: row.unit,
    isActive: row.is_active,
  }))

  const checkboxDefinitions: CheckboxDefinition[] = (checkboxesRes.data ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }))

  const diaries: WorkDiary[] = (diariesRes.data ?? []).map((row) => ({
    id: row.id,
    teamLeaderId: row.team_leader_id,
    workDate: row.work_date,
    companyId: row.company_id,
    customerId: row.customer_id,
    siteId: row.site_id,
    subSiteName: row.sub_site_name,
    projectName: row.project_name,
    workOrderNumber: row.work_order_number,
    accompanyingTechnicianId: row.accompanying_technician_id,
    status: row.status as DiaryStatus,
    notes: row.notes,
    siteManagerName: row.site_manager_name,
    siteManagerSignatureDataUrl: row.site_manager_signature_data_url,
    createdAt: asIso(row.created_at),
    submittedAt: row.submitted_at,
    cancelledAt: row.cancelled_at,
    duplicatedFromId: row.duplicated_from_id,
    signatureCaptureOnly: row.signature_capture_only,
  }))

  const workers: DiaryWorker[] = (workersRes.data ?? []).map((row) => ({
    id: row.id,
    diaryId: row.diary_id,
    fullName: row.full_name,
  }))

  const items: DiaryItem[] = (itemsRes.data ?? []).map((row) => ({
    id: row.id,
    diaryId: row.diary_id,
    componentId: row.component_id,
    quantity: Number(row.quantity),
  }))

  const checks: DiaryCheckbox[] = (checksRes.data ?? []).map((row) => ({
    id: row.id,
    diaryId: row.diary_id,
    checkboxId: row.checkbox_id,
    checked: row.checked,
  }))

  return {
    version: 10,
    companies,
    customers,
    sites,
    subSites: [],
    users,
    technicians,
    domains,
    components,
    checkboxDefinitions,
    diaries,
    workers,
    items,
    checks,
  }
}
