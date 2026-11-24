/**
 * Phase 5B — import Excel business catalog into Supabase (service role).
 * Usage: node --env-file=.env.local scripts/import-excel.mjs
 *
 * Does not invent company associations. Dual-role people share person_id.
 * Re-runnable: skips existing natural keys.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import ExcelJS from "exceljs"
import { createClient } from "@supabase/supabase-js"

const WORKBOOK =
  process.env.TOPESH_IMPORT_XLSX ||
  resolve(process.env.USERPROFILE || "", "Downloads", "אפליקצית טופ - דאטה בייס.xlsx")

const SYSTEM_SHEETS = [
  { sheet: "מערכת אזעקה", name: "אזעקה", sort: 1, dual: false },
  { sheet: "מערכת מצלמות ", name: "מצלמות", sort: 2, dual: false },
  { sheet: "מערכת גילוי אש", name: "גילוי אש", sort: 3, dual: true },
  { sheet: "מערכת כריזה", name: "כריזה", sort: 4, dual: false },
]

function cellText(value) {
  if (value == null || value === "") return ""
  if (typeof value === "object") {
    if (value.text != null) return String(value.text)
    if (value.result != null) return String(value.result)
    if (value.richText) return value.richText.map((p) => p.text).join("")
    return String(value)
  }
  return String(value)
}

function trimText(value) {
  return cellText(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()
}

function digitsOnly(value) {
  return trimText(value).replace(/\D/g, "")
}

function assertEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }
  if (key.startsWith("sb_publishable_")) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY looks like a publishable key; use sb_secret_ / service_role")
  }
  return { url, key }
}

function findSheet(wb, name) {
  const exact = wb.getWorksheet(name)
  if (exact) return exact
  const wanted = name.trim()
  return wb.worksheets.find((ws) => ws.name.trim() === wanted) || null
}

function reportPush(report, bucket, item) {
  report[bucket].push(item)
}

async function upsertBySelectInsert({
  sb,
  table,
  selectFilter,
  insertRow,
  report,
  label,
}) {
  let q = sb.from(table).select("id")
  for (const [col, val] of Object.entries(selectFilter)) {
    q = q.eq(col, val)
  }
  const { data: existing, error: selErr } = await q.maybeSingle()
  if (selErr && selErr.code !== "PGRST116") throw selErr
  if (existing?.id) {
    reportPush(report, "skipped", { table, label, id: existing.id, reason: "exists" })
    return { id: existing.id, created: false }
  }
  const { data, error } = await sb.from(table).insert(insertRow).select("id").single()
  if (error) {
    // Race / unique: fetch again
    if (error.code === "23505") {
      let q2 = sb.from(table).select("id")
      for (const [col, val] of Object.entries(selectFilter)) q2 = q2.eq(col, val)
      const again = await q2.maybeSingle()
      if (again.data?.id) {
        reportPush(report, "skipped", { table, label, id: again.data.id, reason: "unique-conflict" })
        return { id: again.data.id, created: false }
      }
    }
    reportPush(report, "errors", { table, label, error: error.message, code: error.code })
    throw error
  }
  reportPush(report, "imported", { table, label, id: data.id })
  return { id: data.id, created: true }
}

async function main() {
  const { url, key } = assertEnv()
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const report = {
    workbook: WORKBOOK,
    startedAt: new Date().toISOString(),
    imported: [],
    skipped: [],
    unresolved: [],
    warnings: [],
    errors: [],
    counts: {},
  }

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(WORKBOOK)

  // --- companies ---
  const companiesSheet = findSheet(wb, " חברות ") || findSheet(wb, "חברות")
  const companyIds = new Map()
  if (!companiesSheet) {
    report.unresolved.push({ kind: "sheet", name: "חברות", reason: "missing" })
  } else {
    for (let r = 1; r <= companiesSheet.rowCount; r++) {
      const name = trimText(companiesSheet.getRow(r).getCell(1).value)
      if (!name) continue
      const { data: existing } = await sb
        .from("companies")
        .select("id,name")
        .ilike("name", name)
        .maybeSingle()
      if (existing?.id) {
        companyIds.set(name, existing.id)
        reportPush(report, "skipped", { table: "companies", label: name, id: existing.id })
        continue
      }
      const { data, error } = await sb.from("companies").insert({ name }).select("id").single()
      if (error) throw error
      companyIds.set(name, data.id)
      reportPush(report, "imported", { table: "companies", label: name, id: data.id })
    }
  }

  // --- customers + sites ---
  const custSheet = findSheet(wb, " לקוחות  ") || findSheet(wb, "לקוחות")
  const customerIds = new Map()
  let lastCustomer = ""
  if (!custSheet) {
    report.unresolved.push({ kind: "sheet", name: "לקוחות", reason: "missing" })
  } else {
    for (let r = 2; r <= custSheet.rowCount; r++) {
      const row = custSheet.getRow(r)
      let customerName = trimText(row.getCell(1).value)
      const siteName = trimText(row.getCell(2).value)
      if (!customerName && !siteName) continue
      if (!customerName) {
        if (!lastCustomer) {
          report.unresolved.push({
            kind: "site",
            row: r,
            site: siteName,
            reason: "empty-customer-without-carry",
          })
          continue
        }
        customerName = lastCustomer
        report.warnings.push({ kind: "customer-carry", row: r, customer: customerName, site: siteName })
      } else {
        lastCustomer = customerName
      }
      if (!siteName) {
        report.unresolved.push({ kind: "customer-row", row: r, customer: customerName, reason: "empty-site" })
        continue
      }

      let customerId = customerIds.get(customerName)
      if (!customerId) {
        const { data: existing } = await sb
          .from("customers")
          .select("id")
          .ilike("name", customerName)
          .maybeSingle()
        if (existing?.id) {
          customerId = existing.id
          reportPush(report, "skipped", { table: "customers", label: customerName, id: customerId })
        } else {
          const { data, error } = await sb
            .from("customers")
            .insert({ name: customerName, company_id: null })
            .select("id")
            .single()
          if (error) throw error
          customerId = data.id
          reportPush(report, "imported", { table: "customers", label: customerName, id: customerId })
          report.unresolved.push({
            kind: "customer-company",
            customer: customerName,
            reason: "company_id left null — not in Excel",
          })
        }
        customerIds.set(customerName, customerId)
      }

      const { data: siteExisting } = await sb
        .from("sites")
        .select("id")
        .eq("customer_id", customerId)
        .ilike("name", siteName)
        .maybeSingle()
      if (siteExisting?.id) {
        reportPush(report, "skipped", {
          table: "sites",
          label: `${customerName} / ${siteName}`,
          id: siteExisting.id,
        })
      } else {
        const { data, error } = await sb
          .from("sites")
          .insert({ customer_id: customerId, name: siteName })
          .select("id")
          .single()
        if (error) throw error
        reportPush(report, "imported", {
          table: "sites",
          label: `${customerName} / ${siteName}`,
          id: data.id,
        })
      }
    }
  }

  // --- systems + components ---
  for (const sys of SYSTEM_SHEETS) {
    const sheet = findSheet(wb, sys.sheet)
    if (!sheet) {
      report.unresolved.push({ kind: "sheet", name: sys.sheet, reason: "missing" })
      continue
    }

    let systemId
    const { data: sysExisting } = await sb.from("systems").select("id").ilike("name", sys.name).maybeSingle()
    if (sysExisting?.id) {
      systemId = sysExisting.id
      reportPush(report, "skipped", { table: "systems", label: sys.name, id: systemId })
    } else {
      const { data, error } = await sb
        .from("systems")
        .insert({ name: sys.name, sort_order: sys.sort })
        .select("id")
        .single()
      if (error) throw error
      systemId = data.id
      reportPush(report, "imported", { table: "systems", label: sys.name, id: systemId })
    }

    const components = []
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r)
      const a = trimText(row.getCell(1).value)
      const u = trimText(row.getCell(2).value)
      if (a) components.push({ name: a, unit: u || "יח'" })
      if (sys.dual) {
        const a2 = trimText(row.getCell(4).value)
        const u2 = trimText(row.getCell(5).value)
        if (a2) components.push({ name: a2, unit: u2 || "יח'" })
      }
    }

    let sort = 0
    for (const c of components) {
      sort += 1
      const { data: existing } = await sb
        .from("components")
        .select("id")
        .eq("system_id", systemId)
        .ilike("name", c.name)
        .maybeSingle()
      if (existing?.id) {
        reportPush(report, "skipped", {
          table: "components",
          label: `${sys.name} / ${c.name}`,
          id: existing.id,
        })
        continue
      }
      const { data, error } = await sb
        .from("components")
        .insert({
          system_id: systemId,
          name: c.name,
          unit: c.unit,
          sort_order: sort,
        })
        .select("id")
        .single()
      if (error) throw error
      reportPush(report, "imported", {
        table: "components",
        label: `${sys.name} / ${c.name}`,
        id: data.id,
      })
      if (c.unit.includes("קופמלט")) {
        report.warnings.push({ kind: "unit-spelling", component: c.name, unit: c.unit })
      }
    }
  }

  // --- checkboxes ---
  const exSheet = findSheet(wb, "חריגים")
  if (!exSheet) {
    report.unresolved.push({ kind: "sheet", name: "חריגים", reason: "missing" })
  } else {
    let order = 0
    for (let r = 2; r <= exSheet.rowCount; r++) {
      const label = trimText(exSheet.getRow(r).getCell(1).value)
      if (!label) continue
      order += 1
      const { data: existing } = await sb
        .from("checkbox_definitions")
        .select("id")
        .ilike("label", label)
        .maybeSingle()
      if (existing?.id) {
        reportPush(report, "skipped", { table: "checkbox_definitions", label, id: existing.id })
        continue
      }
      const { data, error } = await sb
        .from("checkbox_definitions")
        .insert({ label, sort_order: order })
        .select("id")
        .single()
      if (error) throw error
      reportPush(report, "imported", { table: "checkbox_definitions", label, id: data.id })
    }
  }

  // --- managers + team leaders (dual-role via person_id) ---
  const managersSheet = findSheet(wb, "מנהלים")
  const leadersSheet = findSheet(wb, "ראש צוות")
  const personByKey = new Map() // normalized full name -> person_id

  async function ensurePersonId(fullName) {
    const key = fullName.trim().toLowerCase()
    if (personByKey.has(key)) return personByKey.get(key)
    const { data: existingProfiles } = await sb
      .from("profiles")
      .select("person_id,full_name")
      .ilike("full_name", fullName)
      .limit(1)
    if (existingProfiles?.[0]?.person_id) {
      personByKey.set(key, existingProfiles[0].person_id)
      return existingProfiles[0].person_id
    }
    const personId = crypto.randomUUID()
    personByKey.set(key, personId)
    return personId
  }

  if (managersSheet) {
    for (let r = 2; r <= managersSheet.rowCount; r++) {
      const row = managersSheet.getRow(r)
      const fullName = trimText(row.getCell(1).value)
      const email = trimText(row.getCell(2).value).toLowerCase()
      if (!fullName && !email) continue
      if (!email) {
        report.unresolved.push({ kind: "manager", name: fullName, reason: "missing-email" })
        continue
      }
      const { data: byEmail } = await sb.from("profiles").select("id").eq("email", email).maybeSingle()
      if (byEmail?.id) {
        reportPush(report, "skipped", { table: "profiles", label: `manager:${email}`, id: byEmail.id })
        continue
      }
      const personId = await ensurePersonId(fullName)
      const { data, error } = await sb
        .from("profiles")
        .insert({
          person_id: personId,
          full_name: fullName,
          email,
          identity_number: null,
          phone: null,
          company_id: null,
          role: "manager",
        })
        .select("id")
        .single()
      if (error) throw error
      reportPush(report, "imported", { table: "profiles", label: `manager:${fullName}`, id: data.id })
      report.unresolved.push({
        kind: "manager-company",
        name: fullName,
        reason: "company_id left null — not in Excel",
      })
    }
  }

  if (leadersSheet) {
    for (let r = 2; r <= leadersSheet.rowCount; r++) {
      const row = leadersSheet.getRow(r)
      const fullName = trimText(row.getCell(2).value)
      const identity = digitsOnly(row.getCell(3).value)
      const phone = trimText(row.getCell(4).value)
      if (!fullName && !identity) continue
      if (!identity) {
        report.unresolved.push({ kind: "team_leader", name: fullName, reason: "missing-identity" })
        continue
      }
      const { data: byId } = await sb
        .from("profiles")
        .select("id")
        .eq("identity_number", identity)
        .maybeSingle()
      if (byId?.id) {
        reportPush(report, "skipped", {
          table: "profiles",
          label: `team_leader:${identity}`,
          id: byId.id,
        })
        continue
      }
      const personId = await ensurePersonId(fullName)
      const { data, error } = await sb
        .from("profiles")
        .insert({
          person_id: personId,
          full_name: fullName,
          identity_number: identity,
          phone: phone || null,
          email: null,
          company_id: null,
          role: "team_leader",
        })
        .select("id")
        .single()
      if (error) throw error
      reportPush(report, "imported", {
        table: "profiles",
        label: `team_leader:${fullName}`,
        id: data.id,
      })
      report.unresolved.push({
        kind: "leader-company",
        name: fullName,
        reason: "company_id left null — not in Excel",
      })
    }
  }

  // --- technicians (catalog only) ---
  const techSheet = findSheet(wb, "טכנאי שירות")
  if (techSheet) {
    for (let r = 2; r <= techSheet.rowCount; r++) {
      const row = techSheet.getRow(r)
      const fullName = trimText(row.getCell(1).value)
      const phone = trimText(row.getCell(2).value)
      if (!fullName || !phone) continue
      const phoneDigits = digitsOnly(phone)
      if (phoneDigits.length < 9 || phoneDigits.length > 11) {
        report.warnings.push({ kind: "tech-phone-length", name: fullName, phone })
      }
      const { data: existing } = await sb
        .from("technicians")
        .select("id")
        .ilike("full_name", fullName)
        .eq("phone", phone)
        .maybeSingle()
      if (existing?.id) {
        reportPush(report, "skipped", { table: "technicians", label: fullName, id: existing.id })
        continue
      }
      const { data, error } = await sb
        .from("technicians")
        .insert({ full_name: fullName, phone })
        .select("id")
        .single()
      if (error) throw error
      reportPush(report, "imported", { table: "technicians", label: fullName, id: data.id })
    }
  }

  // summary counts from DB
  for (const table of [
    "companies",
    "customers",
    "sites",
    "profiles",
    "technicians",
    "systems",
    "components",
    "checkbox_definitions",
  ]) {
    const { count, error } = await sb.from(table).select("*", { count: "exact", head: true })
    if (error) throw error
    report.counts[table] = count
  }

  // dual-role check (names only, no PII dump)
  const { data: dual } = await sb.from("profiles").select("person_id,role,full_name")
  const byPerson = new Map()
  for (const p of dual || []) {
    const list = byPerson.get(p.person_id) || []
    list.push(p.role)
    byPerson.set(p.person_id, list)
  }
  const dualPeople = [...byPerson.entries()].filter(([, roles]) => new Set(roles).size > 1)
  report.counts.dual_role_people = dualPeople.length

  report.finishedAt = new Date().toISOString()
  report.summary = {
    imported: report.imported.length,
    skipped: report.skipped.length,
    unresolved: report.unresolved.length,
    warnings: report.warnings.length,
    errors: report.errors.length,
    dbCounts: report.counts,
  }

  mkdirSync(resolve("import"), { recursive: true })
  const outPath = resolve("import", `import-report-${Date.now()}.json`)
  // Strip nothing critical — report labels include names; keep local gitignored only.
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8")

  console.log(JSON.stringify(report.summary, null, 2))
  console.log("Report:", outPath)
}

main().catch((err) => {
  console.error("Import failed:", err.message || err)
  process.exit(1)
})
