/**
 * Phase 5A database verification against a remote/dev Supabase Postgres.
 *
 * Required env:
 *   SUPABASE_DB_URL          — direct Postgres URL (Settings → Database)
 *   NEXT_PUBLIC_SUPABASE_URL — project API URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * No Docker / local supabase start required.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import postgres from "postgres"
import { createClient } from "@supabase/supabase-js"

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing env ${name}`)
  return value
}

function assert(cond, message) {
  if (!cond) throw new Error(message)
}

async function main() {
  const dbUrl = requiredEnv("SUPABASE_DB_URL")
  const apiUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL")
  const anonKey = requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY")

  console.log("Running SQL guard tests…")
  const sqlFile = resolve("supabase/tests/phase5a_guards.sql")
  const sql = readFileSync(sqlFile, "utf8")
  const admin = postgres(dbUrl, { max: 1 })
  try {
    await admin.unsafe(sql)
    console.log("SQL guard tests passed")
  } finally {
    await admin.end({ timeout: 5 })
  }

  console.log("Checking anon denial…")
  const anon = createClient(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: diaries, error: diaryErr } = await anon.from("work_diaries").select("id").limit(1)
  assert(!diaries?.length, "anon must not read work_diaries rows")
  // PostgREST may return error or empty depending on grants; both are acceptable if no rows leak.
  if (diaryErr) {
    console.log("anon work_diaries error (expected):", diaryErr.code || diaryErr.message)
  }

  const { data: leaderView, error: viewErr } = await anon
    .from("work_diaries_for_leader")
    .select("id")
    .limit(1)
  assert(!leaderView?.length, "anon must not read leader view rows")
  if (viewErr) {
    console.log("anon leader view error (expected):", viewErr.code || viewErr.message)
  }

  const { data: rpcData, error: rpcErr } = await anon.rpc("submit_work_diary", {
    p_diary_id: "00000000-0000-0000-0000-000000000000",
  })
  assert(rpcErr, "anon must not execute submit_work_diary")
  console.log("anon RPC denied (expected):", rpcErr.code || rpcErr.message)
  assert(rpcData == null, "anon RPC must not return data")

  console.log("Checking service_role can see schema via REST…")
  const service = createClient(apiUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: companiesErr } = await service.from("companies").select("id").limit(1)
  assert(!companiesErr, `service_role companies select failed: ${companiesErr?.message}`)

  console.log("phase5a db verification: OK")
}

main().catch((err) => {
  console.error("phase5a db verification FAILED:", err.message || err)
  process.exit(1)
})
